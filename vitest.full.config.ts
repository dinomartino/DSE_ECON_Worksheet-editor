import { defineConfig } from 'vitest/config';
import { TEST_ALIAS, TEST_INCLUDE, TEST_SETUP } from './vitest.config';

/**
 * The full lane, `npm run test:full` (k-0611): every test file isolated in its own module
 * graph, as `npm test` ran before the fast lane, and every generated table whole
 * (`TEST_FULL=1`: `src/test/sample.ts`, 120 sync seeds). Per-push CI, nightly and the
 * release gate run this; `npm test` (`vitest.config.ts`) is the fast lane.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: TEST_INCLUDE,
    setupFiles: TEST_SETUP,
    env: { TEST_FULL: '1' },
  },
  resolve: {
    alias: TEST_ALIAS,
  },
});
