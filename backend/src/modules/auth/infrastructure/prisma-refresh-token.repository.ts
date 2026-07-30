import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type {
  RefreshTokenRepositoryPort,
  StoredRefreshToken,
} from '../domain/refresh-token-repository.port';

/** El `tokenHash` nunca sale de aquí: ningún caso de uso lo necesita. */
const SELECTION = {
  id: true,
  userId: true,
  expiresAt: true,
  revokedAt: true,
} as const;

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async save(token: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    deviceInfo?: string | null;
  }): Promise<StoredRefreshToken> {
    return this.prisma.refreshToken.create({
      data: {
        userId: token.userId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        deviceInfo: token.deviceInfo ?? null,
      },
      select: SELECTION,
    });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: SELECTION,
    });
  }

  async revokeById(id: string): Promise<void> {
    // El filtro por `revokedAt: null` conserva la marca de la primera revocación.
    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return result.count;
  }
}
