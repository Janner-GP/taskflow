import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { DatePicker } from 'primeng/datepicker';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';

import { firstErrorKey } from '../../../../shared/forms/validators';
import { CreateTaskRequest, Priority, Task, UpdateTaskRequest } from '../../domain/task';

interface PriorityOption {
  labelKey: string;
  value: Priority;
}

/**
 * Mismo formulario para crear y editar: la diferencia la decide quien lo
 * aloja (`tasks.page`) al escuchar `save` y elegir `create` o `update`.
 * `task` en `null` es el modo creación.
 */
@Component({
  selector: 'app-task-form',
  imports: [ReactiveFormsModule, TranslatePipe, InputText, Textarea, Select, DatePicker, Button],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-form.html',
  styleUrl: './task-form.scss',
})
export class TaskForm {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  task = input<Task | null>(null);
  saving = input(false);

  save = output<CreateTaskRequest | UpdateTaskRequest>();
  cancelled = output<void>();

  /** File seleccionado por el usuario; vive fuera del FormGroup. */
  readonly attachmentFile = signal<File | null>(null);

  protected readonly previewUrl = computed(() => {
    const f = this.attachmentFile();
    return f ? URL.createObjectURL(f) : null;
  });

  protected readonly priorities: PriorityOption[] = [
    { labelKey: 'tasks.priority.LOW', value: 'LOW' },
    { labelKey: 'tasks.priority.MEDIUM', value: 'MEDIUM' },
    { labelKey: 'tasks.priority.HIGH', value: 'HIGH' },
  ];

  protected readonly form = this.formBuilder.group({
    title: ['', [Validators.required]],
    description: [''],
    priority: this.formBuilder.control<Priority>('MEDIUM', { validators: [Validators.required] }),
    dueDate: this.formBuilder.control<Date | null>(null),
  });

  protected readonly errorKey = (control: typeof this.form.controls.title) => firstErrorKey(control, 'tasks.form');

  constructor() {
    // El diálogo se reutiliza para crear/editar: cada tarea nueva repuebla el form.
    effect(() => {
      const task = this.task();
      this.form.reset({
        title: task?.title ?? '',
        description: task?.description ?? '',
        priority: task?.priority ?? 'MEDIUM',
        dueDate: task?.dueDate ? new Date(task.dueDate) : null,
      });
      this.attachmentFile.set(null);
    });
  }

  protected onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.attachmentFile.set(file);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { title, description, priority, dueDate } = this.form.getRawValue();
    this.save.emit({
      title,
      description: description.trim() ? description : undefined,
      priority,
      dueDate: dueDate ? dueDate.toISOString() : undefined,
    });
  }
}
