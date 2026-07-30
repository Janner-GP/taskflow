import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from 'primeng/button';

/** Placeholder reutilizable para listas vacías, con acción opcional. */
@Component({
  selector: 'app-empty-state',
  imports: [Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
})
export class EmptyState {
  title = input.required<string>();
  message = input<string>();
  actionLabel = input<string>();

  action = output<void>();
}
