import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

/**
 * Root shell. `ion-app` is the positioning context every Ionic overlay
 * (toast, modal, alert) attaches to, and `ion-router-outlet` replaces Angular's
 * plain outlet so page transitions and the hardware back button behave natively.
 */
@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
