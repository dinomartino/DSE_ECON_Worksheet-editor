import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  chooseLibraryFolder,
  cloudFolders,
  desktopLibrary,
  foundLibrary,
  LIBRARY_CHANGED_EVENT,
  libraryLocation,
  type LibraryChanged,
} from './library';

const shell = {
  calls: [] as Array<{ command: string; args: unknown }>,
  watch: { status: 'ok', session: 7 } as unknown,
  handler: undefined as ((event: { payload: LibraryChanged }) => void) | undefined,
  unlistened: 0,
};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: unknown) => {
    shell.calls.push({ command, args });
    if (command === 'library_watch') return shell.watch;
    if (command === 'library_list') return { status: 'unavailable', reason: 'no-marker' };
    return null;
  },
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (event: string, handler: (event: { payload: LibraryChanged }) => void) => {
    expect(event).toBe(LIBRARY_CHANGED_EVENT);
    shell.handler = handler;
    return () => {
      shell.unlistened += 1;
    };
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  shell.calls.length = 0;
  shell.unlistened = 0;
  shell.watch = { status: 'ok', session: 7 };
});

describe('library bridge', () => {
  it('refuses on the web, before reaching for Tauri', async () => {
    await expect(libraryLocation()).rejects.toThrow('desktop');
    await expect(desktopLibrary.list()).rejects.toThrow('desktop');
    expect(shell.calls).toEqual([]);
  });

  it('passes relative paths and expectations through as the commands name them', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    expect(await desktopLibrary.list()).toEqual({ status: 'unavailable', reason: 'no-marker' });
    await desktopLibrary.read('trash/a.worksheet.json');
    await desktopLibrary.write('a.worksheet.json', 'text', 'absent');
    await desktopLibrary.remove('a.worksheet.json', 'abc');
    await chooseLibraryFolder();
    await chooseLibraryFolder('Pick', 'onedrive');
    await cloudFolders();
    await foundLibrary();
    expect(shell.calls).toEqual([
      { command: 'library_list', args: undefined },
      { command: 'library_read', args: { path: 'trash/a.worksheet.json' } },
      { command: 'library_write', args: { path: 'a.worksheet.json', text: 'text', expect: 'absent' } },
      { command: 'library_remove', args: { path: 'a.worksheet.json', expect: 'abc' } },
      { command: 'library_choose', args: { title: null, start: null } },
      { command: 'library_choose', args: { title: 'Pick', start: 'onedrive' } },
      { command: 'library_cloud_folders', args: undefined },
      { command: 'library_found', args: undefined },
    ]);
  });

  it('listens before the watcher starts, and stops both', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    const heard: LibraryChanged[] = [];
    const watch = await desktopLibrary.watch((event) => heard.push(event));
    if ('status' in watch) throw new Error('unavailable');
    expect(watch.session).toBe(7);
    shell.handler?.({ payload: { session: 7, paths: ['a.worksheet.json'], rescan: false } });
    expect(heard).toHaveLength(1);
    watch.stop();
    await vi.waitFor(() => expect(shell.calls.at(-1)).toEqual({ command: 'library_unwatch', args: { session: 7 } }));
    expect(shell.unlistened).toBe(1);
  });

  it('an unusable root starts no watcher and leaves no listener', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    shell.watch = { status: 'unavailable', reason: 'root-missing' };
    expect(await desktopLibrary.watch(() => undefined)).toEqual({ status: 'unavailable', reason: 'root-missing' });
    expect(shell.unlistened).toBe(1);
  });
});
