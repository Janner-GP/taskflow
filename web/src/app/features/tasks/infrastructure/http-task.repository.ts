import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  CreateTaskRequest,
  MessageResult,
  MutationResult,
  Paginated,
  Task,
  TaskQuery,
  UpdateTaskRequest,
} from '../domain/task';
import { TaskRepository } from '../domain/task.repository';

/** Adaptador HTTP del puerto `TaskRepository` (`docs/CONTRACT.md` → `/api/tasks`). */
@Injectable({ providedIn: 'root' })
export class HttpTaskRepository implements TaskRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/tasks`;

  list(query: TaskQuery): Observable<Paginated<Task>> {
    return this.http.get<Paginated<Task>>(this.baseUrl, { params: toParams(query) });
  }

  create(request: CreateTaskRequest): Observable<MutationResult<Task>> {
    return this.http.post<MutationResult<Task>>(this.baseUrl, request);
  }

  getById(id: string): Observable<Task> {
    return this.http.get<Task>(`${this.baseUrl}/${id}`);
  }

  update(id: string, request: UpdateTaskRequest): Observable<MutationResult<Task>> {
    return this.http.patch<MutationResult<Task>>(`${this.baseUrl}/${id}`, request);
  }

  delete(id: string): Observable<MessageResult> {
    return this.http.delete<MessageResult>(`${this.baseUrl}/${id}`);
  }

  uploadAttachment(taskId: string, file: File): Observable<MutationResult<Task>> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<MutationResult<Task>>(`${this.baseUrl}/${taskId}/attachment`, fd);
  }
}

/** Solo manda los params presentes: el backend ya aplica sus propios defaults. */
function toParams(query: TaskQuery): HttpParams {
  let params = new HttpParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params = params.set(key, String(value));
    }
  }

  return params;
}
