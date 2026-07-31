import { Inject, Injectable } from '@nestjs/common';

import { STORAGE_SERVICE } from '../../../shared/infrastructure/storage/storage.port';
import type { StorageServicePort } from '../../../shared/infrastructure/storage/storage.port';
import { TASK_REPOSITORY } from '../domain/task-repository.port';
import type { TaskRepositoryPort } from '../domain/task-repository.port';
import { TaskNotFoundError } from '../domain/task.errors';
import type { Task } from '../domain/task.entity';

export interface UploadTaskAttachmentCommand {
  taskId: string;
  userId: string;
  buffer: Buffer;
  mimeType: string;
  ext: string;
}

@Injectable()
export class UploadTaskAttachment {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly tasks: TaskRepositoryPort,
    @Inject(STORAGE_SERVICE)
    private readonly storage: StorageServicePort,
  ) {}

  async execute(cmd: UploadTaskAttachmentCommand): Promise<Task> {
    const task = await this.tasks.findById(cmd.taskId);

    if (!task) {
      throw new TaskNotFoundError();
    }

    task.assertOwnedBy(cmd.userId);

    // Si ya tenía adjunto distinto, liberar el objeto S3 si nadie más lo usa.
    if (task.attachmentUrl) {
      const oldKey = this.extractKey(task.attachmentUrl);
      if (oldKey) {
        await this.storage.deleteIfOrphaned(oldKey, cmd.taskId);
      }
    }

    const { url } = await this.storage.upload(
      cmd.buffer,
      cmd.mimeType,
      cmd.ext,
    );

    return this.tasks.update(cmd.taskId, { attachmentUrl: url });
  }

  private extractKey(url: string): string | null {
    try {
      return new URL(url).pathname.slice(1); // quita el "/" inicial
    } catch {
      return null;
    }
  }
}
