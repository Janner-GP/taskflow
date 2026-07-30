import { InjectionToken } from '@angular/core';

/**
 * Port for attaching a photo to a task (`Task.attachmentUrl` in the contract).
 *
 * Phase 6 provides a `@capacitor/camera` implementation plus a browser fallback
 * that goes through a file input, so the feature degrades instead of breaking
 * during `ionic serve`.
 *
 * Only the contract lives here — no implementation yet.
 */
export interface CapturedPhoto {
  /** Base64 payload, without the `data:` prefix — that is what the plugin returns. */
  base64: string;
  /** e.g. 'jpeg' | 'png'; needed to build the MIME type on upload. */
  format: string;
}

export interface CameraPort {
  requestPermission(): Promise<boolean>;
  /** Resolves null when the user dismisses the picker — a cancel is not an error. */
  takePhoto(): Promise<CapturedPhoto | null>;
  pickFromGallery(): Promise<CapturedPhoto | null>;
}

export const CAMERA_PORT = new InjectionToken<CameraPort>('CameraPort');
