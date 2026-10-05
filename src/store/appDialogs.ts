import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { notify as raiseNotice } from './notices';

/**
 * One app dialog at a time: Settings, opened from anywhere through this store (never
 * stacked — `Dialog` listens on `window`, so two would close on one Escape), and a status
 * line from outside any component (AI verbs, topic sync), raised in the notice stack.
 * Component-owned dialogs (Export, Setup, Feedback, What's new) are not here; their
 * callers close them first.
 */

export interface SettingsRequest { section?: string; focus?: string; params?: Record<string, string> }
export type AppDialog = { kind: 'settings'; request: SettingsRequest };
export interface NoticeAction {
  label: string;
  run: () => void;
  /** False once the action no longer applies; the notice is then dropped (`pruneDeadActions`). */
  live?: () => boolean;
}
export interface AppNotice { id: number; message: string; action?: NoticeAction }
export interface AppDialogsState {
  open: AppDialog | null;
  notice: AppNotice | null;
  /** Replaces whatever app dialog is open (never stacks). */
  openSettings(request?: SettingsRequest): void;
  close(): void;
  /** A status line from outside any component (AI verbs, topic sync): an app notice. */
  notify(message: string, action?: AppNotice['action']): void;
}

let noticeId = 0;

export const useAppDialogs: UseBoundStore<StoreApi<AppDialogsState>> = create<AppDialogsState>((set) => ({
  open: null,
  notice: null,
  openSettings: (request = {}) => set({ open: { kind: 'settings', request } }),
  close: () => set({ open: null }),
  notify: (message, action) => {
    noticeId += 1;
    set({ notice: action ? { id: noticeId, message, action } : { id: noticeId, message } });
    raiseNotice({ tone: 'info', body: message, actions: action ? [action] : undefined });
  },
}));
