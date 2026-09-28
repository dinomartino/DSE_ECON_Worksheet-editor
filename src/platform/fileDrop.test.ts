/**
 * Desktop file drops: the shell's native drag event reaches the start screen, and a
 * dropped path is read through the fs plugin (whose runtime scope the shell has already
 * widened to that path). The Tauri modules are faked; `__TAURI_INTERNALS__` flips
 * `isDesktop()`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DROPPED_FILE_MAX_BYTES,
  listenForFileDrops,
  readDroppedFile,
  subscribeToFileDrops,
  type FileDragEvent,
} from '.';

type Handler = (event: { payload: unknown }) => void;

const fake = {
  handlers: new Map<string, Handler>(),
  /** Unlisten calls per event name, successful or not. */
  unlistenCalls: new Map<string, number>(),
  /** Unlistens that reject (as Tauri's does before its listener registers) before one succeeds. */
  unlistenFailures: 0,
  /** When set, `listen` waits on it — a listen still in flight. */
  gate: undefined as Promise<void> | undefined,
  stat: { isFile: true, size: 10 },
  reads: [] as string[],
};
const unlistened = () => [...fake.unlistenCalls.values()].reduce((a, b) => a + b, 0);
/** Fires one of the shell's drag events, with Tauri's payload for it. */
const drag = (type: string, payload: unknown) =>
  fake.handlers.get(`tauri://drag-${type}`)?.({ payload });

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (event: string, handler: Handler) => {
      await fake.gate;
      fake.handlers.set(event, handler);
      let failures = fake.unlistenFailures;
      return async () => {
        fake.unlistenCalls.set(event, (fake.unlistenCalls.get(event) ?? 0) + 1);
        if (failures-- > 0) throw new TypeError('listeners[eventId].handlerId');
        fake.handlers.delete(event);
      };
    },
  }),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  stat: async () => fake.stat,
  readFile: async (path: string) => {
    fake.reads.push(path);
    return new TextEncoder().encode('{}');
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  fake.handlers.clear();
  fake.unlistenCalls.clear();
  fake.unlistenFailures = 0;
  fake.gate = undefined;
  fake.stat = { isFile: true, size: 10 };
  fake.reads.length = 0;
});

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

describe('listenForFileDrops', () => {
  it('is a no-op on the web', async () => {
    const stop = await listenForFileDrops(() => undefined);
    expect(fake.handlers.size).toBe(0);
    stop();
  });

  it('forwards the shell events without positions, and unlistens', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const seen: FileDragEvent[] = [];
    const stop = await listenForFileDrops((event) => seen.push(event));
    const position = { x: 1, y: 2 };
    drag('enter', { paths: ['/a/1.json'], position });
    drag('over', { position });
    drag('drop', { paths: ['/a/1.json'], position });
    drag('leave', null);
    expect(seen).toEqual([
      { type: 'enter', paths: ['/a/1.json'] },
      { type: 'over' },
      { type: 'drop', paths: ['/a/1.json'] },
      { type: 'leave' },
    ]);
    stop();
    await vi.waitFor(() => expect(fake.handlers.size).toBe(0));
    expect(unlistened()).toBe(4);
  });

  it('retries an unlisten that Tauri rejects, and never lets the rejection escape', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    fake.unlistenFailures = 2;
    const unhandled = await unhandledDuring(async () => {
      const stop = await listenForFileDrops(() => undefined);
      stop();
      await vi.waitFor(() => expect(fake.handlers.size).toBe(0));
    });
    expect(unhandled).toEqual([]);
    expect([...fake.unlistenCalls.values()]).toEqual([3, 3, 3, 3]);
  });

  it('gives up quietly on an unlisten that never succeeds', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    fake.unlistenFailures = Infinity;
    const unhandled = await unhandledDuring(async () => {
      (await listenForFileDrops(() => undefined))();
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(unhandled).toEqual([]);
    expect([...fake.unlistenCalls.values()]).toEqual([6, 6, 6, 6]);
  });
});

describe('subscribeToFileDrops', () => {
  it('stops a listen that resolves after the cleanup ran (StrictMode double mount)', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    let open = () => undefined as void;
    fake.gate = new Promise<void>((resolve) => (open = resolve));
    fake.unlistenFailures = 1;
    const seen: FileDragEvent[] = [];
    const unhandled = await unhandledDuring(async () => {
      const cleanup = subscribeToFileDrops((event) => seen.push(event));
      cleanup();
      cleanup();
      open();
      await new Promise((resolve) => setImmediate(resolve));
      // Resolved, stopped at once, and Tauri refused: the listeners are still live.
      expect(unlistened()).toBe(4);
      expect(fake.handlers.size).toBe(4);
      drag('leave', null);
      await vi.waitFor(() => expect(fake.handlers.size).toBe(0));
    });
    expect(unhandled).toEqual([]);
    expect(seen).toEqual([]);
    // One stop per listener: the rejected attempt, then the retry that removed it.
    expect([...fake.unlistenCalls.values()]).toEqual([2, 2, 2, 2]);
  });

  it('stops a resolved listen exactly once, however often the cleanup runs', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const cleanup = subscribeToFileDrops(() => undefined);
    await vi.waitFor(() => expect(fake.handlers.size).toBe(4));
    cleanup();
    cleanup();
    await vi.waitFor(() => expect(fake.handlers.size).toBe(0));
    expect([...fake.unlistenCalls.values()]).toEqual([1, 1, 1, 1]);
  });
});

describe('readDroppedFile', () => {
  it('refuses on the web, where there are no paths', async () => {
    await expect(readDroppedFile('/a/1.json')).rejects.toThrow();
  });

  it('reads a dropped file through the fs plugin', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const bytes = await readDroppedFile('/a/1.json');
    expect(new TextDecoder().decode(bytes)).toBe('{}');
    expect(fake.reads).toEqual(['/a/1.json']);
  });

  it('refuses a folder or an oversized file unread', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    fake.stat = { isFile: false, size: 0 };
    await expect(readDroppedFile('/a/folder.json')).rejects.toThrow('not a file');
    fake.stat = { isFile: true, size: DROPPED_FILE_MAX_BYTES + 1 };
    await expect(readDroppedFile('/a/huge.json')).rejects.toThrow('too large');
    expect(fake.reads).toEqual([]);
  });
});
