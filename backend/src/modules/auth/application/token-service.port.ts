import type { User } from '../domain/user.entity';

export const TOKEN_SERVICE = Symbol('TokenServicePort');

export interface IssuedRefreshToken {
  /** En claro: es lo único que sale hacia el cliente. */
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface TokenServicePort {
  issueAccessToken(user: User): Promise<string>;

  issueRefreshToken(): IssuedRefreshToken;

  hashRefreshToken(token: string): string;
}
