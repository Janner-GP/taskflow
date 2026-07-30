import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Observable, firstValueFrom } from 'rxjs';

import { ApiErrorCode, isApiError } from '../../../core/api/api-error';
import { AUTH_REPOSITORY } from '../domain/auth.repository';
import { LoginRequest, RegisterRequest, User } from '../domain/user';

interface AuthState {
  user: User | null;
  /** Hay una operación de sesión en vuelo (login / registro / logout). */
  loading: boolean;
  /** La rehidratación inicial ya terminó: `user` es una respuesta, no un "todavía no sé". */
  resolved: boolean;
  /** Último error, por `code` del contrato. Nunca por `message`. */
  error: ApiErrorCode | null;
}

const initialState: AuthState = { user: null, loading: false, resolved: false, error: null };

/**
 * Estado de sesión de la aplicación.
 *
 * Con cookies `httpOnly` el JWT es ilegible desde JS, así que la única forma de
 * saber si hay sesión es preguntárselo al servidor (`GET /api/auth/me`). Eso
 * convierte "¿estoy autenticado?" en una pregunta ASÍNCRONA, y de ahí sale
 * `ensureSessionResolved()`: una promesa memoizada que el guard —y el
 * inicializador de la app— esperan antes de decidir nada. Sin ella, recargar en
 * una ruta privada expulsaría al login antes de que llegue la respuesta.
 */
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed(({ user, resolved }) => ({
    isAuthenticated: computed(() => user() !== null),
    /** `false` mientras no sepamos si hay sesión: nadie debería decidir aún. */
    sessionResolved: computed(() => resolved()),
    displayName: computed(() => user()?.name ?? ''),
    initials: computed(() => toInitials(user()?.name ?? '')),
  })),

  withMethods((store, repository = inject(AUTH_REPOSITORY)) => {
    /**
     * Memoiza la rehidratación. Diez guards concurrentes esperan la MISMA
     * promesa: un solo `GET /auth/me` por arranque.
     */
    let restoration: Promise<void> | null = null;

    async function restore(): Promise<void> {
      try {
        const user = await firstValueFrom(repository.me());
        patchState(store, { user, resolved: true, error: null });
      } catch {
        // 401 = simplemente no hay sesión. No es un error que mostrar.
        patchState(store, { user: null, resolved: true });
      }
    }

    async function authenticate(work: () => Observable<User>): Promise<boolean> {
      patchState(store, { loading: true, error: null });

      try {
        const user = await firstValueFrom(work());
        patchState(store, { user, loading: false, resolved: true, error: null });
        return true;
      } catch (error: unknown) {
        patchState(store, {
          user: null,
          loading: false,
          error: isApiError(error) ? error.code : 'INTERNAL_ERROR',
        });
        return false;
      }
    }

    return {
      /**
       * Punto de sincronización de toda la app: resuelve cuando se sabe si hay
       * sesión o no. Idempotente y compartida.
       */
      ensureSessionResolved(): Promise<void> {
        restoration ??= restore();
        return restoration;
      },

      login(request: LoginRequest): Promise<boolean> {
        return authenticate(() => repository.login(request));
      },

      register(request: RegisterRequest): Promise<boolean> {
        return authenticate(() => repository.register(request));
      },

      /**
       * Limpia el estado local y avisa al servidor. Las cookies solo puede
       * borrarlas él: son `httpOnly`.
       */
      async logout(): Promise<void> {
        patchState(store, { loading: true, error: null });

        try {
          await firstValueFrom(repository.logout());
        } catch {
          // Da igual por qué falle: localmente la sesión se cierra de todos modos.
        }

        patchState(store, { user: null, loading: false, resolved: true, error: null });
      },

      /** Cierre local sin llamada de red: lo usa el interceptor cuando el refresh falla. */
      clearSession(): void {
        patchState(store, { user: null, loading: false, resolved: true, error: null });
      },

      clearError(): void {
        patchState(store, { error: null });
      },
    };
  }),
);

function toInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
