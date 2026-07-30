import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { SILENT_AUTH_FAILURE, SKIP_AUTH_REFRESH } from '../../../core/interceptors/auth-refresh.interceptor';
import { AuthRepository } from '../domain/auth.repository';
import { LoginRequest, RegisterRequest, SessionResponse, User } from '../domain/user';

/**
 * Adaptador HTTP del puerto `AuthRepository` (`docs/CONTRACT.md` → `/api/auth/*`).
 *
 * No hay manejo de tokens: `withCredentials` tampoco hace falta porque todo es
 * same-origin (`apiUrl = '/api'`, proxeado en dev y por nginx en producción),
 * así que el navegador manda las cookies solo. El header `X-XSRF-TOKEN` lo pone
 * Angular con `withXsrfConfiguration` en las peticiones mutantes.
 *
 * `login`, `register`, `logout` y `refresh` se marcan con `SKIP_AUTH_REFRESH`:
 * un 401 en ellas es una respuesta legítima del flujo, no una sesión caducada,
 * y reintentarlas con un refresh sería un bucle. `me()` sí lo permite —es justo
 * el caso "el access token expiró pero el refresh sigue vivo"—.
 */
@Injectable({ providedIn: 'root' })
export class HttpAuthRepository implements AuthRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  register(request: RegisterRequest): Observable<User> {
    return this.http
      .post<SessionResponse>(`${this.baseUrl}/register`, request, { context: skipRefresh() })
      .pipe(map((response) => response.user));
  }

  login(request: LoginRequest): Observable<User> {
    return this.http
      .post<SessionResponse>(`${this.baseUrl}/login`, request, { context: skipRefresh() })
      .pipe(map((response) => response.user));
  }

  me(): Observable<User> {
    return this.http
      .get<SessionResponse>(`${this.baseUrl}/me`, {
        // Sí intenta refrescar, pero en silencio: en el arranque "no hay
        // sesión" es un resultado normal, no una sesión que acaba de expirar.
        context: new HttpContext().set(SILENT_AUTH_FAILURE, true),
      })
      .pipe(map((response) => response.user));
  }

  refresh(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/refresh`, {}, { context: skipRefresh() });
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}, { context: skipRefresh() });
  }
}

function skipRefresh(): HttpContext {
  return new HttpContext().set(SKIP_AUTH_REFRESH, true);
}
