import { folderOf, trashAge, type FolderState, type WorksheetSummary } from '@/storage';

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
): WorksheetSummary[] {
  const needle = query.search.trim().toLocaleLowerCase();
  const inScope = scopedSummaries(summaries, scope);
  const shown = inScope.filter((summary) => {
    if (query.kind === 'mock' && !summary.hasCover) return false;
    if (query.kind === 'worksheet' && summary.hasCover) return false;
    return needle === '' || summary.title.toLocaleLowerCase().includes(needle);
  });
  if (query.sort === 'name') {
    return [...shown].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
    );
  }
  return shown;
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

/**
 * How long ago, in words.
 *
 * A file list is scanned for "the one I had open before lunch", and an absolute
 * timestamp makes the reader do that subtraction themselves. Falls back to the date
 * past a week, where "8 days ago" stops being easier than the date it names.
 */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown';
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

/** "deleted 3 days ago · removed in 27 days" — a Trash row's facts line. */
export function trashAgeLabel(deletedAt: string, now = Date.now()): string {
  const { daysAgo, daysLeft } = trashAge(deletedAt, now);
  const ago =
    daysAgo === 0 ? 'Deleted today' : daysAgo === 1 ? 'Deleted yesterday' : `Deleted ${daysAgo} days ago`;
  return `${ago} · removed in ${daysLeft === 1 ? '1 day' : `${daysLeft} days`}`;
}
