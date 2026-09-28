import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * The translation quality eval (`npm run eval:translate`): live providers, keys from the
 * environment, never part of `npm test`. It lives in `evals/`, outside the default
 * config's `src/` and `scripts/` includes.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['evals/**/*.eval.ts'],
    testTimeout: 15 * 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
