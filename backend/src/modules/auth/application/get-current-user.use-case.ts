import { Inject, Injectable } from '@nestjs/common';

import { UnauthenticatedError } from '../domain/auth.errors';
import { USER_REPOSITORY } from '../domain/user-repository.port';
import type { UserRepositoryPort } from '../domain/user-repository.port';
import type { User } from '../domain/user.entity';

@Injectable()
export class GetCurrentUser {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepositoryPort,
  ) {}

  /** Relee de la base: el JWT vive 15 minutos y sus datos pueden ser viejos. */
  async execute(userId: string): Promise<User> {
    const user = await this.users.findById(userId);

    if (!user) {
      throw new UnauthenticatedError();
    }

    return user;
  }
}
