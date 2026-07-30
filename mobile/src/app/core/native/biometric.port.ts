import { InjectionToken } from '@angular/core';

/**
 * Port for the biometric unlock of a stored session.
 *
 * This is the reason the mobile client uses `Authorization: Bearer` rather than
 * the cookies the web client uses: the refresh token is a value this app owns
 * and can put in the device's secure storage, so a returning user can be let
 * back in with a fingerprint instead of a password. With http-only cookies the
 * token would not be readable and none of this would be possible.
 *
 * Phase 6 provides an `@aparajita/capacitor-biometric-auth` implementation plus
 * a browser no-op that reports `available: false`, which makes the UI hide the
 * unlock affordance rather than offer something that cannot work.
 *
 * Only the contract lives here — no implementation yet.
 */
export interface BiometricAvailability {
  available: boolean;
  /** 'fingerprint' | 'faceId' | 'iris' | 'none' — drives copy and the icon. */
  kind: string;
}

export interface BiometricPort {
  check(): Promise<BiometricAvailability>;
  /**
   * Resolves false on a user cancel or a failed match. It must not reject for
   * those: a refused unlock is an expected outcome, not an exception.
   */
  authenticate(reason: string): Promise<boolean>;
}

export const BIOMETRIC_PORT = new InjectionToken<BiometricPort>('BiometricPort');
