import { isDesktop } from '@/platform';
import { desktopLibrary, libraryLocation, type LibraryLocation } from '@/platform/library';
import { onStoreChange, worksheetHashCache, worksheetStore } from '@/storage';
import { folderSource } from './folderSource';
import { localNamer } from './localNamer';
import { openEditorGuard } from './openEditor';
import { createBaseStore } from './persistentBase';
import { createScheduler, type Scheduler, type SchedulerEnv } from './scheduler';

/**
 * The app's sync, wired (`docs/design/sync-engine.md` § The scheduler). Desktop only, and only
 * when a library folder is chosen and usable (`library_location` status `ok`): otherwise
 * nothing starts and nothing is visible. The web has no source yet. `EditorHost` loads this
 * with `import()` on desktop, so the web bundle carries none of it.
 */

/** The base belongs to (this computer, this folder): another folder starts a fresh one. */
export function folderSourceId(location: Pick<LibraryLocation, 'deviceId' | 'root'>): string | undefined {
  return location.root ? `folder:${location.deviceId}:${location.root}` : undefined;
}

let active: Scheduler | undefined;

/** The running scheduler, if any (status for the coming interface). */
export function librarySync(): Scheduler | undefined {
  return active;
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

export interface StartOptions {
  /** The editor is on screen (not the start screen): its document is the open one. */
  isEditorOpen: () => boolean;
  /** Read once at start; tests pass their own. */
  location?: () => Promise<LibraryLocation>;
}

/** Starts syncing if a folder is ready; returns the stop. Safe to call and stop at once. */
export function startLibrarySync(options: StartOptions): () => void {
  let stopped = false;
  let scheduler: Scheduler | undefined;
  let unsubscribe: (() => void) | undefined;
  void (async () => {
    if (!isDesktop()) return;
    const location = await (options.location ?? libraryLocation)().catch(() => undefined);
    const sourceId = location?.status === 'ok' ? folderSourceId(location) : undefined;
    if (stopped || !sourceId || active) return;
    const guard = openEditorGuard(options.isEditorOpen);
    unsubscribe = onStoreChange(guard.onStoreChange);
    scheduler = createScheduler({
      source: folderSource(desktopLibrary),
      store: worksheetStore,
      base: createBaseStore(sourceId),
      namer: localNamer(),
      hashCache: worksheetHashCache,
      isBusy: guard.isBusy,
      env: browserEnv(),
      onReport: guard.onReport,
    });
    active = scheduler;
    // For a manual check before the interface exists: `__econSync.status()`, `.syncNow()`.
    const started = scheduler;
    Object.assign(globalThis, { __econSync: { status: () => started.status(), syncNow: () => started.trigger() } });
    scheduler.start();
  })();
  return () => {
    stopped = true;
    unsubscribe?.();
    if (scheduler && active === scheduler) {
      active = undefined;
      delete (globalThis as { __econSync?: unknown }).__econSync;
    }
    void scheduler?.stop();
  };
}

/**
 * "Clear saved documents" with sync: the folder's base is forgotten first (so the emptied
 * library is a first sync, never a delete of everything), then `clear` runs, with no run in
 * between. A base that will not clear throws before anything is deleted.
 */
export async function clearSavedLibrary(
  clear: () => Promise<void>,
  location: () => Promise<LibraryLocation> = libraryLocation,
): Promise<void> {
  const forgetThenClear = async () => {
    if (isDesktop()) {
      const sourceId = folderSourceId(await location());
      if (sourceId) await createBaseStore(sourceId).clear();
    }
    await clear();
  };
  return active ? active.suspend(forgetThenClear) : forgetThenClear();
}
