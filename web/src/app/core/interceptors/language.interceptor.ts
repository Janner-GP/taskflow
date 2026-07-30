import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { DEFAULT_LANGUAGE } from '../i18n/i18n.config';

/**
 * Anuncia al backend el idioma activo vía `Accept-Language`.
 *
 * El backend es la fuente de verdad de TODO texto que ve el usuario (errores y
 * confirmaciones): decide el idioma con este header, así que el front solo tiene
 * que declararlo. Se toma del idioma vivo de `TranslateService`, de modo que
 * cambiar de es↔en también cambia el idioma de las respuestas del servidor.
 *
 * Solo aplica a nuestra API; los assets de i18n (`./i18n/*.json`) quedan fuera.
 */
export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  // `currentLang` es un signal en ngx-translate v18 (mismo uso que el switcher).
  const translate = inject(TranslateService);
  const lang = translate.currentLang() ?? DEFAULT_LANGUAGE;

  return next(req.clone({ setHeaders: { 'Accept-Language': lang } }));
};
