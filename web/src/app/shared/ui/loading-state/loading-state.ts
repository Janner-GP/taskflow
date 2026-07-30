import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Skeleton } from 'primeng/skeleton';

/** Placeholder reutilizable para listas en carga: N filas de skeleton. */
@Component({
  selector: 'app-loading-state',
  imports: [Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loading-state.html',
  styleUrl: './loading-state.scss',
})
export class LoadingState {
  rows = input(6);

  protected readonly rowsArray = computed(() => Array.from({ length: this.rows() }, (_, i) => i));
}
