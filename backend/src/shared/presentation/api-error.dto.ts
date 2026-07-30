import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Solo existe para que Swagger documente el formato de error del contrato.
 * Nunca se instancia: el filtro construye el objeto a mano.
 */
export class ApiErrorDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({
    description:
      'Código estable de error. Los clientes se ramifican por este valor, nunca por `message`.',
    example: 'INVALID_CREDENTIALS',
  })
  code!: string;

  @ApiProperty({ example: 'Email o contraseña incorrectos.' })
  message!: string;

  @ApiPropertyOptional({
    description: 'Errores de validación campo a campo.',
    example: { password: ['debe contener al menos una mayúscula y un dígito'] },
  })
  details?: unknown;

  @ApiProperty({ example: '2026-07-30T10:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/auth/login' })
  path!: string;
}
