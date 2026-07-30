import type { NewUser, User } from './user.entity';
import type { Email } from './email.vo';

export const USER_REPOSITORY = Symbol('UserRepositoryPort');

export interface UserRepositoryPort {
  findByEmail(email: Email): Promise<User | null>;
  findById(id: string): Promise<User | null>;

  /** Lanza `EmailAlreadyExistsError` si el email ya está tomado. */
  create(user: NewUser): Promise<User>;
}
