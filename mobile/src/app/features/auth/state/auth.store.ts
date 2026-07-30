import { inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { TranslateService } from '@ngx-translate/core';
import { Observable, catchError, from, map, of, switchMap, tap, throwError } from 'rxjs';

import { ApiError, isApiError } from '../../../core/http/api-error';
import { BIOMETRIC_PORT } from '../../../core/native/biometric.port';
import { SESSION_STORAGE_PORT } from '../../../core/storage/session-storage.port';
import { AUTH_REPOSITORY } from '../domain/auth-repository.port';
import { AuthSession } from '../domain/session.model';
import { LoginInput, RegisterInput, User } from '../domain/user.model';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: User | null;
  /** In memory only — never written to disk, per the session design in domain/session.model.ts. */
  accessToken: string | null;
  status: AuthStatus;
  /** The last failed attempt's error code, for the presentation layer to map to copy. */
  error: string | null;
  /**
   * Flips to `true` once the startup refresh attempt (success or failure) has
   * settled. `authGuard` waits on this signal rather than on `isAuthenticated`
   * directly — deciding before it settles is exactly what would throw a user
   * with a valid session back to the login screen on a cold reload of a
   * private route.
   */
  hydrated: boolean;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  status: 'idle',
  error: null,
  hydrated: false,
};

export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ user, accessToken, status }) => ({
    isAuthenticated: () => user() !== null && accessToken() !== null,
    isLoading: () => status() === 'loading',
  })),
  withMethods((store) => {
    const authRepository = inject(AUTH_REPOSITORY);
    const sessionStorage = inject(SESSION_STORAGE_PORT);
    const biometric = inject(BIOMETRIC_PORT);
    const translate = inject(TranslateService);

    function applySession(session: AuthSession): void {
      patchState(store, {
        user: session.user,
        accessToken: session.accessToken,
        status: 'authenticated',
        error: null,
      });
      void sessionStorage.setRefreshToken(session.refreshToken);
    }

    function errorCode(err: unknown): string {
      return isApiError(err) ? err.code : 'NETWORK_ERROR';
    }

    function clearSession(): void {
      patchState(store, { user: null, accessToken: null, status: 'unauthenticated', error: null });
      void sessionStorage.clearRefreshToken();
    }

    return {
      clearSession,

      register(input: RegisterInput): Observable<AuthSession> {
        patchState(store, { status: 'loading', error: null });
        return authRepository.register(input).pipe(
          tap(applySession),
          catchError((err: unknown) => {
            patchState(store, { status: 'unauthenticated', error: errorCode(err) });
            return throwError(() => err as ApiError);
          }),
        );
      },

      login(input: LoginInput): Observable<AuthSession> {
        patchState(store, { status: 'loading', error: null });
        return authRepository.login(input).pipe(
          tap(applySession),
          catchError((err: unknown) => {
            patchState(store, { status: 'unauthenticated', error: errorCode(err) });
            return throwError(() => err as ApiError);
          }),
        );
      },

      logout(): Observable<void> {
        return from(sessionStorage.getRefreshToken()).pipe(
          switchMap((refreshToken) =>
            refreshToken ? authRepository.logout(refreshToken).pipe(catchError(() => of(void 0))) : of(void 0),
          ),
          tap(() => clearSession()),
        );
      },

      /**
       * Used by `refresh.interceptor.ts` on a 401. Rotates the pair, updates
       * the in-memory access token, persists the new refresh token, and hands
       * back the fresh access token so the interceptor can retry the original
       * request. On failure it clears the session — the caller is expected to
       * navigate to login.
       */
      refresh(): Observable<string> {
        return from(sessionStorage.getRefreshToken()).pipe(
          switchMap((refreshToken) =>
            refreshToken ? authRepository.refresh(refreshToken) : throwError(() => new Error('NO_REFRESH_TOKEN')),
          ),
          tap((tokens) => {
            patchState(store, { accessToken: tokens.accessToken, status: 'authenticated' });
            void sessionStorage.setRefreshToken(tokens.refreshToken);
          }),
          map((tokens) => tokens.accessToken),
          catchError((err: unknown) => {
            clearSession();
            return throwError(() => err);
          }),
        );
      },

      /**
       * Runs once at startup (see `provideAppInitializer` in app.config.ts).
       * Deliberately does not block the app initializer: it fires and settles
       * `hydrated` on its own, while `authGuard` is what actually waits for it.
       */
      bootstrap(): void {
        sessionStorage
          .getRefreshToken()
          .then(async (refreshToken) => {
            if (!refreshToken) {
              patchState(store, { status: 'unauthenticated', hydrated: true });
              return;
            }

            /**
             * Desbloqueo biométrico: si hay sesión guardada y el dispositivo
             * tiene biometría, se exige antes de rehidratar. En navegador el
             * adaptador no-op reporta `available: false`, así que este gate no
             * altera `ionic serve`. Un fallo/cancelación no borra el token — el
             * usuario reintenta al reabrir; solo no se restaura esta vez.
             */
            const bio = await biometric.check();
            if (bio.available) {
              const unlocked = await biometric.authenticate(translate.instant('auth.biometric.reason'));
              if (!unlocked) {
                patchState(store, { status: 'unauthenticated', hydrated: true });
                return;
              }
            }

            authRepository.refresh(refreshToken).subscribe({
              next: (tokens) => {
                patchState(store, { accessToken: tokens.accessToken });
                void sessionStorage.setRefreshToken(tokens.refreshToken);

                authRepository.me().subscribe({
                  next: (user) => patchState(store, { user, status: 'authenticated', hydrated: true }),
                  error: () => {
                    clearSession();
                    patchState(store, { hydrated: true });
                  },
                });
              },
              error: () => {
                void sessionStorage.clearRefreshToken();
                patchState(store, { status: 'unauthenticated', hydrated: true });
              },
            });
          })
          .catch(() => patchState(store, { status: 'unauthenticated', hydrated: true }));
      },
    };
  }),
);
