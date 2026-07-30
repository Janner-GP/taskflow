import { Injectable } from '@angular/core';
import { BiometricAuth, BiometryType } from '@aparajita/capacitor-biometric-auth';

import { BiometricAvailability, BiometricPort } from '../biometric.port';

/**
 * `@aparajita/capacitor-biometric-auth` behind `BiometricPort`. Solo se instancia
 * en dispositivo; el navegador recibe `NoopBiometricAdapter`.
 */
@Injectable()
export class CapacitorBiometricAdapter implements BiometricPort {
  async check(): Promise<BiometricAvailability> {
    const info = await BiometricAuth.checkBiometry();
    return { available: info.isAvailable, kind: mapKind(info.biometryType) };
  }

  /**
   * `authenticate` lanza cuando el usuario cancela o el match falla; para el
   * puerto eso es un `false`, no una excepción — un desbloqueo denegado es un
   * resultado esperado.
   */
  async authenticate(reason: string): Promise<boolean> {
    try {
      await BiometricAuth.authenticate({
        reason,
        cancelTitle: reason,
        allowDeviceCredential: true,
      });
      return true;
    } catch {
      return false;
    }
  }
}

function mapKind(type: BiometryType): string {
  switch (type) {
    case BiometryType.touchId:
    case BiometryType.fingerprintAuthentication:
      return 'fingerprint';
    case BiometryType.faceId:
    case BiometryType.faceAuthentication:
      return 'faceId';
    case BiometryType.irisAuthentication:
      return 'iris';
    default:
      return 'none';
  }
}
