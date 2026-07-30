import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { Select } from 'primeng/select';

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
} from '../../core/i18n/i18n.config';

@Component({
  selector: 'app-language-switcher',
  imports: [Select, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './language-switcher.html',
  styleUrl: './language-switcher.scss',
})
export class LanguageSwitcher {
  private readonly translate = inject(TranslateService);

  protected readonly languages = SUPPORTED_LANGUAGES.map((value) => ({
    value,
    label: value === 'es' ? 'Español' : 'English',
  }));

  /** El idioma activo lo publica ngx-translate como signal: no duplicamos estado. */
  protected readonly current = computed<SupportedLanguage>(
    () => (this.translate.currentLang() as SupportedLanguage | null) ?? DEFAULT_LANGUAGE,
  );

  protected use(lang: SupportedLanguage): void {
    this.translate.use(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }
}
