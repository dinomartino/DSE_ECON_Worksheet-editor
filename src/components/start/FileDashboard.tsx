'use client';

import { useMemo, useState } from 'react';
import { IconButton, Segmented } from '@/components/ui';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { FolderIcon, PlusIcon, SheetIcon, TrashIcon } from '@/components/ui/icons';
import { isDesktop, revealLabel } from '@/platform';
import {
  folderCounts,
  folderOf,
  sortedFolders,
  type Folder,
  type FolderState,
  type WorksheetSummary,
} from '@/storage';
import { PageThumbnail } from './PageThumbnail';
import {
  DEFAULT_QUERY,
  isFiltered,
  readDashboardView,
  relativeTime,
  scopedSummaries,
  visibleSummaries,
  writeDashboardView,
  type DashboardQuery,
  type DashboardView,
  type KindFilter,
  type SortOrder,
} from './dashboard';
import { dropTargetValue, type DropTarget } from './dashboardDrag';
import { useDocumentDrag, type SourceProps } from './useDocumentDrag';

/** What a saved document offers besides opening it. The screen owns the doing. */
export interface DocumentActions {
  open: (summary: WorksheetSummary) => void;
  rename: (summary: WorksheetSummary) => void;
  duplicate: (summary: WorksheetSummary) => void;
  download: (summary: WorksheetSummary) => void;
  /** Desktop only: show the stored file in Finder/Explorer. */
  reveal?: (summary: WorksheetSummary) => void;
  /** File it into a folder (or back to none), through a picker. */
  move?: (summary: WorksheetSummary) => void;
  remove: (summary: WorksheetSummary) => void;
}

/** The folder list's own actions. The screen owns the dialogs and the doing. */
export interface FolderActions {
  create: () => void;
  rename: (folder: Folder) => void;
  remove: (folder: Folder) => void;
  /** A card dropped on a folder, or on All documents (`undefined`: out of any folder). */
  drop: (docId: string, folderId: string | undefined) => void;
}

/**
 * The desk side of the start screen: every saved document, findable.
 *
 * A grid of first pages by default — a teacher recognises a worksheet by its shape on
 * the paper faster than by a title they typed weeks ago — with the older ledger kept as
 * a denser list view for long archives. Search, kind and order narrow the same index;
 * none of them is stored with a document.
 */
