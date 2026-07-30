export const STORAGE_SERVICE = Symbol('StorageServicePort');

export interface StorageServicePort {
  upload(buffer: Buffer, mimeType: string, ext: string): Promise<{ url: string; key: string }>;
  deleteIfOrphaned(key: string, currentTaskId: string): Promise<void>;
}
