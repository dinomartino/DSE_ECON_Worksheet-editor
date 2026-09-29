'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BankRow } from '@/components/bank/BankRow';
import { groupRows } from '@/library/group';
import { usedWithClass } from '@/library/history';
import type { BankGroup, BankRow as BankRowData } from '@/library/types';
import { useBank } from '@/library/useBank';
import { isNewerThanBuild } from '@/model/migrations';
import type { Worksheet } from '@/model/types';
import { listQuestionTypes } from '@/registry';
import { worksheetStore, type WorksheetSummary } from '@/storage';
import { useWorksheetStore } from '@/store/worksheetStore';
import {
  activeFilters,
  addTarget,
  bankIsStale,
  classTags,
  clearFilter,
  coverage as coverageOf,
  DEFAULT_FILTERS,
  distinctVersions,
  filterRows,
  MARKS_BANDS,
  rowKey,
  SINCE_CHOICES,
  summariesKey,
  traySummary,
  treeCounts,
  typeName,
  type BankFilters,
  type MarksBand,
  type Since,
  type SourceFilter,
} from './bankPage';
import { BankPreview } from './BankPreview';
import { CoverageStrip } from './CoverageStrip';
import { worksheetFromPicks, type PickedQuestion } from './fromSelection';
import { SelectionTray } from './SelectionTray';
import { TopicPickerDialog } from './TopicPickerDialog';
import { TopicTree } from './TopicTree';
import { addTopics, replaceTopics, writeTags, type TagEdit, type TagWrite } from './writeBack';
import { addPicksToOpenDocument } from './addToOpen';

/** Groups drawn at first; more on request, so a 900-question bank never renders at once. */
const PAGE = 120;

/** The summaries the index was last refreshed for (per session): at most one catch-up per change. */
let refreshedFor: string | undefined;

type Picker = { mode: 'edit'; row: BankRowData } | { mode: 'bulk' };

/**
 * The start screen's Question bank 題庫 tab: every question in every saved worksheet, by
 * topic. Coverage strip, Topics tree (in the Folders slot), grouped list with filters,
 * a Teacher-version preview, and a selection tray that builds a paper.
 *
 * Writes (topics) go straight into the owning documents: no editor is mounted while the
 * start screen is up (see `writeBack.ts`), so nothing in memory can save over them.
 */
