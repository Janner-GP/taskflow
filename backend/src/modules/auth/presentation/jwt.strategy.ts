import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../../../shared/infrastructure/config/env.schema';
import { ACCESS_TOKEN_COOKIE } from '../../../shared/presentation/cookies';
import type { AccessTokenPayload } from '../infrastructure/jwt-token.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      // La cookie va primero: si un navegador manda ambas cosas, gana el canal
      // que él mismo controla.
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request): string | null =>
          (request.cookies as Record<string, string> | undefined)?.[
            ACCESS_TOKEN_COOKIE
          ] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return { id: payload.sub, email: payload.email };
  }
}
