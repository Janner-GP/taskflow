import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { IonSegment, IonSegmentButton, SegmentCustomEvent } from '@ionic/angular/standalone';

import { environment } from '../../../environments/environment';

/**
 * Language switch. Lives in `shared/` because both the auth screens and the
 * settings area need it — a user who cannot read the login form has no way to
 * reach a language setting placed behind it.
 *
 * The choice is intentionally not persisted yet: phase 6 stores it through
 * `@capacitor/preferences` alongside the other device-local state.
 */
@Component({
  selector: 'app-language-switcher',
  imports: [IonSegment, IonSegmentButton],
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSwitcherComponent {
  private readonly translate = inject(TranslateService);

  protected readonly languages = [...environment.supportedLanguages];

  /**
   * ngx-translate v18 exposes the active language as a signal, so the segment
   * follows a change made anywhere else in the app instead of holding a second
   * copy of the same state.
   */
  protected readonly current = computed(
    () => this.translate.currentLang() ?? environment.defaultLanguage,
  );

  protected switch(event: Event): void {
    const value = (event as SegmentCustomEvent).detail.value;
    if (typeof value === 'string' && value !== this.current()) {
      this.translate.use(value);
    }
  }
}
