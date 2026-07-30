import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

import type { CameraPort, CapturedPhoto } from '../camera.port';

/**
 * `@capacitor/camera` behind `CameraPort`. Solo se instancia en dispositivo;
 * el navegador recibe `NoopCameraAdapter`.
 *
 * Cualquier rechazo del plugin (cancelación, permiso denegado, error de HW) se
 * captura y devuelve null — un cancel no es una excepción del negocio.
 */
@Injectable()
export class CapacitorCameraAdapter implements CameraPort {
  async requestPermission(): Promise<boolean> {
    try {
      const result = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
      // 'limited' counts as usable on iOS; only 'denied' blocks the feature.
      return result.camera !== 'denied' && result.photos !== 'denied';
    } catch {
      return false;
    }
  }

  async takePhoto(): Promise<CapturedPhoto | null> {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
      });
      if (!photo.base64String) return null;
      return { base64: photo.base64String, format: photo.format };
    } catch {
      return null;
    }
  }

  async pickFromGallery(): Promise<CapturedPhoto | null> {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.Base64,
        source: CameraSource.Photos,
      });
      if (!photo.base64String) return null;
      return { base64: photo.base64String, format: photo.format };
    } catch {
      return null;
    }
  }
}
