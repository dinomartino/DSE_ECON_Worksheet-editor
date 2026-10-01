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
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage, useMessages, useUiLanguage } from '@/i18n/language';
import { TOPICS, topicHeading } from '@/model/topics';
import { listQuestionTypes } from '@/registry';
import { useAppDialogs } from '@/store/appDialogs';
import { unanchoredQuestionSectionLabel, useWorksheetStore } from '@/store/worksheetStore';
import { BankRow, typeLabel } from './BankRow';
import { insertFromBank, type InsertReport } from './bankSession';
import { useBankDrag, useBankRowDrag } from './bankDrag';
import { BANK_TAB_MESSAGES } from './messages';
import { emptySentence, markBandLabel, typePlural } from './tabText';
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
function topicGroups(names: 'en' | 'zh', allOf: (code: string, name: string) => string) {
  return TOPICS.map((topic) => ({
    label: `${topic.code} · ${topic[names]}`,
    options: [
      { value: topic.code, label: allOf(topic.code, topic[names]) },
      ...topic.children.map((child) => ({ value: child.code, label: child[names] })),
    ],
  }));
}

function TopicOptions() {
  const m = useMessages(BANK_TAB_MESSAGES);
  const zh = useUiLanguage() === 'zh-HK';
  const groups = useMemo(() => topicGroups(zh ? 'zh' : 'en', m.allOfTopic), [zh, m]);
  return (
    <>
      <option value="">{m.anyTopic}</option>
      {groups.map((group) => (
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
  const m = useMessages(BANK_TAB_MESSAGES);
  const ui = useUiLanguage();
  const topicNames = ui === 'zh-HK' ? 'zh' : 'en';
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
        unanchoredQuestionSectionLabel(worksheet, typeId),
      ));
  const anchor = anchorId ? anchorLabel(worksheet, anchorId) : undefined;
  const splitDestinations = (typeDestinations?.size ?? 0) > 1;
  const section = splitDestinations ? undefined : typeDestinations?.values().next().value;
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
      useAppDialogs.getState().notify(resolveMessages(BANK_TAB_MESSAGES, uiLanguage()).skipped(n));
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
    drag.sourceProps(row, rowKey(row), (language === 'zh' ? row.excerpt.zh || row.excerpt.en : row.excerpt.en || row.excerpt.zh) || m.fallbackLabel);
  // No visible button: a focused row takes Enter or Space, and copies after the anchor.
  const where = splitDestinations
    ? m.whereSplit
    : anchor
      ? m.whereAfter(anchor)
      : section
        ? m.whereIn(section)
        : m.whereEnd;
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
      activateHint: m.rowHint(where),
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
        return m.filterText(filters.text.trim());
      case 'topic':
        return topicHeading(filters.topic, topicNames);
      case 'typeId':
        return typeLabel(filters.typeId);
      case 'marks':
        return MARK_BANDS.some((band) => band.value === filters.marks) ? markBandLabel(filters.marks, ui) : m.filterMarks;
      case 'notUsedWithClass':
        return m.filterNotUsed(classLabel ?? '');
      case 'from':
        return filters.from === 'banks'
          ? m.filterBanksOnly
          : m.filterFrom(
              documents.find((doc) => typeof filters.from === 'object' && doc.docId === filters.from.docId)?.title ??
                m.filterOneWorksheet,
            );
    }
  };

  let body: ReactNode;
  if (rows.length === 0 && status.state === 'scanning') {
    body = (
      <StateNote>
        {m.scanning}
        {status.total > 0 && <span className="tabular-nums">{m.scanProgress(status.done, status.total)}</span>}
      </StateNote>
    );
  } else if (rows.length === 0 && status.state === 'error') {
    body = (
      <StateNote>
        {m.scanError} <LinkButton onClick={refresh}>{m.tryAgain}</LinkButton>
      </StateNote>
    );
  } else if (base.length === 0) {
    body = (
      <StateNote>
        {m.bankEmpty}
        <span className="mt-1 block text-ink-subtle">{m.bankEmptyHint}</span>
      </StateNote>
    );
  } else if (visible.length === 0) {
    const blocking = blockingFilter(rows, filters, ctx);
    body = (
      <StateNote>
        {emptySentence(filters, classLabel, ui)}{' '}
        {blocking ? (
          <LinkButton onClick={() => update(clearFilter(filters, blocking))}>{m.clearFilterBtn(filterLabel(blocking))}</LinkButton>
        ) : (
          <LinkButton onClick={() => update(NO_FILTERS)}>{m.clearFilters}</LinkButton>
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
                      differs={versionDiff(version, row, language, ui)}
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
            <LinkButton onClick={() => setLimit((n) => n + PAGE)}>{m.showMore(Math.min(PAGE, visible.length - limit))}</LinkButton>
          </div>
        )}
      </>
    );
  }

  // Fill prefers questions not used with the class; say so when it had to take some.
  const usedCount = picks.filter((group) => usedWith(group, paperRefs)).length;
  const fillTopicLabel = effectiveFillTopic ? topicHeading(effectiveFillTopic, topicNames) : m.anyTopicLower;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="shrink-0 truncate border-b border-line px-3.5 py-2 text-xs text-ink-muted">
        {readOnly ? (
          m.readOnly
        ) : printPreview ? (
          m.leavePreview
        ) : (
          <>
            {m.dragHint}
            {ui === 'en' && <span className="text-ink-subtle"> 拖到頁面上插入</span>}
          </>
        )}
      </p>

      {!emptyBank && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-line px-3.5 py-2.5">
          <label className="relative block">
            <span className="sr-only">{m.searchBank}</span>
            <input
              type="search"
              value={filters.text}
              placeholder={m.searchPlaceholder}
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
            <MiniSelect label={m.topic} value={filters.topic} onChange={(topic) => update({ topic })} className="flex-[1.6]">
              <TopicOptions />
            </MiniSelect>
            <MiniSelect label={m.type} value={filters.typeId} onChange={(typeId) => update({ typeId })} className="flex-1">
              <option value="">{m.anyType}</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {typeLabel(type.id)}
                </option>
              ))}
            </MiniSelect>
            <MiniSelect label={m.marks} value={filters.marks} onChange={(marks) => update({ marks: marks as MarkBand })} className="flex-1">
              {MARK_BANDS.map((band) => (
                <option key={band.value} value={band.value}>
                  {markBandLabel(band.value, ui)}
                </option>
              ))}
            </MiniSelect>
          </div>
          <div className="flex gap-1.5">
            {classLabel && (
              <MiniSelect
                label={m.classLabel}
                value={filters.notUsedWithClass ? 'not' : 'any'}
                onChange={(value) => update({ notUsedWithClass: value === 'not' })}
                className="flex-1"
              >
                <option value="any">{m.anyClass}</option>
                <option value="not">{m.notUsedWith(classLabel)}</option>
              </MiniSelect>
          )}
          <MiniSelect label={m.from} value={fromValue(filters.from)} onChange={(value) => update({ from: parseFrom(value) })} className="flex-1">
            <option value="all">{m.fromAll}</option>
            {hasBanks && <option value="banks">{m.fromBanks}</option>}
            {documents.map((doc) => (
              <option key={doc.docId} value={`doc:${doc.docId}`}>
                {m.fromDoc(doc.title)}
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
            <span className="shrink-0 font-semibold text-ink">{m.fill}</span>
            <MiniSelect label={m.howMany} value={String(fillCount)} onChange={(value) => setFillCount(Number(value))} className="shrink-0">
              {FILL_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </MiniSelect>
            <MiniSelect label={m.fillType} value={effectiveFillType} onChange={setFillType} className="w-[6.5rem] shrink-0">
              <option value="">{m.fillQuestions}</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {typePlural(type.id, ui)}
                </option>
              ))}
            </MiniSelect>
            <span className="shrink-0">{m.fillFrom}</span>
            <MiniSelect label={m.fillTopic} value={effectiveFillTopic} onChange={setFillTopic} className="flex-1">
              <TopicOptions />
            </MiniSelect>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={busy || picks.length === 0}
              title={m.addsWhere(where)}
              onClick={() => void run(picks.map((group) => group.rows[0]))}
              className="h-7 shrink-0 cursor-pointer rounded-md bg-cta px-3 text-xs font-semibold text-on-cta transition-[background-color,opacity,scale] duration-150 ease-out-soft hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 active:scale-[0.97] disabled:cursor-default disabled:opacity-45"
            >
              {m.addN(picks.length)}
            </button>
            <span className={`min-w-0 truncate ${usedCount > 0 ? 'text-warn-ink' : 'text-ink-subtle'}`}>
              {picks.length === 0
                ? m.nothingLeft(fillTopicLabel)
                : usedCount > 0
                  ? m.alreadyUsed(usedCount, classLabel ?? '')
                  : picks.length < fillCount
                    ? m.onlyLeft(picks.length, fillTopicLabel)
                    : classLabel
                      ? m.noneUsed(classLabel, where)
                      : m.undoesOne(where)}
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
