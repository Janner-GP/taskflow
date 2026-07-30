import type { CookieOptions } from 'express';

import type { Env } from '../infrastructure/config/env.schema';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const XSRF_TOKEN_COOKIE = 'XSRF-TOKEN';
export const XSRF_TOKEN_HEADER = 'x-xsrf-token';

/**
 * El access token viaja en todas las peticiones a la API, así que su path es el
 * prefijo global.
 */
export const ACCESS_TOKEN_COOKIE_PATH = '/api';

/**
 * El refresh token solo lo necesita un endpoint. Acotar el path hace que el
 * navegador NO lo envíe en el resto de las peticiones: menos superficie de
 * exposición por cada request de la aplicación.
 */
export const REFRESH_TOKEN_COOKIE_PATH = '/api/auth/refresh';

/**
 * `secure` se desactiva solo en desarrollo. Con `secure: true` sobre http el
 * navegador descarta la cookie en varios navegadores y el loop local de `ng
 * serve` (http://localhost:4200) quedaría sin sesión. En test y producción va
 * activada, que es lo que dice el contrato.
 *
 * `sameSite: 'lax'` permite que la cookie viaje en navegaciones de primer nivel
 * y en las peticiones same-site (localhost:4200 → localhost:3000 lo es: el
 * puerto no cuenta para "site"), pero no en subpeticiones cross-site.
 */
export function baseCookieOptions(nodeEnv: Env['NODE_ENV']): CookieOptions {
  return {
    secure: nodeEnv !== 'development',
    sameSite: 'lax',
  };
}
