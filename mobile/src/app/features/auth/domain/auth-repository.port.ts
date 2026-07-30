import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthSession, AuthTokens } from './session.model';
import { LoginInput, RegisterInput, User } from './user.model';

/**
 * The use case, independent of transport. `HttpAuthRepository` in
 * `infrastructure/` is the only thing that knows these calls are HTTP, or that
 * the mobile transport is `Authorization: Bearer` rather than the cookies the
 * web client uses — everything above this port, including `AuthStore`, only
 * knows this interface.
 */
export interface AuthRepository {
  register(input: RegisterInput): Observable<AuthSession>;
  login(input: LoginInput): Observable<AuthSession>;
  /** Rotates the pair: the refresh token passed in is revoked by the server. */
  refresh(refreshToken: string): Observable<AuthTokens>;
  logout(refreshToken: string): Observable<void>;
  /** How the app rehydrates a session on cold start once a refresh succeeds. */
  me(): Observable<User>;
}

export const AUTH_REPOSITORY = new InjectionToken<AuthRepository>('AuthRepository');
