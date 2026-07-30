import type { NewTask, Priority, Task, TaskStatus } from './task.entity';

export const TASK_REPOSITORY = Symbol('TaskRepositoryPort');

export interface TaskFilters {
  status?: TaskStatus;
  priority?: Priority;
  search?: string;
  page: number;
  limit: number;
  sortBy: 'createdAt' | 'dueDate' | 'priority';
  sortDir: 'asc' | 'desc';
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  priority?: Priority;
  dueDate?: Date | null;
  status?: TaskStatus;
  attachmentUrl?: string | null;
}

export interface PaginatedTasks {
  data: Task[];
  total: number;
}

export interface TaskRepositoryPort {
  findById(id: string): Promise<Task | null>;
  findManyByUser(userId: string, filters: TaskFilters): Promise<PaginatedTasks>;
  create(task: NewTask): Promise<Task>;
  update(id: string, patch: TaskPatch): Promise<Task>;
  delete(id: string): Promise<void>;
}
