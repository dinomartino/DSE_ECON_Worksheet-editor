'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { pickFill } from '@/library/fill';
import { slotsMatching } from '@/library/slotMatch';
import { groupRows } from '@/library/group';
import { paperTypeFilter } from '@/library/paperTypes';
import { classesLabel } from '@/library/cohort';
import { usedWith } from '@/library/history';
import {
  MARK_BANDS,
  NO_FILTERS,
  anchorLabel,
  bankRowsBesides,
  blockingFilter,
  clearFilter,
  fromDocuments,
  paperClasses,
  paperRoots,
  rowKey,
  topicName,
  versionRows,
  visibleGroups,
  type FilterKey,
  type FromFilter,
  type MarkBand,
  type TabContext,
  type TabFilters,
} from '@/library/tabFilters';
import type { BankRow as BankRowData } from '@/library/types';
import { useBank } from '@/library/useBank';
import { escapeClears } from './escapeClears';
import { TOPICS } from '@/model/topics';
import { listQuestionTypes } from '@/registry';
import { useAppDialogs } from '@/store/appDialogs';
import { unanchoredQuestionAfter, useWorksheetStore } from '@/store/worksheetStore';
import { BankRow, typeLabel } from './BankRow';
import { insertFromBank, type InsertReport } from './bankSession';
import { useBankDrag, useBankRowDrag } from './bankDrag';
import { emptySentence, typePlural } from './tabText';
import { versionDiff } from './bankText';

/**
 * The editor's 題庫 tab: find questions in the other saved documents and drag copies onto
 * the page, which shows the result before the drop (`bankDrag.tsx`), or Fill a set by topic.
 * The keyboard path is Enter on a focused row: copies after the anchor. Sticky (§ Sidebar):
 * while open, a click on the page moves the anchor. Rows are text; the page shows a copy.
 */

const PAGE = 60;
const FILL_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

/** Each topic an optgroup: the whole topic first, then its sub-topics. */
const TOPIC_GROUPS = TOPICS.map((topic) => ({
  label: `${topic.code} · ${topic.en}`,
  options: [
    { value: topic.code, label: `All of ${topic.code} · ${topic.en}` },
    ...topic.children.map((child) => ({ value: child.code, label: child.en })),
  ],
}));

