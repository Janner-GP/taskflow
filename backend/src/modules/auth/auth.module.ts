import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { GetCurrentUser } from './application/get-current-user.use-case';
import { LoginUser } from './application/login-user.use-case';
import { LogoutUser } from './application/logout-user.use-case';
import { PASSWORD_HASHER } from './application/password-hasher.port';
import { RefreshSession } from './application/refresh-session.use-case';
import { RegisterUser } from './application/register-user.use-case';
import { TOKEN_SERVICE } from './application/token-service.port';
import { REFRESH_TOKEN_REPOSITORY } from './domain/refresh-token-repository.port';
import { USER_REPOSITORY } from './domain/user-repository.port';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/jwt-token.service';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { AuthController } from './presentation/auth.controller';
import { JwtStrategy } from './presentation/jwt.strategy';
import { SessionTransport } from './presentation/session-transport';

/**
 * `JwtModule.register({})` va vacío: secreto y TTL se pasan en cada firma desde
 * `JwtTokenService`, que los lee del entorno ya validado.
 */
@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    RegisterUser,
    LoginUser,
    RefreshSession,
    LogoutUser,
    GetCurrentUser,

    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },

    JwtStrategy,
    SessionTransport,
  ],
  exports: [PassportModule],
})
export class AuthModule {}
