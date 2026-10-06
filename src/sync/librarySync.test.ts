import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeLocalStorage } from '@/library/bankTestKit';
import type { LibraryBridge, LibraryLocation } from '@/platform/library';
import { memoryBaseStore } from './baseStore';
import { FakeLibrary } from './folderTestKit';
import { MemoryCloud } from './memorySource';
import type { BaseStore } from './types';

/** The app's wiring: when sync starts (only a desktop with a usable folder), and Clear. */

const bridge: { current?: LibraryBridge } = {};
const bases = new Map<string, BaseStore & { flush(): Promise<void> }>();

vi.mock('@/platform/library', async (original) => ({
  ...(await original<typeof import('@/platform/library')>()),
  desktopLibrary: {
    list: () => bridge.current!.list(),
    read: (path: string) => bridge.current!.read(path),
    write: (path: string, text: string, expect: string) => bridge.current!.write(path, text, expect),
    remove: (path: string, expect: string) => bridge.current!.remove(path, expect),
    watch: (onChange: Parameters<LibraryBridge['watch']>[0]) => bridge.current!.watch(onChange),
  },
}));

vi.mock('./persistentBase', () => ({
  createBaseStore: (sourceId: string) => {
    let base = bases.get(sourceId);
    if (!base) {
      base = { ...memoryBaseStore(), flush: async () => {} };
      bases.set(sourceId, base);
    }
    return base;
  },
}));

const { clearSavedLibrary, folderSourceId, librarySync, startLibrarySync } = await import('./librarySync');

const events = { addEventListener: () => {}, removeEventListener: () => {} };

function asDesktop() {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {}, localStorage: fakeLocalStorage(), ...events });
  vi.stubGlobal('document', { visibilityState: 'visible', ...events });
}

const at = (location: Partial<LibraryLocation>) => async (): Promise<LibraryLocation> => ({
  deviceId: 'device-1',
  root: null,
  status: 'none',
  ...location,
});

let stop: (() => void) | undefined;

beforeEach(() => {
  bases.clear();
  bridge.current = new FakeLibrary(new MemoryCloud(), 'A');
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
});

describe('startLibrarySync', () => {
  it('starts nothing on the web, and never asks for a location', async () => {
    const location = vi.fn(at({ status: 'ok', root: '/Drive/Econ Studio' }));
    stop = startLibrarySync({ isEditorOpen: () => false, location });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(location).not.toHaveBeenCalled();
    expect(librarySync()).toBeUndefined();
  });

  it.each([
    ['no folder chosen', at({})],
    ['the folder unusable', at({ status: 'unavailable', root: '/Gone/Econ Studio', reason: 'root-missing' })],
    ['the location unreadable', async () => Promise.reject(new Error('shell'))],
  ])('starts nothing on desktop with %s', async (_case, location) => {
    asDesktop();
    const list = vi.spyOn(bridge.current!, 'list');
    stop = startLibrarySync({ isEditorOpen: () => false, location });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(librarySync()).toBeUndefined();
    expect(list).not.toHaveBeenCalled();
    expect(bases.size).toBe(0);
  });

  it('with a usable folder: runs, on the base of this computer and folder; stop closes the watcher', async () => {
    asDesktop();
    const fake = bridge.current as FakeLibrary;
    stop = startLibrarySync({ isEditorOpen: () => false, location: at({ status: 'ok', root: '/Drive/Econ Studio' }) });
    await vi.waitFor(() => expect(librarySync()?.status().state).toBe('idle'));
    expect([...bases.keys()]).toEqual(['folder:device-1:/Drive/Econ Studio']);
    expect(fake.watching).toBe(true);
    const hook = (globalThis as { __econSync?: { status(): { state: string } } }).__econSync;
    expect(hook?.status().state).toBe('idle');
    stop();
    stop = undefined;
    await vi.waitFor(() => expect(fake.watching).toBe(false));
    expect(librarySync()).toBeUndefined();
    expect((globalThis as { __econSync?: unknown }).__econSync).toBeUndefined();
  });

  it('stopped before the location answers: nothing starts', async () => {
    asDesktop();
    stop = startLibrarySync({ isEditorOpen: () => false, location: at({ status: 'ok', root: '/Drive/Econ Studio' }) });
    stop();
    stop = undefined;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(librarySync()).toBeUndefined();
  });
});

describe('folderSourceId', () => {
  it('differs per folder and per computer, and is stable for both', () => {
    const one = folderSourceId({ deviceId: 'd1', root: '/A/Econ Studio' });
    expect(one).toBe(folderSourceId({ deviceId: 'd1', root: '/A/Econ Studio' }));
    expect(folderSourceId({ deviceId: 'd1', root: '/B/Econ Studio' })).not.toBe(one);
    expect(folderSourceId({ deviceId: 'd2', root: '/A/Econ Studio' })).not.toBe(one);
    expect(folderSourceId({ deviceId: 'd1', root: null })).toBeUndefined();
  });
});

describe('clearSavedLibrary', () => {
  it("forgets the folder's base before the store is cleared", async () => {
    asDesktop();
    const id = folderSourceId({ deviceId: 'device-1', root: '/Drive/Econ Studio' })!;
    const { createBaseStore } = await import('./persistentBase');
    const base = createBaseStore(id);
    await base.put({ id: 'x', kind: 'worksheet', place: 'trash', hash: 'h', revision: 'r', schemaVersion: 1 });
    const order: string[] = [];
    const clear = vi.spyOn(base, 'clear').mockImplementation(async () => void order.push('base'));
    await clearSavedLibrary(async () => void order.push('store'), at({ status: 'unavailable', root: '/Drive/Econ Studio' }));
    expect(order).toEqual(['base', 'store']);
    clear.mockRestore();
  });

  it('a base that will not clear stops the clear before anything is deleted', async () => {
    asDesktop();
    const id = folderSourceId({ deviceId: 'device-1', root: '/Drive/Econ Studio' })!;
    const { createBaseStore } = await import('./persistentBase');
    vi.spyOn(createBaseStore(id), 'clear').mockRejectedValue(new Error('locked'));
    const store = vi.fn(async () => {});
    await expect(clearSavedLibrary(store, at({ status: 'ok', root: '/Drive/Econ Studio' }))).rejects.toThrow('locked');
    expect(store).not.toHaveBeenCalled();
  });

  it('on the web, or with no folder, just clears', async () => {
    const location = vi.fn(at({}));
    const store = vi.fn(async () => {});
    await clearSavedLibrary(store, location);
    expect(location).not.toHaveBeenCalled();
    asDesktop();
    await clearSavedLibrary(store, location);
    expect(store).toHaveBeenCalledTimes(2);
    expect(bases.size).toBe(0);
  });
});
