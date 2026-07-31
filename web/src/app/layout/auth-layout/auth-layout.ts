import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageSwitcher } from '../../shared/ui/language-switcher';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

/**
 * Marco de las pantallas públicas (login / registro): sin navegación de app,
 * solo marca, tema e idioma. La tarjeta la aporta este layout para que los
 * formularios se ocupen únicamente de sus campos.
 */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, RouterLink, TranslatePipe, ThemeToggle, LanguageSwitcher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {}
