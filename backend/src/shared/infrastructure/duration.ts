const UNIT_IN_MS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Convierte las duraciones del entorno ("15m", "7d", "900") a milisegundos.
 *
 * El formato ya lo garantiza el schema de Zod (`ACCESS_TOKEN_TTL`,
 * `REFRESH_TOKEN_TTL`), así que aquí solo se traduce. Un valor sin unidad se
 * interpreta en segundos, igual que hace `jsonwebtoken` con `expiresIn`
 * numérico, para que el TTL de la cookie y el del JWT no se desalineen.
 */
export function durationToMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(duration);

  if (!match) {
    throw new Error(`Duración inválida: "${duration}"`);
  }

  return Number(match[1]) * UNIT_IN_MS[match[2] ?? 's'];
}
