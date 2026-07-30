/**
 * Configuración de producción (valor por defecto del build).
 *
 * En el stack dockerizado la web se sirve same-origin y nginx proxea `/api`
 * hacia el backend. Por eso `apiUrl` es una ruta relativa y no un host: las
 * cookies `httpOnly` + `Secure` viajan solas y no hay CORS que negociar.
 */
export const environment = {
  production: true,
  apiUrl: '/api',
  defaultLanguage: 'es',
} as const;
