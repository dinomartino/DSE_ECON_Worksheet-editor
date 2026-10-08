import { isDesktop, unlistenSafely } from './index';

/**
 * The library folder's commands (`src-tauri/src/library.rs`): a cloud-synced folder the sync
 * engine mirrors to. Thin wrappers; every rule (paths inside the root, compare-and-swap by
 * content hash, atomic writes, `unavailable` never an empty list) is enforced in Rust.
 * Desktop only: Tauri is reached by `import()` inside each call, never at module load.
 */

/** Why the folder cannot be used now. `newer-format`: a newer build's library, never written here. */
export type LibraryUnavailableReason = 'no-location' | 'root-missing' | 'not-a-folder' | 'no-marker' | 'newer-format' | 'io';

export interface LibraryUnavailable {
  status: 'unavailable';
  reason: LibraryUnavailableReason;
}

/**
 * One `*.json` under the root. `hash`: SHA-256 of its bytes, only when `state` is `ok`.
 * `placeholder`: not downloaded to this computer (reading downloads it); `unreadable`: will not
 * read now. Neither is ever left out of a listing.
 */
export interface LibraryFile {
  path: string;
  size: number;
  mtimeMs: number;
  hash: string | null;
  state: 'ok' | 'placeholder' | 'unreadable';
}

export type LibraryListResult = { status: 'ok'; files: LibraryFile[] } | LibraryUnavailable;
export type LibraryReadResult = { status: 'ok'; text: string; hash: string } | { status: 'missing' } | { status: 'unreadable' } | LibraryUnavailable;
export type LibraryWriteResult = { status: 'ok'; hash: string } | { status: 'conflict' } | LibraryUnavailable;
export type LibraryRemoveResult = { status: 'ok' } | { status: 'missing' } | { status: 'conflict' } | LibraryUnavailable;

/** One `library-changed` burst. `rescan`: events may have been lost; list everything. */
export interface LibraryChanged {
  session: number;
  paths: string[];
  rescan: boolean;
}

export interface LibraryWatch {
  /** Events from this watcher carry it; any other session's are stale. */
  session: number;
  stop(): void;
}

/** What a folder source needs, so it can run over a fake in tests. */
export interface LibraryBridge {
  list(): Promise<LibraryListResult>;
  read(path: string): Promise<LibraryReadResult>;
  /** `expect`: the file's current hash, or `'absent'` when it must not exist. */
  write(path: string, text: string, expect: string): Promise<LibraryWriteResult>;
  remove(path: string, expect: string): Promise<LibraryRemoveResult>;
  /** Starts (or restarts) the watcher; `unavailable` when the root cannot be used. */
  watch(onChange: (event: LibraryChanged) => void): Promise<LibraryWatch | LibraryUnavailable>;
}

export interface LibraryLocation {
  /** Random, made once per computer. */
  deviceId: string;
  root: string | null;
  status: 'none' | 'ok' | 'unavailable';
  reason?: LibraryUnavailableReason;
}

export const LIBRARY_CHANGED_EVENT = 'library-changed';

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktop()) throw new Error('The library folder needs the desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export function libraryLocation(): Promise<LibraryLocation> {
  return call('library_location');
}

/** Why a picked folder was not used: this app's own data folder (or inside it), the home folder, a drive root, inside another library. */
export type LibraryRefusal = 'app-data' | 'home' | 'drive-root' | 'inside-library';

/** `refused`: nothing was created or saved. */
export type LibraryChooseResult = { status: 'chosen'; root: string } | { status: 'cancelled' } | { status: 'refused'; reason: LibraryRefusal };

/**
 * The native folder picker, shown by the shell. `title`: the sheet's (localised) title;
 * `start`: a `CloudFolder.id` to open it at (the shell finds the folder again, never a path).
 */
export function chooseLibraryFolder(title?: string, start?: string): Promise<LibraryChooseResult> {
  return call('library_choose', { title: title ?? null, start: start ?? null });
}

export type CloudProvider = 'google-drive' | 'onedrive' | 'icloud' | 'dropbox' | 'box';

/** A cloud drive's folder on this computer. `id`: the provider's, or `onedrive-2` for a second account. */
export interface CloudFolder {
  id: string;
  provider: CloudProvider;
  label: string;
  path: string;
}

/** The cloud drive folders on this computer, found from paths alone (no network, no prompt). */
export function cloudFolders(): Promise<CloudFolder[]> {
  return call('library_cloud_folders');
}

/** A cloud folder on this computer holding a library another computer made. No path. */
export interface FoundLibrary {
  id: string;
  provider: CloudProvider;
  label: string;
}

/** The first cloud folder holding a library (`<folder>/Econ Studio`, or one folder down), if any. */
export function foundLibrary(): Promise<FoundLibrary | null> {
  return call('library_found');
}

/** This computer stops using the folder; nothing in it is touched. */
export function forgetLibraryFolder(): Promise<void> {
  return call('library_forget');
}

async function watch(onChange: (event: LibraryChanged) => void): Promise<LibraryWatch | LibraryUnavailable> {
  if (!isDesktop()) throw new Error('The library folder needs the desktop app.');
  const { listen } = await import('@tauri-apps/api/event');
  // Listening first: nothing from the new watcher can arrive unheard.
  const unlisten = await listen<LibraryChanged>(LIBRARY_CHANGED_EVENT, ({ payload }) => onChange(payload));
  let started: { status: 'ok'; session: number } | LibraryUnavailable;
  try {
    started = await call('library_watch');
  } catch (error) {
    unlistenSafely(unlisten);
    throw error;
  }
  if (started.status !== 'ok') {
    unlistenSafely(unlisten);
    return started;
  }
  const { session } = started;
  return {
    session,
    stop: () => {
      unlistenSafely(unlisten);
      void call('library_unwatch', { session }).catch(() => undefined);
    },
  };
}

/** The shell's library commands as a `LibraryBridge`. */
export const desktopLibrary: LibraryBridge = {
  list: () => call('library_list'),
  read: (path) => call('library_read', { path }),
  write: (path, text, expect) => call('library_write', { path, text, expect }),
  remove: (path, expect) => call('library_remove', { path, expect }),
  watch,
};
