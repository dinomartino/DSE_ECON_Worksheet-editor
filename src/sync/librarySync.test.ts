import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeLocalStorage } from '@/library/bankTestKit';
import type { LibraryBridge, LibraryChooseResult, LibraryLocation } from '@/platform/library';
import { stringifyWorksheet } from '@/storage/document';
import { closeNotice, resetNoticesForTest, useNoticeStore } from '@/store/notices';
import { memoryBaseStore } from './baseStore';
import { FakeLibrary } from './folderTestKit';
import { MemoryCloud } from './memorySource';
import { resetSyncViewForTest, syncView } from './syncView';
import { paper } from './testKit';
import type { BaseStore } from './types';

/** The app's sync controller: when sync runs, choose / stop / Clear, races, status and notices. */

const bridge: { current?: LibraryBridge } = {};
const bases = new Map<string, BaseStore & { flush(): Promise<void> }>();

/**
 * The shell's `library_*` location commands. `next`: what the picker answers (null: cancelled);
 * `answer`: a refusal or failure instead.
 */
const shell = {
  root: null as string | null,
  next: null as string | null,
  answer: null as null | (() => Promise<LibraryChooseResult>),
  calls: [] as string[],
  location: vi.fn(
    async (): Promise<LibraryLocation> => ({
      deviceId: 'device-1',
      root: shell.root,
      status: shell.root === null ? 'none' : (bridge.current as FakeLibrary).root ? 'unavailable' : 'ok',
    }),
  ),
};

