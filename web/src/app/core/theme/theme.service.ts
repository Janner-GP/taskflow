import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'taskflow.theme';

/**
 * Dark mode de la app.
 *
 * Fuente de verdad: la clase `.dark` en <html>. Ese mismo selector es el
 * `darkModeSelector` del preset de PrimeNG y el que alimenta la variante `dark:`
 * de Tailwind (ver `styles.css`), así que los tres conmutan con un solo toggle.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly scheme = signal<ColorScheme>(this.readInitialScheme());

  readonly colorScheme = this.scheme.asReadonly();
  readonly isDark = computed(() => this.scheme() === 'dark');

  constructor() {
    effect(() => {
      const scheme = this.scheme();
      this.document.documentElement.classList.toggle('dark', scheme === 'dark');
      this.document.documentElement.style.colorScheme = scheme;
      localStorage.setItem(STORAGE_KEY, scheme);
    });
  }

  toggle(): void {
    this.scheme.update((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  set(scheme: ColorScheme): void {
    this.scheme.set(scheme);
  }

  /** Preferencia guardada; si no hay ninguna, la del sistema operativo. */
  private readInitialScheme(): ColorScheme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }

    // `matchMedia` no existe en jsdom (tests): sin él, se asume tema claro.
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
  }
}
