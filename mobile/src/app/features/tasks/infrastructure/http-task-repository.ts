import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { TaskRepository } from '../domain/task-repository.port';
import {
  CreateTaskInput,
  MessageResult,
  MutationResult,
  Paginated,
  Task,
  TaskQuery,
  UpdateTaskInput,
} from '../domain/task.model';

/**
 * HTTP adapter for `TaskRepository`, per docs/CONTRACT.md.
 *
 * `list` always asks for `limit: 100` (the server max) rather than implementing
 * full pagination in the UI — this phase's scope is a single scrollable list,
 * not a paged one. `X-Client`/`Authorization` are added by
 * `core/interceptors/auth.interceptor.ts`, not here.
 */
@Injectable()
export class HttpTaskRepository implements TaskRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/tasks`;

  list(query: TaskQuery): Observable<Paginated<Task>> {
    let params = new HttpParams().set('page', String(query.page ?? 1)).set('limit', String(query.limit ?? 100));
    if (query.status) params = params.set('status', query.status);
    if (query.priority) params = params.set('priority', query.priority);
    if (query.search) params = params.set('search', query.search);
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDir) params = params.set('sortDir', query.sortDir);

    return this.http.get<Paginated<Task>>(this.baseUrl, { params });
  }

  create(input: CreateTaskInput): Observable<MutationResult<Task>> {
    return this.http.post<MutationResult<Task>>(this.baseUrl, input);
  }

  update(id: string, input: UpdateTaskInput): Observable<MutationResult<Task>> {
    return this.http.patch<MutationResult<Task>>(`${this.baseUrl}/${id}`, input);
  }

  delete(id: string): Observable<MessageResult> {
    return this.http.delete<MessageResult>(`${this.baseUrl}/${id}`);
  }
}
