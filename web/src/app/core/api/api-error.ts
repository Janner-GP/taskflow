/**
 * Formato de error uniforme de la API (ver `docs/CONTRACT.md`).
 *
 * Regla del contrato: los clientes se ramifican por `code`, NUNCA por `message`.
 * El texto es legible y traducible; el código es el contrato estable.
 */
export interface ApiError {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  timestamp: string;
  path: string;
}

/**
 * Códigos que el backend documenta. `(string & {})` mantiene el autocompletado
 * sin cerrar el tipo: si el backend añade un código nuevo, el cliente no rompe.
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'EMAIL_ALREADY_EXISTS'
  | 'TASK_NOT_FOUND'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR'
  /** El cliente no pudo hablar con la API (red caída, DNS, offline). */
  | 'NETWORK_ERROR'
  | (string & {});

/** Type guard para distinguir un ApiError de cualquier otro throwable. */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).code === 'string' &&
    typeof (value as ApiError).statusCode === 'number'
  );
}
