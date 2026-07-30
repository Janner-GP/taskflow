import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Password } from 'primeng/password';

import { firstErrorKey, passwordPolicyValidator } from '../../../shared/forms/validators';
import { AuthStore } from '../application/auth.store';
import { authErrorMessageKey } from './auth-error-message';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, Button, InputText, Password],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly store = inject(AuthStore);

  protected readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, passwordPolicyValidator]],
  });

  /** Mensaje del último fallo, elegido por `code` del contrato. */
  protected readonly errorMessage = computed(() => authErrorMessageKey(this.store.error()));

  protected readonly errorKey = firstErrorKey;

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const authenticated = await this.store.login(this.form.getRawValue());
    if (!authenticated) {
      return;
    }

    // Vuelve a donde el guard interceptó al usuario, si venía de algún sitio.
    const redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
    await this.router.navigateByUrl(redirectTo ?? '/tasks');
  }
}
