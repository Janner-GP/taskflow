import { Injectable } from '@angular/core';

import { BiometricAvailability, BiometricPort } from '../biometric.port';

/**
 * Browser fallback: no biometría en `ionic serve`. Reporta `available: false`
 * para que la UI oculte el desbloqueo en vez de ofrecer algo que no funciona,
 * y concede el `authenticate` (no hay barrera que aplicar en el navegador).
 */
@Injectable()
export class NoopBiometricAdapter implements BiometricPort {
  check(): Promise<BiometricAvailability> {
    return Promise.resolve({ available: false, kind: 'none' });
  }

  authenticate(): Promise<boolean> {
    return Promise.resolve(true);
  }
}
