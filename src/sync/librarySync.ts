import { isDesktop } from '@/platform';
import {
  chooseLibraryFolder,
  desktopLibrary,
  forgetLibraryFolder,
  libraryLocation,
  type LibraryLocation,
} from '@/platform/library';
import { onStoreChange, worksheetHashCache, worksheetStore } from '@/storage';
import { folderSource } from './folderSource';
import { classifyKey } from './keys';
import { localNamer } from './localNamer';
import { openEditorGuard } from './openEditor';
import { createBaseStore } from './persistentBase';
import type { SyncReport } from './run';
import { createScheduler, type Scheduler, type SchedulerEnv, type SyncStatus } from './scheduler';
import { syncNotices } from './syncNotices';
import { setSyncView, syncView, type AttentionItem } from './syncView';

/**
 * The app's sync controller (`docs/design/sync-engine.md` § The scheduler). Desktop only:
 * `EditorHost` loads it with `import()` and attaches (`startLibrarySync`), so the web bundle
 * carries none of it. It runs the scheduler whenever a folder is chosen (reachable or not: a
 * missing folder only pauses sync), publishes `{ location, status }` to `syncView.ts`, and
 * owns the actions Settings → Storage location calls: choose, stop, sync now.
 *
 * Every action runs in one queue, so choose, stop, Clear, attach and detach never interleave.
 * The scheduler is stopped before the folder changes under it: a base of one folder run
 * against another would read every missing document as deleted.
 */

/** The base belongs to (this computer, this folder): another folder starts a fresh one. */
export function folderSourceId(location: Pick<LibraryLocation, 'deviceId' | 'root'>): string | undefined {
  return location.root ? `folder:${location.deviceId}:${location.root}` : undefined;
}

interface Running {
  scheduler: Scheduler;
  sourceId: string;
  detach: () => void;
}

export interface StartOptions {
  /** The editor is on screen (not the start screen): its document is the open one. */
  isEditorOpen: () => boolean;
  /** Where the location is read from; tests pass their own. */
  location?: () => Promise<LibraryLocation>;
}

let host: StartOptions | undefined;
let running: Running | undefined;
let queue: Promise<unknown> = Promise.resolve();
const notices = syncNotices();
/** Conflict copies made this session, by copy id. */
let conflicts = new Map<string, AttentionItem>();

function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

/** The running scheduler, if any. */
export function librarySync(): Scheduler | undefined {
  return running?.scheduler;
}

function browserEnv(): SchedulerEnv {
  return {
    visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    onShown(listener) {
      const onVisibility = () => {
        if (document.visibilityState === 'visible') listener();
      };
      window.addEventListener('focus', listener);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        window.removeEventListener('focus', listener);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    },
    onStoreChange,
  };
}

const readLocation = () => (host?.location ?? libraryLocation)();

async function refreshLocation(read: () => Promise<LibraryLocation> = readLocation): Promise<LibraryLocation | undefined> {
  const location = await read().catch(() => undefined);
  setSyncView({ location });
  return location;
}

/** What the last run held or failed on, named for the teacher. Busy (open, unsaved) is not news. */
async function attentionFrom(report: SyncReport): Promise<AttentionItem[]> {
  const held = report.held.flatMap((item) => (item.reason === 'busy' ? [] : [{ ...item, reason: item.reason }]));
  if (held.length === 0 && report.errors.length === 0) return [];
  const names = new Map<string, string>();
  const summaries = await Promise.all([worksheetStore.list(), worksheetStore.listTrash()]).catch(() => [[], []] as const);
  for (const summary of summaries.flat()) names.set(summary.id, summary.title);
  const named = (id: string | undefined, key: string | undefined): AttentionItem['name'] => {
    const stem = id ?? (key ? classifyKey(key)?.stem : undefined);
    return (stem && names.get(stem)) || key?.split('/').pop() || stem || '';
  };
  return [
    ...held.map((item) => ({
      kind: item.reason,
      ...(item.id ? { id: item.id } : {}),
      name: named(item.id, item.key),
    })),
    ...report.errors.map((error) => {
      const id = classifyKey(error.key)?.stem;
      return { kind: 'error' as const, ...(id ? { id } : {}), name: named(id, error.key) };
    }),
  ];
}

function onReport(report: SyncReport): void {
  if (report.status !== 'ok') return;
  const before = conflicts.size;
  for (const conflict of report.conflicts) {
    conflicts.set(conflict.copyId, { kind: 'conflict', id: conflict.copyId, name: conflict.name });
  }
  if (conflicts.size !== before) conflicts = new Map(conflicts);
  notices.onReport(report, [...conflicts.values()].map((item) => item.name));
  void attentionFrom(report).then((rest) => {
    if (running) setSyncView({ attention: [...conflicts.values(), ...rest] });
  });
}

