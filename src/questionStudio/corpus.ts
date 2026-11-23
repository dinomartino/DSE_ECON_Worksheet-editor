import type { BankRow } from '@/library/types';
import type { SearchRow } from '@/pastpapers/pack';
import { buildCorpusIndex, type CorpusDoc, type CorpusIndex } from './nearCopy';

/**
 * What a draft is compared with for the near-copy check: the Past paper bank's search
 * index (every question's words, no topic downloaded) and the teacher's own questions
 * (their 題庫 and papers, from the library index). Words only, read on this computer.
 * The index is built once per set of inputs and kept (`studioCorpus`).
 */

export type PastRow = Pick<SearchRow, 'topicId' | 'source' | 'en' | 'zh'>;
export type OwnRow = Pick<BankRow, 'docId' | 'questionId' | 'contentKey' | 'searchText'>;

/** The Past paper bank's questions as documents; a question is named by its source tag. */
export const pastPaperDocs = (rows: readonly PastRow[]): CorpusDoc[] =>
  rows.map((row, i) => ({ id: row.source.tag || `${row.topicId}#${i}`, kind: 'bank', en: row.en, zh: row.zh }));

/**
 * The teacher's own questions as documents. A row's `searchText` holds both languages
 * (and the topic words), and each side of the index reads only its own script. One per
 * content: copies of a question across papers are one document.
 */
export function ownDocs(rows: readonly OwnRow[]): CorpusDoc[] {
  const seen = new Set<string>();
  const out: CorpusDoc[] = [];
  for (const row of rows) {
    if (seen.has(row.contentKey)) continue;
    seen.add(row.contentKey);
    out.push({ id: `${row.docId}/${row.questionId}`, kind: 'mine', en: row.searchText, zh: row.searchText });
  }
  return out;
}

export interface StudioCorpus {
  index: CorpusIndex;
  /** What is in it: past-paper questions (null: the bank was not available) and the teacher's own. */
  past: number | null;
  mine: number;
}

let last: { past: readonly PastRow[] | undefined; mine: readonly OwnRow[]; made: StudioCorpus } | undefined;

/** The corpus for these inputs; the last one is kept, so a second write reads the same index. */
export function studioCorpus(past: readonly PastRow[] | undefined, mine: readonly OwnRow[]): StudioCorpus {
  if (last && last.past === past && last.mine === mine) return last.made;
  const own = ownDocs(mine);
  const bank = past ? pastPaperDocs(past) : [];
  const made: StudioCorpus = { index: buildCorpusIndex([...bank, ...own]), past: past ? bank.length : null, mine: own.length };
  last = { past, mine, made };
  return made;
}
