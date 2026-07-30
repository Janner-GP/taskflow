import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ApiErrorDto } from '../../../shared/presentation/api-error.dto';
import { resolveClientType } from '../../../shared/presentation/client-type';
import { GetCurrentUser } from '../application/get-current-user.use-case';
import { LoginUser } from '../application/login-user.use-case';
import { LogoutUser } from '../application/logout-user.use-case';
import { RefreshSession } from '../application/refresh-session.use-case';
import { RegisterUser } from '../application/register-user.use-case';
import { UnauthenticatedError } from '../domain/auth.errors';
import {
  AuthResponseDto,
  LoginDto,
  MeResponseDto,
  RefreshDto,
  RegisterDto,
  UserDto,
} from './auth.dto';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthenticatedUser } from './jwt.strategy';
import { SessionTransport } from './session-transport';

@ApiTags('auth')
@ApiExtraModels(AuthResponseDto, UserDto)
@ApiHeader({
  name: 'X-Client',
  required: false,
  enum: ['web', 'mobile'],
  description:
    'Selecciona el transporte de la sesión. `web` (por defecto si falta) ' +
    'devuelve los tokens en cookies httpOnly y el body solo lleva `user`. ' +
    '`mobile` no usa cookies y devuelve `accessToken` y `refreshToken` en el body.',
})
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUser,
    private readonly loginUser: LoginUser,
    private readonly refreshSession: RefreshSession,
    private readonly logoutUser: LogoutUser,
    private readonly getCurrentUser: GetCurrentUser,
    private readonly transport: SessionTransport,
  ) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Registra un usuario y abre sesión',
    description:
      'La contraseña exige mínimo 8 caracteres, una mayúscula y un dígito. ' +
      'La respuesta es idéntica a la de `/auth/login`.',
  })
  @ApiCreatedResponse({
    description:
      'Usuario creado. Con `X-Client: web` la respuesta trae `Set-Cookie` y ' +
      'el body solo `user`; con `mobile`, los tokens en el body.',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: 409,
    description: 'EMAIL_ALREADY_EXISTS',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: 429,
    description: 'TOO_MANY_REQUESTS',
    type: ApiErrorDto,
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.registerUser.execute({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      deviceInfo: userAgent(request),
    });

    return this.transport.deliver(response, resolveClientType(request), result);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Inicia sesión',
    description:
      'Un único caso de uso con dos adaptadores de salida, elegidos por ' +
      '`X-Client`:\n\n' +
      '- **web** (o header ausente): `Set-Cookie` con `access_token` y ' +
      '`refresh_token` (`httpOnly`, `secure`, `sameSite=lax`; el refresh ' +
      'acotado a `/api/auth/refresh`). El body es `{ user }`: los tokens ' +
      'nunca viajan en el body.\n' +
      '- **mobile**: sin cookies; el body es `{ user, accessToken, refreshToken }`.\n\n' +
      'El 401 es genérico y tarda lo mismo exista o no el email.',
  })
  @ApiOkResponse({
    description: 'Sesión iniciada.',
    schema: {
      oneOf: [
        {
          title: 'web',
          type: 'object',
          properties: { user: { $ref: getSchemaPath(UserDto) } },
          required: ['user'],
        },
        { title: 'mobile', $ref: getSchemaPath(AuthResponseDto) },
      ],
    },
  })
  @ApiResponse({
    status: 401,
    description: 'INVALID_CREDENTIALS',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: 429,
    description: 'TOO_MANY_REQUESTS',
    type: ApiErrorDto,
  })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.loginUser.execute({
      email: dto.email,
      password: dto.password,
      deviceInfo: userAgent(request),
    });

    return this.transport.deliver(response, resolveClientType(request), result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renueva la sesión (rotación)',
    description:
      'Web no envía body: el refresh viaja en la cookie `refresh_token`. ' +
      'Mobile lo manda en `{ refreshToken }`. Cada refresh se usa una sola ' +
      'vez; si llega uno ya revocado se revocan todas las sesiones del usuario.',
  })
  @ApiBody({ type: RefreshDto, required: false })
  @ApiOkResponse({ description: 'Nuevo par de tokens.', type: AuthResponseDto })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHENTICATED — inválido, expirado o ya usado',
    type: ApiErrorDto,
  })
  @ApiResponse({
    status: 403,
    description: 'CSRF_TOKEN_INVALID',
    type: ApiErrorDto,
  })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const client = resolveClientType(request);
    const token = this.transport.extractRefreshToken(
      request,
      client,
      dto.refreshToken,
    );

    if (!token) {
      throw new UnauthenticatedError('No se ha recibido ningún refresh token.');
    }

    const result = await this.refreshSession.execute({
      refreshToken: token,
      deviceInfo: userAgent(request),
    });

    return this.transport.deliver(response, client, result);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cierra la sesión',
    description:
      'Revoca el refresh recibido y, en web, borra las cookies. Siempre 204, ' +
      'aunque no hubiera sesión.',
  })
  @ApiResponse({ status: 204, description: 'Sesión cerrada.' })
  @ApiResponse({
    status: 403,
    description: 'CSRF_TOKEN_INVALID',
    type: ApiErrorDto,
  })
  async logout(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const client = resolveClientType(request);

    await this.logoutUser.execute({
      refreshToken: this.transport.extractRefreshToken(
        request,
        client,
        dto.refreshToken,
      ),
    });

    if (client === 'web') {
      this.transport.clear(response);
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Usuario de la sesión actual',
    description:
      'Cómo la web rehidrata la sesión al arrancar: con cookies `httpOnly` el ' +
      'JWT no es legible desde JavaScript. Acepta la cookie `access_token` o ' +
      '`Authorization: Bearer`.',
  })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHENTICATED',
    type: ApiErrorDto,
  })
  async me(@CurrentUser() current: AuthenticatedUser): Promise<MeResponseDto> {
    const user = await this.getCurrentUser.execute(current.id);

    return { user: UserDto.from(user) };
  }
}

function userAgent(request: Request): string | null {
  const raw = request.headers['user-agent'];

  return raw ? raw.slice(0, 255) : null;
}
