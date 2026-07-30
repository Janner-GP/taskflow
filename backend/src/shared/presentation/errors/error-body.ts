import type { Request } from 'express';

/** Cuerpo de error del contrato. Uniforme para toda la API. */
export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  timestamp: string;
  path: string;
}

export function errorBody(
  request: Request,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): ErrorBody {
  return {
    statusCode,
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
    path: request.originalUrl,
  };
}
