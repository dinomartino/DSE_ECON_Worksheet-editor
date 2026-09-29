/**
 * The question bank's contracts (§ docs/design/question-library.md). Rows are derived from
 * saved documents and rebuildable by a scan — never a source of truth, never stored in one.
 */

export type BankLang = 'en' | 'zh';

/** One question in one saved document. Plain data, so an index can persist it as JSON. */
export interface BankRow {
  docId: string;
  docTitle: string;
  /** The owning document's `updatedAt` (ISO): the "when" of every use. */
  docUpdatedAt: string;
  docKind: 'paper' | 'bank';
  /** The owning document's `classTag`, trimmed; absent when unset. */
  classTag?: string;
  questionId: string;
  /** `lineage.rootId`, or the question's own id for an original. */
  rootId: string;
  typeId: string;
  /** Derived total (`questionMarks`). */
  marks: number;
  /** `Question.tags` verbatim: topic codes plus free tags. */
  tags: string[];
  /** The stem's first paragraph per language, each falling back to the other; clipped. */
  excerpt: { en: string; zh: string };
  /** Lower-cased printed text (both languages) plus topic names; what `searchRows` matches. */
  searchText: string;
  /** A diagram or image anywhere in the question (stem, parts, options, answer figures). */
  hasDiagram: boolean;
  /** Languages with printed words; one entry means the other side is missing. */
  languages: BankLang[];
  /** Content fingerprint ignoring ids, lineage and tags (`contentKey.ts`). */
  contentKey: string;
  /** The printed number in its document (`computeNumbering`). */
  number?: number;
}

/** One use of a question: a paper that holds a copy of it. */
export interface BankUse {
  docId: string;
  docTitle: string;
  classTag?: string;
  number?: number;
  docUpdatedAt: string;
}

/** Every copy of one question (same `rootId`), however edited. */
export interface BankGroup {
  rootId: string;
  /** Newest document first; `rows[0]` is the copy to show and insert. */
  rows: BankRow[];
  /** Distinct `contentKey`s: 1 = identical copies, more = "N versions". */
  versions: number;
  /** Papers (not banks) holding a copy, newest first, one entry per document. */
  usedIn: BankUse[];
}

/** A filter over rows; every field optional, all given fields must hold. */
export interface BankQuery {
  /** Whitespace-separated words, each matched case-insensitively in either language. */
  text?: string;
  /** A topic code; a coarse code matches its fine codes (`matchesTopic`). */
  topic?: string;
  typeId?: string;
  marks?: { min?: number; max?: number };
  /** Drop every version of a question already used in a paper with this class tag. */
  notUsedWithClass?: string;
  /** Only rows from this document. */
  fromDocId?: string;
  /** Leave this document out (usually the open paper). */
  excludeDocId?: string;
}

/** Where the index is: first scan or rescan running (`done` of `total` documents), ready, or failed. */
export interface BankStatus {
  state: 'scanning' | 'ready' | 'error';
  done: number;
  total: number;
  error?: string;
}

/** A store event the persistent index (WP-B) re-indexes on. Absent `docId` = everything. */
export interface StoreChange {
  docId?: string;
  kind: 'saved' | 'trashed' | 'restored' | 'removed' | 'cleared';
}
