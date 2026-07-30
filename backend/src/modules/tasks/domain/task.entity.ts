import { TaskNotFoundError } from './task.errors';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export type TaskStatus = 'PENDING' | 'COMPLETED';

export class Task {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly title: string,
    readonly description: string | null,
    readonly status: TaskStatus,
    readonly priority: Priority,
    readonly dueDate: Date | null,
    readonly attachmentUrl: string | null,
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  /** 404, nunca 403: confirmar que el recurso existe ya es una fuga. */
  assertOwnedBy(userId: string): void {
    if (this.userId !== userId) {
      throw new TaskNotFoundError();
    }
  }

  complete(): TaskStatus {
    return 'COMPLETED';
  }

  reopen(): TaskStatus {
    return 'PENDING';
  }
}

export interface NewTask {
  userId: string;
  title: string;
  description: string | null;
  priority: Priority;
  dueDate: Date | null;
}
