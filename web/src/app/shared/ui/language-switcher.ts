import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
} from '../../core/i18n/i18n.config';

@Component({
  selector: 'app-language-switcher',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './language-switcher.html',
  styleUrl: './language-switcher.scss',
})
export class LanguageSwitcher {
  private readonly translate = inject(TranslateService);

  protected readonly languages = SUPPORTED_LANGUAGES;

  protected readonly current = computed<SupportedLanguage>(
    () => (this.translate.currentLang() as SupportedLanguage | null) ?? DEFAULT_LANGUAGE,
  );

  protected langClass(lang: SupportedLanguage): string {
    const base = 'rounded px-2.5 py-1 text-xs font-semibold transition-all duration-150 ';
    return this.current() === lang
      ? base + 'bg-white text-primary-700 shadow-sm dark:bg-surface-700 dark:text-primary-300'
      : base + 'text-muted-color hover:text-color';
  }

  protected use(lang: SupportedLanguage): void {
    this.translate.use(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }
}
