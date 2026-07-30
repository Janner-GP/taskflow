import type { CapacitorConfig } from '@capacitor/cli';

/**
 * `webDir` is the folder Capacitor copies into the native shell, and it must be
 * the folder that actually contains `index.html`. With the Angular 21
 * `@angular/build:application` builder that is `dist/<project>/browser`, NOT
 * `dist/<project>` and not the `www` of older Ionic templates — verified
 * against a real `ng build`.
 *
 * No native platform is added yet (`npx cap add android` lands in phase 6, and
 * `mobile/android/` is git-ignored), so this file is config-only for now.
 */
const config: CapacitorConfig = {
  appId: 'com.taskflow.app',
  appName: 'TaskFlow',
  webDir: 'dist/mobile/browser',
  android: {
    /**
     * The Android emulator reaches the host machine at 10.0.2.2, never at
     * localhost. During development the API is plain http on that address, so
     * cleartext has to be allowed for the dev build; see
     * `src/environments/environment.ts` for how the base URL is chosen.
     */
    allowMixedContent: true,
  },
  plugins: {
    /**
     * Phase 6 wires the actual reminders. Declared here so the native project
     * generated later already has the icon/sound channel defaults.
     */
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#4f46e5',
    },
  },
};

export default config;
