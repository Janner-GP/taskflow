import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { AuthStore } from '../../features/auth/state/auth.store';

/**
 * Adds the two headers the contract asks of the mobile transport:
 *
 *   `X-Client: mobile`   on every API call, always. Without it the backend
 *                        assumes `web` and answers with `Set-Cookie` instead
 *                        of tokens in the body — nothing this client can read.
 *   `Authorization`      only when a session exists. Its absence is not an
 *                        error: it is exactly the state of an unauthenticated
 *                        request, e.g. login or register.
 *
 * Scoped to `environment.apiUrl` so it never touches an unrelated request
 * (asset fetches, `assets/i18n/*.json` picked up by the translate loader).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const authStore = inject(AuthStore);
  const accessToken = authStore.accessToken();

  // El backend (nestjs-i18n) localiza sus mensajes por `Accept-Language`.
  const translate = inject(TranslateService);
  const lang = translate.currentLang() ?? 'es';

  const headers: Record<string, string> = { 'X-Client': 'mobile', 'Accept-Language': lang };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return next(req.clone({ setHeaders: headers }));
};
