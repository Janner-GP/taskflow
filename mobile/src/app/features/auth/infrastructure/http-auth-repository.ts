import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AuthRepository } from '../domain/auth-repository.port';
import { AuthSession, AuthTokens } from '../domain/session.model';
import { LoginInput, RegisterInput, User } from '../domain/user.model';

/**
 * HTTP adapter for `AuthRepository`, per docs/CONTRACT.md.
 *
 * The `X-Client: mobile` header and the `Authorization: Bearer` header are
 * NOT added here — that is `core/interceptors/auth.interceptor.ts`'s job for
 * every request to the API, not just these five. This class only knows the
 * endpoints and their bodies.
 *
 * Discrepancy with the contract: `POST /api/auth/logout` documents `204` and
 * says mobile "revoca el refresh recibido" but does not spell out the request
 * body. This sends `{ refreshToken }`, mirroring `/auth/refresh` — flagged for
 * the backend team to confirm.
 */
@Injectable()
export class HttpAuthRepository implements AuthRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  register(input: RegisterInput): Observable<AuthSession> {
    return this.http.post<AuthSession>(`${this.baseUrl}/register`, input);
  }

  login(input: LoginInput): Observable<AuthSession> {
    return this.http.post<AuthSession>(`${this.baseUrl}/login`, input);
  }

  refresh(refreshToken: string): Observable<AuthTokens> {
    return this.http.post<AuthTokens>(`${this.baseUrl}/refresh`, { refreshToken });
  }

  logout(refreshToken: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, { refreshToken });
  }

  me(): Observable<User> {
    return this.http.get<{ user: User }>(`${this.baseUrl}/me`).pipe(map((res) => res.user));
  }
}
