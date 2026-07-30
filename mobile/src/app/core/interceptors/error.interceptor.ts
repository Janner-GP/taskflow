import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiError, isApiError } from '../http/api-error';

/**
 * Normalizes every failed request to the `ApiError` envelope so nothing
 * downstream — `refresh.interceptor.ts`, `AuthStore`, page components — ever
 * has to unwrap an `HttpErrorResponse` or branch on `error.message`.
 *
 * Runs closest to the backend (last in the `withInterceptors` array): a
 * network drop or a timeout never reaches the server at all, so those are
 * given a synthetic `NETWORK_ERROR` code instead of one from the contract —
 * still branchable by `code`, same as everything else.
 *
 * Scoped to `environment.apiUrl` so a failed asset fetch (e.g. a missing
 * `assets/i18n/*.json`) is never reshaped into an API error envelope.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (isApiError(err.error)) {
          return throwError(() => err.error);
        }
        return throwError(() => toFallbackError(err));
      }
      return throwError(() => err);
    }),
  );
};

function toFallbackError(err: HttpErrorResponse): ApiError {
  return {
    statusCode: err.status || 0,
    code: err.status === 0 ? 'NETWORK_ERROR' : 'INTERNAL_ERROR',
    message: err.message,
    timestamp: new Date().toISOString(),
    path: err.url ?? '',
  };
}
