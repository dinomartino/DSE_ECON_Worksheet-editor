import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Two lanes (k-0611, plan `Outbox/k-0604/TEST-AUDIT.md` §9; rules: `docs/RECIPES.md` §
 * Add or grow a test file).
 *
 * - **Fast lane, `npm test` (this file).** Test files share one module cache per worker
 *   (`isolate: false`), and `src/test/freshModules.ts` resets the module registry before
 *   each file, so every file still gets fresh `src` modules and singletons but React,
 *   jszip and the rest load once per worker, not once per file. The big generated tables
 *   run a fixed sample (`src/test/sample.ts`). The same file also puts back the globals,
 *   env and timers a file changed, so no file sees another's. A test that only passes alone
 *   is a bug in that test: fix it, never isolate it here.
 * - **Full lane, `npm run test:full` (`vitest.full.config.ts`).** Every file isolated, every
 *   table whole, 120 sync seeds. Per-push CI, nightly and the release gate.
 *
 * `scripts/**\/*.test.ts` are hand-run harnesses (fixture emitters, seeders), included
 * only when the command line names a path under `scripts/`
 * (`npx vitest run scripts/foo.test.ts`). A bare `npx vitest run` is `src/` only, so it
 * can never run `scripts/emit-v1-corpus.test.ts` and rewrite the frozen corpus.
 */
const namesScripts = process.argv.slice(2).some((arg) => /(^|[\\/])scripts([\\/]|$)/.test(arg));

export const TEST_INCLUDE = [
  'src/**/*.test.ts',
  'src/**/*.test.tsx',
  ...(namesScripts ? ['scripts/**/*.test.ts'] : []),
];

export const TEST_SETUP = ['src/test/ownKeyAiOn.ts'];

export const TEST_ALIAS = { '@': path.resolve(__dirname, 'src') };

export default defineConfig({
  test: {
    environment: 'node',
    include: TEST_INCLUDE,
    isolate: false,
    setupFiles: [...TEST_SETUP, 'src/test/freshModules.ts'],
  },
  resolve: {
    alias: TEST_ALIAS,
  },
});
