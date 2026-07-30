import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CreateTaskRequest,
  MessageResult,
  MutationResult,
  Paginated,
  Task,
  TaskQuery,
  UpdateTaskRequest,
} from './task';

/**
 * Puerto de tareas. El dominio define QUÉ operaciones existen; el adaptador
 * HTTP (`infrastructure/`) decide CÓMO se hablan (ver `docs/CONTRACT.md`).
 *
 * Las mutaciones devuelven `{ data, message }`: el mensaje ya viene localizado
 * desde el backend y es lo que se muestra en el toast.
 */
export interface TaskRepository {
  /** Filtros, búsqueda, orden y paginación se resuelven en el servidor. */
  list(query: TaskQuery): Observable<Paginated<Task>>;
  create(request: CreateTaskRequest): Observable<MutationResult<Task>>;
  getById(id: string): Observable<Task>;
  /** También es el endpoint para completar/reabrir (`status` en el body). */
  update(id: string, request: UpdateTaskRequest): Observable<MutationResult<Task>>;
  delete(id: string): Observable<MessageResult>;
  /** `POST /tasks/:id/attachment` — multipart/form-data, campo "file". */
  uploadAttachment(taskId: string, file: File): Observable<MutationResult<Task>>;
}

export const TASK_REPOSITORY = new InjectionToken<TaskRepository>('TASK_REPOSITORY');
