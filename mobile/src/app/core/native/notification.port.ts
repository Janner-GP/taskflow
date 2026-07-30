import { InjectionToken } from '@angular/core';

/**
 * Port for scheduling local reminders on a task's due date.
 *
 * Phase 6 provides two implementations behind this token: one backed by
 * `@capacitor/local-notifications` on device, and a no-op for the browser so
 * `ionic serve` keeps working. Nothing above this port knows which one it got,
 * which also means a misbehaving plugin can be swapped out without touching a
 * feature.
 *
 * Only the contract lives here — no implementation yet.
 */
export interface ScheduledReminder {
  /** Numeric because the Capacitor plugin identifies notifications by int id. */
  id: number;
  title: string;
  body: string;
  at: Date;
}

export interface NotificationPort {
  /** Resolves false when the user denies the OS prompt; callers must cope. */
  requestPermission(): Promise<boolean>;
  schedule(reminder: ScheduledReminder): Promise<void>;
  cancel(id: number): Promise<void>;
  pending(): Promise<ScheduledReminder[]>;
}

export const NOTIFICATION_PORT = new InjectionToken<NotificationPort>('NotificationPort');
