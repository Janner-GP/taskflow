import { Inject, Injectable } from '@nestjs/common';

import { TASK_REPOSITORY } from '../domain/task-repository.port';
import type { TaskRepositoryPort } from '../domain/task-repository.port';
import type { Priority, Task } from '../domain/task.entity';

export interface CreateTaskCommand {
  userId: string;
  title: string;
  description?: string | null;
  priority: Priority;
  dueDate?: Date | null;
}

@Injectable()
export class CreateTask {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly tasks: TaskRepositoryPort,
  ) {}

  execute(command: CreateTaskCommand): Promise<Task> {
    return this.tasks.create({
      userId: command.userId,
      title: command.title.trim(),
      description: command.description ?? null,
      priority: command.priority,
      dueDate: command.dueDate ?? null,
    });
  }
}
