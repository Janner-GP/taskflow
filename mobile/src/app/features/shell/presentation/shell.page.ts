import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * The authenticated shell: `ion-tabs` renders its own router outlet
 * internally, so the two tab routes (`tasks`, `profile`) are configured as
 * children of the shell route in `app.routes.ts` and nothing else is needed
 * here beyond the tab bar itself.
 */
@Component({
  selector: 'app-shell-page',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, TranslatePipe],
  templateUrl: './shell.page.html',
  styleUrl: './shell.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellPage {}
