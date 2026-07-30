import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CreateTaskInput,
  MessageResult,
  MutationResult,
  Paginated,
  Task,
  TaskQuery,
  UpdateTaskInput,
} from './task.model';

/**
 * The use case, independent of transport — mirrors `AuthRepository`'s split.
 * `HttpTaskRepository` in `infrastructure/` is the only thing that knows these
 * are HTTP calls against `/api/tasks`.
 *
 * Las mutaciones devuelven `{ data, message }`: el mensaje ya viene localizado
 * del backend y es lo que se muestra en el toast.
 */
export interface TaskRepository {
  list(query: TaskQuery): Observable<Paginated<Task>>;
  create(input: CreateTaskInput): Observable<MutationResult<Task>>;
  /** Also how a task is completed/reopened, via `{ status }` — no dedicated endpoint. */
  update(id: string, input: UpdateTaskInput): Observable<MutationResult<Task>>;
  delete(id: string): Observable<MessageResult>;
}

export const TASK_REPOSITORY = new InjectionToken<TaskRepository>('TaskRepository');
