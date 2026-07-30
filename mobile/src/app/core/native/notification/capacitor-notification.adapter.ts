import { Injectable } from '@angular/core';
import { LocalNotifications } from '@capacitor/local-notifications';

import { NotificationPort, ScheduledReminder } from '../notification.port';

/**
 * `@capacitor/local-notifications` behind `NotificationPort`. Only reached on a
 * native platform; the browser gets `NoopNotificationAdapter` instead, so this
 * file never has to guard for a missing plugin.
 */
@Injectable()
export class CapacitorNotificationAdapter implements NotificationPort {
  async requestPermission(): Promise<boolean> {
    const status = await LocalNotifications.requestPermissions();
    return status.display === 'granted';
  }

  async schedule(reminder: ScheduledReminder): Promise<void> {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: reminder.id,
          title: reminder.title,
          body: reminder.body,
          // `at` en el futuro programa; una fecha pasada dispara de inmediato,
          // que es justo lo que queremos para el aviso de "prioridad alta".
          schedule: { at: reminder.at, allowWhileIdle: true },
        },
      ],
    });
  }

  async cancel(id: number): Promise<void> {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  }

  async pending(): Promise<ScheduledReminder[]> {
    const { notifications } = await LocalNotifications.getPending();
    return notifications.map((n) => ({
      id: n.id,
      title: n.title ?? '',
      body: n.body ?? '',
      at: n.schedule?.at ?? new Date(),
    }));
  }
}
