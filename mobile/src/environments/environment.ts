import { Capacitor } from '@capacitor/core';

/**
 * Development environment.
 *
 * The API base URL cannot be a single constant in development: the Android
 * emulator does not resolve `localhost` to the host machine — that address is
 * the emulator itself. The host is reachable at 10.0.2.2. Resolving it from the
 * Capacitor platform at runtime keeps one dev build working in both
 * `ionic serve` and the emulator, instead of needing two build configurations.
 *
 * iOS simulators do share the host network, so `localhost` is correct there.
 */
const devApiUrl = (): string =>
  Capacitor.getPlatform() === 'android' ? 'http://10.0.2.2:3000/api' : 'http://localhost:3000/api';

export const environment = {
  production: false,
  apiUrl: devApiUrl(),
  defaultLanguage: 'es',
  supportedLanguages: ['es', 'en'] as const,
};
