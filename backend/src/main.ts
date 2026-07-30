import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import type { Env } from './shared/infrastructure/config/env.schema';
import { ValidationFailedException } from './shared/presentation/errors/validation-failed.exception';
import { AllExceptionsFilter } from './shared/presentation/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // `trust proxy` con la IP EXACTA del proxy, nunca `true`. Con `true` Express
  // se cree el último salto de X-Forwarded-For venga de donde venga, así que
  // cualquiera que alcance la app directamente podría inventarse su IP y
  // esquivar el rate limiting.
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', config.get('TRUSTED_PROXY_IP', { infer: true }));

  app.use(helmet());
  app.use(cookieParser(config.get('COOKIE_SECRET', { infer: true })));

  // Lista explícita, nunca "*": con `credentials: true` el navegador rechaza
  // un wildcard cuando viajan cookies.
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept-Language',
      'X-Client',
      'X-XSRF-TOKEN',
    ],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // El formato por defecto de Nest es un array de strings sueltos; el
      // contrato pide `details` campo a campo.
      exceptionFactory: (errors) => new ValidationFailedException(errors),
    }),
  );

  // Se registra DESPUÉS del pipe pero cubre todo, incluidas las rutas
  // inexistentes: sin él, `/api/loquesea` saldría con el 404 crudo de Nest y
  // rompería el contrato de errores.
  app.useGlobalFilters(new AllExceptionsFilter());

  if (config.get('SWAGGER_ENABLED', { infer: true }) === 'true') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('TaskFlow API')
        .setDescription(
          'Gestión de tareas. Dos transportes de auth: cookies httpOnly (web) ' +
            'y Authorization: Bearer (mobile), seleccionados por el header X-Client.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .addCookieAuth('access_token')
        .build(),
    );

    SwaggerModule.setup('api/docs', app, document);
  }

  // Cierra conexiones (Prisma incluido) al recibir SIGTERM en lugar de morir
  // dejando queries a medias.
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
