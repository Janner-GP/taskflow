/**
 * Production environment, swapped in by the `fileReplacements` entry of the
 * `production` build configuration in angular.json.
 *
 * A packaged app has no dev server to fall back on, so the URL is fixed and
 * must be https — Android blocks cleartext traffic in release builds.
 */
export const environment = {
  production: true,
  apiUrl: 'https://api.taskflow.example.com/api',
  defaultLanguage: 'es',
  supportedLanguages: ['es', 'en'] as const,
};
