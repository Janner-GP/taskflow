import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Global porque los repositorios de todos los módulos lo necesitan y no aporta
 * nada obligarles a importarlo uno por uno.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