async function stopRunning(): Promise<void> {
  const current = running;
  if (!current) return;
  running = undefined;
  current.detach();
  delete (globalThis as { __econSync?: unknown }).__econSync;
  await current.scheduler.stop();
  notices.reset();
  setSyncView({ status: { state: 'stopped' }, attention: [...conflicts.values()] });
}

/** Runs the scheduler for the current location: none without a host or a folder. */
async function ensureRunning(): Promise<void> {
  const location = syncView().location;
  const sourceId = host && location ? folderSourceId(location) : undefined;
  if (running && running.sourceId === sourceId) return;
  await stopRunning();
  if (!host || !sourceId) return;
  const guard = openEditorGuard(host.isEditorOpen);
  const scheduler = createScheduler({
    source: folderSource(desktopLibrary),
    store: worksheetStore,
    base: createBaseStore(sourceId),
    namer: localNamer(),
    hashCache: worksheetHashCache,
    isBusy: guard.isBusy,
    env: browserEnv(),
    onReport: (report) => {
      guard.onReport(report);
      onReport(report);
    },
  });
  const unsubscribeStore = onStoreChange(guard.onStoreChange);
  const unsubscribeStatus = scheduler.subscribe((status: SyncStatus) => {
    if (running?.scheduler !== scheduler) return;
    setSyncView({ status });
    notices.onStatus(status);
  });
  running = {
    scheduler,
    sourceId,
    detach: () => {
      unsubscribeStore();
      unsubscribeStatus();
    },
  };
  // For a manual check by hand (`sync-engine.md` § First real run): `__econSync.status()`, `.syncNow()`.
  Object.assign(globalThis, { __econSync: { status: () => scheduler.status(), syncNow: () => scheduler.trigger() } });
  scheduler.start();
}

/**
 * Attaches the controller (EditorHost, once): reads the location, syncs if a folder is
 * chosen. Returns the detach, which stops syncing. Safe to call and detach at once.
 */
export function startLibrarySync(options: StartOptions): () => void {
  if (!isDesktop()) return () => {};
  const mine: StartOptions = { ...options };
  host = mine;
  void serial(async () => {
    if (host !== mine) return;
    await refreshLocation();
    if (host === mine) await ensureRunning();
  });
  return () => {
    if (host !== mine) return;
    host = undefined;
    void serial(stopRunning);
  };
}

/**
 * Settings → Choose a folder…: the native picker (which also commits the folder), then
 * syncing starts at once. Sync is stopped while the picker is open and the folder changes.
 * `start`: a `CloudFolder.id` the picker opens at.
 */
export function chooseFolder(title?: string, start?: string): Promise<'chosen' | 'cancelled'> {
  return serial(async () => {
    setSyncView({ pending: 'choose' });
    try {
      await stopRunning();
      const picked = await chooseLibraryFolder(title, start).catch(() => ({ status: 'cancelled' as const }));
      await refreshLocation();
      return picked.status;
    } finally {
      setSyncView({ pending: undefined });
      await ensureRunning();
    }
  });
}

/**
 * Settings → Stop syncing on this computer: the folder is forgotten here and left as it is;
 * the library here is untouched. The base is kept, so choosing the same folder again resumes.
 */
export function stopSyncing(): Promise<void> {
  return serial(async () => {
    setSyncView({ pending: 'stop' });
    try {
      await stopRunning();
      await forgetLibraryFolder();
    } finally {
      await refreshLocation();
      setSyncView({ pending: undefined });
      await ensureRunning();
    }
  });
}

/** Settings → Sync now. */
export function syncNow(): void {
  running?.scheduler.trigger();
}

/**
 * "Clear saved documents" with a folder chosen detaches it (user, 2026-10-07): syncing stops,
 * the folder's base is forgotten, the folder is forgotten here (its files left as they are),
 * then the library is cleared. Nothing refills it. A base that will not clear, or a folder
 * that will not detach, throws before anything is deleted, and syncing resumes.
 */
export function clearSavedLibrary(
  clear: () => Promise<void>,
  location: () => Promise<LibraryLocation> = readLocation,
): Promise<void> {
  if (!isDesktop()) return clear();
  return serial(async () => {
    const sourceId = folderSourceId(await location());
    if (!sourceId) return clear();
    await stopRunning();
    try {
      await createBaseStore(sourceId).clear();
      await forgetLibraryFolder();
    } catch (error) {
      await refreshLocation(location);
      await ensureRunning();
      throw error;
    }
    conflicts = new Map();
    await refreshLocation(location);
    setSyncView({ attention: [] });
    await clear();
  });
}

/** Test seam: detached, nothing queued, no copies remembered. */
export async function resetLibrarySyncForTest(): Promise<void> {
  host = undefined;
  await serial(stopRunning);
  conflicts = new Map();
  notices.reset();
}
