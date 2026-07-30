import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { SessionStoragePort } from './session-storage.port';

const REFRESH_TOKEN_KEY = 'tf.auth.refreshToken';

/**
 * `@capacitor/preferences` implementation of `SessionStoragePort`.
 *
 * On Android this is backed by `SharedPreferences` and on iOS by `UserDefaults`
 * — plain storage, not the Keychain. That is an accepted trade-off for now
 * because a refresh token rotates on every use and a leaked one stops working
 * the moment the legitimate client refreshes; it is not the trade-off Phase 6
 * ships to production with. Swapping this class for a secure-storage adapter
 * is the entire migration, since every caller only knows `SessionStoragePort`.
 */
@Injectable()
export class CapacitorSessionStorage implements SessionStoragePort {
  async getRefreshToken(): Promise<string | null> {
    const { value } = await Preferences.get({ key: REFRESH_TOKEN_KEY });
    return value;
  }

  async setRefreshToken(token: string): Promise<void> {
    await Preferences.set({ key: REFRESH_TOKEN_KEY, value: token });
  }

  async clearRefreshToken(): Promise<void> {
    await Preferences.remove({ key: REFRESH_TOKEN_KEY });
  }
}
