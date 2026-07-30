import { inject, Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import { NOTIFICATION_PORT } from '../../../core/native/notification.port';
import { Task } from '../domain/task.model';

/**
 * Traduce un evento de dominio ("se creó una tarea") a recordatorios locales,
 * según el ejemplo de la prueba: aviso inmediato para prioridad alta y un
 * recordatorio en la fecha límite. Habla con `NotificationPort`, así que en el
 * navegador degrada a no-op sin romper el alta de tareas.
 */
@Injectable({ providedIn: 'root' })
export class TaskNotificationsService {
  private readonly notifications = inject(NOTIFICATION_PORT);
  private readonly translate = inject(TranslateService);

  /** Best-effort: si el usuario deniega el permiso, no se programa nada y ya. */
  async onTaskCreated(task: Task): Promise<void> {
    const granted = await this.notifications.requestPermission();
    if (!granted) {
      return;
    }

    if (task.priority === 'HIGH') {
      await this.notifications.schedule({
        id: notificationId(task.id, 'high'),
        title: this.translate.instant('tasks.notifications.highTitle'),
        body: task.title,
        at: new Date(),
      });
    }

    if (task.dueDate) {
      const at = new Date(task.dueDate);
      if (at.getTime() > Date.now()) {
        await this.notifications.schedule({
          id: notificationId(task.id, 'due'),
          title: this.translate.instant('tasks.notifications.reminderTitle'),
          body: task.title,
          at,
        });
      }
    }
  }
}

/**
 * El plugin identifica notificaciones por entero; el id de tarea es un UUID.
 * Se deriva un entero de 31 bits estable del UUID + sufijo, para poder
 * cancelar/actualizar la misma notificación más tarde sin colisiones.
 */
function notificationId(taskId: string, suffix: string): number {
  const seed = `${taskId}:${suffix}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