vi.mock('@/platform/library', async (original) => ({
  ...(await original<typeof import('@/platform/library')>()),
  desktopLibrary: {
    list: () => bridge.current!.list(),
    read: (path: string) => bridge.current!.read(path),
    write: (path: string, text: string, expect: string) => bridge.current!.write(path, text, expect),
    remove: (path: string, expect: string) => bridge.current!.remove(path, expect),
    watch: (onChange: Parameters<LibraryBridge['watch']>[0]) => bridge.current!.watch(onChange),
  },
  libraryLocation: () => shell.location(),
  chooseLibraryFolder: async (_title?: string, start?: string) => {
    shell.calls.push(`choose (watching: ${(bridge.current as FakeLibrary).watching})${start ? ` at ${start}` : ''}`);
    if (shell.answer) return shell.answer();
    if (shell.next === null) return { status: 'cancelled' };
    shell.root = shell.next;
    return { status: 'chosen', root: shell.next };
  },
  forgetLibraryFolder: async () => {
    shell.calls.push('forget');
    shell.root = null;
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

const { chooseFolder, clearSavedLibrary, folderSourceId, librarySync, resetLibrarySyncForTest, startLibrarySync, stopSyncing, syncNow } =
  await import('./librarySync');
const { worksheetStore } = await import('@/storage');

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

const fake = () => bridge.current as FakeLibrary;
const noticeIds = () => useNoticeStore.getState().notices.map((n) => n.id);
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const DRIVE = '/Drive/Econ Studio';
const OTHER = '/Other/Econ Studio';

let stop: (() => void) | undefined;

beforeEach(() => {
  bases.clear();
  bridge.current = new FakeLibrary(new MemoryCloud(), 'A');
  shell.root = null;
  shell.next = null;
  shell.answer = null;
  shell.calls = [];
  shell.location.mockClear();
  resetSyncViewForTest();
  resetNoticesForTest();
});

afterEach(async () => {
  stop?.();
  stop = undefined;
  await resetLibrarySyncForTest();
  vi.unstubAllGlobals();
});

describe('startLibrarySync', () => {
  it('starts nothing on the web, and never asks for a location', async () => {
    const location = vi.fn(at({ status: 'ok', root: DRIVE }));
    stop = startLibrarySync({ isEditorOpen: () => false, location });
    await settle();
    expect(location).not.toHaveBeenCalled();
    expect(librarySync()).toBeUndefined();
    expect(syncView().location).toBeUndefined();
  });

  it.each([
    ['no folder chosen', at({})],
    ['the location unreadable', async () => Promise.reject(new Error('shell'))],
  ])('starts nothing on desktop with %s', async (_case, location) => {
    asDesktop();
    const list = vi.spyOn(bridge.current!, 'list');
    stop = startLibrarySync({ isEditorOpen: () => false, location });
    await settle();
    expect(librarySync()).toBeUndefined();
    expect(list).not.toHaveBeenCalled();
    expect(bases.size).toBe(0);
  });

  it('with a usable folder: runs, on the base of this computer and folder; stop closes the watcher', async () => {
    asDesktop();
    stop = startLibrarySync({ isEditorOpen: () => false, location: at({ status: 'ok', root: DRIVE }) });
    await vi.waitFor(() => expect(syncView().status.lastSyncedAt).toBeDefined());
    expect(syncView()).toMatchObject({ location: { root: DRIVE }, status: { state: 'idle' } });
    expect([...bases.keys()]).toEqual([`folder:device-1:${DRIVE}`]);
    expect(fake().watching).toBe(true);
    const hook = (globalThis as { __econSync?: { status(): { state: string } } }).__econSync;
    expect(hook?.status().state).toBe('idle');
    stop();
    stop = undefined;
    await vi.waitFor(() => expect(fake().watching).toBe(false));
    expect(librarySync()).toBeUndefined();
    expect(syncView().status.state).toBe('stopped');
    expect((globalThis as { __econSync?: unknown }).__econSync).toBeUndefined();
  });

  it('stopped before the location answers: nothing starts', async () => {
    asDesktop();
    stop = startLibrarySync({ isEditorOpen: () => false, location: at({ status: 'ok', root: DRIVE }) });
    stop();
    stop = undefined;
    await settle();
    expect(librarySync()).toBeUndefined();
  });
});

describe('a folder that cannot be reached', () => {
  it('pauses sync with one warning per outage, taken down when the folder is back', async () => {
    asDesktop();
    shell.root = DRIVE;
    fake().root = 'root-missing';
    stop = startLibrarySync({ isEditorOpen: () => false });
    await vi.waitFor(() => expect(syncView().status.state).toBe('unavailable'));
    expect(syncView().status.reason).toBe('root-missing');
    expect(noticeIds()).toEqual(['sync-unreachable']);
    expect(useNoticeStore.getState().notices[0]).toMatchObject({ tone: 'warning', details: [expect.stringContaining('cloud drive')] });

    // Closed by the teacher, it stays closed while the folder is still away.
    closeNotice('sync-unreachable');
    const failed = syncView().status;
    syncNow();
    await vi.waitFor(() => expect(syncView().status).not.toBe(failed));
    await vi.waitFor(() => expect(syncView().status.state).toBe('unavailable'));
    expect(noticeIds()).toEqual([]);

    fake().root = null;
    syncNow();
    await vi.waitFor(() => expect(syncView().status.lastReport?.status).toBe('ok'));
    expect(noticeIds()).toEqual([]);

    // A new outage warns again; the first good run takes it down.
    fake().root = 'io';
    syncNow();
    await vi.waitFor(() => expect(noticeIds()).toEqual(['sync-unreachable']));
    fake().root = null;
    syncNow();
    await vi.waitFor(() => expect(noticeIds()).toEqual([]));
  });
});

describe('chooseFolder', () => {
  it('starts syncing at once, on the new folder’s base, with no relaunch', async () => {
    asDesktop();
    stop = startLibrarySync({ isEditorOpen: () => false });
    await settle();
    expect(librarySync()).toBeUndefined();
    shell.next = DRIVE;
    await expect(chooseFolder('Pick')).resolves.toEqual({ status: 'chosen', root: DRIVE });
    expect(syncView().location?.root).toBe(DRIVE);
    expect(syncView().pending).toBeUndefined();
    await vi.waitFor(() => expect(syncView().status.lastSyncedAt).toBeDefined());
    expect([...bases.keys()]).toEqual([`folder:device-1:${DRIVE}`]);
  });

  it('stops the old folder’s sync before the picker runs; another folder gets its own base', async () => {
    asDesktop();
    shell.root = DRIVE;
    stop = startLibrarySync({ isEditorOpen: () => false });
    await vi.waitFor(() => expect(fake().watching).toBe(true));
    const first = librarySync();
    shell.next = OTHER;
    await chooseFolder();
    expect(shell.calls).toEqual(['choose (watching: false)']);
    expect(librarySync()).not.toBe(first);
    await vi.waitFor(() => expect(syncView().status.lastSyncedAt).toBeDefined());
    expect([...bases.keys()]).toEqual([`folder:device-1:${DRIVE}`, `folder:device-1:${OTHER}`]);
  });

  it('cancelled: the folder it had keeps syncing', async () => {
    asDesktop();
    shell.root = DRIVE;
    stop = startLibrarySync({ isEditorOpen: () => false });
    await vi.waitFor(() => expect(librarySync()).toBeDefined());
    await expect(chooseFolder('Pick', 'onedrive')).resolves.toEqual({ status: 'cancelled' });
    expect(shell.calls).toEqual(['choose (watching: false) at onedrive']);
    expect(syncView().location?.root).toBe(DRIVE);
    await vi.waitFor(() => expect(syncView().status.lastSyncedAt).toBeDefined());
    expect(fake().watching).toBe(true);
  });

  it('refused or failed: said to the caller, never read as cancelled; the folder it had keeps syncing', async () => {
    asDesktop();
    shell.root = DRIVE;
    stop = startLibrarySync({ isEditorOpen: () => false });
    await vi.waitFor(() => expect(librarySync()).toBeDefined());
    shell.answer = async () => ({ status: 'refused', reason: 'inside-library' });
    await expect(chooseFolder()).resolves.toEqual({ status: 'refused', reason: 'inside-library' });
    shell.answer = async () => {
      throw new Error('picker failed');
    };
    await expect(chooseFolder()).rejects.toThrow('picker failed');
    expect(syncView()).toMatchObject({ location: { root: DRIVE }, pending: undefined });
    await vi.waitFor(() => expect(fake().watching).toBe(true));
  });

  it('detached while the picker is open: nothing starts afterwards', async () => {
    asDesktop();
    stop = startLibrarySync({ isEditorOpen: () => false });
    shell.next = DRIVE;
    const choosing = chooseFolder();
    stop();
    stop = undefined;
    await choosing;
    await settle();
    expect(librarySync()).toBeUndefined();
    expect(fake().watching).toBe(false);
  });
});

describe('stopSyncing', () => {
  it('stops, forgets the folder here, leaves the library and keeps the base for a return', async () => {
    asDesktop();
    const doc = paper('Mock');
    await worksheetStore.save(doc);
    shell.root = DRIVE;
    stop = startLibrarySync({ isEditorOpen: () => false });
    await vi.waitFor(() => expect(syncView().status.lastReport?.counts.uploaded).toBe(1));
    await stopSyncing();
    expect(shell.calls).toEqual(['forget']);
    expect(librarySync()).toBeUndefined();
    expect(fake().watching).toBe(false);
    expect(syncView()).toMatchObject({ location: { root: null }, status: { state: 'stopped' } });
    expect((await worksheetStore.list()).map((row) => row.id)).toContain(doc.id);
    expect((await bases.get(`folder:device-1:${DRIVE}`)!.load()).has(doc.id)).toBe(true);

    // The same folder again: the kept base agrees with it, so nothing moves.
    shell.next = DRIVE;
    await chooseFolder();
    await vi.waitFor(() => expect(syncView().status.lastSyncedAt).toBeDefined());
    expect(syncView().status.lastReport?.counts).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: 0 });
  });

  it('choose then stop, in a hurry: they run in order and stop wins', async () => {
    asDesktop();
    stop = startLibrarySync({ isEditorOpen: () => false });
    shell.next = DRIVE;
    const both = Promise.all([chooseFolder(), stopSyncing(), chooseFolder(), stopSyncing()]);
    await both;
    await settle();
    expect(shell.calls).toEqual(['choose (watching: false)', 'forget', 'choose (watching: false)', 'forget']);
    expect(librarySync()).toBeUndefined();
    expect(fake().watching).toBe(false);
    expect(syncView().location?.root).toBeNull();
  });
});

describe('Needs attention and notices', () => {
  it('a conflict copy is listed and announced, with a way to the list', async () => {
    asDesktop();
    const doc = paper('Here');
    await worksheetStore.save(doc);
    fake().cloud.put(`${doc.id}.worksheet.json`, stringifyWorksheet({ ...doc, title: paper('There').title }));
    shell.root = DRIVE;
    stop = startLibrarySync({ isEditorOpen: () => false });
    await vi.waitFor(() => expect(syncView().attention).toHaveLength(1));
    const [item] = syncView().attention;
    expect(item).toMatchObject({ kind: 'conflict' });
    expect(item.id).not.toBe(doc.id);
    const notice = useNoticeStore.getState().notices.find((n) => n.id === 'sync-conflicts');
    expect(notice).toMatchObject({ tone: 'warning', actions: [{ label: 'Review' }] });
    expect(notice?.body).toContain(item.name);
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
  it('detaches the folder: sync stops, the base and the folder are forgotten, then the store clears; nothing refills', async () => {
    asDesktop();
    shell.root = DRIVE;
    stop = startLibrarySync({ isEditorOpen: () => false });
    await vi.waitFor(() => expect(fake().watching).toBe(true));
    const base = bases.get(`folder:device-1:${DRIVE}`)!;
    await base.put({ id: 'x', kind: 'worksheet', place: 'trash', hash: 'h', revision: 'r', schemaVersion: 1 });
    const order: string[] = [];
    const clear = vi.spyOn(base, 'clear').mockImplementation(async () => void order.push(`base (watching: ${fake().watching})`));
    await clearSavedLibrary(async () => void order.push(`store (forgot: ${shell.calls.includes('forget')})`));
    expect(order).toEqual(['base (watching: false)', 'store (forgot: true)']);
    await settle();
    expect(librarySync()).toBeUndefined();
    expect(syncView().location?.root).toBeNull();
    clear.mockRestore();
  });

  it('a base that will not clear stops the clear before anything is deleted, and sync resumes', async () => {
    asDesktop();
    shell.root = DRIVE;
    stop = startLibrarySync({ isEditorOpen: () => false });
    await vi.waitFor(() => expect(librarySync()).toBeDefined());
    vi.spyOn(bases.get(`folder:device-1:${DRIVE}`)!, 'clear').mockRejectedValue(new Error('locked'));
    const store = vi.fn(async () => {});
    await expect(clearSavedLibrary(store)).rejects.toThrow('locked');
    expect(store).not.toHaveBeenCalled();
    expect(shell.calls).toEqual([]);
    expect(librarySync()).toBeDefined();
    expect(syncView().location?.root).toBe(DRIVE);
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
    expect(shell.calls).toEqual([]);
  });
});
