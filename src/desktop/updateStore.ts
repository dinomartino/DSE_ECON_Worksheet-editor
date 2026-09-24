import { create } from 'zustand';
import { checkForUpdate, currentVersion, isDesktop, type AvailableUpdate } from './updater';

/**
 * One update state for the whole app, so the banner, the start screen's version line
 * and the editor menu can never disagree — and the launch check runs once per launch,
 * not once per screen that happens to mount.
 */

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'failed'
  | 'installing'
  | 'installFailed';

interface UpdateState {
  status: UpdateStatus;
  /** The running version; null on the web or until read. */
  current: string | null;
  /** The newer version on offer, once one is found. */
  available: string | null;
  /** The banner's "Later". A manual check brings it back. */
  dismissed: boolean;
  check: () => Promise<UpdateStatus>;
  install: () => Promise<void>;
  dismiss: () => void;
}

// A function, so it lives outside state: nothing renders from it.
let pending: AvailableUpdate | null = null;
let launched = false;

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  current: null,
  available: null,
  dismissed: false,

  check: async () => {
    const busy = get().status;
    if (busy === 'checking' || busy === 'installing') return busy;
    set({ status: 'checking', dismissed: false });
    if (get().current === null) set({ current: await currentVersion() });

    const found = await checkForUpdate();
    if (found.kind === 'available') {
      pending = found.update;
      set({ status: 'available', available: found.update.version });
    } else {
      set({ status: found.kind === 'failed' ? 'failed' : 'current' });
    }
    return get().status;
  },

  install: async () => {
    if (!pending) return;
    set({ status: 'installing' });
    try {
      // Relaunches on success, so only the failure path returns here.
      await pending.install();
    } catch (error) {
      console.warn('Update install failed', error);
      set({ status: 'installFailed' });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));

/** The launch check: desktop only, once per app launch however often it is called. */
export function checkOnLaunch(): void {
  if (launched || !isDesktop()) return;
  launched = true;
  void useUpdateStore.getState().check();
}

/** Test seam: forget the launch and any pending update. */
export function resetUpdateStoreForTest(): void {
  launched = false;
  pending = null;
  useUpdateStore.setState({ status: 'idle', current: null, available: null, dismissed: false });
}
