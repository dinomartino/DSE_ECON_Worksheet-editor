import { create } from 'zustand';

/**
 * Asks the add rail to open from elsewhere (k-0201): ⌘K's Table… opens the Insert menu at
 * Word's size grid, so a table is sized the one way. A counter, so asking twice opens twice.
 */
export const useRailRequest = create<{ tableGrid: number }>(() => ({ tableGrid: 0 }));

export function requestTableGrid(): void {
  useRailRequest.setState((state) => ({ tableGrid: state.tableGrid + 1 }));
}
