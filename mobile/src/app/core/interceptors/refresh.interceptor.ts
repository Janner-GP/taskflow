import { HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular/standalone';
import { TranslateService } from '@ngx-translate/core';
import { Observable, catchError, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiErrorCode, isApiError } from '../http/api-error';
import { AuthStore } from '../../features/auth/state/auth.store';
import { RefreshCoordinator } from './refresh-coordinator';

/**
 * Endpoints exempt from the refresh dance. `/auth/refresh` is the hard
 * requirement — without it a failing refresh would try to refresh itself
 * forever. `/auth/login` and `/auth/register` are excluded too: a 401 there
 * is `INVALID_CREDENTIALS`, not `UNAUTHENTICATED`, but excluding them keeps
 * this interceptor from ever reasoning about pre-session requests at all.
 */
const REFRESH_EXEMPT = ['/auth/login', '/auth/register', '/auth/refresh'];

/**
 * 401 handling, per the brief: refresh once, retry the original request,
 * queue whatever else is in flight while the refresh is pending, and never
 * loop if the refresh itself fails.
 *
 * Must sit AFTER `errorInterceptor` in the `withInterceptors` array — it
 * relies on receiving the normalized `ApiError`, not a raw `HttpErrorResponse`,
 * so it can branch on `code === 'UNAUTHENTICATED'` per the contract rule of
 * never branching on `message`.
 *
 * Scoped to `environment.apiUrl` BEFORE injecting anything: the ngx-translate
 * http-loader fetches `assets/i18n/*.json` through this same `HttpClient`
 * while `TranslateService` itself is still being constructed, and injecting
 * `TranslateService` here for that request is a circular-DI crash
 * (`NG0200`), not merely wasted work.
 */
export const refreshInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl) || REFRESH_EXEMPT.some((path) => req.url.includes(path))) {
    return next(req);
  }

  const authStore = inject(AuthStore);
  const coordinator = inject(RefreshCoordinator);
  const router = inject(Router);
  const toastController = inject(ToastController);
  const translate = inject(TranslateService);

  const retryWith = (token: string): Observable<HttpEvent<unknown>> => next(withBearer(req, token));

  const onRefreshFailed = (original: unknown): Observable<HttpEvent<unknown>> => {
    authStore.clearSession();
    void presentSessionExpiredToast(toastController, translate);
    void router.navigateByUrl('/auth/login');
    return throwError(() => original) as Observable<HttpEvent<unknown>>;
  };

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!isApiError(err) || err.code !== ApiErrorCode.UNAUTHENTICATED) {
        return throwError(() => err);
      }

      if (coordinator.isRefreshing()) {
        return coordinator.wait().pipe(
          switchMap((token) => (token ? retryWith(token) : onRefreshFailed(err))),
        );
      }

      coordinator.start();
      return authStore.refresh().pipe(
        switchMap((token) => {
          coordinator.complete(token);
          return retryWith(token);
        }),
        catchError(() => {
          coordinator.complete(null);
          return onRefreshFailed(err);
        }),
      );
    }),
  );
};

function withBearer(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

async function presentSessionExpiredToast(
  toastController: ToastController,
  translate: TranslateService,
): Promise<void> {
  const toast = await toastController.create({
    message: translate.instant('errors.sessionExpired'),
    duration: 3000,
    color: 'danger',
    position: 'top',
  });
  await toast.present();
}
