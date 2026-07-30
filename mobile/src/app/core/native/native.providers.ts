import { Provider } from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { BIOMETRIC_PORT } from './biometric.port';
import { CapacitorBiometricAdapter } from './biometric/capacitor-biometric.adapter';
import { NoopBiometricAdapter } from './biometric/noop-biometric.adapter';
import { CAMERA_PORT } from './camera.port';
import { CapacitorCameraAdapter } from './camera/capacitor-camera.adapter';
import { NoopCameraAdapter } from './camera/noop-camera.adapter';
import { CapacitorNotificationAdapter } from './notification/capacitor-notification.adapter';
import { NoopNotificationAdapter } from './notification/noop-notification.adapter';
import { NOTIFICATION_PORT } from './notification.port';

/**
 * Enlaza cada puerto nativo con su adaptador según la plataforma: el de
 * Capacitor en dispositivo, el fallback de navegador en `ionic serve`. Quien
 * inyecta el puerto no sabe cuál le tocó — esa es la gracia del puerto.
 */
export function provideNativeCapabilities(): Provider[] {
  const native = Capacitor.isNativePlatform();

  return [
    {
      provide: NOTIFICATION_PORT,
      useClass: native ? CapacitorNotificationAdapter : NoopNotificationAdapter,
    },
    {
      provide: BIOMETRIC_PORT,
      useClass: native ? CapacitorBiometricAdapter : NoopBiometricAdapter,
    },
    {
      provide: CAMERA_PORT,
      useClass: native ? CapacitorCameraAdapter : NoopCameraAdapter,
    },
  ];
}
