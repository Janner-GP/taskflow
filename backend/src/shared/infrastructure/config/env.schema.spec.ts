import { validateEnv } from './env.schema';

const secret = 'a'.repeat(48);

const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL:
    'postgresql://taskflow:pw@localhost:5432/taskflow?schema=public',
  SWAGGER_ENABLED: 'true',
  JWT_ACCESS_SECRET: secret,
  JWT_REFRESH_SECRET: `${secret}b`,
  COOKIE_SECRET: `${secret}c`,
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL: '7d',
  BCRYPT_ROUNDS: '12',
  CORS_ORIGIN: 'http://localhost:4200',
  APP_PUBLIC_URL: 'http://localhost:8080',
  THROTTLE_TTL: '60',
  THROTTLE_LIMIT: '10',
  TRUSTED_PROXY_IP: '10.0.0.4',
};

describe('validateEnv', () => {
  it('convierte los numéricos a number', () => {
    const env = validateEnv(validEnv);

    expect(env.PORT).toBe(3000);
    expect(env.BCRYPT_ROUNDS).toBe(12);
    expect(env.THROTTLE_LIMIT).toBe(10);
  });

  it('ignora las variables no declaradas', () => {
    const env = validateEnv({ ...validEnv, POSTGRES_PASSWORD: 'pw' });

    expect(env).not.toHaveProperty('POSTGRES_PASSWORD');
  });

  it('falla nombrando la variable que falta', () => {
    const incomplete: Partial<typeof validEnv> = { ...validEnv };
    delete incomplete.JWT_ACCESS_SECRET;

    expect(() => validateEnv(incomplete)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rechaza un CORS_ORIGIN comodín', () => {
    expect(() => validateEnv({ ...validEnv, CORS_ORIGIN: '*' })).toThrow(
      /CORS_ORIGIN/,
    );
  });

  it('rechaza TRUSTED_PROXY_IP="true"', () => {
    expect(() =>
      validateEnv({ ...validEnv, TRUSTED_PROXY_IP: 'true' }),
    ).toThrow(/TRUSTED_PROXY_IP/);
  });

  it('rechaza secretos demasiado cortos', () => {
    expect(() => validateEnv({ ...validEnv, COOKIE_SECRET: 'corto' })).toThrow(
      /COOKIE_SECRET/,
    );
  });
});
