import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext } from 'nestjs-i18n';
import { Observable, map } from 'rxjs';

import { RESPONSE_MESSAGE_KEY } from '../response-message.decorator';

/**
 * Envuelve las respuestas de los handlers marcados con `@ResponseMessage` como
 * `{ data, message }`, con el mensaje localizado por nestjs-i18n según el
 * idioma resuelto (`Accept-Language` / `x-lang`).
 *
 * Es el lado "éxito" del i18n del backend; el lado "error" vive en
 * `AllExceptionsFilter`. Juntos garantizan que TODO texto para el usuario nace
 * en el servidor y llega ya traducido.
 */
@Injectable()
export class MessageEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const key = this.reflector.get<string | undefined>(
      RESPONSE_MESSAGE_KEY,
      context.getHandler(),
    );

    if (!key) {
      return next.handle();
    }

    const i18n = I18nContext.current(context);
    const message = i18n?.t(key) ?? key;

    return next
      .handle()
      .pipe(map((data: unknown) => ({ data: data ?? null, message })));
  }
}
