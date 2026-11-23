import { create } from 'zustand';

/**
 * The ✦ Write panel's small shared state (k-0516 B), kept apart from its chat store so the
 * editor's toolbar and page can read it without loading the studio.
 */
export interface WritePanelState {
  /** The tab is open: the drafts are drawn on the page. */
  open: boolean;
  /** "Ask about this" from a draft on the page: the composer's draft chip. */
  ask?: string;
  /** Accepted drafts → the paper and question each became (this session), so an undo brings the draft back. */
  placed: Record<string, { paper: string; question: string; after?: string }>;
  /** A PDF print is under way: the drafts are off the page. */
  printing: boolean;
  setOpen(open: boolean): void;
  setAsk(draftId: string | undefined): void;
}

export const useWritePanel = create<WritePanelState>((set) => ({
  open: false,
  placed: {},
  printing: false,
  setOpen: (open) => set({ open }),
  setAsk: (ask) => set({ ask }),
}));

/**
 * Printing (PDF) takes the page as it shows: the drafts go off it first, and come back with
 * the teacher's next click or key once the print has been handed over. Returns that hand-over.
 */
export function hideGhostsForPrint(): () => void {
  if (!useWritePanel.getState().open) return () => undefined;
  useWritePanel.setState({ printing: true });
  return () => {
    if (typeof window === 'undefined') return useWritePanel.setState({ printing: false });
    const back = () => {
      window.removeEventListener('pointerdown', back, true);
      window.removeEventListener('keydown', back, true);
      useWritePanel.setState({ printing: false });
    };
    window.addEventListener('pointerdown', back, true);
    window.addEventListener('keydown', back, true);
  };
}
