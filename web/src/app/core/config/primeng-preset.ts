import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Preset de PrimeNG para TaskFlow.
 *
 * No repite la paleta: cada token apunta a las variables `--tf-*` definidas en
 * `src/styles/design-tokens.css`, que es la única fuente de verdad (y el archivo
 * que se replica en `mobile/`). PrimeNG emite estos valores como `--p-*`, y
 * `tailwindcss-primeui` los expone luego como utilidades `bg-primary-600`,
 * `bg-surface-100`, etc. Un solo cambio de hex se propaga a todo.
 */
const tfPrimary = {
  50: 'var(--tf-primary-50)',
  100: 'var(--tf-primary-100)',
  200: 'var(--tf-primary-200)',
  300: 'var(--tf-primary-300)',
  400: 'var(--tf-primary-400)',
  500: 'var(--tf-primary-500)',
  600: 'var(--tf-primary-600)',
  700: 'var(--tf-primary-700)',
  800: 'var(--tf-primary-800)',
  900: 'var(--tf-primary-900)',
  950: 'var(--tf-primary-950)',
};

const tfSurface = {
  0: 'var(--tf-surface-0)',
  50: 'var(--tf-surface-50)',
  100: 'var(--tf-surface-100)',
  200: 'var(--tf-surface-200)',
  300: 'var(--tf-surface-300)',
  400: 'var(--tf-surface-400)',
  500: 'var(--tf-surface-500)',
  600: 'var(--tf-surface-600)',
  700: 'var(--tf-surface-700)',
  800: 'var(--tf-surface-800)',
  900: 'var(--tf-surface-900)',
  950: 'var(--tf-surface-950)',
};

export const TaskFlowPreset = definePreset(Aura, {
  semantic: {
    primary: tfPrimary,
    // Radios alineados con los design tokens
    borderRadius: {
      none: '0',
      xs: '0.25rem',
      sm: '0.375rem',
      md: '0.5rem',
      lg: '0.875rem',
      xl: '1.25rem',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.600}',
          contrastColor: 'var(--tf-surface-0)',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        surface: tfSurface,
      },
      dark: {
        primary: {
          color: '{primary.400}',
          contrastColor: 'var(--tf-surface-950)',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}',
        },
        surface: tfSurface,
      },
    },
  },
});
