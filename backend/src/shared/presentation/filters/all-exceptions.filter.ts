import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

const SERVER_ERROR = 500;
import type { Request, Response } from 'express';

import { I18nContext } from 'nestjs-i18n';

import { DomainError } from '../../domain/domain.error';
import {
  CODE_BY_HTTP_STATUS,
  INTERNAL_ERROR_CODE,
  INTERNAL_ERROR_MESSAGE,
  MESSAGE_BY_HTTP_STATUS,
  httpStatusForCode,
} from '../errors/error-catalog';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
  path: string;
}

/**
 * Filtro único de excepciones: TODA respuesta de error de la API sale con el
 * formato del contrato (`statusCode`, `code`, `message`, `details?`,
 * `timestamp`, `path`).
 *
 * `@Catch()` sin argumentos incluye las rutas inexistentes: Nest lanza un
 * `NotFoundException` para ellas y antes salía con su formato por defecto, sin
 * `code`, `timestamp` ni `path`. Ese era el bug que detectó el cliente web.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const body = this.describe(exception, request);

    if (body.statusCode >= SERVER_ERROR) {
      // El detalle real se queda en el servidor. Al cliente solo le llega
      // INTERNAL_ERROR con un mensaje genérico.
      this.logger.error(
        `${request.method} ${request.originalUrl} → ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private describe(exception: unknown, request: Request): ErrorBody {
    const base = {
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };

    if (exception instanceof DomainError) {
      const statusCode = httpStatusForCode(exception.code);

      return {
        statusCode,
        code: exception.code,
        // Un error de dominio que mapea a 5xx es un bug: no se expone. Para el
        // resto, el texto sale localizado (nestjs-i18n, por `code`); si el
        // código no está catalogado, cae al mensaje original de la excepción.
        message:
          statusCode >= SERVER_ERROR
            ? this.localize(INTERNAL_ERROR_CODE, INTERNAL_ERROR_MESSAGE)
            : this.localize(exception.code, exception.message),
        details: exception.details,
        ...base,
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();

      if (statusCode >= SERVER_ERROR) {
        return this.internal(base);
      }

      const payload = exception.getResponse();
      const shape: Record<string, unknown> =
        typeof payload === 'object' && payload !== null
          ? (payload as Record<string, unknown>)
          : {};

      // Si la excepción trae `code`, es nuestra y manda su propio mensaje. Si
      // no (404 de ruta inexistente, 429 del throttler, 400 de body ilegible),
      // se normaliza con el catálogo para no filtrar los textos de Nest.
      const code = typeof shape.code === 'string' ? shape.code : undefined;
      const resolvedCode =
        code ?? CODE_BY_HTTP_STATUS[statusCode] ?? INTERNAL_ERROR_CODE;
      const fallback =
        code !== undefined && typeof shape.message === 'string'
          ? shape.message
          : (MESSAGE_BY_HTTP_STATUS[statusCode] ?? INTERNAL_ERROR_MESSAGE);

      return {
        statusCode,
        code: resolvedCode,
        // El texto sale localizado por `code`. Fallback: el mensaje propio de
        // la excepción (si es nuestra) o el genérico del catálogo por status.
        message: this.localize(resolvedCode, fallback),
        details: shape.details,
        ...base,
      };
    }

    return this.internal(base);
  }

  /**
   * Traduce un `code` de error con nestjs-i18n (`messages.errors.<code>`).
   * nestjs-i18n devuelve la propia clave cuando no la encuentra: en ese caso —
   * o si no hay contexto de request— se usa el fallback (el mensaje original).
   */
  private localize(code: string, fallback: string): string {
    const i18n = I18nContext.current();
    if (!i18n) {
      return fallback;
    }

    const key = `messages.errors.${code}`;
    const translated = String(i18n.t(key));
    return translated && translated !== key ? translated : fallback;
  }

  private internal(base: { timestamp: string; path: string }): ErrorBody {
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: INTERNAL_ERROR_CODE,
      message: INTERNAL_ERROR_MESSAGE,
      ...base,
    };
  }
}
