import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { Observable, tap } from 'rxjs';

import { isApiError } from '../../../core/http/api-error';
import { TASK_REPOSITORY } from '../domain/task-repository.port';
import {
  CreateTaskInput,
  MessageResult,
  MutationResult,
  Priority,
  Task,
  TaskStatus,
  UpdateTaskInput,
} from '../domain/task.model';

interface TaskFilter {
  status: TaskStatus | null;
  priority: Priority | null;
}

interface TasksState {
  tasks: Task[];
  filter: TaskFilter;
  loading: boolean;
  error: string | null;
}

const initialState: TasksState = {
  tasks: [],
  filter: { status: null, priority: null },
  loading: false,
  error: null,
};

/**
 * Filters resolve server-side (query params), per docs/CONTRACT.md — this
 * store re-requests the list on every filter change instead of filtering the
 * already-loaded array in memory.
 */
export const TasksStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const taskRepository = inject(TASK_REPOSITORY);

    function errorCode(err: unknown): string {
      return isApiError(err) ? err.code : 'NETWORK_ERROR';
    }

    function load(): void {
      const { status, priority } = store.filter();
      patchState(store, { loading: true, error: null });
      taskRepository.list({ status: status ?? undefined, priority: priority ?? undefined, limit: 100 }).subscribe({
        next: (page) => patchState(store, { tasks: page.data, loading: false }),
        error: (err: unknown) => patchState(store, { loading: false, error: errorCode(err) }),
      });
    }

    return {
      load,

      setStatusFilter(status: TaskStatus | null): void {
        patchState(store, (state) => ({ filter: { ...state.filter, status } }));
        load();
      },

      setPriorityFilter(priority: Priority | null): void {
        patchState(store, (state) => ({ filter: { ...state.filter, priority } }));
        load();
      },

      /** Prepends the new task rather than reloading — avoids a round trip the UI doesn't need. */
      create(input: CreateTaskInput): Observable<MutationResult<Task>> {
        return taskRepository
          .create(input)
          .pipe(tap((res) => patchState(store, (state) => ({ tasks: [res.data, ...state.tasks] }))));
      },

      /** Edición completa: aplica la tarea devuelta en sitio, sin re-listar. */
      update(id: string, input: UpdateTaskInput): Observable<MutationResult<Task>> {
        return taskRepository.update(id, input).pipe(
          tap((res) =>
            patchState(store, (state) => ({
              tasks: state.tasks.map((t) => (t.id === res.data.id ? res.data : t)),
            })),
          ),
        );
      },

      /** Toggle for the swipe/checkbox action — same endpoint used to complete or reopen. */
      toggleComplete(task: Task): Observable<MutationResult<Task>> {
        const input: UpdateTaskInput = { status: task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED' };
        return taskRepository.update(task.id, input).pipe(
          tap((res) =>
            patchState(store, (state) => ({
              tasks: state.tasks.map((t) => (t.id === res.data.id ? res.data : t)),
            })),
          ),
        );
      },

      /** Borra en el servidor y saca la tarea de la lista local. */
      remove(id: string): Observable<MessageResult> {
        return taskRepository
          .delete(id)
          .pipe(tap(() => patchState(store, (state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }))));
      },
    };
  }),
);
