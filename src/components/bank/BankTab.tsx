'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { pickFill } from '@/library/fill';
import { groupRows } from '@/library/group';
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
import { TOPICS } from '@/model/topics';
import { listQuestionTypes } from '@/registry';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { BankRow, typeLabel } from './BankRow';
import { insertFromBank } from './bankSession';
import { emptySentence, typePlural } from './tabText';

/**
 * The editor's 題庫 tab: find questions in the other saved documents and insert copies
 * after the anchor, or Fill a set by topic. Sticky (§ Sidebar): while open, a click on the
 * page moves the anchor. Rows are text; the page is where a copy is seen at full size.
 */

const PAGE = 60;
const FILL_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

const TOPIC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Any topic' },
  ...TOPICS.flatMap((topic) => [
    { value: topic.code, label: `${topic.code} · ${topic.en}` },
    ...topic.children.map((child) => ({ value: child.code, label: ` ${child.en}` })),
  ]),
];

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

function InsertButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded px-1 py-0.5 text-xs font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-50"
    >
      Insert
    </button>
  );
}

export function BankTab() {
  const { status, rows, refresh } = useBank();
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const anchorId = useWorksheetStore((s) => s.insertAnchorId);
  const language = useWorksheetStore((s) => s.mode.language);

  const [filters, setFilters] = useState<TabFilters>(NO_FILTERS);
  const [expanded, setExpanded] = useState<string | undefined>();
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [fillCount, setFillCount] = useState(4);
  const [fillType, setFillType] = useState<string | undefined>();
  const [fillTopic, setFillTopic] = useState<string | undefined>();

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
  const anchor = anchorLabel(worksheet, anchorId);
  // Nothing to filter: the empty state stands alone rather than under inert controls.
  const emptyBank = status.state === 'ready' && base.length === 0;

  const update = (patch: Partial<TabFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setLimit(PAGE);
  };

  const run = async (picked: readonly BankRowData[]) => {
    if (busy || !picked.length) return;
    setBusy(true);
    try {
      const report = await insertFromBank(picked);
      if (report.missing.length) {
        const n = report.missing.length;
        useAppDialogs
          .getState()
          .notify(`${n} question${n === 1 ? '' : 's'} changed since the bank was read, so ${n === 1 ? 'it was' : 'they were'} skipped.`);
        refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  // Fill: its own type and topic, following the filters until set.
  const effectiveFillType = fillType ?? (filters.typeId || types[0]?.id || '');
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
                inPaper={inPaper ? { ...(inPaper.number !== undefined ? { number: inPaper.number } : {}) } : undefined}
                usedWithClass={usedWith(group, paperRefs)}
                versions={group.versions}
                onVersions={() => setExpanded((open) => (open === group.rootId ? undefined : group.rootId))}
                onSelect={inPaper ? () => useWorksheetStore.getState().select(inPaper.questionId) : undefined}
                action={<InsertButton disabled={busy} onClick={() => void run([row])} />}
              />
              {others.length > 0 && (
                <div className="border-b border-line bg-surface-sunken pl-3">
                  {others.map((version) => (
                    <BankRow
                      key={version.questionId + version.docId}
                      row={version}
                      language={language}
                      action={<InsertButton disabled={busy} onClick={() => void run([version])} />}
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
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-line px-3.5 py-2 text-xs text-ink-muted">
        <span className="truncate">
          {anchor ? (
            <>
              Inserts after <span className="font-semibold text-accent-ink">{anchor}</span>
            </>
          ) : (
            'Inserts at the end'
          )}
        </span>
        <span className="shrink-0 text-ink-subtle">click a question to move</span>
      </div>

      {!emptyBank && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-line px-3.5 py-2.5">
          <label className="relative block">
            <span className="sr-only">Search the bank</span>
            <input
              type="search"
              value={filters.text}
              placeholder="Search 搜尋 · both languages"
              onChange={(event) => update({ text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && filters.text) {
                  event.stopPropagation();
                  update({ text: '' });
                }
              }}
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
              {TOPIC_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
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
                <option value="any">Any use</option>
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

      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={status.state === 'scanning'}>
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
              {TOPIC_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </MiniSelect>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={busy || picks.length === 0}
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
                      ? `None used with ${classLabel} · one ⌘Z undoes it`
                      : 'One ⌘Z undoes the set.'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
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
