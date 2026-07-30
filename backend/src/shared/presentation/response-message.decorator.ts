import { SetMetadata } from '@nestjs/common';

/** Clave de metadata que lee `MessageEnvelopeInterceptor`. */
export const RESPONSE_MESSAGE_KEY = 'response_message_key';

/**
 * Marca un handler para que su respuesta salga como `{ data, message }`, con el
 * `message` localizado desde el catálogo i18n del backend (clave `key`).
 *
 * Sin este decorador la respuesta pasa intacta: las lecturas (GET) siguen
 * devolviendo el recurso o `{ data, meta }` tal cual.
 */
export const ResponseMessage = (key: string): MethodDecorator =>
  SetMetadata(RESPONSE_MESSAGE_KEY, key);
