import { DomainError } from '../../../shared/domain/domain.error';

/**
 * Único error de login: distinguir "email inexistente" de "contraseña
 * incorrecta" convertiría el endpoint en un oráculo de enumeración.
 */
export class InvalidCredentialsError extends DomainError {
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Email o contraseña incorrectos.');
  }
}

export class EmailAlreadyExistsError extends DomainError {
  readonly code = 'EMAIL_ALREADY_EXISTS';

  constructor() {
    super('Ya existe una cuenta registrada con ese email.');
  }
}

export class UnauthenticatedError extends DomainError {
  readonly code = 'UNAUTHENTICATED';

  constructor(message = 'No hay una sesión válida.') {
    super(message);
  }
}

export class InvalidEmailError extends DomainError {
  readonly code = 'VALIDATION_ERROR';

  constructor() {
    super('El email no tiene un formato válido.', {
      email: ['debe tener un formato válido'],
    });
  }
}

/** Siempre es un bug nuestro o datos corruptos, nunca culpa del cliente. */
export class InvalidPasswordHashError extends DomainError {
  readonly code = 'INTERNAL_ERROR';

  constructor() {
    super('El valor recibido no es un hash bcrypt válido.');
  }
}
