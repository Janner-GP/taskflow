import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

import type { Env } from '../infrastructure/config/env.schema';
import { resolveClientType } from './client-type';
import {
  XSRF_TOKEN_COOKIE,
  XSRF_TOKEN_HEADER,
  baseCookieOptions,
} from './cookies';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Login y register quedan exentos porque el double-submit exige que el cliente
 * pueda LEER la cookie, y un cliente recién llegado todavía no la tiene:
 * exigirla ahí dejaría el arranque en frío sin forma de autenticarse nunca.
 * Es seguro porque ninguna de las dos actúa sobre una sesión existente, y el
 * login CSRF lo cubre `SameSite=Lax`. Refresh y logout sí la exigen.
 */
const EXEMPT_PATHS = /\/auth\/(login|register)\/?$/;

/**
 * Double-submit: un atacante cross-origin puede provocar que el navegador
 * envíe la cookie, pero la same-origin policy le impide leerla para copiarla al
 * header. Que la cookie sea legible por JS es el mecanismo, no un descuido.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly cookieOptions: ReturnType<typeof baseCookieOptions>;

  constructor(config: ConfigService<Env, true>) {
    this.cookieOptions = baseCookieOptions(
      config.get('NODE_ENV', { infer: true }),
    );
  }

  use(request: Request, response: Response, next: NextFunction): void {
    // Mobile no usa cookies: ni se le exige el token ni se le emite.
    if (resolveClientType(request) === 'mobile') {
      next();
      return;
    }

    const cookies = request.cookies as Record<string, string> | undefined;
    let token = cookies?.[XSRF_TOKEN_COOKIE];

    if (
      MUTATING.has(request.method) &&
      // `originalUrl` porque Express reescribe `req.url` según el montaje.
      !EXEMPT_PATHS.test(request.originalUrl.split('?')[0])
    ) {
      const header = request.headers[XSRF_TOKEN_HEADER];
      const sent = Array.isArray(header) ? header[0] : header;

      if (!token || !sent || !equals(token, sent)) {
        throw new ForbiddenException({
          code: 'CSRF_TOKEN_INVALID',
          message: 'Falta el token CSRF o no coincide con la cookie.',
        });
      }
    }

    if (!token) {
      token = randomBytes(32).toString('base64url');

      response.cookie(XSRF_TOKEN_COOKIE, token, {
        ...this.cookieOptions,
        httpOnly: false,
        path: '/',
      });
    }

    next();
  }
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}
