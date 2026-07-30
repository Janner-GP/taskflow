import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, OnInit, signal } from '@angular/core';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  RefresherCustomEvent,
  SegmentCustomEvent,
  SelectCustomEvent,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { isApiError } from '../../../core/http/api-error';
import { MessageResult, Priority, Task, TaskStatus } from '../domain/task.model';
import { TasksStore } from '../state/tasks.store';
import { CreateTaskModalComponent } from './create-task-modal';

/** Listing + filters + full CRUD (create/edit/complete/delete). */
@Component({
  selector: 'app-tasks-page',
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonRefresher,
    IonRefresherContent,
    IonList,
    IonItemSliding,
    IonItem,
    IonItemOptions,
    IonItemOption,
    IonLabel,
    IonBadge,
    IonNote,
    DatePipe,
    TranslatePipe,
    CreateTaskModalComponent,
  ],
  templateUrl: './tasks.page.html',
  styleUrl: './tasks.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TasksPage implements OnInit {
  private readonly tasksStore = inject(TasksStore);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly translate = inject(TranslateService);

  protected readonly priorities = [Priority.LOW, Priority.MEDIUM, Priority.HIGH];
  protected readonly tasks = this.tasksStore.tasks;
  protected readonly loading = this.tasksStore.loading;
  protected readonly error = this.tasksStore.error;
  protected readonly filter = this.tasksStore.filter;
  protected readonly showCreate = signal(false);
  /** Tarea en edición; `null` cuando el modal está en modo creación. */
  protected readonly editing = signal<Task | null>(null);

  /** Pending pull-to-refresh handle; released once `loading()` settles back to `false`. */
  private pendingRefresh: RefresherCustomEvent['detail'] | null = null;

  constructor() {
    effect(() => {
      if (!this.loading() && this.pendingRefresh) {
        this.pendingRefresh.complete();
        this.pendingRefresh = null;
      }
    });
  }

  ngOnInit(): void {
    this.tasksStore.load();
  }

  protected onStatusChange(event: SegmentCustomEvent): void {
    const value = event.detail.value as string;
    this.tasksStore.setStatusFilter(value ? (value as TaskStatus) : null);
  }

  protected onPriorityChange(event: SelectCustomEvent): void {
    const value = event.detail.value as string;
    this.tasksStore.setPriorityFilter(value ? (value as Priority) : null);
  }

  protected onRefresh(event: RefresherCustomEvent): void {
    this.pendingRefresh = event.detail;
    this.tasksStore.load();
  }

  protected retry(): void {
    this.tasksStore.load();
  }

  protected toggle(task: Task): void {
    this.tasksStore.toggleComplete(task).subscribe({
      next: (res) => void this.presentToast(res.message, 'success'),
      error: (err: unknown) => void this.presentToast(isApiError(err) ? err.message : '', 'danger'),
    });
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.showCreate.set(true);
  }

  protected openEdit(task: Task): void {
    this.editing.set(task);
    this.showCreate.set(true);
  }

  protected closeModal(): void {
    this.showCreate.set(false);
    this.editing.set(null);
  }

  /** Confirmación antes de borrar: el borrado es irreversible. */
  protected async confirmDelete(task: Task): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translate.instant('tasks.delete.header'),
      message: this.translate.instant('tasks.delete.message', { title: task.title }),
      buttons: [
        { text: this.translate.instant('common.cancel'), role: 'cancel' },
        {
          text: this.translate.instant('tasks.delete.confirm'),
          role: 'destructive',
          handler: () => {
            this.tasksStore.remove(task.id).subscribe({
              next: (res: MessageResult) => void this.presentToast(res.message, 'success'),
              error: (err: unknown) => void this.presentToast(isApiError(err) ? err.message : '', 'danger'),
            });
          },
        },
      ],
    });
    await alert.present();
  }

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

  protected priorityColor(priority: Priority): string {
    return `var(--color-priority-${priority.toLowerCase()})`;
  }

  protected statusColor(status: TaskStatus): string {
    return status === 'COMPLETED' ? 'success' : 'medium';
  }
}
