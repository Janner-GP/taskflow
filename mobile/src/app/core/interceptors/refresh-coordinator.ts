import { Injectable } from '@angular/core';
import { Observable, Subject, take } from 'rxjs';

/**
 * Makes concurrent 401s share a single `/auth/refresh` call instead of each
 * firing their own — a race that would have the second refresh revoke the
 * token the first one just received.
 *
 * `refresh.interceptor.ts` checks `isRefreshing()`: the request that finds it
 * `false` becomes the one that calls `AuthStore.refresh()`, after calling
 * `start()` so every request behind it takes the `wait()` branch instead.
 * `complete()` replays the outcome (a fresh access token, or `null` on
 * failure) to every request queued on `wait()`, then resets the flag.
 */
@Injectable({ providedIn: 'root' })
export class RefreshCoordinator {
  private refreshing = false;
  private readonly outcome = new Subject<string | null>();

  isRefreshing(): boolean {
    return this.refreshing;
  }

  start(): void {
    this.refreshing = true;
  }

  complete(token: string | null): void {
    this.refreshing = false;
    this.outcome.next(token);
  }

  /** Resolves once, with the token the in-flight refresh produced (or `null`). */
  wait(): Observable<string | null> {
    return this.outcome.pipe(take(1));
  }
}
