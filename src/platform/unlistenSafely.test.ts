/**
 * `unlistenSafely`: Tauri can reject an unlisten that lands before the listener's page half
 * registers, so it retries briefly and never lets a rejection escape (the library watchers
 * use it). Its tests lived with the native file-drop helpers until they were removed (k-0263).
 */
import { describe, expect, it, vi } from 'vitest';
import { unlistenSafely } from '.';

/** Collects unhandled rejections while `run` executes and settles. */
async function unhandledDuring(run: () => Promise<void>): Promise<unknown[]> {
  const seen: unknown[] = [];
  const onRejection = (reason: unknown) => seen.push(reason);
  process.on('unhandledRejection', onRejection);
  try {
    await run();
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    process.off('unhandledRejection', onRejection);
  }
  return seen;
}

/** An unlisten that fails `failures` times (async rejection or sync throw), then succeeds. */
function flaky(failures: number, sync = false) {
  const state = { calls: 0, removed: false };
  const unlisten = () => {
    state.calls += 1;
    if (state.calls <= failures) {
      if (sync) throw new TypeError('listeners[eventId].handlerId');
      return Promise.reject(new TypeError('listeners[eventId].handlerId'));
    }
    state.removed = true;
    return Promise.resolve();
  };
  return { state, unlisten };
}

describe('unlistenSafely', () => {
  it('unlistens once when Tauri accepts', async () => {
    const { state, unlisten } = flaky(0);
    unlistenSafely(unlisten);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state).toEqual({ calls: 1, removed: true });
  });

  it('retries an unlisten that Tauri rejects, and never lets the rejection escape', async () => {
    const { state, unlisten } = flaky(2);
    const unhandled = await unhandledDuring(async () => {
      unlistenSafely(unlisten);
      await vi.waitFor(() => expect(state.removed).toBe(true));
    });
    expect(unhandled).toEqual([]);
    expect(state.calls).toBe(3);
  });

  it('retries an unlisten that throws synchronously', async () => {
    const { state, unlisten } = flaky(1, true);
    expect(() => unlistenSafely(unlisten)).not.toThrow();
    await vi.waitFor(() => expect(state.removed).toBe(true));
    expect(state.calls).toBe(2);
  });

  it('gives up quietly on an unlisten that never succeeds', async () => {
    const { state, unlisten } = flaky(Infinity);
    const unhandled = await unhandledDuring(async () => {
      unlistenSafely(unlisten);
      // The whole retry chain: 10 + 20 + 40 + 80 + 160 ms of waiting, however late it runs.
      await vi.waitFor(() => expect(state.calls).toBe(6), { timeout: 5000 });
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    expect(unhandled).toEqual([]);
    expect(state.calls).toBe(6);
  });
});
