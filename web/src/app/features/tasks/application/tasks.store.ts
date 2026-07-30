import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { removeEntity, setAllEntities, setEntity, withEntities } from '@ngrx/signals/entities';
import { firstValueFrom } from 'rxjs';

import { ApiErrorCode, isApiError } from '../../../core/api/api-error';
import { CreateTaskRequest, PageMeta, Priority, Task, TaskStatus, UpdateTaskRequest } from '../domain/task';
import { TASK_REPOSITORY } from '../domain/task.repository';

interface TasksFilters {
  status: TaskStatus | null;
  priority: Priority | null;
  search: string;
}

/**
 * Resultado de una mutación de cara a la UI: si salió bien y el `message` YA
 * localizado que devolvió el backend (o el del error). La página lo usa tal cual
 * como cuerpo del toast — no arma texto por su cuenta.
 * `taskId` se rellena en `create` para que la página pueda encadenar un upload.
 */
export interface MutationOutcome {
  ok: boolean;
  message: string;
  taskId?: string;
}

interface TasksState {
  filters: TasksFilters;
  page: number;
  limit: number;
  meta: PageMeta;
  loading: boolean;
  error: ApiErrorCode | null;
}

const initialState: TasksState = {
  filters: { status: null, priority: null, search: '' },
  page: 1,
  limit: 20,
  meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  loading: false,
  error: null,
};

/**
 * Estado de la lista de tareas.
 *
 * Filtros, búsqueda y paginación viven aquí pero se RESUELVEN en el servidor
 * (`docs/CONTRACT.md` → `GET /tasks`): cambiar un filtro no filtra el array en
 * cliente, dispara una query nueva. `withEntities` guarda solo la página
 * actual, nunca "todas las tareas".
 */
export const TasksStore = signalStore(
  { providedIn: 'root' },
  withEntities<Task>(),
  withState(initialState),

  withComputed(({ filters }) => ({
    isFiltered: computed(() => filters().status !== null || filters().priority !== null || filters().search !== ''),
  })),

  withMethods((store, repository = inject(TASK_REPOSITORY)) => {
    async function load(): Promise<void> {
      patchState(store, { loading: true, error: null });
      const { status, priority, search } = store.filters();

      try {
        const response = await firstValueFrom(
          repository.list({
            status: status ?? undefined,
            priority: priority ?? undefined,
            search: search || undefined,
            page: store.page(),
            limit: store.limit(),
          }),
        );
        patchState(store, setAllEntities(response.data), { meta: response.meta, loading: false });
      } catch (error: unknown) {
        patchState(store, { loading: false, error: isApiError(error) ? error.code : 'INTERNAL_ERROR' });
      }
    }

    /** Mensaje del backend cuando una mutación falla (o vacío si no es ApiError). */
    function failureMessage(error: unknown): string {
      return isApiError(error) ? error.message : '';
    }

    /** PATCH ya devuelve la tarea completa: se aplica en sitio, sin re-listar. */
    async function updateTask(id: string, request: UpdateTaskRequest): Promise<MutationOutcome> {
      try {
        const { data, message } = await firstValueFrom(repository.update(id, request));
        patchState(store, setEntity(data));
        return { ok: true, message };
      } catch (error: unknown) {
        return { ok: false, message: failureMessage(error) };
      }
    }

    return {
      load,
      update: updateTask,

      setStatusFilter(status: TaskStatus | null): void {
        patchState(store, { filters: { ...store.filters(), status }, page: 1 });
        void load();
      },

      setPriorityFilter(priority: Priority | null): void {
        patchState(store, { filters: { ...store.filters(), priority }, page: 1 });
        void load();
      },

      setSearch(search: string): void {
        patchState(store, { filters: { ...store.filters(), search }, page: 1 });
        void load();
      },

      setPage(page: number): void {
        patchState(store, { page });
        void load();
      },

      /**
       * El total y el orden de inserción los decide el servidor: a diferencia
       * de `update`/`toggleStatus`, aquí sí se re-lista.
       */
      async create(request: CreateTaskRequest): Promise<MutationOutcome> {
        patchState(store, { loading: true, error: null });

        try {
          const { data, message } = await firstValueFrom(repository.create(request));
          await load();
          return { ok: true, message, taskId: data.id };
        } catch (error: unknown) {
          patchState(store, { loading: false });
          return { ok: false, message: failureMessage(error) };
        }
      },

      /** Un click, sin abrir el formulario: PATCH `{ status }` y update local. */
      toggleStatus(task: Task): Promise<MutationOutcome> {
        return updateTask(task.id, { status: task.status === 'PENDING' ? 'COMPLETED' : 'PENDING' });
      },

      async remove(id: string): Promise<MutationOutcome> {
        try {
          const { message } = await firstValueFrom(repository.delete(id));

          const remainingOnPage = store.entities().length - 1;
          const meta = store.meta();
          patchState(store, removeEntity(id), { meta: { ...meta, total: Math.max(meta.total - 1, 0) } });

          // Página vaciada por el borrado: retrocede una y refresca esa página.
          if (remainingOnPage === 0 && store.page() > 1) {
            patchState(store, { page: store.page() - 1 });
            await load();
          }

          return { ok: true, message };
        } catch (error: unknown) {
          return { ok: false, message: failureMessage(error) };
        }
      },

      async uploadAttachment(taskId: string, file: File): Promise<MutationOutcome> {
        try {
          const { data, message } = await firstValueFrom(repository.uploadAttachment(taskId, file));
          patchState(store, setEntity(data));
          return { ok: true, message };
        } catch (error: unknown) {
          return { ok: false, message: failureMessage(error) };
        }
      },

      clearError(): void {
        patchState(store, { error: null });
      },
    };
  }),
);
