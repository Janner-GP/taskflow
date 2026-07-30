import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { EnvironmentInjector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { MessageService } from 'primeng/api';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AUTH_REPOSITORY } from '../../features/auth/domain/auth.repository';
import { AuthStore } from '../../features/auth/application/auth.store';
import { isApiError } from '../api/api-error';

/** La petición no debe disparar refresh (login, registro, logout y el propio refresh). */
export const SKIP_AUTH_REFRESH = new HttpContextToken<boolean>(() => false);

/**
 * La petición sí puede intentar el refresh, pero si falla NO hay que avisar al
 * usuario: es la rehidratación de arranque y "no hay sesión" es un resultado
 * normal, no una expiración.
 */
export const SILENT_AUTH_FAILURE = new HttpContextToken<boolean>(() => false);

/** Marca interna: esta petición ya es el reintento posterior al refresh. */
const AUTH_RETRIED = new HttpContextToken<boolean>(() => false);

/**
 * Refresh transparente de la sesión.
 *
 * Ante un 401 lanza `POST /api/auth/refresh` **una sola vez** y reintenta la
 * petición original. Si diez peticiones caducan a la vez, las diez esperan al
 * MISMO refresh: `refreshInFlight` es un observable compartido
 * (`shareReplay`), así que solo sale una llamada a la red y las demás se
 * encolan sobre su resultado.
 *
 * Sin bucles posibles: el refresh viaja con `SKIP_AUTH_REFRESH`, y el reintento
 * con `AUTH_RETRIED`, de modo que un 401 en cualquiera de los dos se propaga.
 */
export const authRefreshInterceptor: HttpInterceptorFn = (req, next) => {
  // Se captura el injector aquí (única zona con contexto de inyección) y se
  // resuelven las dependencias tarde: TranslateService y AuthStore emiten
  // peticiones HTTP y construirlos en cada request abriría ciclos de DI.
  const injector = inject(EnvironmentInjector);

  if (!req.url.startsWith(environment.apiUrl) || req.context.get(SKIP_AUTH_REFRESH)) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: unknown) => {
      if (req.context.get(AUTH_RETRIED) || !isSessionExpired(error)) {
        return throwError(() => error);
      }

      return refreshOnce(injector, req.context.get(SILENT_AUTH_FAILURE)).pipe(
        switchMap((renewed) =>
          renewed
            ? next(req.clone({ context: req.context.set(AUTH_RETRIED, true) }))
            : throwError(() => error),
        ),
      );
    }),
  );
};

/**
 * El error llega ya normalizado por `apiErrorInterceptor` (está por dentro de
 * este en la cadena), así que se ramifica por `code`, como manda el contrato.
 * `INVALID_CREDENTIALS` también es 401 pero significa "esas credenciales no
 * valen": refrescar ahí no tiene sentido.
 */
function isSessionExpired(error: unknown): boolean {
  return isApiError(error) && error.statusCode === 401 && error.code !== 'INVALID_CREDENTIALS';
}

/** Refresh compartido: mientras uno esté en vuelo, todos se cuelgan de él. */
let refreshInFlight: Observable<boolean> | null = null;

function refreshOnce(injector: EnvironmentInjector, silent: boolean): Observable<boolean> {
  refreshInFlight ??= injector.get(AUTH_REPOSITORY).refresh().pipe(
    map(() => true),
    catchError(() => of(false)),
    tap((renewed) => {
      if (!renewed) {
        expireSession(injector, silent);
      }
    }),
    // Se libera al completar: el siguiente 401 podrá abrir un refresh nuevo.
    finalize(() => (refreshInFlight = null)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  return refreshInFlight;
}

function expireSession(injector: EnvironmentInjector, silent: boolean): void {
  injector.get(AuthStore).clearSession();

  if (silent) {
    return;
  }

  const translate = injector.get(TranslateService);
  injector.get(MessageService).add({
    severity: 'warn',
    summary: translate.instant('auth.session.expiredTitle'),
    detail: translate.instant('auth.session.expiredDetail'),
    life: 6000,
  });

  void injector.get(Router).navigate(['/auth/login']);
}
