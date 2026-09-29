import { cleanClasses, dateOfUse } from '@/model/classes';
import { flowItemLabel } from '@/model/flow';
import { computeNumbering } from '@/model/numbering';
import { topicLabel } from '@/model/topics';
import type { Worksheet } from '@/model/types';
import { classRefs, type ClassRef } from './cohort';
import { groupRows } from './group';
import { searchRows } from './search';
import type { BankGroup, BankQuery, BankRow } from './types';

/**
 * The editor's 題庫 tab, as pure functions: its filters composed into a `BankQuery`, the
 * groups they admit, which of them the open paper already holds, and the anchor line.
 * The open document's own saved rows never enter: the live paper is what counts there.
 */

export type MarkBand = 'any' | '1' | '2-4' | '5-8' | '9+';

export const MARK_BANDS: ReadonlyArray<{ value: MarkBand; label: string; range?: BankQuery['marks'] }> = [
  { value: 'any', label: 'Any marks' },
  { value: '1', label: '1 mark', range: { min: 1, max: 1 } },
  { value: '2-4', label: '2–4 marks', range: { min: 2, max: 4 } },
  { value: '5-8', label: '5–8 marks', range: { min: 5, max: 8 } },
  { value: '9+', label: '9+ marks', range: { min: 9 } },
];

/** 'all' worksheets, only 'banks', or one document's id. */
export type FromFilter = 'all' | 'banks' | { docId: string };

export interface TabFilters {
  text: string;
  /** Topic code; '' = any. */
  topic: string;
  /** Registry type id; '' = any. */
  typeId: string;
  marks: MarkBand;
  /** Only honoured when the paper names classes. */
  notUsedWithClass: boolean;
  from: FromFilter;
}

export const NO_FILTERS: TabFilters = { text: '', topic: '', typeId: '', marks: 'any', notUsedWithClass: false, from: 'all' };

/** What the open paper contributes: its id (left out of the bank) and its classes. */
export interface TabContext {
  openDocId: string;
  /** The open paper's classes on its use date (`paperClasses`); empty or absent = a draft. */
  classes?: readonly ClassRef[];
}

/** The open paper's classes on its use date, cohorts derived. */
export function paperClasses(worksheet: Pick<Worksheet, 'classes' | 'satOn' | 'createdAt'>): ClassRef[] {
  return classRefs(cleanClasses(worksheet.classes), dateOfUse(worksheet));
}

/** Every row but the open document's own (its saved copy lags the live paper). */
export function bankRowsBesides(rows: readonly BankRow[], openDocId: string): BankRow[] {
  return rows.filter((row) => row.docId !== openDocId);
}

/** The filters as a `BankQuery` ('banks' is a kind, not a query field: see `visibleGroups`). */
export function tabQuery(filters: TabFilters, ctx: TabContext): BankQuery {
  const classes = ctx.classes ?? [];
  const range = MARK_BANDS.find((band) => band.value === filters.marks)?.range;
  return {
    ...(filters.text.trim() ? { text: filters.text } : {}),
    ...(filters.topic ? { topic: filters.topic } : {}),
    ...(filters.typeId ? { typeId: filters.typeId } : {}),
    ...(range ? { marks: range } : {}),
    ...(filters.notUsedWithClass && classes.length > 0 ? { notUsedWith: classes } : {}),
    ...(typeof filters.from === 'object' ? { fromDocId: filters.from.docId } : {}),
    excludeDocId: ctx.openDocId,
  };
}

export interface VisibleGroup {
  /** The whole group (every copy outside the open paper): versions and uses count all. */
  group: BankGroup;
  /** The copy to show and insert: the newest one the filters admit. */
  row: BankRow;
}

/**
 * The groups the filters admit, newest first. `rows` is the whole index: uses ("not used
 * with 5A", "Used with…") read every copy, while the row shown is the newest admitted one.
 */
