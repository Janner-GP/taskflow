import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Dialog } from 'primeng/dialog';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Paginator, PaginatorState } from 'primeng/paginator';
import { Select } from 'primeng/select';
import { Tag } from 'primeng/tag';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../../shared/ui/error-state/error-state';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { TasksStore } from '../application/tasks.store';
import { CreateTaskRequest, Priority, Task, TaskStatus, UpdateTaskRequest } from '../domain/task';
import { TaskForm } from './task-form/task-form';

interface FilterOption<T> {
  labelKey: string;
  value: T;
}

/** Severidad del `p-tag` por prioridad — el mismo mapa que la leyenda de la UI. */
const PRIORITY_SEVERITY: Record<Priority, 'success' | 'warn' | 'danger'> = {
  LOW: 'success',
  MEDIUM: 'warn',
  HIGH: 'danger',
};

/**
 * Pantalla de gestión de tareas (Fase 4).
 *
 * No filtra ni pagina en memoria: cada cambio de filtro, búsqueda o página pide
 * una query nueva al backend a través del `TasksStore`. La lista solo pinta la
 * página actual. Estados loading / vacío / error son componentes explícitos, no
 * `@if` sueltos repartidos por la plantilla.
 */
@Component({
  selector: 'app-tasks',
  imports: [
    FormsModule,
    DatePipe,
    TranslatePipe,
    Button,
    Checkbox,
    ConfirmDialog,
    Dialog,
    IconField,
    InputIcon,
    InputText,
    Paginator,
    Select,
    Tag,
    TaskForm,
    EmptyState,
    ErrorState,
    LoadingState,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tasks.page.html',
  styleUrl: './tasks.page.scss',
})
export class TasksPage {
  protected readonly store = inject(TasksStore);
  private readonly messages = inject(MessageService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly translate = inject(TranslateService);

  private readonly taskFormRef = viewChild<TaskForm>('taskForm');

  protected readonly prioritySeverity = PRIORITY_SEVERITY;

  protected readonly statusOptions: FilterOption<TaskStatus>[] = [
    { labelKey: 'tasks.status.PENDING', value: 'PENDING' },
    { labelKey: 'tasks.status.COMPLETED', value: 'COMPLETED' },
  ];

  protected readonly priorityOptions: FilterOption<Priority>[] = [
    { labelKey: 'tasks.priority.LOW', value: 'LOW' },
    { labelKey: 'tasks.priority.MEDIUM', value: 'MEDIUM' },
    { labelKey: 'tasks.priority.HIGH', value: 'HIGH' },
  ];

  /** Texto del buscador; se propaga al store con debounce, no en cada tecla. */
  protected readonly search = signal('');

  // Estado del diálogo crear/editar. `editing` en `null` es modo creación.
  protected readonly dialogVisible = signal(false);
  protected readonly editing = signal<Task | null>(null);
  protected readonly saving = signal(false);

  protected readonly firstRecord = computed(() => (this.store.page() - 1) * this.store.limit());
  protected readonly showPaginator = computed(() => this.store.meta().totalPages > 1);

  /** Distingue "no hay tareas" de "los filtros no devuelven nada". */
  protected readonly showEmpty = computed(
    () => !this.store.loading() && this.store.error() === null && this.store.entities().length === 0,
  );
  protected readonly showError = computed(
    () => !this.store.loading() && this.store.error() !== null && this.store.entities().length === 0,
  );

  protected readonly dialogTitleKey = computed(() =>
    this.editing() ? 'tasks.form.editTitle' : 'tasks.form.createTitle',
  );

  constructor() {
    // Búsqueda server-side con debounce: una query cada 300 ms de calma, no una
    // por pulsación, y sin repetir la misma consulta dos veces seguidas.
    toObservable(this.search)
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((term) => this.store.setSearch(term.trim()));

    void this.store.load();
  }

  protected onStatusChange(status: TaskStatus | null): void {
    this.store.setStatusFilter(status);
  }

  protected onPriorityChange(priority: Priority | null): void {
    this.store.setPriorityFilter(priority);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.store.setStatusFilter(null);
    this.store.setPriorityFilter(null);
    this.store.setSearch('');
  }

  protected onPageChange(event: PaginatorState): void {
    this.store.setPage((event.page ?? 0) + 1);
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.dialogVisible.set(true);
  }

  protected openEdit(task: Task): void {
    this.editing.set(task);
    this.dialogVisible.set(true);
  }

  protected async onSave(request: CreateTaskRequest | UpdateTaskRequest): Promise<void> {
    this.saving.set(true);
    const target = this.editing();
    const formRef = this.taskFormRef();
    const file = formRef?.attachmentFile() ?? null;

    // Si el usuario marcó eliminar y no hay archivo nuevo, pedir al backend que borre el adjunto.
    const shouldRemove =
      !!target && (formRef?.removeExistingAttachment() ?? false) && !file;

    const outcome = target
      ? await this.store.update(target.id, { ...request, removeAttachment: shouldRemove })
      : await this.store.create(request as CreateTaskRequest);

    this.saving.set(false);

    if (!outcome.ok) {
      this.toastError(outcome.message);
      return;
    }

    const taskId = target ? target.id : outcome.taskId;
    if (file && taskId) {
      const uploadOutcome = await this.store.uploadAttachment(taskId, file);
      if (!uploadOutcome.ok) {
        this.toastError(uploadOutcome.message);
      }
    }

    this.dialogVisible.set(false);
    this.toastSuccess(outcome.message);
  }

  protected async toggle(task: Task): Promise<void> {
    const outcome = await this.store.toggleStatus(task);
    if (outcome.ok) {
      this.toastSuccess(outcome.message);
    } else {
      this.toastError(outcome.message);
    }
  }

  protected confirmDelete(task: Task): void {
    this.confirmation.confirm({
      header: this.translate.instant('tasks.delete.header'),
      message: this.translate.instant('tasks.delete.message', { title: task.title }),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.translate.instant('tasks.delete.confirm'),
      rejectLabel: this.translate.instant('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        const outcome = await this.store.remove(task.id);
        if (outcome.ok) {
          this.toastSuccess(outcome.message);
        } else {
          this.toastError(outcome.message);
        }
      },
    });
  }

  protected onDialogHide(): void {
    this.editing.set(null);
    this.taskFormRef()?.resetForm();
  }

  protected retry(): void {
    this.store.clearError();
    void this.store.load();
  }

  /** Una tarea pendiente cuya fecha límite ya pasó: se resalta en rojo. */
  protected isOverdue(task: Task): boolean {
    return task.status === 'PENDING' && task.dueDate !== null && new Date(task.dueDate).getTime() < Date.now();
  }

  /**
   * Toasts SIEMPRE con título + descripción. El título es la etiqueta de
   * categoría (front); la descripción es el mensaje que llega YA localizado
   * desde el backend. Si por lo que sea no vino texto, se cae a uno genérico.
   */
  private toastSuccess(detail: string): void {
    this.messages.add({
      severity: 'success',
      summary: this.translate.instant('common.toast.success'),
      detail: detail || this.translate.instant('common.toast.successDetail'),
      life: 2500,
    });
  }

  private toastError(detail: string): void {
    this.messages.add({
      severity: 'error',
      summary: this.translate.instant('common.toast.error'),
      detail: detail || this.translate.instant('common.toast.errorDetail'),
      life: 4000,
    });
  }
}
