import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { searchRows } from '@/library/search';
import type { BankRow } from '@/library/types';
import { folderOf, trashAge, type FolderState, type WorksheetSummary } from '@/storage';
import { DASHBOARD_MESSAGES } from './screen.messages';

/**
 * The file dashboard's pure half: which saved documents show, in what order.
 *
 * Kept out of the component so the rules are testable without a DOM — and because the
 * index is the only route to a document, a filter bug that hides a row reads exactly
 * like lost work.
 */

/** A cover is the one structural fact the index stores; it tells a mock from a worksheet. */
export type KindFilter = 'all' | 'worksheet' | 'mock';
export type SortOrder = 'recent' | 'name';
export type DashboardView = 'grid' | 'list';

export interface DashboardQuery {
  search: string;
  kind: KindFilter;
  sort: SortOrder;
}

export const DEFAULT_QUERY: DashboardQuery = { search: '', kind: 'all', sort: 'recent' };

/** Which part of the library is open: a folder, or all documents (`undefined`). */
export interface FolderScope {
  folderId: string | undefined;
  folders: FolderState;
}

/**
 * The rows to show. `recent` keeps the index's own order (newest first, undated last —
 * `usableSummaries` owns that rule); `name` is a natural, case-blind sort so "Unit 10"
 * follows "Unit 9". A folder scope narrows first; search, kind and order then work
 * within it. All documents (no folder) shows every row, filed or not.
 */
export function visibleSummaries(
  summaries: WorksheetSummary[],
  query: DashboardQuery,
  scope?: FolderScope,
  /** Documents whose question text matches the search (`questionHits`); titles match without it. */
  hits?: ReadonlyMap<string, unknown>,
): WorksheetSummary[] {
  const needle = query.search.trim().toLocaleLowerCase();
  const inScope = scopedSummaries(summaries, scope);
  const shown = inScope.filter((summary) => {
    if (query.kind === 'mock' && !summary.hasCover) return false;
    // A question bank is neither a worksheet nor a mock: it shows under All only.
    if (query.kind !== 'all' && summary.kind === 'bank') return false;
    if (query.kind === 'worksheet' && summary.hasCover) return false;
    return needle === '' || summary.title.toLocaleLowerCase().includes(needle) || !!hits?.has(summary.id);
  });
  if (query.sort === 'name') {
    return [...shown].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
    );
  }
  return shown;
}

/** Why a card matched a search: its first matching question, and a few words from it. */
export interface QuestionHit {
  /** The question's printed number, when it has one. */
  number?: number;
  /** Words from the question, the matched one apart so the card can mark it; absent when only the title explains the match. */
  snippet?: Snippet;
}

export interface Snippet {
  before: string;
  /** The matched text as printed; '' when the snippet is just the question's opening words. */
  hit: string;
  after: string;
}

/** Characters of context kept before the matched word, and the snippet's whole length. */
const LEAD = 24;
const SNIPPET_MAX = 90;

/**
 * Which documents' questions match `search`, by document id: the 題庫's own search over
 * its own rows (`searchRows` — every word in the question, either language, or in its
 * paper's title), so the dashboard and the bank can never disagree about a match. The
 * first matching question in printed order explains it. No rows (the bank index still
 * reading, or a document kept out of the bank) only means no question match: titles
 * still match in `visibleSummaries`.
 */
export function questionHits(
  rows: readonly BankRow[] | undefined,
  search: string,
  lang: UiLanguage = uiLanguage(),
): Map<string, QuestionHit> {
  const hits = new Map<string, QuestionHit>();
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (!rows || words.length === 0) return hits;
  for (const row of searchRows(rows, { text: search })) {
    if (hits.has(row.docId)) continue;
    hits.set(row.docId, {
      ...(row.number !== undefined ? { number: row.number } : {}),
      ...optionalSnippet(row, words, lang),
    });
  }
  return hits;
}

function optionalSnippet(row: BankRow, words: string[], lang: UiLanguage): Pick<QuestionHit, 'snippet'> {
  const title = row.docTitle.toLowerCase();
  // The words the question itself answers for; none means the title alone matched.
  const own = words.filter((word) => !title.includes(word));
  if (own.length === 0) return {};
  const snippet = snippetOf(row, own, lang);
  return snippet ? { snippet } : {};
}

/**
 * A few words around the first matched word: from the stem's excerpt (as printed, the UI
 * language's side first), else from the line of the question's text that holds it, but
 * only when lower-casing left that line as printed (no Latin letters, e.g. 中文); else the
 * question's opening words, unmarked. Never invents text the question does not print.
 */
