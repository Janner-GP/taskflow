import { Inject, Injectable } from '@nestjs/common';

import { STORAGE_SERVICE } from '../../../shared/infrastructure/storage/storage.port';
import type { StorageServicePort } from '../../../shared/infrastructure/storage/storage.port';
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
  removeAttachment?: boolean;
}

@Injectable()
export class UpdateTask {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly tasks: TaskRepositoryPort,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageServicePort,
  ) {}

  async execute(command: UpdateTaskCommand): Promise<Task> {
    const task = await this.tasks.findById(command.id);

    if (!task) {
      throw new TaskNotFoundError();
    }

    task.assertOwnedBy(command.userId);

    const status =
      command.status === undefined
        ? undefined
        : command.status === 'COMPLETED'
          ? task.complete()
          : task.reopen();

    let attachmentUrl: string | null | undefined = undefined;

    if (command.removeAttachment && task.attachmentUrl) {
      await this.storage.deleteByUrl(task.attachmentUrl, command.id);
      attachmentUrl = null;
    }

    return this.tasks.update(command.id, {
      title: command.title,
      description: command.description,
      priority: command.priority,
      dueDate: command.dueDate,
      status,
      attachmentUrl,
    });
  }
}
