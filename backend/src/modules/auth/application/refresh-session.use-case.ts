import { Inject, Injectable, Logger } from '@nestjs/common';

import { UnauthenticatedError } from '../domain/auth.errors';
import { REFRESH_TOKEN_REPOSITORY } from '../domain/refresh-token-repository.port';
import type { RefreshTokenRepositoryPort } from '../domain/refresh-token-repository.port';
import { USER_REPOSITORY } from '../domain/user-repository.port';
import type { UserRepositoryPort } from '../domain/user-repository.port';
import type { AuthResult } from './auth-result';
import { TOKEN_SERVICE } from './token-service.port';
import type { TokenServicePort } from './token-service.port';

export interface RefreshSessionCommand {
  refreshToken: string;
  deviceInfo?: string | null;
}

@Injectable()
export class RefreshSession {
  private readonly logger = new Logger(RefreshSession.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepositoryPort,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(TOKEN_SERVICE)
    private readonly tokens: TokenServicePort,
  ) {}

  async execute(command: RefreshSessionCommand): Promise<AuthResult> {
    const tokenHash = this.tokens.hashRefreshToken(command.refreshToken);
    const stored = await this.refreshTokens.findByHash(tokenHash);

    if (!stored) {
      throw new UnauthenticatedError('El refresh token no es válido.');
    }

    if (stored.revokedAt !== null) {
      // Un token ya canjeado que vuelve o se filtró o viene de un cliente roto,
      // y no hay forma de distinguirlo: se corta la sesión entera.
      const revoked = await this.refreshTokens.revokeAllForUser(stored.userId);

      this.logger.warn(
        `Reuso de refresh token (usuario ${stored.userId}): ${revoked} sesiones revocadas.`,
      );

      throw new UnauthenticatedError('El refresh token ya fue utilizado.');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      await this.refreshTokens.revokeById(stored.id);
      throw new UnauthenticatedError('El refresh token ha expirado.');
    }

    const user = await this.users.findById(stored.userId);

    if (!user) {
      await this.refreshTokens.revokeById(stored.id);
      throw new UnauthenticatedError();
    }

    // Revocar antes de emitir: si algo falla a mitad, el token viejo ya no sirve.
    await this.refreshTokens.revokeById(stored.id);

    const accessToken = await this.tokens.issueAccessToken(user);
    const refresh = this.tokens.issueRefreshToken();

    await this.refreshTokens.save({
      userId: user.id,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
      deviceInfo: command.deviceInfo ?? null,
    });

    return { user, accessToken, refreshToken: refresh.token };
  }
}
