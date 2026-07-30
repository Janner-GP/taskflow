import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type {
  PaginatedTasks,
  TaskFilters,
  TaskPatch,
  TaskRepositoryPort,
} from '../domain/task-repository.port';
import type { NewTask, Task } from '../domain/task.entity';
import { toDomainTask } from './task.mapper';

@Injectable()
export class PrismaTaskRepository implements TaskRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Task | null> {
    const row = await this.prisma.task.findUnique({ where: { id } });

    return row ? toDomainTask(row) : null;
  }

  async findManyByUser(
    userId: string,
    filters: TaskFilters,
  ): Promise<PaginatedTasks> {
    const where: Prisma.TaskWhereInput = {
      userId,
      status: filters.status,
      priority: filters.priority,
      title: filters.search
        ? { contains: filters.search, mode: 'insensitive' }
        : undefined,
    };

    const [rows, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
        orderBy: { [filters.sortBy]: filters.sortDir },
      }),
      this.prisma.task.count({ where }),
    ]);

    return { data: rows.map(toDomainTask), total };
  }

  async create(task: NewTask): Promise<Task> {
    const row = await this.prisma.task.create({
      data: {
        userId: task.userId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        dueDate: task.dueDate,
      },
    });

    return toDomainTask(row);
  }

  async update(id: string, patch: TaskPatch): Promise<Task> {
    const row = await this.prisma.task.update({
      where: { id },
      data: {
        title: patch.title,
        description: patch.description,
        priority: patch.priority,
        dueDate: patch.dueDate,
        status: patch.status,
        attachmentUrl: patch.attachmentUrl,
      },
    });

    return toDomainTask(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.task.delete({ where: { id } });
  }
}
