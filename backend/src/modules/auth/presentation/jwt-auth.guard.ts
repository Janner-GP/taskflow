import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { UnauthenticatedError } from '../domain/auth.errors';
import type { AuthenticatedUser } from './jwt.strategy';

/**
 * Traduce el fallo de Passport al error de dominio, para que el 401 salga con
 * `code: 'UNAUTHENTICATED'` — que es lo que dispara el refresh en los clientes.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      throw new UnauthenticatedError();
    }

    return user;
  }
}
