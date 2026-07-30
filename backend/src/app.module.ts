import { join } from 'node:path';

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AcceptLanguageResolver, HeaderResolver, I18nModule } from 'nestjs-i18n';

import { AuthModule } from './modules/auth/auth.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ConfigModule } from './shared/infrastructure/config/config.module';
import { S3StorageModule } from './shared/infrastructure/storage/s3-storage.module';
import type { Env } from './shared/infrastructure/config/env.schema';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { CsrfMiddleware } from './shared/presentation/csrf.middleware';
import { HealthController } from './shared/presentation/health.controller';
import { MessageEnvelopeInterceptor } from './shared/presentation/interceptors/message-envelope.interceptor';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    /**
     * i18n del backend. El idioma se resuelve por `Accept-Language` (y por el
     * header `X-Lang` como alternativa explícita). `es` es el fallback del
     * proyecto. Los JSON viven en `src/i18n/<lang>/*.json` y se copian a `dist`
     * vía `nest-cli.json` (assets).
     */
    I18nModule.forRoot({
      fallbackLanguage: 'es',
      loaderOptions: {
        path: join(__dirname, '/i18n/'),
        watch: true,
      },
      resolvers: [new HeaderResolver(['x-lang']), AcceptLanguageResolver],
    }),
    // El throttler se configura aquí pero NO se activa globalmente: solo lo
    // aplican `/auth/login` y `/auth/register` vía `@UseGuards(ThrottlerGuard)`.
    // Limitar toda la API castigaría el uso normal sin frenar ningún ataque
    // nuevo: la fuerza bruta se juega en esas dos rutas.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            // El entorno lo expresa en segundos; el throttler espera ms.
            ttl: config.get('THROTTLE_TTL', { infer: true }) * 1000,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
      }),
    }),
    S3StorageModule,
    AuthModule,
    TasksModule,
  ],
  controllers: [HealthController],
  providers: [
    // Lado "éxito" del i18n: envuelve en { data, message } los handlers
    // marcados con @ResponseMessage. El lado "error" es AllExceptionsFilter.
    { provide: APP_INTERCEPTOR, useClass: MessageEnvelopeInterceptor },
  ],
})
export class AppModule implements NestModule {
  /**
   * El CSRF va como middleware y no como guard global a propósito: así corre
   * también en las peticiones que NO llegan a ningún controlador (una ruta
   * inexistente, por ejemplo) y puede emitir la cookie `XSRF-TOKEN` desde la
   * primera petición que haga el cliente, sea cual sea.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware).forRoutes('*path');
  }
}
