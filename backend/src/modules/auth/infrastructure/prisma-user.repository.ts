import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { EmailAlreadyExistsError } from '../domain/auth.errors';
import type { Email } from '../domain/email.vo';
import type { UserRepositoryPort } from '../domain/user-repository.port';
import type { NewUser, User } from '../domain/user.entity';
import { toDomainUser } from './user.mapper';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.value },
    });

    return row ? toDomainUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });

    return row ? toDomainUser(row) : null;
  }

  async create(user: NewUser): Promise<User> {
    try {
      const row = await this.prisma.user.create({
        data: {
          name: user.name,
          email: user.email.value,
          passwordHash: user.passwordHash.value,
        },
      });

      return toDomainUser(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new EmailAlreadyExistsError();
      }

      throw error;
    }
  }
}
