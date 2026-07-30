/**
 * Catálogo único de códigos de error de la API.
 *
 * Los clientes se ramifican por `code`, nunca por `message`: el texto puede
 * cambiar o traducirse, el código no. Por eso el mapeo code → HTTP vive en un
 * solo sitio y no repartido por los controladores.
 */

/** code → status HTTP. Traduce los errores de dominio a la capa HTTP. */
export const HTTP_STATUS_BY_CODE: Readonly<Record<string, number>> = {
  VALIDATION_ERROR: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  CSRF_TOKEN_INVALID: 403,
  NOT_FOUND: 404,
  TASK_NOT_FOUND: 404,
  EMAIL_ALREADY_EXISTS: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
};

/**
 * status HTTP → code, para las excepciones que NO nacen del dominio: el 404 de
 * una ruta inexistente, el 429 del throttler, etc. Sin esto esas respuestas
 * saldrían con el formato por defecto de Nest y romperían el contrato.
 */
export const CODE_BY_HTTP_STATUS: Readonly<Record<number, string>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'TOO_MANY_REQUESTS',
};

/** Mensaje genérico en español por status, para no filtrar los de Nest. */
export const MESSAGE_BY_HTTP_STATUS: Readonly<Record<number, string>> = {
  400: 'La petición no es válida.',
  401: 'No hay una sesión válida.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'El recurso solicitado no existe.',
  405: 'Método no permitido para esta ruta.',
  409: 'La petición entra en conflicto con el estado actual del recurso.',
  413: 'El contenido enviado es demasiado grande.',
  415: 'Tipo de contenido no soportado.',
  429: 'Demasiadas peticiones. Inténtalo de nuevo en unos segundos.',
};

export const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';

/**
 * Único mensaje que se devuelve ante un fallo no previsto. Nunca se envía al
 * cliente el mensaje real ni el stack: el detalle se queda en el log.
 */
export const INTERNAL_ERROR_MESSAGE = 'Ha ocurrido un error inesperado.';

export function httpStatusForCode(code: string): number {
  return HTTP_STATUS_BY_CODE[code] ?? 500;
}
