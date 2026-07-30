import { InjectionToken } from '@angular/core';

/**
 * Port for persisting the refresh token across cold starts.
 *
 * The access token never comes near this port — it stays in `AuthStore`'s
 * in-memory state. Only the refresh token, which must survive the app being
 * killed, goes through here.
 *
 * Phase 0 shipped this as a stated intent (see `core/native/biometric.port.ts`);
 * this is that same pattern applied to storage. `CapacitorSessionStorage`
 * (infra, `@capacitor/preferences`) is a plain, unencrypted implementation —
 * fine for a refresh token that rotates on every use, but Phase 6 swaps it for
 * a Keychain/EncryptedSharedPreferences-backed adapter behind this same
 * interface, and pairs it with `BiometricPort` to unlock it. Nothing above
 * this token needs to change when that happens.
 */
export interface SessionStoragePort {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clearRefreshToken(): Promise<void>;
}

export const SESSION_STORAGE_PORT = new InjectionToken<SessionStoragePort>('SessionStoragePort');
