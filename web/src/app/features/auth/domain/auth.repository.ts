import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { LoginRequest, RegisterRequest, User } from './user';

/**
 * Puerto de autenticación. El dominio define QUÉ operaciones existen; el
 * adaptador HTTP (`infrastructure/`) decide CÓMO se hablan.
 *
 * Ninguna firma devuelve tokens: en web viajan en cookies `httpOnly` y el
 * cliente jamás los ve. `refresh()` solo indica si el servidor renovó o no.
 */
export interface AuthRepository {
  register(request: RegisterRequest): Observable<User>;
  login(request: LoginRequest): Observable<User>;
  /** Rehidrata la sesión: 200 = hay sesión, 401 = no la hay. */
  me(): Observable<User>;
  /** Rota el par de tokens leyendo la cookie de refresh. */
  refresh(): Observable<void>;
  logout(): Observable<void>;
}

/**
 * El store depende de esta abstracción, nunca de la clase concreta: cambiar el
 * transporte (o falsearlo) es cambiar un provider.
 */
export const AUTH_REPOSITORY = new InjectionToken<AuthRepository>('AUTH_REPOSITORY');
