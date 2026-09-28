import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { Side } from '@/model/textSlots';
import type { TranslateScope } from '@/translate/types';

/**
 * One app dialog at a time. Translate and Settings hand off through this store, which
 * holds a single `open` value, so the two can never be stacked (both would close on one
 * Escape: `Dialog` listens on `window`). Component-owned dialogs (Export, Setup, Feedback,
 * What's new) are not here; their callers close them first.
 */

export interface TranslateRequest {
  /** The host renders it only while this document is open. */
  worksheetId: string;
  mode: 'translate' | 'check';
  scope: TranslateScope;
  /** ≤ 3 texts from a page or field action: skip Setup. */
  autoStart?: boolean;
  /** "Re-translate into 中文…": lock Replace existing. */
  retranslate?: Side;
}
export interface SettingsRequest { section?: string; focus?: string; params?: Record<string, string> }
export type AppDialog =
  | { kind: 'settings'; request: SettingsRequest; returnTo?: TranslateRequest }
  | { kind: 'translate'; request: TranslateRequest };
export interface NoticeAction {
  label: string;
  run: () => void;
  /** False once the action no longer applies; the toolbar then drops the notice. */
  live?: () => boolean;
}
export interface AppNotice { id: number; message: string; action?: NoticeAction }
export interface AppDialogsState {
  open: AppDialog | null;
  notice: AppNotice | null;
  /** Replaces whatever app dialog is open (never stacks). */
  openSettings(request?: SettingsRequest, returnTo?: TranslateRequest): void;
  openTranslate(request: TranslateRequest): void;
  /** Settings with returnTo and resume:true → reopens that translate request. */
  close(opts?: { resume?: boolean }): void;
  /** Toolbar flash from outside the toolbar (AI verbs, BiTextField). */
  notify(message: string, action?: AppNotice['action']): void;
}

let noticeId = 0;

export const useAppDialogs: UseBoundStore<StoreApi<AppDialogsState>> = create<AppDialogsState>((set) => ({
  open: null,
  notice: null,
  openSettings: (request = {}, returnTo) =>
    set({ open: returnTo ? { kind: 'settings', request, returnTo } : { kind: 'settings', request } }),
  openTranslate: (request) => set({ open: { kind: 'translate', request } }),
  close: (opts) =>
    set((state) => {
      const open = state.open;
      if (opts?.resume && open?.kind === 'settings' && open.returnTo) {
        return { open: { kind: 'translate', request: open.returnTo } };
      }
      return { open: null };
    }),
  notify: (message, action) => {
    noticeId += 1;
    set({ notice: action ? { id: noticeId, message, action } : { id: noticeId, message } });
  },
}));
