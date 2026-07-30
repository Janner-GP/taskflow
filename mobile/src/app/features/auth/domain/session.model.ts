import { User } from './user.model';

/**
 * The mobile-shaped login response. The web client gets `{ user }` plus
 * `Set-Cookie`; this client asks with `X-Client: mobile` and gets the tokens in
 * the body instead.
 *
 * Where each half lives, and why:
 *
 *   accessToken   in memory only. It is short-lived and rewriting it to disk on
 *                 every refresh would widen the window in which a stolen device
 *                 backup yields a usable token.
 *   refreshToken  device secure storage (`@capacitor/preferences` over the
 *                 Keychain / EncryptedSharedPreferences in phase 6). It has to
 *                 survive a cold start, which is exactly what makes the
 *                 biometric unlock possible.
 *
 * A refresh rotates the pair and revokes the one just used, so a leaked refresh
 * token stops working the moment the legitimate client refreshes.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession extends AuthTokens {
  user: User;
}
