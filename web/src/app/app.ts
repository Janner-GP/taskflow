import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from 'primeng/toast';

/**
 * Raíz de la aplicación: solo outlet y toasts.
 *
 * La cabecera vive en `layout/shell` (rutas privadas) y en `layout/auth-layout`
 * (login / registro), porque no es lo mismo la navegación de alguien con sesión
 * que la pantalla de acceso de alguien sin ella.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
