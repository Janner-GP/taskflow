import { HttpInterceptorFn } from '@angular/common/http';

import { environment } from '../../../environments/environment';

/**
 * Declara el transporte de autenticación ante el backend.
 *
 * El contrato define un solo caso de uso con dos adaptadores, seleccionados por
 * el header `X-Client`: `web` → cookies `httpOnly`, `mobile` → Bearer token.
 * `web` es el valor por defecto del backend, pero lo enviamos explícito para no
 * depender de un default ajeno.
 *
 * Solo se aplica a las peticiones a nuestra API; assets e i18n quedan intactos.
 */
export const clientHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { 'X-Client': 'web' } }));
};
