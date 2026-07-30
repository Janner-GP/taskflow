import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from './auth.store';

/**
 * Guard de rutas privadas.
 *
 * La clave está en el `await`: con cookies `httpOnly` el guard NO puede decidir
 * de forma sincrónica, porque el único que sabe si hay sesión es el servidor.
 * Esperar a `ensureSessionResolved()` es lo que hace que recargar la página en
 * una ruta privada no expulse al login mientras `GET /auth/me` está en vuelo.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const store = inject(AuthStore);
  const router = inject(Router);

  await store.ensureSessionResolved();

  return (
    store.isAuthenticated() ||
    router.createUrlTree(['/auth/login'], { queryParams: { redirectTo: state.url } })
  );
};

/** Inverso: quien ya tiene sesión no vuelve al login ni al registro. */
export const guestGuard: CanActivateFn = async () => {
  const store = inject(AuthStore);
  const router = inject(Router);

  await store.ensureSessionResolved();

  return store.isAuthenticated() ? router.createUrlTree(['/tasks']) : true;
};
