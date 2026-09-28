import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { useWorksheetStore } from '@/store/worksheetStore';
import { scopeFromSelection, scopeLabel } from './scope';
import type { AiScope } from './types';

/** The AI door's one menu. Every entry point (button, ⌘J, page menu, pill) calls `openAi`. */
export interface AiMenuOpen {
  scope: AiScope;
  scopeLabel: string;
  /** Viewport point to open at; absent = the host's default (under the toolbar button). */
  anchor?: { x: number; y: number };
  /** Verb id to highlight on open. */
  preselect?: string;
}

export interface AiMenuState {
  open: AiMenuOpen | null;
  /** No scope → the editor's selection (`scopeFromSelection`); no label → `scopeLabel`. */
  openMenu(o?: Partial<AiMenuOpen>): void;
  close(): void;
}

export const useAiMenu: UseBoundStore<StoreApi<AiMenuState>> = create<AiMenuState>((set) => ({
  open: null,
  openMenu: (o = {}) => {
    const state = useWorksheetStore.getState();
    const scope = o.scope ?? scopeFromSelection(state);
    set({
      open: {
        scope,
        scopeLabel: o.scopeLabel ?? scopeLabel(state.worksheet, scope),
        ...(o.anchor ? { anchor: o.anchor } : {}),
        ...(o.preselect ? { preselect: o.preselect } : {}),
      },
    });
  },
  close: () => set({ open: null }),
}));

/** What every entry point calls. */
export function openAi(opts?: Partial<AiMenuOpen>): void {
  useAiMenu.getState().openMenu(opts);
}
