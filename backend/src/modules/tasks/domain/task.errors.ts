import { DomainError } from '../../../shared/domain/domain.error';

/** También cubre "existe pero es de otro usuario": ver `Task.assertOwnedBy`. */
export class TaskNotFoundError extends DomainError {
  readonly code = 'TASK_NOT_FOUND';

  constructor() {
    super('La tarea no existe.');
  }
}
