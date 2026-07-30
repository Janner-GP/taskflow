import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes } from 'node:crypto';

import type { Env } from '../../../shared/infrastructure/config/env.schema';
import { durationToMs } from '../../../shared/infrastructure/duration';
import type {
  IssuedRefreshToken,
  TokenServicePort,
} from '../application/token-service.port';
import type { User } from '../domain/user.entity';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtTokenService implements TokenServicePort {
  private readonly accessSecret: string;
  /** En segundos: `jsonwebtoken` solo acepta números o su propio literal. */
  private readonly accessTtlSeconds: number;
  private readonly refreshSecret: string;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessSecret = config.get('JWT_ACCESS_SECRET', { infer: true });
    this.accessTtlSeconds =
      durationToMs(config.get('ACCESS_TOKEN_TTL', { infer: true })) / 1000;
    this.refreshSecret = config.get('JWT_REFRESH_SECRET', { infer: true });
    this.refreshTtlMs = durationToMs(
      config.get('REFRESH_TOKEN_TTL', { infer: true }),
    );
  }

  async issueAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email.value,
    };

    return this.jwt.signAsync(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessTtlSeconds,
    });
  }

  /**
   * Valor opaco, no un JWT: así la tabla es la única autoridad sobre si la
   * sesión sigue viva y la revocación es inmediata.
   */
  issueRefreshToken(): IssuedRefreshToken {
    const token = randomBytes(32).toString('base64url');

    return {
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
    };
  }

  /**
   * HMAC y no bcrypt porque el hash debe ser determinista para buscar por
   * índice; es seguro al ser el token aleatorio de 256 bits.
   */
  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.refreshSecret).update(token).digest('hex');
  }
}
