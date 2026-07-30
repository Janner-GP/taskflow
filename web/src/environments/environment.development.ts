/**
 * Configuración de desarrollo (`ng serve`).
 *
 * `apiUrl` sigue siendo `/api`: el dev-server de Angular proxea esa ruta a
 * http://localhost:3000 (ver `proxy.conf.json`). Así también en desarrollo todo
 * es same-origin, las cookies `httpOnly` funcionan y el XSRF de Angular puede
 * adjuntar el header — que es justo lo que NO pasaría apuntando al host directo.
 */
export const environment = {
  production: false,
  apiUrl: '/api',
  defaultLanguage: 'es',
} as const;
