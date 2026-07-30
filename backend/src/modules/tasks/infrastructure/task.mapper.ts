import type { Task as PrismaTask } from '@prisma/client';

import { Task } from '../domain/task.entity';

export function toDomainTask(row: PrismaTask): Task {
  return new Task(
    row.id,
    row.userId,
    row.title,
    row.description,
    row.status,
    row.priority,
    row.dueDate,
    row.attachmentUrl,
    row.createdAt,
    row.updatedAt,
  );
}
