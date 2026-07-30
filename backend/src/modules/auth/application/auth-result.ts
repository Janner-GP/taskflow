import type { User } from '../domain/user.entity';

/**
 * Los casos de uso siempre devuelven ambos tokens; si viajan en cookies o en el
 * body lo decide el transporte (`SessionTransport`).
 */
export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}
