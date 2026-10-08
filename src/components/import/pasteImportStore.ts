import { create, type StoreApi, type UseBoundStore } from 'zustand';

/** Whether the editor's Paste questions dialog is open (the add rail opens it). */
export interface PasteImportState {
  open: boolean;
  show(): void;
  close(): void;
}

export const usePasteImport: UseBoundStore<StoreApi<PasteImportState>> = create<PasteImportState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));
