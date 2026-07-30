import { Inject, Injectable } from '@nestjs/common';

import { Email } from '../domain/email.vo';
import { REFRESH_TOKEN_REPOSITORY } from '../domain/refresh-token-repository.port';
import type { RefreshTokenRepositoryPort } from '../domain/refresh-token-repository.port';
import { USER_REPOSITORY } from '../domain/user-repository.port';
import type { UserRepositoryPort } from '../domain/user-repository.port';
import type { AuthResult } from './auth-result';
import { PASSWORD_HASHER } from './password-hasher.port';
import type { PasswordHasherPort } from './password-hasher.port';
import { TOKEN_SERVICE } from './token-service.port';
import type { TokenServicePort } from './token-service.port';

export interface RegisterUserCommand {
  name: string;
  email: string;
  password: string;
  deviceInfo?: string | null;
}

@Injectable()
export class RegisterUser {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepositoryPort,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(PASSWORD_HASHER)
    private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_SERVICE)
    private readonly tokens: TokenServicePort,
  ) {}

  async execute(command: RegisterUserCommand): Promise<AuthResult> {
    const email = Email.create(command.email);
    const passwordHash = await this.hasher.hash(command.password);

    // Sin `findByEmail` previo: entre consultar y escribir cabe otra petición
    // con el mismo email, y solo el UNIQUE de la base arbitra esa carrera.
    const user = await this.users.create({
      name: command.name.trim(),
      email,
      passwordHash,
    });

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
