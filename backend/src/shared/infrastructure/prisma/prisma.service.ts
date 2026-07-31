import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import type { Env } from '../config/env.schema';

/**
 * Cliente de Prisma como provider de Nest.
 *
 * En Prisma 7 la conexión ya no se declara en el schema: se pasa un driver
 * adapter al constructor. `DATABASE_URL` llega del entorno ya validado.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<Env, true>) {
    const rawUrl = config.get('DATABASE_URL', { infer: true });
    // pg (node-postgres) no entiende ?schema= (parámetro exclusivo del CLI de
    // Prisma). Lo eliminamos del URL antes de pasárselo al Pool.
    // En producción añadimos sslmode=require: el motor Rust de migraciones usa
    // SSL por defecto (prefer), pero pg no lo hace, y RDS puede rechazar
    // conexiones sin SSL cuando rds.force_ssl está activo.
    const urlObj = new URL(rawUrl);
    urlObj.searchParams.delete('schema');
    if (config.get('NODE_ENV', { infer: true }) === 'production') {
      urlObj.searchParams.set('sslmode', 'require');
    }
    super({
      adapter: new PrismaPg({ connectionString: urlObj.toString() }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
