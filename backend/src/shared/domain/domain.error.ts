/**
 * Error de dominio.
 *
 * Deliberadamente NO lleva código HTTP: el dominio no sabe que existe HTTP.
 * Solo expone un `code` estable (el que consumen los clientes según el
 * contrato) y el filtro de excepciones lo traduce a un status.
 *
 * El mapa code → status vive en la capa de presentación
 * (`shared/presentation/errors/error-catalog.ts`).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    // `new.target.name` da el nombre de la subclase concreta, útil en los logs.
    this.name = new.target.name;
    this.details = details;
  }
}
