/**
 * Desktop file drops: the shell's native drag event reaches the start screen, and a
 * dropped path is read through the fs plugin (whose runtime scope the shell has already
 * widened to that path). The Tauri modules are faked; `__TAURI_INTERNALS__` flips
 * `isDesktop()`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DROPPED_FILE_MAX_BYTES, listenForFileDrops, readDroppedFile, type FileDragEvent } from '.';

const fake = {
  handler: undefined as ((event: { payload: unknown }) => void) | undefined,
  unlistened: 0,
  stat: { isFile: true, size: 10 },
  reads: [] as string[],
};

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async (handler: (event: { payload: unknown }) => void) => {
      fake.handler = handler;
      return () => {
        fake.unlistened += 1;
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
  fake.handler = undefined;
  fake.unlistened = 0;
  fake.stat = { isFile: true, size: 10 };
  fake.reads.length = 0;
});

describe('listenForFileDrops', () => {
  it('is a no-op on the web', async () => {
    const stop = await listenForFileDrops(() => undefined);
    expect(fake.handler).toBeUndefined();
    stop();
  });

  it('forwards the shell events without positions, and unlistens', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const seen: FileDragEvent[] = [];
    const stop = await listenForFileDrops((event) => seen.push(event));
    const position = { x: 1, y: 2 };
    fake.handler?.({ payload: { type: 'enter', paths: ['/a/1.json'], position } });
    fake.handler?.({ payload: { type: 'over', position } });
    fake.handler?.({ payload: { type: 'drop', paths: ['/a/1.json'], position } });
    fake.handler?.({ payload: { type: 'leave' } });
    expect(seen).toEqual([
      { type: 'enter', paths: ['/a/1.json'] },
      { type: 'over' },
      { type: 'drop', paths: ['/a/1.json'] },
      { type: 'leave' },
    ]);
    stop();
    expect(fake.unlistened).toBe(1);
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
