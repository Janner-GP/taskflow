import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Mirrors the server rule from docs/CONTRACT.md exactly: min 8 chars, at
 * least one uppercase letter, at least one digit. Kept as three distinct
 * error keys rather than one `invalidPassword` flag so the template can show
 * which rule failed instead of a single opaque message.
 */
export function passwordStrengthValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string | null;
    if (!value) {
      return null;
    }

    const errors: ValidationErrors = {};
    if (value.length < 8) {
      errors['minlength'] = true;
    }
    if (!/[A-Z]/.test(value)) {
      errors['uppercase'] = true;
    }
    if (!/\d/.test(value)) {
      errors['digit'] = true;
    }

    return Object.keys(errors).length > 0 ? errors : null;
  };
}

/** Attached to the confirmation field so the mismatch reads naturally on it. */
export function passwordMatchValidator(passwordKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey)?.value;
    const confirm = group.get(confirmKey)?.value;
    if (!confirm || password === confirm) {
      return null;
    }
    group.get(confirmKey)?.setErrors({ ...group.get(confirmKey)?.errors, mismatch: true });
    return null;
  };
}
