import { Routes } from '@angular/router';

/** Lazy-loaded, unguarded — this is precisely the tree a signed-out user must reach. */
export const authRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./presentation/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./presentation/register.page').then((m) => m.RegisterPage),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];
