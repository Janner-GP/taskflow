import type { Email } from './email.vo';
import type { PasswordHash } from './password-hash.vo';

export class User {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly email: Email,
    readonly passwordHash: PasswordHash,
    readonly createdAt: Date,
  ) {}
}

export interface NewUser {
  name: string;
  email: Email;
  passwordHash: PasswordHash;
}
