import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import type { User } from '../domain/user.entity';

const PASSWORD_PATTERN = /^(?=.*[A-ZÁÉÍÓÚÑ])(?=.*\d).+$/;

export class RegisterDto {
  @ApiProperty({ example: 'Ana Torres', minLength: 2, maxLength: 80 })
  @IsString()
  @IsNotEmpty({ message: 'el nombre es obligatorio' })
  @MinLength(2, { message: 'el nombre debe tener al menos 2 caracteres' })
  @MaxLength(80, { message: 'el nombre no puede superar los 80 caracteres' })
  name!: string;

  @ApiProperty({ example: 'ana@taskflow.dev', format: 'email' })
  @IsEmail({}, { message: 'debe tener un formato de email válido' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: 'Secreta123',
    minLength: 8,
    // bcrypt ignora los bytes a partir del 72; aceptar más daría una falsa
    // sensación de fortaleza.
    maxLength: 72,
    description: 'Mínimo 8 caracteres, al menos una mayúscula y un dígito.',
  })
  @IsString()
  @MinLength(8, { message: 'la contraseña debe tener al menos 8 caracteres' })
  @MaxLength(72, {
    message: 'la contraseña no puede superar los 72 caracteres',
  })
  @Matches(PASSWORD_PATTERN, {
    message: 'la contraseña debe contener una mayúscula y un dígito',
  })
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ana@taskflow.dev', format: 'email' })
  @IsString()
  @IsNotEmpty({ message: 'el email es obligatorio' })
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'Secreta123' })
  @IsString()
  @IsNotEmpty({ message: 'la contraseña es obligatoria' })
  @MaxLength(72)
  password!: string;
}

export class RefreshDto {
  @ApiPropertyOptional({
    description:
      'Solo para `X-Client: mobile`. En web el refresh viaja en la cookie ' +
      '`refresh_token` y este campo se omite.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken?: string;
}

export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ana Torres' })
  name!: string;

  @ApiProperty({ example: 'ana@taskflow.dev', format: 'email' })
  email!: string;

  @ApiProperty({ example: '2026-07-30T10:00:00.000Z', format: 'date-time' })
  createdAt!: string;

  static from(user: User): UserDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email.value,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

/**
 * Los tokens son opcionales por diseño: solo aparecen con `X-Client: mobile`.
 * Devolverlos en web anularía el `httpOnly` de las cookies.
 */
export class AuthResponseDto {
  @ApiProperty({ type: UserDto })
  user!: UserDto;

  @ApiPropertyOptional({ description: 'Solo con `X-Client: mobile`.' })
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Solo con `X-Client: mobile`.' })
  refreshToken?: string;
}

export class MeResponseDto {
  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
