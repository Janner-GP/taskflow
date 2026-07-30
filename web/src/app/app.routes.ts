import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './features/auth/application/auth.guard';

/**
 * Dos zonas, cada una con su layout y su guard:
 *
 * - `/auth/*` — público, `guestGuard`: quien ya tiene sesión no ve el login.
 * - el resto  — privado, `authGuard`: espera a la rehidratación antes de decidir.
 *
 * Todo se carga en su propio chunk (`loadComponent`).
 */
export const routes: Routes = [
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./layout/auth-layout/auth-layout').then((m) => m.AuthLayout),
    children: [
      {
        path: 'login',
        loadComponent: () => import('./features/auth/presentation/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        loadComponent: () => import('./features/auth/presentation/register.page').then((m) => m.RegisterPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'login' },
    ],
  },

  // Atajos heredados de la Fase 0.
  { path: 'login', pathMatch: 'full', redirectTo: 'auth/login' },
  { path: 'register', pathMatch: 'full', redirectTo: 'auth/register' },

  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: 'tasks',
        loadComponent: () => import('./features/tasks/presentation/tasks.page').then((m) => m.TasksPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'tasks' },
      { path: '**', redirectTo: 'tasks' },
    ],
  },
];
