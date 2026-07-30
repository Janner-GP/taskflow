import type { User as PrismaUser } from '@prisma/client';

import { Email } from '../domain/email.vo';
import { PasswordHash } from '../domain/password-hash.vo';
import { User } from '../domain/user.entity';

export function toDomainUser(row: PrismaUser): User {
  return new User(
    row.id,
    row.name,
    Email.create(row.email),
    PasswordHash.fromHashed(row.passwordHash),
    row.createdAt,
  );
}
