import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthStore } from '../../features/auth/application/auth.store';
import { LanguageSwitcher } from '../../shared/ui/language-switcher';
import { ThemeToggle } from '../../shared/ui/theme-toggle';

/** Marco de la aplicación autenticada: cabecera de sesión + outlet de rutas privadas. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, ThemeToggle, LanguageSwitcher],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly router = inject(Router);

  protected readonly store = inject(AuthStore);
  protected readonly dropdownOpen = signal(false);

  protected async logout(): Promise<void> {
    await this.store.logout();
    await this.router.navigateByUrl('/auth/login');
  }
}
