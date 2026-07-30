import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput, IonNote, IonSpinner } from '@ionic/angular/standalone';
import { TranslatePipe } from '@ngx-translate/core';

import { ApiErrorCode } from '../../../core/http/api-error';
import { AuthStore } from '../state/auth.store';

/**
 * `X-Client: mobile` and the `Authorization` header are the interceptors'
 * job (`core/interceptors/`); this component only knows the form and how to
 * turn `AuthStore.error()`'s code into copy — never its `message`, per the
 * contract rule that clients branch on `code`.
 */
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, IonContent, IonButton, IonInput, IonNote, IonSpinner],
  templateUrl: './login.page.html',
  styleUrl: './login.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly isLoading = this.authStore.isLoading;
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly errorKey = computed(() => {
    const code = this.authStore.error();
    if (!code) {
      return null;
    }
    return code === ApiErrorCode.INVALID_CREDENTIALS
      ? 'auth.errors.invalidCredentials'
      : 'auth.errors.generic';
  });

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.authStore.login({ email, password }).subscribe({
      next: () => void this.router.navigateByUrl('/tasks'),
      // AuthStore already recorded the error code for `errorKey` above; this
      // empty handler only exists so the rejection does not surface as an
      // unhandled RxJS error in the console.
      error: () => undefined,
    });
  }
}
