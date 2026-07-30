/**
 * Modelos de tarea del contrato (`docs/CONTRACT.md`).
 *
 * `userId` no aparece: el dueño se deduce del token y nunca viaja en la
 * respuesta, así que un cliente no tiene forma de pedir tareas de otro usuario.
 */
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

export type TaskStatus = 'PENDING' | 'COMPLETED';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  /** ISO 8601 */
  dueDate: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaskSortBy = 'createdAt' | 'dueDate' | 'priority';

export type SortDirection = 'asc' | 'desc';

/** Query de `GET /tasks`. Todo se resuelve en SQL, no en memoria. */
export interface TaskQuery {
  status?: TaskStatus;
  priority?: Priority;
  /** Búsqueda parcial e insensible a mayúsculas sobre el título. */
  search?: string;
  page?: number;
  /** Por defecto 20, máximo 100. */
  limit?: number;
  sortBy?: TaskSortBy;
  sortDir?: SortDirection;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Envoltorio paginado que devuelve `GET /tasks`. */
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/**
 * Envelope de las mutaciones (`docs/CONTRACT.md`): el recurso + el mensaje ya
 * localizado por el backend. El texto del toast NO se arma en el front — nace
 * en el servidor según `Accept-Language`.
 */
export interface MutationResult<T> {
  data: T;
  message: string;
}

/** Envelope de una mutación sin recurso de vuelta (delete). */
export interface MessageResult {
  data: null;
  message: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority: Priority;
  dueDate?: string;
}

/** `PATCH /tasks/:id` — también es el endpoint para completar/reabrir. */
export type UpdateTaskRequest = Partial<Omit<CreateTaskRequest, 'priority'>> & {
  priority?: Priority;
  status?: TaskStatus;
};
