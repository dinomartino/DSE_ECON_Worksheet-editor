import { create } from 'zustand';
import { withCoverageReport, withoutCoverageReport } from '@/model/coverageReports';
import type { SavedCoverageReport, Worksheet } from '@/model/types';
import { changeSetMembers, worksheetStore, type WorksheetStore } from '@/storage';
import { whileSyncPaused } from '@/sync/syncPause';
import { useWorksheetStore } from './worksheetStore';

/**
 * Keeping coverage checks with their papers (k-0489 v2, `model/coverageReports.ts`).
 *
 * A check is written to each paper it read, as the paper is stored (`changeSetMembers`: the
 * saved copy, never this tab's unsaved edits), and taken into the open paper and its undo
 * history (`adoptSavedElsewhere`), so neither an autosave nor ⌘Z drops it and the paper's
 * own unsaved edits stay unsaved: saving by hand still means what it says. Deleting goes the
 * same way. Sync is held around the write, as Set details holds it.
 *
 * `useCoverageSaves` says how each record's save went, for the report's status line.
 */

export type SaveState = 'saving' | 'saved' | 'failed';

interface CoverageSavesState {
  byId: Record<string, SaveState>;
  mark: (id: string, state: SaveState) => void;
}

export const useCoverageSaves = create<CoverageSavesState>((set) => ({
  byId: {},
  mark: (id, state) => set((s) => ({ byId: { ...s.byId, [id]: state } })),
}));

type Store = Pick<WorksheetStore, 'load' | 'save'>;

/** The papers a record belongs to: each paper it read. */
const papersOf = (record: SavedCoverageReport): string[] => [...new Set(record.runs.map((run) => run.worksheetId))];

async function changePapers(ids: readonly string[], change: (worksheet: Worksheet) => Worksheet, store: Store): Promise<string[]> {
  const editor = useWorksheetStore.getState();
  const openId = editor.worksheet.id;
  if (ids.includes(openId)) editor.adoptSavedElsewhere((doc) => (doc.id === openId ? change(doc) : doc));
  const result = await whileSyncPaused(() => changeSetMembers(store, ids, change)).catch(() => ({ failed: [...ids] }));
  return result.failed;
}

/**
 * Keep a finished check with every paper it read. Resolves to whether every stored paper
 * took it; the open paper holds it either way (it saves with the paper's next save).
 */
export async function keepCoverageReport(record: SavedCoverageReport, store: Store = worksheetStore): Promise<boolean> {
  const { mark } = useCoverageSaves.getState();
  mark(record.id, 'saving');
  const failed = await changePapers(papersOf(record), (doc) => withCoverageReport(doc, record), store);
  const ok = failed.length === 0;
  mark(record.id, ok ? 'saved' : 'failed');
  return ok;
}

/** Delete a saved check from every paper that keeps it (a set's from each paper of the set). */
export async function deleteCoverageReport(record: SavedCoverageReport, store: Store = worksheetStore): Promise<boolean> {
  const failed = await changePapers(papersOf(record), (doc) => withoutCoverageReport(doc, record.id), store);
  return failed.length === 0;
}
