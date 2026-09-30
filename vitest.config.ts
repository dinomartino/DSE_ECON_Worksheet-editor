import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * `scripts/**\/*.test.ts` are hand-run harnesses (fixture emitters, seeders), included
 * only when the command line names a path under `scripts/`
 * (`npx vitest run scripts/foo.test.ts`). A bare `npx vitest run` is `src/` only, so it
 * can never run `scripts/emit-v1-corpus.test.ts` and rewrite the frozen corpus.
 */
const namesScripts = process.argv.slice(2).some((arg) => /(^|[\\/])scripts([\\/]|$)/.test(arg));

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      ...(namesScripts ? ['scripts/**/*.test.ts'] : []),
    ],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
