import type { PasswordHash } from '../domain/password-hash.vo';

export const PASSWORD_HASHER = Symbol('PasswordHasherPort');

export interface PasswordHasherPort {
  hash(plain: string): Promise<PasswordHash>;

  compare(plain: string, hash: PasswordHash): Promise<boolean>;

  /**
   * Compara contra un hash dummy y descarta el resultado, para que el login
   * tarde lo mismo exista o no el usuario.
   */
  burnComparison(plain: string): Promise<void>;
}
