import { Inject, Injectable } from '@nestjs/common';

import { TASK_REPOSITORY } from '../domain/task-repository.port';
import type { TaskRepositoryPort } from '../domain/task-repository.port';
import { TaskNotFoundError } from '../domain/task.errors';
import type { Task } from '../domain/task.entity';

@Injectable()
export class GetTask {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly tasks: TaskRepositoryPort,
  ) {}

  async execute(id: string, userId: string): Promise<Task> {
    const task = await this.tasks.findById(id);

    if (!task) {
      throw new TaskNotFoundError();
    }

    task.assertOwnedBy(userId);

    return task;
  }
}
