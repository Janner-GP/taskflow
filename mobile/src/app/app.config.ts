import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  checkmarkCircleOutline,
  checkmarkOutline,
  createOutline,
  languageOutline,
  personCircleOutline,
  sparklesOutline,
  trashOutline,
} from 'ionicons/icons';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { refreshInterceptor } from './core/interceptors/refresh.interceptor';
import { provideI18n } from './core/i18n/i18n.providers';
import { provideNativeCapabilities } from './core/native/native.providers';
import { CapacitorSessionStorage } from './core/storage/capacitor-session-storage';
import { SESSION_STORAGE_PORT } from './core/storage/session-storage.port';
import { AUTH_REPOSITORY } from './features/auth/domain/auth-repository.port';
import { HttpAuthRepository } from './features/auth/infrastructure/http-auth-repository';
import { AuthStore } from './features/auth/state/auth.store';
import { TASK_REPOSITORY } from './features/tasks/domain/task-repository.port';
import { HttpTaskRepository } from './features/tasks/infrastructure/http-task-repository';

/**
 * Standalone icon registration. With the tree-shakeable ionicons build nothing
 * is bundled unless it is named, so an unregistered `ion-icon` renders empty
 * instead of failing loudly. One call for the shell; features register their own.
 */
addIcons({
  'checkmark-circle-outline': checkmarkCircleOutline,
  'language-outline': languageOutline,
  'sparkles-outline': sparklesOutline,
  'person-circle-outline': personCircleOutline,
  'add-outline': addOutline,
  'checkmark-outline': checkmarkOutline,
  'create-outline': createOutline,
  'trash-outline': trashOutline,
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    /**
     * zone.js is kept deliberately. Ionic 8's components are Stencil custom
     * elements that fire events from outside Angular's knowledge, and zoneless
     * change detection is not something Ionic 8 claims to support — this is not
     * the place to find out. `eventCoalescing` trims the redundant cycles that
     * touch and scroll events would otherwise trigger.
     */
    provideZoneChangeDetection({ eventCoalescing: true }),

    /**
     * `mode: 'md'` pins Material styling on every platform instead of letting
     * Ionic switch to Cupertino on iOS. That is the point of sharing design
     * tokens with `web/`: one product, one look, whatever the device.
     */
    provideIonicAngular({ mode: 'md' }),

    provideRouter(routes, withComponentInputBinding()),

    /**
     * `withFetch` avoids the XHR quirks of a WebView, and note the absence of
     * `withCredentials`: this client authenticates with an `Authorization:
     * Bearer` header, not with cookies as the web client does.
     *
     * Interceptor order matters: `errorInterceptor` runs closest to the
     * backend (last in this array), so by the time `refreshInterceptor` sees
     * a failure it is already the normalized `ApiError` envelope, not a raw
     * `HttpErrorResponse` — that is what lets it branch on `code ===
     * 'UNAUTHENTICATED'`. `authInterceptor` runs outermost, adding
     * `X-Client: mobile` and the bearer token to the request on its way out.
     */
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, refreshInterceptor, errorInterceptor])),

    { provide: AUTH_REPOSITORY, useClass: HttpAuthRepository },
    { provide: TASK_REPOSITORY, useClass: HttpTaskRepository },
    { provide: SESSION_STORAGE_PORT, useClass: CapacitorSessionStorage },

    // Capacidades nativas (Fase 6) tras sus puertos: adaptador Capacitor en
    // dispositivo, fallback de navegador en `ionic serve`.
    ...provideNativeCapabilities(),

    provideI18n(),

    /**
     * Kicks off the startup session-rehydration attempt without blocking
     * bootstrap on it (`AuthStore.bootstrap()` returns `void`, not a promise
     * the initializer would await) — first paint is not held hostage to a
     * network round trip. `authGuard` is what actually waits for it to
     * settle before letting a private route activate.
     */
    provideAppInitializer(() => {
      const authStore = inject(AuthStore);
      authStore.bootstrap();
    }),
  ],
};
