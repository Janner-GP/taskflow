import { Injectable } from '@angular/core';

import type { CameraPort, CapturedPhoto } from '../camera.port';

/**
 * Browser fallback para `ionic serve`: no hay acceso a cámara nativa, pero sí
 * a `<input type="file">`. Permite probar el flujo de adjunto en el navegador
 * sin necesidad de dispositivo.
 *
 * `takePhoto` delega a `pickFromGallery` porque el navegador no distingue
 * entre captura nueva y selección de archivo.
 */
@Injectable()
export class NoopCameraAdapter implements CameraPort {
  requestPermission(): Promise<boolean> {
    return Promise.resolve(true);
  }

  pickFromGallery(): Promise<CapturedPhoto | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.style.display = 'none';
      document.body.appendChild(input);

      const cleanup = (): void => {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
        }
      };

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        cleanup();
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // dataUrl format: "data:image/<format>;base64,<payload>"
          const commaIdx = dataUrl.indexOf(',');
          const header = dataUrl.slice(0, commaIdx);
          const base64 = dataUrl.slice(commaIdx + 1);
          const mimeMatch = header.match(/data:image\/(\w+);base64/);
          const format = mimeMatch ? mimeMatch[1] : 'jpeg';
          resolve({ base64, format });
        };
        reader.readAsDataURL(file);
      });

      // Modern browsers fire 'cancel' when the file dialog is dismissed without selection.
      input.addEventListener('cancel', () => {
        cleanup();
        resolve(null);
      });

      input.click();
    });
  }

  takePhoto(): Promise<CapturedPhoto | null> {
    return this.pickFromGallery();
  }
}
