import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';

import { ThemeService } from '../../core/theme/theme.service';

/**
 * Botón de light/dark. Iconos SVG inline a propósito: evita añadir `primeicons`
 * como dependencia solo para dos glifos.
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [Button, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './theme-toggle.html',
  styleUrl: './theme-toggle.scss',
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
}
