import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { validateEnv } from './env.schema';

/**
 * Configuración global y validada.
 *
 * `envFilePath` prioriza `backend/.env` y cae al `.env` de la raíz, que es el
 * documentado en `.env.example`. En Docker no existe ninguno de los dos y las
 * variables llegan del entorno: ambos casos funcionan sin cambios.
 */
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../.env'],
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
