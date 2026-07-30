import { Inject, Injectable } from '@nestjs/common';

import { REFRESH_TOKEN_REPOSITORY } from '../domain/refresh-token-repository.port';
import type { RefreshTokenRepositoryPort } from '../domain/refresh-token-repository.port';
import { TOKEN_SERVICE } from './token-service.port';
import type { TokenServicePort } from './token-service.port';

export interface LogoutUserCommand {
  refreshToken?: string | null;
}

/** Idempotente: si no hay token o ya estaba revocado, el objetivo ya se cumple. */
@Injectable()
export class LogoutUser {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(TOKEN_SERVICE)
    private readonly tokens: TokenServicePort,
  ) {}

  async execute(command: LogoutUserCommand): Promise<void> {
    if (!command.refreshToken) {
      return;
    }

    const stored = await this.refreshTokens.findByHash(
      this.tokens.hashRefreshToken(command.refreshToken),
    );

    if (stored && stored.revokedAt === null) {
      await this.refreshTokens.revokeById(stored.id);
    }
  }
}
