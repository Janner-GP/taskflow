/**
 * Task domain types, mirroring docs/CONTRACT.md.
 *
 * Dates stay as ISO strings, exactly as they arrive. Parsing them into `Date`
 * belongs to the infrastructure layer that talks to HTTP, not to the domain —
 * and the timezone handling that comes with it is easier to keep in one place.
 */
export const Priority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;

export type Priority = (typeof Priority)[keyof typeof Priority];

export const TaskStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * `userId` is absent by design: ownership comes from the token, and there is no
 * query parameter that could ask for someone else's tasks.
 */

export type TaskSortField = 'createdAt' | 'dueDate' | 'priority';
export type SortDirection = 'asc' | 'desc';

export interface TaskQuery {
  status?: TaskStatus;
  priority?: Priority;
  search?: string;
  page?: number;
  /** Server caps this at 100. */
  limit?: number;
  sortBy?: TaskSortField;
  sortDir?: SortDirection;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/**
 * Envelope de las mutaciones (docs/CONTRACT.md): recurso + mensaje YA localizado
 * por el backend según `Accept-Language`. El texto del toast nace en el servidor.
 */
export interface MutationResult<T> {
  data: T;
  message: string;
}

export interface MessageResult {
  data: null;
  message: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority: Priority;
  dueDate?: string;
}

/** Also the endpoint that completes or reopens a task, via `status`. */
export type UpdateTaskInput = Partial<CreateTaskInput & { status: TaskStatus }>;
