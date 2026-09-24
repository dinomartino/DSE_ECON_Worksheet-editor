'use client';

import { useMemo, useState } from 'react';
import { Segmented } from '@/components/ui';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { SheetIcon } from '@/components/ui/icons';
import { isDesktop, revealLabel } from '@/platform';
import type { WorksheetSummary } from '@/storage';
import { PageThumbnail } from './PageThumbnail';
import {
  DEFAULT_QUERY,
  isFiltered,
  readDashboardView,
  relativeTime,
  visibleSummaries,
  writeDashboardView,
  type DashboardQuery,
  type DashboardView,
  type KindFilter,
  type SortOrder,
} from './dashboard';

/** What a saved document offers besides opening it. The screen owns the doing. */
export interface DocumentActions {
  open: (summary: WorksheetSummary) => void;
  rename: (summary: WorksheetSummary) => void;
  duplicate: (summary: WorksheetSummary) => void;
  download: (summary: WorksheetSummary) => void;
  /** Desktop only: show the stored file in Finder/Explorer. */
  reveal?: (summary: WorksheetSummary) => void;
  remove: (summary: WorksheetSummary) => void;
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
}: {
  summaries: WorksheetSummary[];
  loaded: boolean;
  actions: DocumentActions;
  /** Shown as a quiet "Trash (N)" link beside the count, only when there is any. */
  trashCount?: number;
  onShowTrash?: () => void;
}) {
  const [query, setQuery] = useState<DashboardQuery>(DEFAULT_QUERY);
  // Lazy initialiser: `EditorHost` renders the start screen only after hydration, so
  // reading storage on the first render cannot mismatch the prerendered tree.
  const [view, setView] = useState<DashboardView>(readDashboardView);
  const shown = useMemo(() => visibleSummaries(summaries, query), [summaries, query]);
  const place = isDesktop() ? 'on this computer' : 'in this browser';

  const chooseView = (next: DashboardView) => {
    setView(next);
    writeDashboardView(next);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
          {isDesktop() ? 'Saved on this computer' : 'Saved in this browser'}
        </h2>
        <span className="flex items-baseline gap-3 text-[11px] tabular-nums text-ink-subtle">
          {summaries.length > 0 && (
            <span>
              {shown.length === summaries.length
                ? plural(summaries.length, 'document')
                : `${shown.length} of ${plural(summaries.length, 'document')}`}
            </span>
          )}
          {trashCount > 0 && onShowTrash && (
            <button
              type="button"
              onClick={onShowTrash}
              className="cursor-pointer font-medium text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Trash ({trashCount})
            </button>
          )}
        </span>
      </div>

      {/* The controls only appear once there is something to control; on an empty
          desk they would be four inert widgets around a sentence. */}
      {loaded && summaries.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
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
            <DocumentCard key={summary.id} summary={summary} actions={actions} />
          ))}
        </ul>
      ) : (
        <ul className="zone-light mt-5 overflow-hidden rounded-xl border border-line bg-surface">
          {shown.map((summary) => (
            <SavedRow key={summary.id} summary={summary} actions={actions} />
          ))}
        </ul>
      )}
    </div>
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
}: {
  summary: WorksheetSummary;
  actions: DocumentActions;
}) {
  return (
    <li className="group relative min-w-0">
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
function SavedRow({ summary, actions }: { summary: WorksheetSummary; actions: DocumentActions }) {
  return (
    <li className="group relative flex items-center gap-3 border-b border-line pr-1.5 last:border-b-0 transition-colors duration-150 ease-[var(--ease-out-soft)] hover:bg-surface-hover">
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
