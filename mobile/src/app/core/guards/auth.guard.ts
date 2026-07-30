import { toObservable } from '@angular/core/rxjs-interop';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';

import { AuthStore } from '../../features/auth/state/auth.store';

/**
 * Guards the private route tree (the shell and everything under it).
 *
 * The one thing this must not do is decide from `isAuthenticated()` alone: at
 * the moment the app boots — including a hard reload deep on a private route
 * — that signal is `false` simply because the startup refresh (`AuthStore
 * .bootstrap()`, kicked off from a `provideAppInitializer` in app.config.ts)
 * has not resolved yet, not because there is no session. Deciding then would
 * be exactly the bug this brief calls out: reloading a private route would
 * bounce a validly-logged-in user to the login screen.
 *
 * So the guard waits on `hydrated`, which only becomes `true` once that
 * startup attempt has settled one way or the other, and only then reads
 * `isAuthenticated()`.
 */
export const authGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  return toObservable(authStore.hydrated).pipe(
    filter((hydrated) => hydrated),
    take(1),
    map(() => authStore.isAuthenticated() || router.createUrlTree(['/auth/login'])),
  );
};
