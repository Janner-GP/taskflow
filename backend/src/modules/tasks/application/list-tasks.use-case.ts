import { Inject, Injectable } from '@nestjs/common';

import { TASK_REPOSITORY } from '../domain/task-repository.port';
import type {
  TaskFilters,
  TaskRepositoryPort,
} from '../domain/task-repository.port';
import type { Task } from '../domain/task.entity';

export type ListTasksQuery = TaskFilters & { userId: string };

export interface ListTasksResult {
  data: Task[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class ListTasks {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly tasks: TaskRepositoryPort,
  ) {}

  async execute(query: ListTasksQuery): Promise<ListTasksResult> {
    const { data, total } = await this.tasks.findManyByUser(
      query.userId,
      query,
    );

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