export function FileDashboard({
  summaries,
  loaded,
  actions,
  trashCount = 0,
  onShowTrash,
  libraryItems = [],
  folders,
  folderId,
  onFolderChange,
  folderActions,
}: {
  summaries: WorksheetSummary[];
  loaded: boolean;
  actions: DocumentActions;
  /** Folders and assignments; absent means no folder UI at all. */
  folders?: FolderState;
  /** The open folder; `undefined` is All documents. */
  folderId?: string;
  onFolderChange?: (folderId: string | undefined) => void;
  folderActions?: FolderActions;
  /** The Trash icon beside the count; its badge shows how many are in it. */
  trashCount?: number;
  onShowTrash?: () => void;
  /** Whole-library actions (backup, restore, folders) behind one ⋯ menu. */
  libraryItems?: MenuItem[];
}) {
  const [query, setQuery] = useState<DashboardQuery>(DEFAULT_QUERY);
  // Lazy initialiser: `EditorHost` renders the start screen only after hydration, so
  // reading storage on the first render cannot mismatch the prerendered tree.
  const [view, setView] = useState<DashboardView>(readDashboardView);
  // A folder that has gone (deleted here, or in another tab) is All documents.
  const openFolder =
    folders && folderId !== undefined ? folders.folders.find((f) => f.id === folderId) : undefined;
  const scope = useMemo(
    () => (folders ? { folderId: openFolder?.id, folders } : undefined),
    [folders, openFolder],
  );
  const inScope = useMemo(() => scopedSummaries(summaries, scope), [summaries, scope]);
  const shown = useMemo(() => visibleSummaries(summaries, query, scope), [summaries, query, scope]);
  const place = isDesktop() ? 'on this computer' : 'in this browser';
  const showFolders = !!folders && !!folderActions && loaded && summaries.length > 0;
  // In All documents a card says which folder it is in; inside a folder that is noise.
  const folderLabel = (summary: WorksheetSummary) =>
    folders && !openFolder ? folderOf(folders, summary.id)?.name : undefined;

  // Pointer events, not HTML5 drag-and-drop — the desktop webview never delivers `drop`.
  const drag = useDocumentDrag(showFolders ? folderActions?.drop : undefined);
  const dragProps = (summary: WorksheetSummary) => drag.sourceProps(summary.id, summary.title);

  const chooseView = (next: DashboardView) => {
    setView(next);
    writeDashboardView(next);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
          {isDesktop() ? 'Saved on this computer' : 'Saved in this browser'}
        </h2>
        {/* The library's own tools sit with the library: the count, the Trash, and the
            rare whole-library actions behind ⋯ — never as a column of links. */}
        <span className="flex items-center gap-1 text-[11px] tabular-nums text-ink-subtle">
          {summaries.length > 0 && (
            <span className="mr-2">
              {shown.length === inScope.length
                ? plural(inScope.length, 'document')
                : `${shown.length} of ${plural(inScope.length, 'document')}`}
            </span>
          )}
          {onShowTrash && (
            <IconButton
              label={trashCount > 0 ? `Trash (${trashCount})` : 'Trash'}
              onClick={onShowTrash}
              className="relative"
            >
              <TrashIcon />
              {trashCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[15px] rounded-full bg-ink-muted px-1 text-center text-[9.5px] font-semibold leading-[15px] text-surface">
                  {trashCount}
                </span>
              )}
            </IconButton>
          )}
          {libraryItems.length > 0 && (
            <Menu label="Back up, restore and folders" items={libraryItems} />
          )}
        </span>
      </div>

      <div className={showFolders ? 'mt-4 flex flex-col gap-x-8 gap-y-3 md:flex-row' : ''}>
        {showFolders && folders && folderActions && (
          <FolderNav
            folders={folders}
            summaries={summaries}
            openId={openFolder?.id}
            onOpen={(id) => onFolderChange?.(id)}
            actions={folderActions}
            over={drag.over}
          />
        )}
        <div className="min-w-0 flex-1">
          {/* The controls only appear once there is something to control; on an empty
              desk they would be four inert widgets around a sentence. */}
          {loaded && summaries.length > 0 && (
            <div className={`${showFolders ? '' : 'mt-4 '}flex flex-wrap items-center gap-x-3 gap-y-2`}>
              <label className="relative min-w-[200px] flex-1">
                <span className="sr-only">Search saved documents</span>
                <input
                  type="search"
                  value={query.search}
                  placeholder="Search by name"
                  onChange={(event) => setQuery((q) => ({ ...q, search: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && query.search) {
                      event.stopPropagation();
                      setQuery((q) => ({ ...q, search: '' }));
                    }
                  }}
                  className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
                <SearchGlyph />
              </label>
              <Segmented<KindFilter>
                label="Kind of document"
                value={query.kind}
                onChange={(kind) => setQuery((q) => ({ ...q, kind }))}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'worksheet', label: 'Worksheets' },
                  { value: 'mock', label: 'Mock papers' },
                ]}
              />
              <span aria-hidden className="h-4 w-px bg-line" />
              <Segmented<SortOrder>
                label="Order"
                value={query.sort}
                onChange={(sort) => setQuery((q) => ({ ...q, sort }))}
                options={[
                  { value: 'recent', label: 'Recent', title: 'Most recently edited first' },
                  { value: 'name', label: 'A–Z', title: 'By name' },
                ]}
              />
              <span aria-hidden className="h-4 w-px bg-line" />
              <Segmented<DashboardView>
                label="View"
                value={view}
                onChange={chooseView}
                options={[
                  { value: 'grid', label: 'Pages', title: 'First pages, as a grid' },
                  { value: 'list', label: 'List', title: 'A compact list' },
                ]}
              />
            </div>
          )}

          {/* Four states, each said plainly. "Still reading storage" must not flash an empty
              list — that reads as lost work — and "nothing matches" must not read as
              "nothing saved". */}
          {!loaded ? (
            <p className="mt-5 text-[12px] text-ink-subtle">Reading saved documents…</p>
          ) : summaries.length === 0 ? (
            <div className="zone-light mt-4 rounded-xl border border-line bg-surface px-6 py-10">
              <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
                Nothing saved yet. Worksheets you start are kept {place} — save a .json copy to
                move one to another machine.
              </p>
            </div>
          ) : openFolder && inScope.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-line-strong px-6 py-8">
              <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
                “{openFolder.name || 'Untitled folder'}” is empty. Choose Move to folder… on a
                document, or drag one onto this folder.
              </p>
            </div>
          ) : shown.length === 0 ? (
            <div className="mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-[13px] text-ink-muted">No saved document matches.</p>
              {isFiltered(query) && (
                <button
                  type="button"
                  onClick={() => setQuery((q) => ({ ...DEFAULT_QUERY, sort: q.sort }))}
                  className="cursor-pointer text-[12px] font-medium text-accent-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : view === 'grid' ? (
            <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-6 gap-y-8">
              {shown.map((summary) => (
                <DocumentCard
                  key={summary.id}
                  summary={summary}
                  actions={actions}
                  folder={folderLabel(summary)}
                  drag={dragProps(summary)}
                  dragging={drag.draggingId === summary.id}
                />
              ))}
            </ul>
          ) : (
            <ul className="zone-light mt-5 overflow-hidden rounded-xl border border-line bg-surface">
              {shown.map((summary) => (
                <SavedRow
                  key={summary.id}
                  summary={summary}
                  actions={actions}
                  folder={folderLabel(summary)}
                  drag={dragProps(summary)}
                  dragging={drag.draggingId === summary.id}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
      {drag.ghost}
    </div>
  );
}

/**
 * The folder list: All documents, then each folder by name, with counts. Each row is a
 * drop target for a dragged card (`data-folder-drop`, found under the pointer). A folder's ⋯ stays in the layout and is revealed by
 * opacity, never display, so reaching for it cannot move the row.
 */
function FolderNav({
  folders,
  summaries,
  openId,
  onOpen,
  actions,
  over,
}: {
  folders: FolderState;
  summaries: WorksheetSummary[];
  openId: string | undefined;
  onOpen: (folderId: string | undefined) => void;
  actions: FolderActions;
  /** The row a dragged document is over. */
  over: DropTarget | null;
}) {
  const counts = useMemo(
    () => folderCounts(folders, summaries.map((summary) => summary.id)),
    [folders, summaries],
  );
  const list = sortedFolders(folders);
  return (
    <nav aria-label="Folders" className="shrink-0 md:w-48">
      <div className="flex items-center justify-between pb-1 pl-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
          Folders
        </span>
        <IconButton label="New folder…" onClick={actions.create}>
          <PlusIcon size={14} />
        </IconButton>
      </div>
      <ul className="flex flex-wrap gap-1 md:flex-col md:flex-nowrap md:gap-0.5">
        <FolderRow
          name="All documents"
          count={summaries.length}
          active={openId === undefined}
          onOpen={() => onOpen(undefined)}
          dropValue={dropTargetValue(undefined)}
          over={over !== null && over.folderId === undefined}
        />
        {list.map((folder) => (
          <FolderRow
            key={folder.id}
            name={folder.name || 'Untitled folder'}
            count={counts.get(folder.id) ?? 0}
            active={openId === folder.id}
            folder
            onOpen={() => onOpen(folder.id)}
            dropValue={dropTargetValue(folder.id)}
            over={over?.folderId === folder.id}
            menu={[
              { label: 'Rename…', onSelect: () => actions.rename(folder) },
              {
                label: 'Delete folder…',
                danger: true,
                separated: true,
                onSelect: () => actions.remove(folder),
              },
            ]}
          />
        ))}
      </ul>
      {list.length === 0 && (
        <p className="mt-2 hidden pl-2 text-[11px] leading-snug text-ink-subtle md:block">
          Group documents by class or term — press + to make a folder.
        </p>
      )}
    </nav>
  );
}

function FolderRow({
  name,
  count,
  active,
  folder = false,
  onOpen,
  dropValue,
  over,
  menu,
}: {
  name: string;
  count: number;
  active: boolean;
  folder?: boolean;
  onOpen: () => void;
  dropValue: string;
  over: boolean;
  menu?: MenuItem[];
}) {
  return (
    <li
      data-folder-drop={dropValue}
      className={`group relative flex min-w-0 items-center rounded-lg transition-colors duration-150 ease-[var(--ease-out-soft)] md:w-full ${
        over
          ? 'bg-accent-soft ring-2 ring-inset ring-accent'
          : active
            ? 'bg-surface-hover'
            : 'hover:bg-surface-hover'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? 'true' : undefined}
        className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-2 pr-1 text-left text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
          active ? 'font-medium text-ink' : 'text-ink-muted hover:text-ink'
        }`}
      >
        <span className={active ? 'text-ink' : 'text-ink-subtle'}>
          {folder ? <FolderIcon size={15} /> : <SheetIcon size={15} />}
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">{count}</span>
      </button>
      {menu && (
        <span
          className={`transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
            active ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Menu label={`Actions for folder ${name}`} items={menu} />
        </span>
      )}
      {/* The ⋯'s width, so every count sits in one column. */}
      {!menu && <span aria-hidden className="w-7 shrink-0" />}
    </li>
  );
}

function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

/** The overflow menu both views share, so a card and a row can never offer different things. */
function menuItems(summary: WorksheetSummary, actions: DocumentActions): MenuItem[] {
  const items: MenuItem[] = [
    { label: 'Open', onSelect: () => actions.open(summary) },
    { label: 'Rename…', onSelect: () => actions.rename(summary) },
    { label: 'Duplicate', onSelect: () => actions.duplicate(summary) },
    // Desktop gets a save sheet and a real destination; the web gets a download.
    {
      label: isDesktop() ? 'Save a .json copy…' : 'Download .json',
      onSelect: () => actions.download(summary),
    },
  ];
  if (actions.move) {
    const move = actions.move;
    items.push({ label: 'Move to folder…', onSelect: () => move(summary) });
  }
  if (actions.reveal) {
    const reveal = actions.reveal;
    items.push({ label: revealLabel(), onSelect: () => reveal(summary) });
  }
  items.push({
    label: 'Move to Trash…',
    onSelect: () => actions.remove(summary),
    danger: true,
    separated: true,
  });
  return items;
}

/**
 * The kind leads the facts line: it distinguishes two similarly named documents.
 * Carried by weight and ink, never the accent — blue in this system means
 * link/focus/selection, and a label that cannot be clicked must not wear it.
 */
function KindAndCount({ summary }: { summary: WorksheetSummary }) {
  return (
    <>
      <span className={summary.hasCover ? 'font-semibold text-ink-muted' : 'text-ink-subtle'}>
        {summary.hasCover ? 'Mock exam paper' : 'Worksheet'}
      </span>
      {summary.questionCount !== undefined && (
        <> · {plural(summary.questionCount, 'question')}</>
      )}
    </>
  );
}

/**
 * One saved document as its first page.
 *
 * The whole card is one button — paper and title together — so the target is as large
 * as the thing being recognised. The menu sits beside the title rather than floating
 * over the paper: it is always visible (no hover-only reveal to chase on a trackpad)
 * and it stays inside the card's own box.
 */
function DocumentCard({
  summary,
  actions,
  folder,
  drag,
  dragging,
}: {
  summary: WorksheetSummary;
  actions: DocumentActions;
  /** The folder it is filed in, shown in All documents only. */
  folder?: string;
  /** Pointer handlers that drag it onto a folder; absent when there are no folders. */
  drag?: SourceProps;
  dragging?: boolean;
}) {
  return (
    <li
      className={`group relative min-w-0 transition-opacity duration-150 ${dragging ? 'opacity-40' : ''}`}
      {...drag}
    >
      <button
        type="button"
        onClick={() => actions.open(summary)}
        aria-label={`Open ${summary.title}`}
        className="block w-full cursor-pointer rounded-lg text-left focus-visible:outline-none"
      >
        {/* The paper answers hover and focus with the accent ring — the same signal
            the Start rows' accent bar gives. Nothing lifts. */}
        <span className="block overflow-hidden rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.18),0_4px_14px_rgba(0,0,0,0.14)] ring-1 ring-black/5 transition-shadow duration-150 ease-[var(--ease-out-soft)] group-hover:ring-2 group-hover:ring-accent group-focus-within:ring-2 group-focus-within:ring-accent">
          <PageThumbnail id={summary.id} updatedAt={summary.updatedAt} />
        </span>
        <span className="mt-2.5 block pr-9">
          {/* Two lines for the name before it clips: at card width one line cut most
              real titles ("Unit 3 — Demand and…") to the words they all share. */}
          <span className="line-clamp-2 text-[13px] font-medium leading-snug text-ink transition-colors group-hover:text-accent-ink">
            {summary.title}
          </span>
          <span className="mt-1 block truncate text-[11px] leading-tight text-ink-subtle">
            <span className={summary.hasCover ? 'font-semibold text-ink-muted' : undefined}>
              {summary.hasCover ? 'Mock exam paper' : 'Worksheet'}
            </span>
          </span>
          {/* Its own line: beside "Mock exam paper" at card width the name clipped to "M…". */}
          {folder && (
            <span className="mt-0.5 block truncate text-[11px] leading-tight text-ink-subtle">
              <FolderIcon size={11} className="mr-1 inline-block align-[-1px]" />
              {folder}
            </span>
          )}
          <span className="mt-0.5 block truncate text-[11px] tabular-nums leading-tight text-ink-subtle">
            {summary.questionCount !== undefined &&
              `${plural(summary.questionCount, 'question')} · `}
            {relativeTime(summary.updatedAt)}
          </span>
        </span>
      </button>
      <div className="absolute bottom-0 right-0">
        <Menu label={`Actions for ${summary.title}`} items={menuItems(summary, actions)} />
      </div>
    </li>
  );
}

/**
 * One saved document as a line — the dense view for a long archive.
 *
 * The row itself opens it; the menu carries what a file list also has to offer.
 */
function SavedRow({
  summary,
  actions,
  folder,
  drag,
  dragging,
}: {
  summary: WorksheetSummary;
  actions: DocumentActions;
  folder?: string;
  drag?: SourceProps;
  dragging?: boolean;
}) {
  return (
    <li
      className={`group relative flex items-center gap-3 border-b border-line pr-1.5 last:border-b-0 transition-[background-color,opacity] duration-150 ease-[var(--ease-out-soft)] hover:bg-surface-hover ${dragging ? 'opacity-40' : ''}`}
      {...drag}
    >
      {/* The same accent bar the Start rows use. Opacity, never display — a reveal
          that changes layout moves the row out from under the pointer reaching for it. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 bg-accent opacity-0 transition-opacity duration-150 ease-[var(--ease-out-soft)] group-hover:opacity-100 group-focus-within:opacity-100"
      />
      <button
        type="button"
        onClick={() => actions.open(summary)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 py-3 pl-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span className="shrink-0 text-ink-subtle transition-colors duration-150 group-hover:text-accent-ink">
          <SheetIcon size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium leading-tight text-ink">
            {summary.title}
          </span>
          <span className="mt-1 block truncate text-[11px] leading-tight text-ink-subtle">
            <KindAndCount summary={summary} />
            {folder && <FolderTag name={folder} />}
          </span>
        </span>
        <span className="shrink-0 pl-3 text-[11px] tabular-nums text-ink-muted">
          {relativeTime(summary.updatedAt)}
        </span>
      </button>
      <Menu label={`Actions for ${summary.title}`} items={menuItems(summary, actions)} />
    </li>
  );
}

/** " · ▭ Mocks" — which folder, in the facts line. */
function FolderTag({ name }: { name: string }) {
  return (
    <>
      {' · '}
      {/* Plain inline, not flex: the facts line truncates, and an inline-flex box
          cannot be clipped part-way — the whole name would turn into "…". */}
      <FolderIcon size={11} className="mr-0.5 inline-block align-[-1px]" />
      {name || 'Untitled folder'}
    </>
  );
}

function SearchGlyph() {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
