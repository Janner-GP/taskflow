import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { MutationResult, Task } from '../domain/task.model';

/**
 * Sube una foto (base64) al endpoint de adjuntos del backend.
 *
 * El backend espera `POST /tasks/:id/attachment` como multipart/form-data con
 * el campo "file". Devuelve `{ data: Task, message: string }` con la tarea
 * actualizada que ya incluye `attachmentUrl`.
 */
@Injectable({ providedIn: 'root' })
export class TaskUploadService {
  private readonly http = inject(HttpClient);

  upload(taskId: string, base64: string, format: string): Observable<MutationResult<Task>> {
    const mimeType = `image/${format}`;

    // Decode base64 → Blob without loading an external lib.
    const byteChars = atob(base64);
    const arr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      arr[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([arr], { type: mimeType });

    const fd = new FormData();
    fd.append('file', blob, `photo.${format}`);

    return this.http.post<MutationResult<Task>>(
      `${environment.apiUrl}/tasks/${taskId}/attachment`,
      fd,
    );
  }
}
