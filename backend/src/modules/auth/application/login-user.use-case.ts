import { Inject, Injectable } from '@nestjs/common';

import { InvalidCredentialsError } from '../domain/auth.errors';
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

export interface LoginUserCommand {
  email: string;
  password: string;
  deviceInfo?: string | null;
}

@Injectable()
export class LoginUser {
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

  async execute(command: LoginUserCommand): Promise<AuthResult> {
    // Todo camino de fallo gasta un bcrypt: sin eso, el tiempo de respuesta
    // delata qué emails tienen cuenta.
    let email: Email;
    try {
      email = Email.create(command.email);
    } catch {
      await this.hasher.burnComparison(command.password);
      throw new InvalidCredentialsError();
    }

    const user = await this.users.findByEmail(email);

    if (!user) {
      await this.hasher.burnComparison(command.password);
      throw new InvalidCredentialsError();
    }

    const matches = await this.hasher.compare(
      command.password,
      user.passwordHash,
    );

    if (!matches) {
      throw new InvalidCredentialsError();
    }

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
