import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { ApiError, isApiError } from '../api/api-error';

/**
 * Normaliza cualquier fallo HTTP a un `ApiError`.
 *
 * Aguas arriba de este interceptor nadie tiene que inspeccionar
 * `HttpErrorResponse` ni distinguir "el backend respondió un error" de "no hubo
 * respuesta": todo llega con la misma forma y con un `code` sobre el que
 * ramificar, tal como exige el contrato.
 */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      // El backend ya respondió con el formato del contrato: se respeta tal cual.
      if (isApiError(error.error)) {
        return throwError(() => error.error as ApiError);
      }

      // No hubo respuesta útil (status 0 = red caída / CORS / offline).
      const normalized: ApiError = {
        statusCode: error.status,
        code: error.status === 0 ? 'NETWORK_ERROR' : 'INTERNAL_ERROR',
        message: error.status === 0 ? 'No se pudo conectar con el servidor.' : 'Error inesperado del servidor.',
        timestamp: new Date().toISOString(),
        path: req.url,
      };

      return throwError(() => normalized);
    }),
  );
