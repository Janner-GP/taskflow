import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonHeader,
  IonInput,
  IonModal,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { isApiError } from '../../../core/http/api-error';
import { CAMERA_PORT, CapturedPhoto } from '../../../core/native/camera.port';
import { TaskNotificationsService } from '../application/task-notifications.service';
import { TaskUploadService } from '../application/task-upload.service';
import { CreateTaskInput, Priority, Task, UpdateTaskInput } from '../domain/task.model';
import { TasksStore } from '../state/tasks.store';

/**
 * Mismo modal para crear y editar: `task` en `null` es modo creación. Habla con
 * el `TasksStore` directamente; el store ya refleja el cambio en la lista.
 *
 * El mensaje del toast NO se arma aquí: llega ya localizado desde el backend
 * (`{ message }`) según `Accept-Language`. Título del toast = etiqueta local.
 */
@Component({
  selector: 'app-create-task-modal',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonDatetime,
    IonNote,
    IonSpinner,
  ],
  templateUrl: './create-task-modal.html',
  styleUrl: './create-task-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateTaskModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly tasksStore = inject(TasksStore);
  private readonly toastController = inject(ToastController);
  private readonly translate = inject(TranslateService);
  private readonly taskNotifications = inject(TaskNotificationsService);
  private readonly cameraPort = inject(CAMERA_PORT);
  private readonly taskUploadService = inject(TaskUploadService);

  readonly isOpen = input(false);
  readonly task = input<Task | null>(null);
  readonly closed = output<void>();

  protected readonly priorities = [Priority.LOW, Priority.MEDIUM, Priority.HIGH];
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly capturedPhoto = signal<CapturedPhoto | null>(null);

  protected readonly titleKey = computed(() => (this.task() ? 'tasks.edit.title' : 'tasks.create.title'));

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required]],
    description: [''],
    priority: [Priority.MEDIUM as Priority, [Validators.required]],
    dueDate: [null as string | null],
  });

  constructor() {
    // Al abrir en modo edición, el form se puebla con la tarea; en creación se limpia.
    effect(() => {
      const task = this.task();
      if (this.isOpen()) {
        this.form.reset({
          title: task?.title ?? '',
          description: task?.description ?? '',
          priority: task?.priority ?? Priority.MEDIUM,
          dueDate: task?.dueDate ?? null,
        });
        this.submitted.set(false);
        this.errorKey.set(null);
        this.capturedPhoto.set(null);
      }
    });
  }

  protected async onTakePhoto(): Promise<void> {
    const photo = await this.cameraPort.takePhoto();
    if (photo) this.capturedPhoto.set(photo);
  }

  protected async onPickGallery(): Promise<void> {
    const photo = await this.cameraPort.pickFromGallery();
    if (photo) this.capturedPhoto.set(photo);
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      return;
    }

    const { title, description, priority, dueDate } = this.form.getRawValue();
    const payload = {
      title,
      priority,
      ...(description ? { description } : {}),
      ...(dueDate ? { dueDate } : {}),
    };

    const editing = this.task();
    const request$ = editing
      ? this.tasksStore.update(editing.id, payload as UpdateTaskInput)
      : this.tasksStore.create(payload as CreateTaskInput);

    this.saving.set(true);
    this.errorKey.set(null);
    request$.subscribe({
      next: (res) => {
        this.saving.set(false);
        // Solo al crear: recordatorios locales y subida de foto adjunta.
        if (!editing) {
          void this.taskNotifications.onTaskCreated(res.data);
          const photo = this.capturedPhoto();
          if (photo) {
            this.taskUploadService
              .upload(res.data.id, photo.base64, photo.format)
              .subscribe({
                next: () => this.tasksStore.load(),
                error: () => {
                  // Best-effort: la tarea ya fue creada aunque el adjunto falle.
                },
              });
          }
        }
        void this.presentToast(res.message, 'success');
        this.resetAndClose();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        void this.presentToast(isApiError(err) ? err.message : '', 'danger');
      },
    });
  }

  protected cancel(): void {
    this.resetAndClose();
  }

  private resetAndClose(): void {
    this.form.reset({ title: '', description: '', priority: Priority.MEDIUM, dueDate: null });
    this.submitted.set(false);
    this.errorKey.set(null);
    this.capturedPhoto.set(null);
    this.closed.emit();
  }

  /** Toast con título (etiqueta local) + descripción (mensaje del backend). */
  private async presentToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({
      header: this.translate.instant(color === 'success' ? 'common.toast.success' : 'common.toast.error'),
      message: message || this.translate.instant('errors.unexpected'),
      duration: 2500,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
