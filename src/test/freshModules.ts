import { afterAll, vi } from 'vitest';

/**
 * Fast lane only (`vitest.config.ts`, k-0611): test files share a worker, so each file must
 * start as if it ran alone.
 *
 * - Modules: the registry is reset before each file, so it imports fresh `src` modules
 *   (stores, singletons, caches) instead of the previous file's.
 * - Globals, env, timers: what a file left behind is put back when it ends. A file that
 *   assigns `globalThis.window` or a fake `localStorage` once for all its tests keeps it
 *   for all of them (so vitest's per-test `unstubGlobals` would be wrong here), but the
 *   next file never sees it.
 */
vi.resetModules();

const globalsBefore = new Map(
  Reflect.ownKeys(globalThis).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
);
const envBefore = { ...process.env };

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const key of Reflect.ownKeys(globalThis)) {
    if (!globalsBefore.has(key)) {
      Reflect.deleteProperty(globalThis, key);
      continue;
    }
    const before = globalsBefore.get(key)!;
    const now = Object.getOwnPropertyDescriptor(globalThis, key);
    const changed =
      !now ||
      now.value !== before.value ||
      now.get !== before.get ||
      now.set !== before.set;
    if (changed && before.configurable !== false) Object.defineProperty(globalThis, key, before);
  }
  for (const key of Object.keys(process.env)) if (!(key in envBefore)) delete process.env[key];
  Object.assign(process.env, envBefore);
});
