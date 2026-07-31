import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
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

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

  private readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly attachmentFile = signal<File | null>(null);
  readonly isDragOver = signal(false);

  protected readonly previewUrl = computed(() => {
    const f = this.attachmentFile();
    return f ? URL.createObjectURL(f) : null;
  });

  protected readonly dropzoneClass = computed(() => {
    const base =
      'group relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 ' +
      'rounded-xl border-2 border-dashed px-4 py-5 outline-none transition-all duration-200 ' +
      'focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2';
    const active =
      'border-primary-400 bg-primary-50 dark:border-primary-500 dark:bg-primary-950/40';
    const idle =
      'border-surface-300 bg-surface-50 hover:border-primary-300 hover:bg-primary-50/40 ' +
      'dark:border-surface-600 dark:bg-surface-800 dark:hover:border-primary-700 dark:hover:bg-primary-950/20';
    return `${base} ${this.isDragOver() ? active : idle}`;
  });

  protected readonly dropzoneIconClass = computed(() => {
    const base = 'material-symbols-outlined text-4xl transition-colors duration-200';
    return this.isDragOver()
      ? `${base} text-primary-500`
      : `${base} text-surface-400 dark:text-surface-500 group-hover:text-primary-400`;
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

  protected readonly errorKey = (control: typeof this.form.controls.title) =>
    firstErrorKey(control, 'tasks.form');

  constructor() {
    effect(() => {
      const task = this.task();
      this.form.reset({
        title: task?.title ?? '',
        description: task?.description ?? '',
        priority: task?.priority ?? 'MEDIUM',
        dueDate: task?.dueDate ? new Date(task.dueDate) : null,
      });
      this.attachmentFile.set(null);
      this.isDragOver.set(false);
    });
  }

  /** Llamado por el host (TasksPage) al cerrar el diálogo. */
  resetForm(): void {
    this.form.reset({ title: '', description: '', priority: 'MEDIUM', dueDate: null });
    this.attachmentFile.set(null);
    this.isDragOver.set(false);
  }

  protected onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (file && ACCEPTED_TYPES.includes(file.type)) {
      this.attachmentFile.set(file);
    }
    // Reset el input para que volver a seleccionar el mismo archivo dispare el evento
    (event.target as HTMLInputElement).value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.stopPropagation();
    // Solo desactivar si el cursor sale fuera del drop zone, no al moverse entre hijos
    const target = event.currentTarget as HTMLElement;
    if (!target.contains(event.relatedTarget as Node)) {
      this.isDragOver.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file && ACCEPTED_TYPES.includes(file.type)) {
      this.attachmentFile.set(file);
    }
  }

  protected onDropzoneClick(): void {
    if (!this.attachmentFile()) {
      this.fileInputRef()?.nativeElement.click();
    }
  }

  protected clearAttachment(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.attachmentFile.set(null);
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
