import { defineConfig } from 'vitest/config';

/**
 * Merged into the config that `@angular/build:unit-test` generates; only the
 * deltas belong here.
 *
 * Why this file has to exist at all: `@ionic/angular` reaches for
 * `@ionic/core/components`, a directory import. Bundlers resolve that to the
 * folder's index, Node's native ESM loader does not, so under the default jsdom
 * runner every spec that touches an Ionic component dies with
 * "Directory import ... is not supported resolving ES modules". Inlining the
 * Ionic packages routes them through Vite's resolver, which handles it.
 */
export default defineConfig({
  test: {
    server: {
      deps: {
        inline: [/@ionic\//],
      },
    },
  },
});
