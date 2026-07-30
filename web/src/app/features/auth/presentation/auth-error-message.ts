import { ApiErrorCode } from '../../../core/api/api-error';

/**
 * Códigos con mensaje propio. El resto cae en un genérico: no se ramifica por
 * `message` (puede cambiar o venir traducido del backend), solo por `code`.
 */
const TRANSLATED_CODES: readonly string[] = [
  'INVALID_CREDENTIALS',
  'EMAIL_ALREADY_EXISTS',
  'VALIDATION_ERROR',
  'TOO_MANY_REQUESTS',
  'CSRF_TOKEN_INVALID',
  'NETWORK_ERROR',
];

/** Traduce un `code` del contrato a una clave i18n. `null` si no hay error. */
export function authErrorMessageKey(code: ApiErrorCode | null): string | null {
  if (!code) {
    return null;
  }

  return TRANSLATED_CODES.includes(code) ? `auth.errors.codes.${code}` : 'auth.errors.codes.UNEXPECTED';
}
