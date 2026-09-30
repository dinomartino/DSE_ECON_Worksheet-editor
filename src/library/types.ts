import type { ClassTarget } from './cohort';

/**
 * The question bank's contracts (§ docs/design/question-library.md). Rows are derived from
 * saved documents and rebuildable by a scan — never a source of truth, never stored in one.
 */

export type BankLang = 'en' | 'zh';

/** One question in one saved document. Plain data, so an index can persist it as JSON. */
export interface BankRow {
  docId: string;
  docTitle: string;
  /** The owning document's `updatedAt` (ISO): which saved version the row was read from. */
  docUpdatedAt: string;
  /**
   * The owning document's use date (`dateOfUse`: `satOn`, else `createdAt`). Orders copies
   * and dates uses; never `updatedAt`, so editing an old paper does not make it recent.
   */
  usedOn: string;
  docKind: 'paper' | 'bank';
  /** The classes that sat the owning document, cleaned; absent = a draft, never a use. */
  classes?: string[];
  questionId: string;
  /** `lineage.rootId`, or the question's own id for an original. */
  rootId: string;
  typeId: string;
  /** Derived total (`questionMarks`). */
  marks: number;
  /**
   * `Question.tags` (its strings): topic codes plus free tags. Published rows hold the
   * question's shared set instead (`withSharedTags`); stored rows keep the copy's own.
   */
  tags: string[];
  /** `Question.tagsAt` when a string; published rows hold the shared set's stamp. */
  tagsAt?: string;
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

/**
 * A paper that holds a copy of a question. It is a *use* only when it names classes; a
 * draft still shows where the question lives, but no anti-repeat filter counts it.
 */
export interface BankUse {
  docId: string;
  docTitle: string;
  classes?: string[];
  number?: number;
  /** `BankRow.usedOn`: when it was sat, else when it was made. */
  usedOn: string;
}

/** Every copy of one question (same `rootId`), however edited. */
export interface BankGroup {
  rootId: string;
  /** Newest use date first (`usedOn`, then docId); `rows[0]` is the copy to show and insert. */
  rows: BankRow[];
  /** Distinct `contentKey`s: 1 = identical copies, more = "N versions". */
  versions: number;
  /** Papers (not banks) holding a copy, newest first, one entry per document. */
  usedIn: BankUse[];
}

/** A filter over rows; every field optional, all given fields must hold. */
export interface BankQuery {
  /** Whitespace-separated words, each matched case-insensitively in either language or in the paper's title. */
  text?: string;
  /** A topic code; a coarse code matches its fine codes (`matchesTopic`). */
  topic?: string;
  typeId?: string;
  marks?: { min?: number; max?: number };
  /** Drop every version of a question already used with any of these students (`cohort.ts`). */
  notUsedWith?: readonly ClassTarget[];
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
