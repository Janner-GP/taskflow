import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput, IonNote, IonSpinner } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';

import { ApiErrorCode } from '../../../core/http/api-error';
import { AuthStore } from '../state/auth.store';
import { passwordMatchValidator, passwordStrengthValidator } from '../validators/password.validator';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, IonContent, IonButton, IonInput, IonNote, IonSpinner],
  templateUrl: './register.page.html',
  styleUrl: './register.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly isLoading = this.authStore.isLoading;
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, passwordStrengthValidator()]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator('password', 'confirmPassword') },
  );

  protected readonly errorKey = computed(() => {
    const code = this.authStore.error();
    if (!code) {
      return null;
    }
    return code === ApiErrorCode.EMAIL_ALREADY_EXISTS
      ? 'auth.errors.emailAlreadyExists'
      : 'auth.errors.generic';
  });

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      return;
    }

    const { name, email, password } = this.form.getRawValue();
    this.authStore.register({ name, email, password }).subscribe({
      next: () => void this.router.navigateByUrl('/tasks'),
      error: () => undefined,
    });
  }
}
