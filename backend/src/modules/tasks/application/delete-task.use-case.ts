import { Inject, Injectable } from '@nestjs/common';

import { STORAGE_SERVICE } from '../../../shared/infrastructure/storage/storage.port';
import type { StorageServicePort } from '../../../shared/infrastructure/storage/storage.port';
import { TASK_REPOSITORY } from '../domain/task-repository.port';
import type { TaskRepositoryPort } from '../domain/task-repository.port';
import { TaskNotFoundError } from '../domain/task.errors';

@Injectable()
export class DeleteTask {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly tasks: TaskRepositoryPort,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageServicePort,
  ) {}

  async execute(id: string, userId: string): Promise<void> {
    const task = await this.tasks.findById(id);

    if (!task) {
      throw new TaskNotFoundError();
    }

    task.assertOwnedBy(userId);

    if (task.attachmentUrl) {
      try {
        const key = new URL(task.attachmentUrl).pathname.slice(1);
        await this.storage.deleteIfOrphaned(key, id);
      } catch {
        // URL malformada — ignorar, no bloquear el delete
      }
    }

    await this.tasks.delete(id);
  }
}
