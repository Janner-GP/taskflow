/**
 * Modelo de usuario del contrato (`docs/CONTRACT.md`).
 *
 * No hay campo de token: en web el JWT viaja en una cookie `httpOnly`, de modo
 * que es ilegible desde JavaScript. La sesión se rehidrata con `GET /auth/me`.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  /** ISO 8601 */
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  /** Mínimo 8 caracteres, 1 mayúscula y 1 dígito (lo valida el backend). */
  password: string;
}

/**
 * Respuesta de `login` / `register` / `me` para el transporte web.
 * Mobile recibe además `accessToken` y `refreshToken`; web nunca los ve.
 */
export interface SessionResponse {
  user: User;
}
