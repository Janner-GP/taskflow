import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

/**
 * `auth/*` is unguarded and lazy — reachable by anyone. The `''` tree is the
 * shell plus its tabs, guarded once at the parent: `authGuard` waits for
 * `AuthStore`'s startup rehydration before deciding, so a hard reload on
 * `/tasks` or `/profile` does not get bounced to login while that check is
 * still pending.
 */
export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/presentation/shell.page').then((m) => m.ShellPage),
    children: [
      {
        path: 'tasks',
        loadComponent: () => import('./features/tasks/presentation/tasks.page').then((m) => m.TasksPage),
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/presentation/profile.page').then((m) => m.ProfilePage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'tasks' },
    ],
  },
  { path: '**', redirectTo: '' },
];