export function QuestionBankPage({
  summaries,
  loaded,
  onOpenDocument,
  onOpenWorksheet,
  onDocumentsChanged,
  onNotice,
  onError,
  onStartNew,
}: {
  summaries: WorksheetSummary[];
  loaded: boolean;
  /** Open a saved document the start screen's way; `then` runs once it is in the editor's store. */
  onOpenDocument: (docId: string, then?: () => void) => void;
  /** Open a document built here (already complete; the host saves it on open). */
  onOpenWorksheet: (worksheet: Worksheet) => void;
  /** Saved documents changed under the start screen: re-read the list. */
  onDocumentsChanged: () => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  onStartNew: () => void;
}) {
  const { rows, status, refresh } = useBank();
  const [filters, setFilters] = useState<BankFilters>(DEFAULT_FILTERS);
  const [focusKey, setFocusKey] = useState<string>();
  const [picks, setPicks] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [picker, setPicker] = useState<Picker>();
  const [busy, setBusy] = useState(false);
  const [docs, setDocs] = useState<ReadonlyMap<string, Worksheet | null>>(new Map());

  // The index catches up with documents saved since it last read them (an edit in the
  // editor, a rename here). Once per change of the saved list — a document that yields no
  // rows would otherwise read stale forever and rescan in a loop.
  const savedKey = summariesKey(summaries);
  useEffect(() => {
    if (!loaded || refreshedFor === savedKey) return;
    if (status.state === 'ready' && bankIsStale(rows, summaries, status)) {
      refreshedFor = savedKey;
      refresh();
    }
  }, [loaded, savedKey, rows, summaries, status, refresh]);

  const byKey = useMemo(() => new Map(rows.map((row) => [rowKey(row), row])), [rows]);
  const fullGroups = useMemo(() => new Map(groupRows(rows).map((group) => [group.rootId, group])), [rows]);
  const cover = useMemo(() => coverageOf(rows), [rows]);
  const counts = useMemo(() => treeCounts(filterRows(rows, { ...filters, topic: 'all' })), [rows, filters]);
  const groups = useMemo(() => groupRows(filterRows(rows, filters)), [rows, filters]);
  const classes = useMemo(() => classTags(rows), [rows]);

  const pickedRows = picks.map((key) => byKey.get(key)).filter((row): row is BankRowData => row !== undefined);
  const pickedSet = new Set(pickedRows.map(rowKey));
  const focused = (focusKey ? byKey.get(focusKey) : undefined) ?? groups[0]?.rows[0];
  const focusedGroup = focused ? fullGroups.get(focused.rootId) : undefined;
  const docKey = focused ? `${focused.docId}@${focused.docUpdatedAt}` : undefined;

  // The focused question's document, read once per saved version.
  useEffect(() => {
    if (!focused || !docKey || docs.has(docKey)) return;
    let live = true;
    worksheetStore.load(focused.docId).then(
      (worksheet) => live && setDocs((current) => new Map(current).set(docKey, worksheet ?? null)),
      () => live && setDocs((current) => new Map(current).set(docKey, null)),
    );
    return () => {
      live = false;
    };
  }, [focused, docKey, docs]);
  const focusedDoc = docKey ? docs.get(docKey) : undefined;

  const togglePick = (row: BankRowData) =>
    setPicks((current) => (current.includes(rowKey(row)) ? current.filter((key) => key !== rowKey(row)) : [...current, rowKey(row)]));
  const shownGroups = groups.slice(0, limit);
  const allShownPicked = shownGroups.length > 0 && shownGroups.every((group) => pickedSet.has(rowKey(group.rows[0])));
  const toggleAll = () =>
    setPicks((current) => {
      const keys = shownGroups.map((group) => rowKey(group.rows[0]));
      if (allShownPicked) return current.filter((key) => !keys.includes(key));
      return [...current, ...keys.filter((key) => !current.includes(key))];
    });

  const setFilter = <K extends keyof BankFilters>(key: K, value: BankFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setLimit(PAGE);
  };

  /** The picked questions, read from their documents, in the order picked. */
  const readPicked = useCallback(async (): Promise<PickedQuestion[]> => {
    const loadedDocs = new Map<string, Worksheet | undefined>();
    const out: PickedQuestion[] = [];
    for (const row of pickedRows) {
      if (!loadedDocs.has(row.docId)) loadedDocs.set(row.docId, await worksheetStore.load(row.docId).catch(() => undefined));
      const question = loadedDocs.get(row.docId)?.questions.find((q) => q.id === row.questionId);
      if (question) out.push({ question, fromDocId: row.docId });
    }
    return out;
  }, [pickedRows]);

  const writeTopics = async (writes: TagWrite[], edit: TagEdit, done: (saved: number) => string) => {
    setBusy(true);
    try {
      const report = await writeTags(worksheetStore, writes, edit);
      if (report.saved.length > 0) {
        refresh();
        onDocumentsChanged();
      }
      if (report.failed.length > 0) {
        const title = (id: string) => summaries.find((s) => s.id === id)?.title ?? 'A worksheet';
        onError(report.failed.map((f) => `“${title(f.docId)}” was not changed: ${f.reason}.`).join(' '));
      } else if (report.saved.length > 0) {
        onNotice(done(report.saved.length));
      }
    } finally {
      setBusy(false);
    }
  };

  const newWorksheet = async () => {
    setBusy(true);
    try {
      const picked = await readPicked();
      if (picked.length === 0) {
        onError('Those questions are no longer saved here.');
        return;
      }
      onOpenWorksheet(worksheetFromPicks(picked));
    } finally {
      setBusy(false);
    }
  };

  // Read at render: the editor's store still holds the document open last in this session.
  const target = addTarget(summaries, rows, useWorksheetStore.getState().worksheet.id);
  const addTo = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const picked = await readPicked();
      if (picked.length === 0) {
        onError('Those questions are no longer saved here.');
        return;
      }
      // Opened the start screen's way, then inserted through the store (`addToOpen.ts`).
      onOpenDocument(target.id, () => void addPicksToOpenDocument(picked));
    } finally {
      setBusy(false);
    }
  };

  if (loaded && summaries.length === 0) {
    return (
      <div className="zone-light mt-6 rounded-xl border border-line bg-surface px-6 py-10">
        <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
          Your bank fills itself from the questions in your worksheets. Start one, and every question you
          write appears here, by topic.
        </p>
        <button
          type="button"
          onClick={onStartNew}
          className="mt-3 cursor-pointer text-[12.5px] font-medium text-accent-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Start a classroom worksheet
        </button>
      </div>
    );
  }

  const active = activeFilters(filters);
  const noQuestions = status.state !== 'scanning' && rows.length === 0;
  return (
    <div className="mt-5 flex min-h-0 flex-1 flex-col">
      <CoverageStrip coverage={cover} status={status} topic={filters.topic} onTopic={(topic) => setFilter('topic', topic)} />
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-x-8 gap-y-3 md:flex-row">
        <TopicTree counts={counts} value={filters.topic} onChange={(topic) => setFilter('topic', topic)} />
        <div className="zone-light flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface md:min-h-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line px-3 py-2.5">
            <label className="relative min-w-[160px] flex-1">
              <span className="sr-only">Search questions</span>
              <input
                type="search"
                value={filters.text}
                placeholder="Search 搜尋"
                onChange={(event) => setFilter('text', event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && filters.text) {
                    event.stopPropagation();
                    setFilter('text', '');
                  }
                }}
                className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
              <SearchGlyph />
            </label>
            <FilterSelect
              label="Type"
              value={filters.typeId ?? ''}
              onChange={(value) => setFilter('typeId', value || undefined)}
              options={[{ value: '', label: 'Any type' }, ...listQuestionTypes().map((type) => ({ value: type.id, label: typeName(type.id) }))]}
            />
            <FilterSelect
              label="Marks"
              value={filters.marks}
              onChange={(value) => setFilter('marks', value as MarksBand)}
              options={MARKS_BANDS.map((band) => ({ value: band.value, label: band.label }))}
            />
            <FilterSelect
              label="Not used with a class"
              value={filters.notUsedWith ?? ''}
              disabled={classes.length === 0}
              title={classes.length === 0 ? 'Give a worksheet a class in Setup to use this' : undefined}
              onChange={(value) => setFilters((current) => ({ ...current, notUsedWith: value || undefined, since: value ? current.since : 'ever' }))}
              options={[
                { value: '', label: classes.length === 0 ? 'No classes yet' : 'Any class' },
                ...classes.map((tag) => ({ value: tag, label: `Not used with ${tag}` })),
              ]}
            />
            {filters.notUsedWith && (
              <FilterSelect
                label="Since"
                value={filters.since}
                onChange={(value) => setFilter('since', value as Since)}
                options={SINCE_CHOICES.map((choice) => ({ value: choice.value, label: choice.label }))}
              />
            )}
            <FilterSelect
              label="Source"
              value={filters.source}
              onChange={(value) => setFilter('source', value as SourceFilter)}
              options={[
                { value: 'all', label: 'All sources' },
                { value: 'paper', label: 'Worksheets' },
                { value: 'bank', label: 'Banks' },
              ]}
            />
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_clamp(248px,42%,340px)]">
            <div className="scroll-slim min-h-0 overflow-y-auto" role="list" aria-label="Questions">
              {groups.length > 0 && (
                <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-line bg-surface px-3.5 py-1.5 text-[11px] tabular-nums text-ink-subtle">
                  <input
                    type="checkbox"
                    aria-label={allShownPicked ? 'Unselect the questions shown' : 'Select the questions shown'}
                    checked={allShownPicked}
                    onChange={toggleAll}
                    className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                  />
                  <span className="flex-1">
                    {groups.length} {groups.length === 1 ? 'question' : 'questions'}
                  </span>
                  {status.state === 'scanning' && (
                    <span role="status">
                      Reading · {status.done} of {status.total}
                    </span>
                  )}
                </div>
              )}
              {groups.length === 0 ? (
                <EmptyList>
                  {status.state === 'scanning' ? (
                    <p role="status">
                      Reading your worksheets
                      {status.total > 0 && (
                        <span className="tabular-nums">
                          {' '}
                          · {status.done} of {status.total}
                        </span>
                      )}
                      …
                    </p>
                  ) : noQuestions ? (
                    <p>No questions yet. Every question you write in a worksheet appears here, by topic.</p>
                  ) : active.length === 1 && filters.topic === 'untagged' ? (
                    <p>Every question has a topic.</p>
                  ) : (
                    <>
                      <p>Nothing matches {active.map((filter) => filter.label).join(' · ')}.</p>
                      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {active.map((filter) => (
                          <TextButton key={filter.key} onClick={() => setFilters((current) => clearFilter(current, filter.key))}>
                            Clear {filter.label}
                          </TextButton>
                        ))}
                        {active.length > 1 && <TextButton onClick={() => setFilters(DEFAULT_FILTERS)}>Clear all</TextButton>}
                      </p>
                    </>
                  )}
                </EmptyList>
              ) : (
                <>
                  {shownGroups.map((group) => (
                    <GroupRows
                      key={group.rootId}
                      group={group}
                      full={fullGroups.get(group.rootId)}
                      focusedKey={focused ? rowKey(focused) : undefined}
                      picked={pickedSet}
                      expanded={expanded.has(group.rootId)}
                      classTag={filters.notUsedWith}
                      onFocus={(row) => setFocusKey(rowKey(row))}
                      onPick={togglePick}
                      onVersions={() =>
                        setExpanded((current) => {
                          const next = new Set(current);
                          if (next.has(group.rootId)) next.delete(group.rootId);
                          else next.add(group.rootId);
                          return next;
                        })
                      }
                    />
                  ))}
                  {groups.length > limit && (
                    <div className="px-3.5 py-3">
                      <TextButton onClick={() => setLimit((current) => current + PAGE)}>
                        Show {Math.min(PAGE, groups.length - limit)} more
                      </TextButton>
                    </div>
                  )}
                </>
              )}
            </div>
            <BankPreview
              key={focused ? rowKey(focused) : 'none'}
              row={focused}
              group={focusedGroup}
              worksheet={focusedDoc ?? undefined}
              loadFailed={focusedDoc === null}
              classTag={filters.notUsedWith}
              onEditTopics={
                focused && focusedDoc && !isNewerThanBuild(focusedDoc) ? () => setPicker({ mode: 'edit', row: focused }) : undefined
              }
              onOpen={() => focused && onOpenDocument(focused.docId, () => useWorksheetStore.getState().select(focused.questionId))}
            />
          </div>
        </div>
      </div>
      {pickedRows.length > 0 && (
        <div className="zone-light mt-3 overflow-hidden rounded-xl border border-line">
          <SelectionTray
            summary={traySummary(pickedRows)}
            targetTitle={target?.title}
            busy={busy}
            onClear={() => setPicks([])}
            onSetTopic={() => setPicker({ mode: 'bulk' })}
            onAddTo={() => void addTo()}
            onNewWorksheet={() => void newWorksheet()}
          />
        </div>
      )}

      {picker?.mode === 'edit' && (
        <TopicPickerDialog
          title="Topics"
          description={`Saved into “${picker.row.docTitle}”${picker.row.number !== undefined ? ` · Q${picker.row.number}` : ''}. Other copies keep their own.`}
          initial={picker.row.tags}
          confirmLabel="Save topics"
          onClose={() => setPicker(undefined)}
          onDone={(codes) => {
            const row = picker.row;
            setPicker(undefined);
            void writeTopics([{ docId: row.docId, questionId: row.questionId }], replaceTopics(codes), () => 'Topics saved.');
          }}
        />
      )}
      {picker?.mode === 'bulk' && (
        <TopicPickerDialog
          title={`Set topic for ${pickedRows.length} ${pickedRows.length === 1 ? 'question' : 'questions'}`}
          description="Adds the topics you tick. Topics already on a question stay."
          initial={[]}
          confirmLabel="Add topics"
          onClose={() => setPicker(undefined)}
          onDone={(codes) => {
            const writes = pickedRows.map((row) => ({ docId: row.docId, questionId: row.questionId }));
            setPicker(undefined);
            if (codes.length === 0) return;
            void writeTopics(writes, addTopics(codes), (saved) =>
              `Tagged ${writes.length} ${writes.length === 1 ? 'question' : 'questions'} in ${saved} ${saved === 1 ? 'worksheet' : 'worksheets'}.`,
            );
          }}
        />
      )}
    </div>
  );
}

