import { z } from 'zod';

/**
 * Contrato de variables de entorno. Es la única fuente de verdad: si una
 * variable no está aquí, la app no la conoce.
 *
 * Todas las variables están documentadas en el `.env.example` de la raíz.
 */
const durationString = z
  .string()
  .regex(
    /^\d+(ms|s|m|h|d)?$/,
    'debe ser una duración estilo "15m", "7d" o un número de segundos',
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535),

  DATABASE_URL: z
    .string()
    .startsWith(
      'postgresql://',
      'debe ser una cadena de conexión PostgreSQL (postgresql://...)',
    ),

  // Se compara como cadena, no como booleano: así "1", "yes" o "TRUE" no
  // encienden Swagger por accidente en producción.
  SWAGGER_ENABLED: z.enum(['true', 'false']),

  // 32 caracteres es el mínimo razonable para HS256; `openssl rand -base64 48`
  // produce 64 y es lo que documenta el .env.example.
  JWT_ACCESS_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),
  COOKIE_SECRET: z.string().min(32, 'debe tener al menos 32 caracteres'),

  ACCESS_TOKEN_TTL: durationString,
  REFRESH_TOKEN_TTL: durationString,

  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15),

  // Lista separada por comas, sin espacios. Nunca "*": la API viaja con
  // credenciales y el navegador rechaza un wildcard junto a cookies.
  CORS_ORIGIN: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(z.url('cada origen debe ser una URL absoluta, y nunca "*"'))),
  APP_PUBLIC_URL: z.url('debe ser una URL absoluta'),

  THROTTLE_TTL: z.coerce.number().int().positive(),
  THROTTLE_LIMIT: z.coerce.number().int().positive(),

  // IP concreta del proxy de confianza. Se pasa tal cual a `trust proxy`;
  // aceptar `true` permitiría a cualquiera falsificar X-Forwarded-For.
  TRUSTED_PROXY_IP: z.union([z.ipv4(), z.ipv6()], {
    error: 'debe ser una IP concreta, nunca "true"',
  }),

  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_NAME: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida el entorno al arrancar y falla rápido. Un arranque con configuración
 * incompleta es peor que no arrancar: la app quedaría escuchando con secretos
 * vacíos o CORS abierto.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const detail = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(raíz)'}: ${issue.message}`,
      )
      .join('\n');

    throw new Error(
      `Configuración de entorno inválida. Revisa tu .env (plantilla en .env.example):\n${detail}`,
    );
  }

  return result.data;
}
