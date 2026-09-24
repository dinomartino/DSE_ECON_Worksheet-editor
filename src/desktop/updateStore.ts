import { create } from 'zustand';
import { checkForUpdate, currentVersion, isDesktop, type AvailableUpdate } from './updater';

/**
 * One update state for the whole app, so the banner, the start screen's version line
 * and the editor menu can never disagree — and the launch check runs once per launch,
 * not once per screen that happens to mount.
 *
 * A found update downloads silently; the teacher is only interrupted once it is ready,
 * and only restarts when they choose to.
 */

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'current'
  | 'failed'
  | 'downloading'
  | 'downloadFailed'
  | 'ready'
  | 'installing'
  | 'installFailed';

interface UpdateState {
  status: UpdateStatus;
  /** The running version; null on the web or until read. */
  current: string | null;
  /** The newer version found, from the moment it starts downloading. */
  available: string | null;
  /** The banner's "Later". A manual check brings it back. */
  dismissed: boolean;
  check: () => Promise<UpdateStatus>;
  restart: () => Promise<void>;
  dismiss: () => void;
}

// Functions, so they live outside state: nothing renders from them.
let pending: AvailableUpdate | null = null;
let launched = false;
let beforeRestart: () => Promise<void> = async () => {};

/**
 * Work that must finish before the app restarts into the update — the editor registers
 * its autosave flush here, since a relaunch kills the pending debounce.
 */
export function setBeforeRestart(flush: () => Promise<void>): void {
  beforeRestart = flush;
}

export const useUpdateStore = create<UpdateState>((set, get) => {
  const download = async (update: AvailableUpdate) => {
    pending = update;
    set({ status: 'downloading', available: update.version });
    try {
      await update.download();
      set({ status: 'ready' });
    } catch (error) {
      console.warn('Update download failed', error);
      set({ status: 'downloadFailed' });
    }
  };

  return {
    status: 'idle',
    current: null,
    available: null,
    dismissed: false,

    check: async () => {
      const { status } = get();
      set({ dismissed: false });
      // Already fetched or under way: asking again only brings the banner back.
      if (['checking', 'downloading', 'ready', 'installing'].includes(status)) return status;
      if (status === 'downloadFailed' && pending) {
        void download(pending);
        return 'downloading';
      }

      set({ status: 'checking' });
      if (get().current === null) set({ current: await currentVersion() });
      const found = await checkForUpdate();
      if (found.kind === 'available') {
        void download(found.update);
        return 'downloading';
      }
      set({ status: found.kind === 'failed' ? 'failed' : 'current' });
      return get().status;
    },

    restart: async () => {
      if (!pending || !['ready', 'installFailed'].includes(get().status)) return;
      set({ status: 'installing' });
      try {
        await beforeRestart();
        // Relaunches on success, so only the failure path returns here.
        await pending.installAndRestart();
      } catch (error) {
        console.warn('Update install failed', error);
        set({ status: 'installFailed' });
      }
    },

    dismiss: () => set({ dismissed: true }),
  };
});

/** The launch check: desktop only, once per app launch however often it is called. */
export function checkOnLaunch(): void {
  if (launched || !isDesktop()) return;
  launched = true;
  void useUpdateStore.getState().check();
}

/** Test seam: forget the launch, any pending update and the restart hook. */
export function resetUpdateStoreForTest(): void {
  launched = false;
  pending = null;
  beforeRestart = async () => {};
  useUpdateStore.setState({ status: 'idle', current: null, available: null, dismissed: false });
}