export function snippetOf(row: Pick<BankRow, 'excerpt' | 'searchText'>, words: string[], lang: UiLanguage): Snippet | undefined {
  const sides = lang === 'zh-HK' ? [row.excerpt.zh, row.excerpt.en] : [row.excerpt.en, row.excerpt.zh];
  // The words as one phrase first ("rent control" marked whole), then each on its own.
  const phrases = words.length > 1 ? [words.join(' '), ...words] : words;
  for (const word of phrases) {
    for (const text of sides) {
      const at = text.toLowerCase().indexOf(word);
      // Lower-casing kept the length (it does but for a few letters): the offsets hold.
      if (at >= 0 && text.toLowerCase().length === text.length) return around(text, at, word.length);
    }
  }
  for (const word of words) {
    const line = row.searchText.split('\n').find((entry) => entry.includes(word));
    if (line && !/[a-z]/.test(line)) return around(line, line.indexOf(word), word.length);
  }
  const opening = sides.find((text) => text.trim() !== '');
  return opening ? { before: '', hit: '', after: clipEnd(opening, SNIPPET_MAX) } : undefined;
}

function around(text: string, at: number, length: number): Snippet {
  const flat = (part: string) => part.replace(/\s+/g, ' ');
  let start = Math.max(0, at - LEAD);
  // Start on a word where there are spaces to start on (English); 中文 cuts anywhere.
  if (start > 0) {
    const space = text.lastIndexOf(' ', at);
    if (space >= start && space < at) start = space + 1;
  }
  const before = (start > 0 ? '…' : '') + flat(text.slice(start, at)).trimStart();
  const hit = flat(text.slice(at, at + length));
  const room = Math.max(0, SNIPPET_MAX - before.length - hit.length);
  const after = clipEnd(flat(text.slice(at + length)), room);
  return { before, hit, after };
}

function clipEnd(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ');
  return flat.length <= max ? flat : `${flat.slice(0, max).trimEnd()}…`;
}

/**
 * The marks a card shows: a paper's `totalMarks`, read per row like every index field. A
 * bank has no paper total, and a row that lacks the figure (an earlier build wrote it) or
 * holds nothing sensible shows none — never a guess, never 0 for "not known".
 */
export function cardMarks(summary: WorksheetSummary): number | undefined {
  if (summary.kind !== undefined) return undefined;
  const marks: unknown = summary.totalMarks;
  return typeof marks === 'number' && Number.isFinite(marks) && marks > 0 ? marks : undefined;
}

/**
 * The rows in the open folder, before search and kind. A folder that no longer exists
 * scopes to nothing; the caller falls back to all documents.
 */
export function scopedSummaries(
  summaries: WorksheetSummary[],
  scope: FolderScope | undefined,
): WorksheetSummary[] {
  if (!scope || scope.folderId === undefined) return summaries;
  return summaries.filter((summary) => folderOf(scope.folders, summary.id)?.id === scope.folderId);
}

/**
 * The count beside the saved documents: papers and banks apart, so a bank never reads as
 * one more worksheet ("3 worksheets · 1 bank").
 */
export function documentCount(summaries: readonly WorksheetSummary[], lang: UiLanguage = uiLanguage()): string {
  const m = resolveMessages(DASHBOARD_MESSAGES, lang);
  const banks = summaries.filter((summary) => summary.kind === 'bank').length;
  const papers = summaries.length - banks;
  const parts = papers > 0 || banks === 0 ? [m.worksheetCount(papers)] : [];
  if (banks > 0) parts.push(m.bankCount(banks));
  return parts.join(' · ');
}

/** Whether any filter is narrowing the list — decides "no matches" vs "nothing saved". */
export function isFiltered(query: DashboardQuery): boolean {
  return query.search.trim() !== '' || query.kind !== 'all';
}

/**
 * The grid/list choice is a per-viewer convenience, so it lives in `localStorage` —
 * under a key outside the `econ-worksheet:` prefix, which the store treats as its own
 * documents and `clear()` deletes.
 */
const VIEW_KEY = 'econgen.startView';

export function readDashboardView(): DashboardView {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export function writeDashboardView(view: DashboardView): void {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Private mode or blocked storage: the choice just doesn't outlive the tab.
  }
}

/**
 * The open folder is remembered per viewer, like the view — a teacher who files by term
 * comes back to the term they were in. A folder that has since gone reads as none.
 */
const FOLDER_KEY = 'econgen.startFolder';

export function readDashboardFolder(): string | undefined {
  try {
    return window.localStorage.getItem(FOLDER_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeDashboardFolder(folderId: string | undefined): void {
  try {
    if (folderId === undefined) window.localStorage.removeItem(FOLDER_KEY);
    else window.localStorage.setItem(FOLDER_KEY, folderId);
  } catch {
    // Private mode or blocked storage: the choice just doesn't outlive the tab.
  }
}

/** How long ago, in words, in the interface language. */
export { relativeTime } from '@/i18n/format';

/** "deleted 3 days ago · removed in 27 days" — a Trash row's facts line. */
export function trashAgeLabel(deletedAt: string, now = Date.now(), lang: UiLanguage = uiLanguage()): string {
  const m = resolveMessages(DASHBOARD_MESSAGES, lang);
  const { daysAgo, daysLeft } = trashAge(deletedAt, now);
  const ago = daysAgo === 0 ? m.deletedToday : daysAgo === 1 ? m.deletedYesterday : m.deletedDaysAgo(daysAgo);
  return `${ago} · ${m.removedIn(daysLeft)}`;
}
