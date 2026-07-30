export const REFRESH_TOKEN_REPOSITORY = Symbol('RefreshTokenRepositoryPort');

export interface StoredRefreshToken {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RefreshTokenRepositoryPort {
  save(token: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    deviceInfo?: string | null;
  }): Promise<StoredRefreshToken>;

  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;

  revokeById(id: string): Promise<void>;

  /** Devuelve cuántos ha revocado. */
  revokeAllForUser(userId: string): Promise<number>;
}
