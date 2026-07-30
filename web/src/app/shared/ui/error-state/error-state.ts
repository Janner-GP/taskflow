import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from 'primeng/button';

/** Placeholder reutilizable para un fallo de carga, con reintento opcional. */
@Component({
  selector: 'app-error-state',
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './error-state.html',
  styleUrl: './error-state.scss',
})
export class ErrorState {
  message = input.required<string>();
  retryLabel = input<string>();

  retry = output<void>();
}