export function visibleGroups(rows: readonly BankRow[], filters: TabFilters, ctx: TabContext): VisibleGroup[] {
  const base = bankRowsBesides(rows, ctx.openDocId);
  const admitted = new Set(
    searchRows(base, tabQuery(filters, ctx))
      .filter((row) => filters.from !== 'banks' || row.docKind === 'bank')
      .map(rowKey),
  );
  return groupRows(base).flatMap((group) => {
    const row = group.rows.find((candidate) => admitted.has(rowKey(candidate)));
    return row ? [{ group, row }] : [];
  });
}

/** One row per distinct version (`contentKey`), newest first. */
export function versionRows(group: BankGroup): BankRow[] {
  const seen = new Set<string>();
  return group.rows.filter((row) => !seen.has(row.contentKey) && seen.add(row.contentKey));
}

export const rowKey = (row: Pick<BankRow, 'docId' | 'questionId'>): string => `${row.docId}\u0000${row.questionId}`;

/** The open paper's questions by `lineage.rootId ?? id` → where each one prints. */
export function paperRoots(worksheet: Worksheet): Map<string, { questionId: string; number?: number }> {
  const numbering = computeNumbering(worksheet);
  const out = new Map<string, { questionId: string; number?: number }>();
  for (const question of worksheet.questions) {
    const rootId = question.lineage?.rootId ?? question.id;
    if (out.has(rootId)) continue;
    const number = numbering.byQuestionId.get(question.id)?.number;
    out.set(rootId, { questionId: question.id, ...(number !== undefined ? { number } : {}) });
  }
  return out;
}

/** "Q4", a layout element's name, or undefined (= inserts at the end). */
export function anchorLabel(worksheet: Worksheet, anchorId: string | undefined): string | undefined {
  if (!anchorId) return undefined;
  const numbering = computeNumbering(worksheet);
  return flowItemLabel(worksheet, anchorId, (id) => numbering.byQuestionId.get(id)?.number);
}

/** The documents the From picker offers: every other document with rows, newest first. */
export function fromDocuments(rows: readonly BankRow[], openDocId: string): Array<{ docId: string; title: string; kind: BankRow['docKind'] }> {
  const seen = new Map<string, { docId: string; title: string; kind: BankRow['docKind']; at: string }>();
  for (const row of rows) {
    if (row.docId === openDocId || seen.has(row.docId)) continue;
    seen.set(row.docId, { docId: row.docId, title: row.docTitle, kind: row.docKind, at: row.docUpdatedAt });
  }
  return [...seen.values()]
    .sort((a, b) => (a.at !== b.at ? (a.at < b.at ? 1 : -1) : a.docId < b.docId ? -1 : 1))
    .map(({ docId, title, kind }) => ({ docId, title, kind }));
}

export type FilterKey = 'text' | 'topic' | 'typeId' | 'marks' | 'notUsedWithClass' | 'from';

/** Each filter's "off" value. */
export function clearFilter(filters: TabFilters, key: FilterKey): TabFilters {
  return { ...filters, [key]: NO_FILTERS[key] };
}

export function activeFilters(filters: TabFilters, ctx: TabContext): FilterKey[] {
  const keys: FilterKey[] = [];
  if (filters.notUsedWithClass && (ctx.classes?.length ?? 0) > 0) keys.push('notUsedWithClass');
  if (filters.from !== 'all') keys.push('from');
  if (filters.marks !== 'any') keys.push('marks');
  if (filters.typeId) keys.push('typeId');
  if (filters.topic) keys.push('topic');
  if (filters.text.trim()) keys.push('text');
  return keys;
}

/**
 * When the filters admit nothing but the bank is not empty: the one filter to clear that
 * brings rows back (the most situational first), or undefined when no single one does.
 */
export function blockingFilter(rows: readonly BankRow[], filters: TabFilters, ctx: TabContext): FilterKey | undefined {
  return activeFilters(filters, ctx).find((key) => visibleGroups(rows, clearFilter(filters, key), ctx).length > 0);
}

/** A topic as the tab names it: "C · Price elasticity of demand". */
export function topicName(code: string): string {
  const coarse = code.split('.')[0];
  return `${coarse} · ${topicLabel(code, 'en')}`;
}
