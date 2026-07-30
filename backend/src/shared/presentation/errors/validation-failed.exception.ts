import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * Excepción que emite el `ValidationPipe` global (ver `main.ts`).
 *
 * El formato por defecto de Nest es un array de strings sueltos; el contrato
 * pide `details` campo a campo, así que se aplana a
 * `{ campo: ["motivo", ...] }` incluyendo objetos anidados con notación de
 * punto (`profile.name`).
 */
export class ValidationFailedException extends BadRequestException {
  constructor(errors: ValidationError[]) {
    super({
      code: 'VALIDATION_ERROR',
      message: 'Los datos enviados no son válidos.',
      details: flatten(errors),
    });
  }
}

function flatten(
  errors: ValidationError[],
  parent = '',
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;

    if (error.constraints) {
      result[path] = Object.values(error.constraints);
    }

    if (error.children?.length) {
      Object.assign(result, flatten(error.children, path));
    }
  }

  return result;
}