function TopicOptions() {
  return (
    <>
      <option value="">Any topic</option>
      {TOPIC_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function fromValue(from: FromFilter): string {
  return typeof from === 'object' ? `doc:${from.docId}` : from;
}

function parseFrom(value: string): FromFilter {
  return value.startsWith('doc:') ? { docId: value.slice(4) } : value === 'banks' ? 'banks' : 'all';
}

function MiniSelect({
  label,
  value,
  onChange,
  children,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      title={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-7 min-w-0 cursor-pointer truncate rounded-md border border-line bg-surface px-1.5 text-xs text-ink outline-none transition-colors duration-150 ease-out-soft hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/25 ${className}`}
    >
      {children}
    </select>
  );
}

export function BankTab() {
  const { status, rows, refresh } = useBank();
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const anchorId = useWorksheetStore((s) => s.insertAnchorId);
  const language = useWorksheetStore((s) => s.mode.language);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  const printPreview = useWorksheetStore((s) => s.printPreview);

  // The type filter starts on what this paper takes (Paper 1: MCQs); a classroom sheet takes any.
  const [filters, setFilters] = useState<TabFilters>(() => ({ ...NO_FILTERS, typeId: paperTypeFilter(worksheet) }));
  const [expanded, setExpanded] = useState<string | undefined>();
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [fillCount, setFillCount] = useState(4);
  const [fillType, setFillType] = useState<string | undefined>();
  const [fillTopic, setFillTopic] = useState<string | undefined>();
  // Another paper opened under the open tab: its own type, and Fill follows it again.
  const [filtersFor, setFiltersFor] = useState(worksheet.id);
  if (filtersFor !== worksheet.id) {
    setFiltersFor(worksheet.id);
    setFilters((current) => ({ ...current, typeId: paperTypeFilter(worksheet) }));
    setFillType(undefined);
  }

  // Opening the tab reads the store again: papers saved since the last scan show up.
  useEffect(() => refresh(), [refresh]);

  // The open paper's classes on its use date; none = a draft, and the class filter hides.
  const { classes, satOn, createdAt } = worksheet;
  const paperRefs = useMemo(() => paperClasses({ classes, satOn, createdAt }), [classes, satOn, createdAt]);
  const classLabel = paperRefs.length > 0 ? classesLabel(paperRefs) : undefined;
  const ctx: TabContext = useMemo(() => ({ openDocId: worksheet.id, classes: paperRefs }), [worksheet.id, paperRefs]);
  const types = useMemo(() => listQuestionTypes(), []);
  const base = useMemo(() => bankRowsBesides(rows, ctx.openDocId), [rows, ctx.openDocId]);
  const baseGroups = useMemo(() => groupRows(base), [base]);
  const visible = useMemo(() => visibleGroups(rows, filters, ctx), [rows, filters, ctx]);
  const roots = useMemo(() => paperRoots(worksheet), [worksheet]);
  const documents = useMemo(() => fromDocuments(rows, ctx.openDocId), [rows, ctx.openDocId]);
  const hasBanks = documents.some((doc) => doc.kind === 'bank');
  // Rows name their paper as the From list does: two called "Quiz" read apart.
  const docLabels = useMemo(() => new Map(documents.map((doc) => [doc.docId, doc.title])), [documents]);
  // With no anchor, a question lands in the section for its type (or the first section of
  // an empty sectioned document): the Type filter names the type, else each row may differ.
  const typeDestinations = anchorId
    ? undefined
    : new Set((filters.typeId ? [filters.typeId] : types.map((type) => type.id)).map((typeId) =>
        anchorLabel(worksheet, unanchoredQuestionAfter(worksheet, typeId)),
      ));
  const anchor = anchorId ? anchorLabel(worksheet, anchorId) : typeDestinations?.values().next().value;
  const splitDestinations = (typeDestinations?.size ?? 0) > 1;
  // Nothing to filter: the empty state stands alone rather than under inert controls.
  const emptyBank = status.state === 'ready' && base.length === 0;

  const update = (patch: Partial<TabFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setLimit(PAGE);
  };

  const reportMissing = useCallback(
    (report: InsertReport) => {
      if (!report.missing.length) return;
      const n = report.missing.length;
      useAppDialogs
        .getState()
        .notify(`${n} question${n === 1 ? '' : 's'} changed since the bank was read, so ${n === 1 ? 'it was' : 'they were'} skipped.`);
      refresh();
    },
    [refresh],
  );

  const run = async (picked: readonly BankRowData[]) => {
    if (busy || !picked.length) return;
    setBusy(true);
    try {
      reportMissing(await insertFromBank(picked));
    } finally {
      setBusy(false);
    }
  };

  // Print preview shows the sheets as they print; a read-only document takes nothing.
  const drag = useBankRowDrag({ enabled: !readOnly && !printPreview && !busy, onReport: reportMissing });
  const draggingKey = useBankDrag((s) => s.active?.key);
  const dragFor = (row: BankRowData) =>
    drag.sourceProps(row, rowKey(row), (language === 'zh' ? row.excerpt.zh || row.excerpt.en : row.excerpt.en || row.excerpt.zh) || 'Question');
  // No visible button: a focused row takes Enter or Space, and copies after the anchor.
  const where = splitDestinations ? 'in the section for its type' : anchor ? `after ${anchor}` : 'at the end';
  // One Tab stop for the list: the row last focused (else the first); ↑ ↓ move between rows.
  const [stopKey, setStopKey] = useState<string>();
  // The rows Enter inserts, in list order (rows already in the paper are not among them).
  const stops = readOnly
    ? []
    : visible.slice(0, limit).flatMap(({ group, row }) => [
        ...(roots.has(group.rootId) ? [] : [rowKey(row)]),
        ...(expanded === group.rootId ? versionRows(group).filter((v) => v.contentKey !== row.contentKey).map(rowKey) : []),
      ]);
  const tabStop = stopKey !== undefined && stops.includes(stopKey) ? stopKey : stops[0];
  const keyboardFor = (row: BankRowData) => {
    if (readOnly) return {};
    return {
      onActivate: () => void run([row]),
      activateHint: `Drag onto the page, or press Enter to insert ${where}. Up and down arrows move between questions.`,
      tabIndex: rowKey(row) === tabStop ? (0 as const) : (-1 as const),
    };
  };

  // A topic filter set: the parts of a long question that test it, when not every part does.
  const partsFor = (row: BankRowData) => {
    if (!filters.topic) return undefined;
    const labels = slotsMatching(row, { topic: filters.topic }).map((slot) => slot.label);
    return labels.length > 0 ? { labels, topic: filters.topic } : undefined;
  };

  // Fill: its own type and topic, following the filters (so the paper's type) until set.
  const effectiveFillType = fillType ?? filters.typeId;
  const effectiveFillTopic = fillTopic ?? filters.topic;
  const picks = useMemo(
    () =>
      pickFill(baseGroups, {
        count: fillCount,
        ...(effectiveFillType ? { typeId: effectiveFillType } : {}),
        ...(effectiveFillTopic ? { topic: effectiveFillTopic } : {}),
        usedWith: paperRefs,
        excludeRootIds: roots.keys(),
      }),
    [baseGroups, fillCount, effectiveFillType, effectiveFillTopic, paperRefs, roots],
  );

  const filterLabel = (key: FilterKey): string => {
    switch (key) {
      case 'text':
        return `“${filters.text.trim()}”`;
      case 'topic':
        return topicName(filters.topic);
      case 'typeId':
        return typeLabel(filters.typeId);
      case 'marks':
        return MARK_BANDS.find((band) => band.value === filters.marks)?.label ?? 'marks';
      case 'notUsedWithClass':
        return `not used with ${classLabel}`;
      case 'from':
        return filters.from === 'banks'
          ? 'banks only'
          : `from ${documents.find((doc) => typeof filters.from === 'object' && doc.docId === filters.from.docId)?.title ?? 'one worksheet'}`;
    }
  };

  let body: ReactNode;
  if (rows.length === 0 && status.state === 'scanning') {
    body = (
      <StateNote>
        Reading your worksheets
        {status.total > 0 && (
          <span className="tabular-nums">
            {' '}
            · {status.done} of {status.total}
          </span>
        )}
      </StateNote>
    );
  } else if (rows.length === 0 && status.state === 'error') {
    body = (
      <StateNote>
        Your worksheets could not be read.{' '}
        <LinkButton onClick={refresh}>Try again</LinkButton>
      </StateNote>
    );
  } else if (base.length === 0) {
    body = (
      <StateNote>
        Your bank fills itself from the questions in your saved worksheets.
        <span className="mt-1 block text-ink-subtle">Save another worksheet with questions and they appear here.</span>
      </StateNote>
    );
  } else if (visible.length === 0) {
    const blocking = blockingFilter(rows, filters, ctx);
    body = (
      <StateNote>
        {emptySentence(filters, classLabel)}{' '}
        {blocking ? (
          <LinkButton onClick={() => update(clearFilter(filters, blocking))}>Clear {filterLabel(blocking)}</LinkButton>
        ) : (
          <LinkButton onClick={() => update(NO_FILTERS)}>Clear filters</LinkButton>
        )}
      </StateNote>
    );
  } else {
    body = (
      <>
        {visible.slice(0, limit).map(({ group, row }) => {
          const inPaper = roots.get(group.rootId);
          const others = expanded === group.rootId ? versionRows(group).filter((v) => v.contentKey !== row.contentKey) : [];
          return (
            <div key={group.rootId}>
              <BankRow
                row={row}
                language={language}
                docLabel={docLabels.get(row.docId)}
                inPaper={inPaper ? { ...(inPaper.number !== undefined ? { number: inPaper.number } : {}) } : undefined}
                usedWithClass={usedWith(group, paperRefs)}
                versions={group.versions}
                partsFor={partsFor(row)}
                onVersions={() => setExpanded((open) => (open === group.rootId ? undefined : group.rootId))}
                onSelect={inPaper ? () => useWorksheetStore.getState().select(inPaper.questionId) : undefined}
                drag={inPaper ? undefined : dragFor(row)}
                dragging={draggingKey === rowKey(row)}
                {...(inPaper ? {} : keyboardFor(row))}
              />
              {others.length > 0 && (
                <div className="border-b border-line bg-surface-sunken pl-3">
                  {others.map((version) => (
                    <BankRow
                      key={version.questionId + version.docId}
                      row={version}
                      language={language}
                      docLabel={docLabels.get(version.docId)}
                      differs={versionDiff(version, row, language)}
                      partsFor={partsFor(version)}
                      drag={dragFor(version)}
                      dragging={draggingKey === rowKey(version)}
                      {...keyboardFor(version)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {visible.length > limit && (
          <div className="px-3.5 py-3 text-center">
            <LinkButton onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, visible.length - limit)} more</LinkButton>
          </div>
        )}
      </>
    );
  }

  // Fill prefers questions not used with the class; say so when it had to take some.
  const usedCount = picks.filter((group) => usedWith(group, paperRefs)).length;
  const fillTopicLabel = effectiveFillTopic ? topicName(effectiveFillTopic) : 'any topic';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="shrink-0 truncate border-b border-line px-3.5 py-2 text-xs text-ink-muted">
        {readOnly ? (
          'This paper is read-only.'
        ) : printPreview ? (
          'Leave print preview to drag questions in.'
        ) : (
          <>
            Drag a question onto the page <span className="text-ink-subtle">拖到頁面上插入</span>
          </>
        )}
      </p>

      {!emptyBank && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-line px-3.5 py-2.5">
          <label className="relative block">
            <span className="sr-only">Search the bank</span>
            <input
              type="search"
              value={filters.text}
              placeholder="Search 搜尋 · both languages"
              onChange={(event) => update({ text: event.target.value })}
              onKeyDown={(event) => void escapeClears(event, filters.text, () => update({ text: '' }))}
              className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <svg
              aria-hidden
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
          </label>
          <div className="flex gap-1.5">
            <MiniSelect label="Topic" value={filters.topic} onChange={(topic) => update({ topic })} className="flex-[1.6]">
              <TopicOptions />
            </MiniSelect>
            <MiniSelect label="Type" value={filters.typeId} onChange={(typeId) => update({ typeId })} className="flex-1">
              <option value="">Any type</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {typeLabel(type.id)}
                </option>
              ))}
            </MiniSelect>
            <MiniSelect label="Marks" value={filters.marks} onChange={(marks) => update({ marks: marks as MarkBand })} className="flex-1">
              {MARK_BANDS.map((band) => (
                <option key={band.value} value={band.value}>
                  {band.label}
                </option>
              ))}
            </MiniSelect>
          </div>
          <div className="flex gap-1.5">
            {classLabel && (
              <MiniSelect
                label="Class"
                value={filters.notUsedWithClass ? 'not' : 'any'}
                onChange={(value) => update({ notUsedWithClass: value === 'not' })}
                className="flex-1"
              >
                <option value="any">Any class</option>
                <option value="not">Not used with {classLabel}</option>
              </MiniSelect>
          )}
          <MiniSelect label="From" value={fromValue(filters.from)} onChange={(value) => update({ from: parseFrom(value) })} className="flex-1">
            <option value="all">From: all worksheets</option>
            {hasBanks && <option value="banks">From: banks</option>}
            {documents.map((doc) => (
              <option key={doc.docId} value={`doc:${doc.docId}`}>
                From: {doc.title}
              </option>
            ))}
          </MiniSelect>
        </div>
      </div>

      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        aria-busy={status.state === 'scanning'}
        onFocus={(event) => {
          const at = listRows(event.currentTarget).indexOf(event.target as HTMLElement);
          if (at >= 0 && stops[at] !== stopKey) setStopKey(stops[at]);
        }}
        onKeyDown={(event) => {
          const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
          if (!step) return;
          const rows = listRows(event.currentTarget);
          const at = rows.indexOf(event.target as HTMLElement);
          if (at < 0) return;
          event.preventDefault();
          rows[Math.min(rows.length - 1, Math.max(0, at + step))]?.focus();
        }}
      >
        {body}
      </div>

      {base.length > 0 && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-line-strong bg-surface-sunken px-3.5 py-2.5 text-xs text-ink-muted">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 font-semibold text-ink">Fill</span>
            <MiniSelect label="How many" value={String(fillCount)} onChange={(value) => setFillCount(Number(value))} className="shrink-0">
              {FILL_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </MiniSelect>
            <MiniSelect label="Fill type" value={effectiveFillType} onChange={setFillType} className="w-[6.5rem] shrink-0">
              <option value="">questions</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {typePlural(type.id)}
                </option>
              ))}
            </MiniSelect>
            <span className="shrink-0">from</span>
            <MiniSelect label="Fill topic" value={effectiveFillTopic} onChange={setFillTopic} className="flex-1">
              <TopicOptions />
            </MiniSelect>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={busy || picks.length === 0}
              title={`Adds ${where}`}
              onClick={() => void run(picks.map((group) => group.rows[0]))}
              className="h-7 shrink-0 cursor-pointer rounded-md bg-cta px-3 text-xs font-semibold text-on-cta transition-[background-color,opacity,scale] duration-150 ease-out-soft hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 active:scale-[0.97] disabled:cursor-default disabled:opacity-45"
            >
              Add {picks.length} {picks.length === 1 ? 'question' : 'questions'}
            </button>
            <span className={`min-w-0 truncate ${usedCount > 0 ? 'text-warn-ink' : 'text-ink-subtle'}`}>
              {picks.length === 0
                ? `Nothing left in ${fillTopicLabel}.`
                : usedCount > 0
                  ? `${usedCount} already used with ${classLabel}`
                  : picks.length < fillCount
                    ? `Only ${picks.length} left in ${fillTopicLabel}.`
                    : classLabel
                      ? `None used with ${classLabel} · adds ${where}`
                      : `Adds ${where} · one ⌘Z undoes it`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** The rows a key can reach (the ones Enter inserts), in list order. */
function listRows(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>('[data-bank-row][role="group"]')];
}

function StateNote({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-xs leading-relaxed text-ink-muted">{children}</p>;
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </button>
  );
}
