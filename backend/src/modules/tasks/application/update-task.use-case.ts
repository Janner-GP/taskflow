import { Inject, Injectable } from '@nestjs/common';

import { TASK_REPOSITORY } from '../domain/task-repository.port';
import type { TaskRepositoryPort } from '../domain/task-repository.port';
import { TaskNotFoundError } from '../domain/task.errors';
import type { Priority, Task, TaskStatus } from '../domain/task.entity';

export interface UpdateTaskCommand {
  id: string;
  userId: string;
  title?: string;
  description?: string | null;
  priority?: Priority;
  dueDate?: Date | null;
  status?: TaskStatus;
}

@Injectable()
export class UpdateTask {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly tasks: TaskRepositoryPort,
  ) {}

  async execute(command: UpdateTaskCommand): Promise<Task> {
    const task = await this.tasks.findById(command.id);

    if (!task) {
      throw new TaskNotFoundError();
    }

    task.assertOwnedBy(command.userId);

    // El toggle de estado pasa por la entidad para que "completar"/"reabrir"
    // sea una decisión del dominio, no un simple passthrough del DTO.
    const status =
      command.status === undefined
        ? undefined
        : command.status === 'COMPLETED'
          ? task.complete()
          : task.reopen();

    return this.tasks.update(command.id, {
      title: command.title,
      description: command.description,
      priority: command.priority,
      dueDate: command.dueDate,
      status,
    });
  }
}
