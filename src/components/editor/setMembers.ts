import { create } from 'zustand';
import { useMemo } from 'react';
import { paperSetOf } from '@/model/paperSet';
import type { Worksheet } from '@/model/types';
import type { WorksheetSummary } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { stripPapers } from './PaperSetStrip';

/**
 * The open paper's set, as the editor knows it (k-0299 step C): the index rows and the other
 * papers, read once by the set strip (`PaperSetStrip`, always mounted) and shared with the
 * Marking scheme view's "Whole set" and Export → Whole set, so neither reads the set again.
 *
 * View state only: nothing here is saved. `keyScope` is whether the Marking scheme view shows
 * this paper's key or the whole set's.
 */
export type KeyScope = 'paper' | 'set';

interface SetMembersState {
  /** The set the rows and partners were read for. */
  setId?: string;
  rows: WorksheetSummary[];
  /** The other papers of the set, as stored. */
  partners: Worksheet[];
  keyScope: KeyScope;
  setRows: (setId: string | undefined, rows: WorksheetSummary[]) => void;
  setPartners: (setId: string | undefined, partners: Worksheet[]) => void;
  setKeyScope: (scope: KeyScope) => void;
}

export const useSetMembers = create<SetMembersState>((set) => ({
  rows: [],
  partners: [],
  keyScope: 'paper',
  setRows: (setId, rows) =>
    set((state) => (state.setId === setId ? { rows } : { setId, rows, partners: [], keyScope: 'paper' })),
  setPartners: (setId, partners) => set((state) => (state.setId === setId ? { partners } : state)),
  setKeyScope: (keyScope) => set({ keyScope }),
}));

/**
 * The set's papers in set order (Paper 1, Paper 2), the open one as the editor holds it, the
 * blank ones left out (a new mock set's placeholder has no key and nothing to print). Empty
 * when the paper is in no set, or its partners are not read yet.
 */
export function setPapersInOrder(
  worksheet: Worksheet,
  rows: readonly WorksheetSummary[],
  partners: readonly Worksheet[],
): { name: string; papers: Worksheet[]; blank: Worksheet[]; missing: number } | undefined {
  const shown = stripPapers(worksheet, rows);
  if (!shown) return undefined;
  const byId = new Map<string, Worksheet>([[worksheet.id, worksheet], ...partners.map((p) => [p.id, p] as const)]);
  const papers: Worksheet[] = [];
  const blank: Worksheet[] = [];
  let missing = 0;
  for (const paper of shown.papers) {
    const doc = byId.get(paper.id);
    if (!doc) missing += 1;
    else if (doc.questions.length === 0) blank.push(doc);
    else papers.push(doc);
  }
  return { name: shown.name, papers, blank, missing };
}

/** `setPapersInOrder` for the open paper, from the shared store. */
export function useSetPapers() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setId = paperSetOf(worksheet)?.id;
  const { rows, partners, setId: readFor } = useSetMembers();
  return useMemo(
    () => (setId && readFor === setId ? setPapersInOrder(worksheet, rows, partners) : undefined),
    [worksheet, setId, readFor, rows, partners],
  );
}

/** A whole set worth showing: at least two papers with something in them. */
export const isWholeSet = (set: { papers: readonly Worksheet[] } | undefined): boolean => (set?.papers.length ?? 0) >= 2;
