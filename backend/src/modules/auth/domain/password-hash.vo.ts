import { InvalidPasswordHashError } from './auth.errors';

const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** Impide que una contraseña en claro acabe donde se espera un hash. */
export class PasswordHash {
  private constructor(readonly value: string) {}

  static fromHashed(hashed: string): PasswordHash {
    if (!BCRYPT_PATTERN.test(hashed)) {
      throw new InvalidPasswordHashError();
    }

    return new PasswordHash(hashed);
  }

  toString(): string {
    return this.value;
  }
}