/** A group's row, and — expanded — each of its other versions under it. */
function GroupRows({
  group,
  full,
  focusedKey,
  picked,
  expanded,
  classTag,
  onFocus,
  onPick,
  onVersions,
}: {
  group: BankGroup;
  /** The same question across the whole bank (versions and uses are never filtered). */
  full: BankGroup | undefined;
  focusedKey: string | undefined;
  picked: ReadonlySet<string>;
  expanded: boolean;
  classTag?: string;
  onFocus: (row: BankRowData) => void;
  onPick: (row: BankRowData) => void;
  onVersions: () => void;
}) {
  const lead = group.rows[0];
  const whole = full ?? group;
  const used = classTag ? usedWithClass(whole, classTag) : undefined;
  const others = expanded ? distinctVersions(whole).filter((row) => row.contentKey !== lead.contentKey) : [];
  const box = (row: BankRowData) => (
    <input
      type="checkbox"
      aria-label={`Select “${row.excerpt.en || row.excerpt.zh || 'question'}”`}
      checked={picked.has(rowKey(row))}
      onChange={() => onPick(row)}
      className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
    />
  );
  return (
    <div role="listitem">
      <BankRow
        row={lead}
        leading={box(lead)}
        usedWithClass={used}
        versions={whole.versions}
        onVersions={onVersions}
        selected={focusedKey === rowKey(lead)}
        onSelect={() => onFocus(lead)}
      />
      {others.length > 0 && (
        <div className="border-b border-line bg-surface-sunken pl-5">
          {others.map((row) => (
            <BankRow key={rowKey(row)} row={row} leading={box(row)} selected={focusedKey === rowKey(row)} onSelect={() => onFocus(row)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  title,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <select
      aria-label={label}
      title={title ?? label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`h-8 max-w-[190px] cursor-pointer rounded-lg border bg-surface px-2 text-[12px] outline-none transition-colors duration-150 ease-out-soft focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:cursor-default disabled:opacity-50 ${
        value && value !== options[0]?.value ? 'border-line-strong text-ink' : 'border-line text-ink-muted'
      }`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function EmptyList({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-[12.5px] leading-relaxed text-ink-muted">{children}</div>;
}

function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer text-[12px] font-medium text-accent-ink underline decoration-line-strong underline-offset-4 transition-[text-decoration-color] duration-150 ease-out-soft hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </button>
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
