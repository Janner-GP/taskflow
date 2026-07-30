import type { Request } from 'express';

export const CLIENT_HEADER = 'x-client';

export type ClientType = 'web' | 'mobile';

/**
 * Resuelve el transporte de autenticación a partir del header `X-Client`.
 *
 * Si el header falta se asume `web`, que es el default seguro: la respuesta
 * llevará cookies `httpOnly` y NO devolverá tokens en el body. Equivocarse
 * hacia `mobile` sí sería peligroso (tokens en el body para un navegador).
 */
export function resolveClientType(request: Request): ClientType {
  const raw = request.headers[CLIENT_HEADER];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase();

  return value === 'mobile' ? 'mobile' : 'web';
}
