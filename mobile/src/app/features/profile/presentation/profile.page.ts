import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageSwitcherComponent } from '../../../shared/ui/language-switcher.component';
import { AuthStore } from '../../auth/state/auth.store';

/** Profile/settings tab: who is signed in, the language switch, and logout. */
@Component({
  selector: 'app-profile-page',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonIcon,
    TranslatePipe,
    LanguageSwitcherComponent,
  ],
  templateUrl: './profile.page.html',
  styleUrl: './profile.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly user = this.authStore.user;

  protected logout(): void {
    this.authStore.logout().subscribe(() => void this.router.navigateByUrl('/auth/login'));
  }
}
