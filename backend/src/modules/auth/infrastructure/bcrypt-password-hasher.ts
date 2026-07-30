import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import type { Env } from '../../../shared/infrastructure/config/env.schema';
import type { PasswordHasherPort } from '../application/password-hasher.port';
import { PasswordHash } from '../domain/password-hash.vo';

@Injectable()
export class BcryptPasswordHasher implements PasswordHasherPort, OnModuleInit {
  private readonly rounds: number;

  /** Mismo coste que los hashes reales, para que `burnComparison` tarde igual. */
  private dummyHash!: string;

  constructor(config: ConfigService<Env, true>) {
    this.rounds = config.get('BCRYPT_ROUNDS', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    this.dummyHash = await bcrypt.hash(
      'contraseña-inexistente-para-igualar-tiempos',
      this.rounds,
    );
  }

  async hash(plain: string): Promise<PasswordHash> {
    return PasswordHash.fromHashed(await bcrypt.hash(plain, this.rounds));
  }

  async compare(plain: string, hash: PasswordHash): Promise<boolean> {
    return bcrypt.compare(plain, hash.value);
  }

  async burnComparison(plain: string): Promise<void> {
    await bcrypt.compare(plain, this.dummyHash);
  }
}
