import { provideHttpClient, withFetch, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
  inject,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { TaskFlowPreset } from './core/config/primeng-preset';
import { provideI18n } from './core/i18n/i18n.config';
import { apiErrorInterceptor } from './core/interceptors/api-error.interceptor';
import { authRefreshInterceptor } from './core/interceptors/auth-refresh.interceptor';
import { clientHeaderInterceptor } from './core/interceptors/client-header.interceptor';
import { languageInterceptor } from './core/interceptors/language.interceptor';
import { AuthStore } from './features/auth/application/auth.store';
import { AUTH_REPOSITORY } from './features/auth/domain/auth.repository';
import { HttpAuthRepository } from './features/auth/infrastructure/http-auth.repository';
import { TASK_REPOSITORY } from './features/tasks/domain/task.repository';
import { HttpTaskRepository } from './features/tasks/infrastructure/http-task.repository';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    // Angular 21 ya arranca sin zone.js (no hay polyfill de zone en el build);
    // lo declaramos explícito para que quede en el contrato de la app y no
    // dependa del default del CLI.
    provideZonelessChangeDetection(),

    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),

    /**
     * `withFetch()` — usa la Fetch API en vez de XHR.
     * `withXsrfConfiguration()` — el backend deja la cookie `XSRF-TOKEN` y espera
     *   el header `X-XSRF-TOKEN`. Angular lo adjunta solo en peticiones mutantes
     *   y same-origin; por eso en dev usamos el proxy (`proxy.conf.json`) en vez
     *   de apuntar a http://localhost:3000, que sería cross-origin y rompería
     *   tanto el XSRF como las cookies `httpOnly`.
     *
     * No hace falta interceptor de token: la cookie de sesión es `httpOnly` y el
     * navegador la envía sola.
     *
     * Orden de la cadena (el primero es el más externo):
     *   clientHeader → authRefresh → apiError → red
     * `apiError` queda por dentro para que `authRefresh` reciba el error ya
     * normalizado y pueda ramificar por `code`, como manda el contrato.
     */
    provideHttpClient(
      withFetch(),
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
      withInterceptors([
        clientHeaderInterceptor,
        languageInterceptor,
        authRefreshInterceptor,
        apiErrorInterceptor,
      ]),
    ),

    providePrimeNG({
      ripple: true,
      theme: {
        preset: TaskFlowPreset,
        options: {
          // Mismo selector que la variante `dark:` de Tailwind (ver styles.css).
          darkModeSelector: '.dark',
          // Mete el CSS del tema en la capa `primeng`, cuyo orden se declara en
          // `styles.css`. Así las utilidades de Tailwind ganan al tema.
          cssLayer: { name: 'primeng', order: 'theme, base, primeng, components, utilities' },
        },
      },
    }),

    provideI18n(),

    MessageService,

    // Los stores hablan con el puerto del dominio, no con la clase concreta.
    { provide: AUTH_REPOSITORY, useExisting: HttpAuthRepository },
    { provide: TASK_REPOSITORY, useExisting: HttpTaskRepository },

    /**
     * Rehidratación de sesión ANTES de que el router evalúe ninguna ruta.
     *
     * Devolver la promesa aquí es la mitad de la solución a la carrera
     * guard/rehidratación: cuando el primer guard corre, `GET /api/auth/me` ya
     * respondió. La otra mitad es que el guard `await`ea la misma promesa
     * memoizada, así que tampoco depende de este orden.
     *
     * Efecto lateral útil: esta primera petición es la que trae la cookie
     * `XSRF-TOKEN`, de modo que el login (mutante) ya sale con el header.
     */
    provideAppInitializer(() => inject(AuthStore).ensureSessionResolved()),
  ],
};
