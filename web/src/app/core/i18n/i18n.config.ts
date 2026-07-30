import { Provider } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

/** Idiomas soportados. `es` es el idioma por defecto y el fallback. */
export const SUPPORTED_LANGUAGES = ['es', 'en'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'es';

/** Clave de localStorage donde se recuerda el idioma elegido. */
export const LANGUAGE_STORAGE_KEY = 'taskflow.lang';

export function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Resuelve el idioma inicial: lo guardado por el usuario, si no el del
 * navegador, si no el default. Se evalúa una sola vez al arrancar.
 */
export function resolveInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (isSupportedLanguage(stored)) {
    return stored;
  }

  const browser = navigator.language?.split('-')[0] ?? null;
  return isSupportedLanguage(browser) ? browser : DEFAULT_LANGUAGE;
}

/** Traducciones servidas como assets estáticos desde `public/i18n/`. */
export function provideI18n(): Provider[] {
  return provideTranslateService({
    lang: resolveInitialLanguage(),
    fallbackLang: DEFAULT_LANGUAGE,
    loader: provideTranslateHttpLoader({
      prefix: './i18n/',
      suffix: '.json',
    }),
  });
}
