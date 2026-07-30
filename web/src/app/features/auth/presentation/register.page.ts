import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';

import { firstErrorKey, passwordPolicyValidator } from '../../../shared/forms/validators';
import { AuthStore } from '../application/auth.store';
import { authErrorMessageKey } from './auth-error-message';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Button, InputText, Password],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
})
export class RegisterPage {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  protected readonly store = inject(AuthStore);

  protected readonly form = this.formBuilder.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, passwordPolicyValidator]],
  });

  protected readonly errorMessage = computed(() => authErrorMessageKey(this.store.error()));

  protected readonly errorKey = firstErrorKey;

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // El registro deja sesión iniciada (mismo `Set-Cookie` que el login).
    if (await this.store.register(this.form.getRawValue())) {
      await this.router.navigateByUrl('/tasks');
    }
  }
}
