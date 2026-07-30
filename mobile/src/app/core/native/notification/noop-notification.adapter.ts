import { Injectable } from '@angular/core';

import { NotificationPort, ScheduledReminder } from '../notification.port';

/**
 * Browser fallback: `ionic serve` has no local-notifications plugin. Reports no
 * permission and keeps an in-memory list so `pending()` stays honest during a
 * dev session, but never touches the OS.
 */
@Injectable()
export class NoopNotificationAdapter implements NotificationPort {
  private readonly scheduled = new Map<number, ScheduledReminder>();

  requestPermission(): Promise<boolean> {
    return Promise.resolve(false);
  }

  schedule(reminder: ScheduledReminder): Promise<void> {
    this.scheduled.set(reminder.id, reminder);
    return Promise.resolve();
  }

  cancel(id: number): Promise<void> {
    this.scheduled.delete(id);
    return Promise.resolve();
  }

  pending(): Promise<ScheduledReminder[]> {
    return Promise.resolve([...this.scheduled.values()]);
  }
}
