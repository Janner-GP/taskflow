import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';

import type { Env } from '../../../shared/infrastructure/config/env.schema';
import { durationToMs } from '../../../shared/infrastructure/duration';
import type { ClientType } from '../../../shared/presentation/client-type';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
  baseCookieOptions,
} from '../../../shared/presentation/cookies';
import type { AuthResult } from '../application/auth-result';
import { AuthResponseDto, UserDto } from './auth.dto';

/**
 * El doble adaptador: los casos de uso devuelven siempre los dos tokens y aquí
 * se decide si salen en cookies `httpOnly` (web) o en el body (mobile).
 */
@Injectable()
export class SessionTransport {
  private readonly accessTtlMs: number;
  private readonly refreshTtlMs: number;
  private readonly base: CookieOptions;

  constructor(config: ConfigService<Env, true>) {
    this.accessTtlMs = durationToMs(
      config.get('ACCESS_TOKEN_TTL', { infer: true }),
    );
    this.refreshTtlMs = durationToMs(
      config.get('REFRESH_TOKEN_TTL', { infer: true }),
    );
    this.base = baseCookieOptions(config.get('NODE_ENV', { infer: true }));
  }

  deliver(
    response: Response,
    client: ClientType,
    result: AuthResult,
  ): AuthResponseDto {
    const user = UserDto.from(result.user);

    if (client === 'mobile') {
      return {
        user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      };
    }

    response.cookie(ACCESS_TOKEN_COOKIE, result.accessToken, {
      ...this.base,
      httpOnly: true,
      path: ACCESS_TOKEN_COOKIE_PATH,
      maxAge: this.accessTtlMs,
    });

    response.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, {
      ...this.base,
      httpOnly: true,
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge: this.refreshTtlMs,
    });

    return { user };
  }

  clear(response: Response): void {
    response.clearCookie(ACCESS_TOKEN_COOKIE, {
      ...this.base,
      httpOnly: true,
      path: ACCESS_TOKEN_COOKIE_PATH,
    });

    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...this.base,
      httpOnly: true,
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
  }

  extractRefreshToken(
    request: Request,
    client: ClientType,
    bodyToken?: string,
  ): string | null {
    if (client === 'mobile') {
      return bodyToken ?? null;
    }

    return (
      (request.cookies as Record<string, string> | undefined)?.[
        REFRESH_TOKEN_COOKIE
      ] ?? null
    );
  }
}
