import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { environment } from '../../../environments/environment';

/**
 * Spanish is the default and also the fallback: the API returns its error
 * messages in Spanish, so a missing key degrading into Spanish keeps the UI
 * coherent rather than mixing two languages on one screen.
 */
export function provideI18n(): (Provider | EnvironmentProviders)[] {
  return [
    provideTranslateService({
      lang: environment.defaultLanguage,
      fallbackLang: environment.defaultLanguage,
      loader: provideTranslateHttpLoader({
        prefix: 'assets/i18n/',
        suffix: '.json',
      }),
    }),
    /**
     * Blocks bootstrap until the default bundle is in memory. Without this the
     * first paint shows raw keys — cheap on a fast dev server, very visible on
     * a phone reading the file from the WebView's asset layer.
     */
    provideAppInitializer(() => {
      const translate = inject(TranslateService);
      return translate.use(environment.defaultLanguage);
    }),
  ];
}
