import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Mismo criterio que el backend (`docs/CONTRACT.md`): mín. 8, 1 mayúscula, 1 dígito. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Devuelve TODOS los requisitos incumplidos a la vez, no el primero: el usuario
 * ve de un vistazo qué le falta a la contraseña en lugar de descubrirlo a
 * tropezones.
 */
export const passwordPolicyValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '');

  if (value.length === 0) {
    return null; // De la ausencia se encarga `Validators.required`.
  }

  const errors: ValidationErrors = {};

  if (value.length < PASSWORD_MIN_LENGTH) {
    errors['passwordMinLength'] = { requiredLength: PASSWORD_MIN_LENGTH };
  }
  if (!/[A-Z]/.test(value)) {
    errors['passwordUppercase'] = true;
  }
  if (!/\d/.test(value)) {
    errors['passwordDigit'] = true;
  }

  return Object.keys(errors).length > 0 ? errors : null;
};

/** Orden de prioridad de los mensajes: el más específico manda. */
const ERROR_KEYS: readonly string[] = [
  'required',
  'email',
  'minlength',
  'passwordMinLength',
  'passwordUppercase',
  'passwordDigit',
];

/**
 * Clave i18n del primer error visible de un control, o `null` si no hay nada
 * que mostrar todavía (campo intacto). `namespace` permite reutilizar la
 * misma lógica fuera de `auth.*` (p.ej. `tasks.form.errors.*`).
 */
export function firstErrorKey(control: AbstractControl | null | undefined, namespace = 'auth'): string | null {
  if (!control?.errors || (!control.touched && !control.dirty)) {
    return null;
  }

  const found = ERROR_KEYS.find((key) => control.errors?.[key]);
  return found ? `${namespace}.errors.${found}` : `${namespace}.errors.invalid`;
}
