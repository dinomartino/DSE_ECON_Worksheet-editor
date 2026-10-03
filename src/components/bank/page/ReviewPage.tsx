'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button, Segmented } from '@/components/ui';
import { marksLabel, SourceText, sourceLabel, tagTitle, typeLabel, sittingLabel, usedLabel } from '@/components/bank/BankRow';
import { versionDiff } from '@/components/bank/bankText';
import { refsOf, usedWith as usedWithTargets } from '@/library/history';
import { anySameStudents } from '@/library/cohort';
import type { BankItemTone, BankMark } from '@/assist/bankRun';
import type { BankGroup, BankRow } from '@/library/types';
import { isNewerThanBuild } from '@/model/migrations';
import { isPatternTag } from '@/model/patterns';
import { useMessages } from '@/i18n/language';
import type { LanguageMode, VersionMode } from '@/model/types';
import { distinctVersions, patternLines, rowKey, type ClassChoice } from './bankPage';
import { alsoInText, partsTesting, testsThisText, testsWhatText, topicsByPart, type RailEntry, type RailPart, type RailSection } from './bankScreen';
import { RAIL_WINDOW_FROM, railRows, rowAt, rowOffsets, scrollToShow, visibleRange } from './railWindow';
import { PaperPreview, SHEET_MAX_WIDTH } from './PaperPreview';
import { useOwningDocument } from './useOwningDocument';
import { BANK_PAGE_MESSAGES } from './bankPage.messages';
import { REVIEW_PAGE_MESSAGES } from './ReviewPage.messages';
import { topicName } from './topicText';

export interface ReviewState {
  sections: RailSection[];
  /** The rail's entries in reading order (`railOrder`): a question under two headings is two. */
  order: RailEntry[];
  /** The row on the stage (any copy of a question in `order`). */
  focused: BankRow | undefined;
  /** Its entry's position in `order` (`entryIndex`). */
  index: number;
  /** The questions in the cart, by `rootId`: any copy picked marks the question. */
  picked: ReadonlySet<string>;
  railHidden: boolean;
  language: LanguageMode;
  version: VersionMode;
  /** The Filter's "not used with" students: their uses read amber. */
  usedWith?: ClassChoice;
  /** Each document's name where two share a title (`distinctDocLabels`); default its title. */
  docLabels?: ReadonlyMap<string, string>;
  /** A ✦ review: each reviewed question's tone, by `rootId` (rail marks). */
  aiTones?: ReadonlyMap<string, BankItemTone>;
  /** The questions the "Adding to" paper already holds, by `rootId` (`rootsInPaper`). */
  inTarget?: ReadonlyMap<string, { number?: number }>;
}

/** The ✦ review of the question on the stage: its note above the paper, its marks on it. */
export interface StageAi {
  note?: ReactNode;
  marks?: readonly BankMark[];
}

const AI_TONE = {
  inserted: { className: 'text-accent-ink', title: 'aiFilled' }, // i18n-ignore: catalogue key
  look: { className: 'text-warn-ink', title: 'aiLook' }, // i18n-ignore: catalogue key
  failed: { className: 'text-danger-ink', title: 'aiFailed' }, // i18n-ignore: catalogue key
  finding: { className: 'text-warn-ink', title: 'aiFinding' }, // i18n-ignore: catalogue key
} as const;

/** The rail's ✦ for a reviewed question. */
function AiGlyph({ tone }: { tone: BankItemTone | undefined }) {
  const m = useMessages(REVIEW_PAGE_MESSAGES);
  if (!tone) return null;
  return (
    <span data-bank-ai={tone} title={m[AI_TONE[tone].title]} className={`shrink-0 whitespace-pre ${AI_TONE[tone].className}`}>
      {' ✦'}
    </span>
  );
}

/**
 * Level 2: one topic (or search results, or every question) as a review page. The list is
 * a rail of sub-topic sections on the sunken tone; the stage shows the focused question
 * at reading size on the desk tone, facts and actions under it, never beside it.
 */
export function ReviewPage({
  state,
  fullGroup,
  empty,
  onFocus,
  onStep,
  onPick,
  onRailHidden,
  onLanguage,
  onVersion,
  onEditTopics,
  onOpen,
  stageAi,
  targetPicker,
}: {
  state: ReviewState;
  /** "Adding to ‹paper ▾›", under the rail's count. */
  targetPicker?: ReactNode;
  /** The ✦ review of the question on the stage. */
  stageAi?: StageAi;
  /** The focused question across the whole bank: versions and uses are never filtered. */
  fullGroup: BankGroup | undefined;
  /** Shown instead of the stage when the list is empty. */
  empty: ReactNode;
  /** `entry`: the rail entry chosen (`RailEntry.key`); absent keeps the question's current one. */
  onFocus: (row: BankRow, entry?: string) => void;
  onStep: (delta: number) => void;
  onPick: (row: BankRow) => void;
  onRailHidden: (hidden: boolean) => void;
  onLanguage: (language: LanguageMode) => void;
  onVersion: (version: VersionMode) => void;
  /** Offered only once the owning document has loaded and this build may write it. */
  onEditTopics?: (row: BankRow) => void;
  onOpen: (row: BankRow) => void;
}) {
  const { order, focused, railHidden } = state;
  return (
    <div
      className={`grid min-h-0 flex-1 ${railHidden ? 'grid-cols-[52px_minmax(0,1fr)]' : 'grid-cols-[300px_minmax(0,1fr)]'}`}
    >
      {railHidden ? (
        <NumberStrip state={state} onFocus={onFocus} onShow={() => onRailHidden(false)} />
      ) : (
        <Rail state={state} targetPicker={targetPicker} onFocus={onFocus} onPick={onPick} onHide={() => onRailHidden(true)} />
      )}
      {order.length === 0 || !focused ? (
        <div className="flex min-h-0 items-start justify-center overflow-y-auto bg-surface px-8 py-16">
          <div className="max-w-md text-[13px] leading-relaxed text-ink-muted">{empty}</div>
        </div>
      ) : (
        <Stage
          state={state}
          row={focused}
          fullGroup={fullGroup}
          onStep={onStep}
          onFocus={onFocus}
          onLanguage={onLanguage}
          onVersion={onVersion}
          onEditTopics={onEditTopics}
          onOpen={onOpen}
          onPick={onPick}
          ai={stageAi}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------ */
/* The rail                                                                             */
/* ------------------------------------------------------------------------------------ */

function Rail({
  state,
  targetPicker,
  onFocus,
  onPick,
  onHide,
}: {
  state: ReviewState;
  targetPicker?: ReactNode;
  onFocus: (row: BankRow, entry?: string) => void;
  onPick: (row: BankRow) => void;
  onHide: () => void;
}) {
  const { sections, order, focused, picked, index } = state;
  const m = useMessages(REVIEW_PAGE_MESSAGES);
  const w = useMessages(BANK_PAGE_MESSAGES);
  const listRef = useRef<HTMLDivElement>(null);
  const focusedEntry = focused ? order[index]?.key : undefined;
  const windowed = order.length >= RAIL_WINDOW_FROM;

  // Keep the focused row in view as ↑ ↓ move it; when a row has the keyboard, it moves too.
  // (A windowed rail scrolls by arithmetic instead: the row may not be drawn yet.)
  useEffect(() => {
    if (!focusedEntry || windowed) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-rail-entry="${CSS.escape(focusedEntry)}"]`);
    node?.scrollIntoView({ block: 'nearest' });
    const active = document.activeElement;
    if (node && active !== node && active instanceof HTMLElement && active.hasAttribute('data-rail-root') && listRef.current?.contains(active)) {
      node.focus({ preventScroll: true });
    }
  }, [focusedEntry, windowed]);

  const item = (entry: RailEntry) => (
    <RailItem key={entry.key} entry={entry} state={state} on={focusedEntry === entry.key} onFocus={onFocus} onPick={onPick} />
  );

  // Counts are of questions: one listed under two headings is one.
  const roots = new Set(order.map((entry) => entry.group.rootId));
  const pickedHere = [...roots].filter((root) => picked.has(root)).length;
  return (
    <aside aria-label={m.questions} className="flex min-h-0 flex-col border-r border-line bg-surface-sunken">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3.5 py-2.5 text-[12px] tabular-nums text-ink-muted">
        <span className="truncate">
          {w.questions(roots.size)}
          {picked.size > 0 &&
            (pickedHere === picked.size
              ? `${m.listPre}${picked.size}${m.listPost}`
              : `${m.listPreOf}${pickedHere}${m.listOf}${picked.size}${m.listPost}`)}
        </span>
        <button
          type="button"
          onClick={onHide}
          className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {m.hideList}
        </button>
      </div>
      {targetPicker && <div className="shrink-0 border-b border-line px-3.5 py-2">{targetPicker}</div>}
      <div ref={listRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto pb-3" role="list">
        {windowed ? (
          <RailWindow listRef={listRef} state={state} focusedEntry={focusedEntry} item={item} />
        ) : (
          sections.map((section) => (
            <section key={section.key} aria-label={section.label}>
              <SectionHeading section={section} />
              {(section.parts ?? [{ key: '', label: '', entries: section.entries }]).map((part) => (
                <div key={part.key} data-rail-part={part.key || undefined}>
                  {part.key && <PartHeading part={part} />}
                  {part.entries.map(item)}
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

/** A sub-topic's heading in the rail: sticky while its questions scroll under it. */
function SectionHeading({ section, sticky = true }: { section: RailSection; sticky?: boolean }) {
  return (
    <h3
      className={`${sticky ? 'sticky top-0 z-[1]' : ''} flex justify-between gap-2 bg-surface-sunken px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle`}
    >
      <span className="truncate" title={section.label}>
        {section.label}
      </span>
      <span className="tabular-nums">{section.entries.length}</span>
    </h3>
  );
}

/** A 題型's heading inside a section (or "No 題型"). */
function PartHeading({ part }: { part: RailPart }) {
  return (
    <h4
      className={`flex justify-between gap-2 px-3.5 pb-0.5 pt-1.5 text-[11.5px] ${part.pattern ? 'font-medium text-ink-muted' : 'text-ink-subtle'}`}
      title={part.pattern ? `${part.label} · ${part.kind} 題型` : undefined}
    >
      <span className="min-w-0 truncate">
        {part.label}
        {part.kind && <span className="ml-1.5 text-[10.5px] font-normal text-ink-subtle">{part.kind}</span>}
      </span>
      <span className="shrink-0 tabular-nums text-ink-subtle">{part.entries.length}</span>
    </h4>
  );
}

/** "Part (b) tests this · also under …": the entry's third line, empty when it has none. */
const whereText = (entry: RailEntry) =>
  [testsThisText(partsTesting(entry.group.rows[0], entry.query).map((slot) => slot.label)), alsoInText(entry.alsoIn)].filter(Boolean).join(' · ');

/** One question in the rail. */
function RailItem({
  entry,
  state,
  on,
  onFocus,
  onPick,
}: {
  entry: RailEntry;
  state: ReviewState;
  on: boolean;
  onFocus: (row: BankRow, entry?: string) => void;
  onPick: (row: BankRow) => void;
}) {
  const m = useMessages(REVIEW_PAGE_MESSAGES);
  const { group } = entry;
  const lead = group.rows[0];
  const used = state.usedWith ? usedWithTargets(group, [state.usedWith.target]) : undefined;
  const where = whereText(entry);
  const held = state.inTarget?.get(group.rootId);
  return (
    <div
      role="listitem"
      data-rail-root={group.rootId}
      data-rail-entry={entry.key}
      // One Tab stop for the list (the question on the stage); ↑ ↓ then move it,
      // Space picks it, O opens it (the screen's key listener).
      tabIndex={on ? 0 : -1}
      aria-current={on || undefined}
      onClick={() => onFocus(lead, entry.key)}
      onFocus={(event) => {
        if (event.target === event.currentTarget && !on) onFocus(lead, entry.key);
      }}
      // scroll-mt: scrolled into view below the sticky section heading, never under it.
      className={`relative grid scroll-mt-8 cursor-pointer grid-cols-[16px_minmax(0,1fr)] gap-2 px-3.5 py-[7px] transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
        on ? 'bg-accent-soft' : 'hover:bg-surface-hover'
      }`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-0.5 bg-accent ${on ? 'opacity-100' : 'opacity-0'}`} />
      <input
        type="checkbox"
        tabIndex={-1}
        aria-label={m.selectLabel(lead.excerpt.en || lead.excerpt.zh || m.questionWord)}
        checked={state.picked.has(group.rootId)}
        onClick={(event) => event.stopPropagation()}
        onChange={() => onPick(lead)}
        className="mt-[3px] h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
      />
      <div className="min-w-0">
        <p className="line-clamp-2 text-[13px] leading-[1.4] text-ink" title={lead.excerpt.en || lead.excerpt.zh}>
          {lead.excerpt.en || lead.excerpt.zh || <span className="text-ink-subtle">{m.untitled}</span>}
        </p>
        {/* Look-alikes (a copy, a retyped question) read apart by where they live. */}
        <p className="flex min-w-0 text-[11px] tabular-nums text-ink-subtle">
          <span className="shrink-0 whitespace-pre">
            {typeLabel(lead.typeId)} · {marksLabel(lead.marks)}
            {lead.hasDiagram && m.diagram}
            {group.versions > 1 && m.versions(group.versions)}
            {' · '}
          </span>
          <SourceText title={docLabel(state, lead)} number={lead.number} />
          <AiGlyph tone={state.aiTones?.get(group.rootId)} />
        </p>
        {where && (
          <p className="line-clamp-2 text-[11px] leading-snug text-ink-muted" title={where} data-rail-where>
            {where}
          </p>
        )}
        {used && <p className="truncate text-[11px] tabular-nums text-warn-ink">{usedLabel(used)}</p>}
        {held && (
          <p data-rail-in-target className="truncate text-[11px] tabular-nums text-accent-ink">
            {m.inTarget}
            {held.number !== undefined && ` · Q${held.number}`}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The rail of a large bank, drawn as a window (`railWindow.ts`): the rows near the scroll
 * position between two spacers, each row measured once drawn. The heading of the section
 * at the top stays pinned, as the full rail's sticky headings do.
 */
function RailWindow({
  listRef,
  state,
  focusedEntry,
  item,
}: {
  listRef: RefObject<HTMLDivElement | null>;
  state: ReviewState;
  focusedEntry: string | undefined;
  item: (entry: RailEntry) => ReactNode;
}) {
  const { sections } = state;
  const rows = useMemo(() => railRows(sections, (entry) => whereText(entry) !== ''), [sections]);
  const rowIndex = useMemo(() => new Map(rows.map((row, i) => [row.key, i])), [rows]);
  const [measured, setMeasured] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [view, setView] = useState({ top: 0, height: 800 });
  const offsets = useMemo(() => rowOffsets(rows, measured), [rows, measured]);
  const [start, end] = visibleRange(offsets, view.top, view.height);
  const pendingFocus = useRef<string | undefined>(undefined);
  const pendingReveal = useRef<{ key: string; until: number } | undefined>(undefined);

  // Follow the scroll and the list's height, once a frame at most.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setView((current) =>
        current.top === list.scrollTop && current.height === list.clientHeight ? current : { top: list.scrollTop, height: list.clientHeight },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    list.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      list.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [listRef]);

  // Measure each row as it is drawn (and again when it changes height): a height that
  // differs from the estimate moves the rows below. Without ResizeObserver, estimates.
  const observer = useMemo(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    return new ResizeObserver((records) => {
      setMeasured((current) => {
        let next: Map<string, number> | undefined;
        for (const record of records) {
          const node = record.target as HTMLElement;
          const key = node.dataset.railRow;
          const height = node.offsetHeight;
          if (key && height > 0 && Math.abs((current.get(key) ?? -1) - height) > 0.5) (next ??= new Map(current)).set(key, height);
        }
        return next ?? current;
      });
    });
  }, []);
  useEffect(() => () => observer?.disconnect(), [observer]);
  const observe = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) observer?.observe(node);
    },
    [observer],
  );

  // A row given the keyboard before it was drawn takes it now. A row just focused is kept
  // in view by the drawn layout for a moment, while measuring corrects the estimates.
  useLayoutEffect(() => {
    const find = (key: string) => listRef.current?.querySelector<HTMLElement>(`[data-rail-entry="${CSS.escape(key)}"]`);
    const waiting = pendingFocus.current;
    const node = waiting ? find(waiting) : undefined;
    if (node) {
      node.focus({ preventScroll: true });
      pendingFocus.current = undefined;
    }
    const reveal = pendingReveal.current;
    if (!reveal) return;
    if (performance.now() > reveal.until) pendingReveal.current = undefined;
    else find(reveal.key)?.scrollIntoView({ block: 'nearest' });
  }, [listRef, start, end, measured]);


  // Keep the focused row in view as ↑ ↓ move it (below the pinned heading); a row that had
  // the keyboard hands it on, now or once the new row is drawn.
  useEffect(() => {
    const list = listRef.current;
    if (!focusedEntry || !list) return;
    const at = rowIndex.get(`e:${focusedEntry}`);
    if (at === undefined) return;
    const target = scrollToShow(offsets, at, list.scrollTop, list.clientHeight, STICKY_HEADING_PX);
    if (target !== undefined) list.scrollTop = target;
    pendingReveal.current = { key: focusedEntry, until: performance.now() + REVEAL_MS };
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.hasAttribute('data-rail-root') && list.contains(active) && active.dataset.railEntry !== focusedEntry) {
      const node = list.querySelector<HTMLElement>(`[data-rail-entry="${CSS.escape(focusedEntry)}"]`);
      if (node) node.focus({ preventScroll: true });
      else pendingFocus.current = focusedEntry;
    }
    // Only a new focus scrolls: re-measuring must not pull the list back to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedEntry, rowIndex]);

  const top = rows[rowAt(offsets, view.top)];
  const pinned = top ? sections[top.sectionIndex] : undefined;
  return (
    <>
      {pinned && (
        <div className="sticky top-0 z-[2] h-0 overflow-visible" aria-hidden>
          <SectionHeading section={pinned} sticky={false} />
        </div>
      )}
      <div style={{ height: offsets[start] }} role="presentation" />
      {rows.slice(start, end).map((row) => (
        <div key={row.key} ref={observe} role="presentation" data-rail-row={row.key} data-rail-part={row.kind === 'part' ? row.part.key : undefined}>
          {row.kind === 'section' ? (
            <SectionHeading section={row.section} sticky={false} />
          ) : row.kind === 'part' ? (
            <PartHeading part={row.part} />
          ) : (
            item(row.entry)
          )}
        </div>
      ))}
      <div style={{ height: offsets[rows.length] - offsets[end] }} role="presentation" />
    </>
  );
}

/** The pinned section heading's height: a row scrolled into view sits below it. */
const STICKY_HEADING_PX = 32;
/** How long a newly focused row is kept in view while the rows around it are measured. */
const REVEAL_MS = 500;

/** The rail folded: question numbers only, the focused one marked, picks dotted. */
function NumberStrip({
  state,
  onFocus,
  onShow,
}: {
  state: ReviewState;
  onFocus: (row: BankRow, entry?: string) => void;
  onShow: () => void;
}) {
  const { order, focused, picked, index: focusedIndex } = state;
  const m = useMessages(REVIEW_PAGE_MESSAGES);
  const listRef = useRef<HTMLDivElement>(null);
  const focusedEntry = focused ? order[focusedIndex]?.key : undefined;
  useEffect(() => {
    if (!focusedEntry) return;
    listRef.current?.querySelector<HTMLElement>(`[data-rail-entry="${CSS.escape(focusedEntry)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focusedEntry]);
  return (
    <aside aria-label={m.questions} className="flex min-h-0 flex-col border-r border-line bg-surface-sunken">
      <button
        type="button"
        onClick={onShow}
        title={m.showList}
        aria-label={m.showList}
        className="shrink-0 cursor-pointer border-b border-line py-2.5 text-[13px] text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        ›
      </button>
      <div ref={listRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto py-1.5">
        {order.map((entry, index) => {
          const { group } = entry;
          const on = entry.key === focusedEntry;
          const lead = group.rows[0];
          return (
            <button
              key={entry.key}
              type="button"
              data-rail-root={group.rootId}
              data-rail-entry={entry.key}
              onClick={() => onFocus(lead, entry.key)}
              title={lead.excerpt.en || lead.excerpt.zh}
              className={`relative flex w-full cursor-pointer items-center justify-center gap-1 py-1.5 text-[12px] tabular-nums transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                on ? 'bg-surface font-semibold text-ink' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
              }`}
            >
              <span aria-hidden className={`absolute inset-y-0 left-0 w-0.5 bg-accent ${on ? 'opacity-100' : 'opacity-0'}`} />
              {index + 1}
              {picked.has(group.rootId) && <span aria-label={m.inList} className="h-1.5 w-1.5 rounded-full bg-accent" />}
              <AiGlyph tone={state.aiTones?.get(group.rootId)} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------------------------ */
/* The stage                                                                            */
/* ------------------------------------------------------------------------------------ */

function Stage({
  state,
  row,
  fullGroup,
  onStep,
  onFocus,
  onLanguage,
  onVersion,
  onEditTopics,
  onOpen,
  onPick,
  ai,
}: {
  state: ReviewState;
  row: BankRow;
  ai?: StageAi;
  fullGroup: BankGroup | undefined;
  onStep: (delta: number) => void;
  onFocus: (row: BankRow) => void;
  onLanguage: (language: LanguageMode) => void;
  onVersion: (version: VersionMode) => void;
  onEditTopics?: (row: BankRow) => void;
  onOpen: (row: BankRow) => void;
  onPick: (row: BankRow) => void;
}) {
  const { order, index, language, version, usedWith, picked } = state;
  const m = useMessages(REVIEW_PAGE_MESSAGES);
  const inList = picked.has(row.rootId);
  const { worksheet, failed } = useOwningDocument(row);
  const topicTags = row.tags.filter((tag) => !isPatternTag(tag));
  const byPart = topicsByPart(row);
  const patterns = patternLines(row.tags);
  // Which part tests the heading it is listed under: said above the paper, marked on it.
  const query = order[index]?.query;
  const testing = partsTesting(row, query);
  const testsWhat = testsWhatText(
    testing.map((slot) => slot.label),
    query,
  );
  const highlight = testing.map((slot) => slot.key);
  const shown = shownLanguage(row, language);
  const scrollRef = useRef<HTMLDivElement>(null);
  const key = rowKey(row);
  // A new question starts at its top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [key]);

  return (
    <section aria-label={m.question} className="flex min-h-0 flex-col bg-surface">
      <div className="flex shrink-0 items-center gap-4 whitespace-nowrap border-b border-line px-[22px] py-1">
        <span className="text-[13px] tabular-nums text-ink-muted" aria-live="polite">
          {m.positionBefore}<b className="font-semibold text-ink">{index + 1}</b>{m.positionAfter(order.length)}
        </span>
        <Segmented<LanguageMode>
          label={m.previewLanguage}
          value={language}
          onChange={onLanguage}
          options={[
            { value: 'en', label: 'EN' },
            { value: 'zh', label: '中文' },
            { value: 'bilingual', label: 'EN+中' },
          ]}
        />
        <Segmented<VersionMode>
          label={m.previewVersion}
          value={version}
          onChange={onVersion}
          options={[
            { value: 'student', label: m.student },
            { value: 'teacher', label: m.teacher },
          ]}
        />
        <span className="flex-1" />
        <span className="hidden text-[12px] text-ink-subtle xl:inline">{m.keysHint}</span>
      </div>

      {/* The stage is the one place the desk tone appears: the paper sits on it, and the
          facts under the paper share it. Lists stay on the light surfaces. */}
      <div ref={scrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-[var(--chrome-sunken)]">
        <div className="px-4 pt-[22px]">
          <div className="mx-auto flex items-start justify-center gap-3" style={{ maxWidth: SHEET_MAX_WIDTH + 2 * 46 }}>
            <NavButton label={m.previousQuestion} disabled={index <= 0} onClick={() => onStep(-1)}>
              ‹
            </NavButton>
            <div className="min-w-0 flex-1" style={{ maxWidth: SHEET_MAX_WIDTH }}>
              {ai?.note}
              {testsWhat && (
                <p className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-muted" data-stage-tests>
                  {/* The paper's margin rule, as a key: literal hex like the sheet's mark. */}
                  <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-full" style={{ background: '#6f9f5a' }} />
                  <span className="min-w-0 truncate" title={testsWhat}>
                    {testsWhat}
                  </span>
                </p>
              )}
              <PaperPreview
                worksheet={worksheet}
                questionId={row.questionId}
                language={shown}
                version={version}
                failed={failed}
                marks={ai?.marks}
                highlight={highlight}
              />
              {shown !== language && (
                <p className="mt-2 text-center text-[12px] text-ink-muted">
                  {language === 'zh' ? m.noZh : language === 'en' ? m.noEn : m.oneLanguage}
                </p>
              )}
            </div>
            <NavButton label={m.nextQuestion} disabled={index >= order.length - 1} onClick={() => onStep(1)}>
              ›
            </NavButton>
          </div>
        </div>

        <div className="mx-auto grid grid-cols-1 gap-x-6 gap-y-4 px-[22px] pb-8 pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" style={{ maxWidth: SHEET_MAX_WIDTH + 44 }}>
          <Facts>
            <dt className="text-ink-subtle">{m.topics}</dt>
            <dd className="min-w-0">
              {topicTags.length === 0 ? (
                <span className="text-ink-subtle">{m.noneYet}</span>
              ) : byPart ? (
                <span className="grid" data-fact-by-part>
                  {byPart.map((line) => {
                    const names = line.tags.filter((tag) => !isPatternTag(tag));
                    return (
                      <span key={line.label} className="flex min-w-0 gap-1.5" title={tagTitle(line.tags)}>
                        <span className="shrink-0 text-ink-muted">{line.label}</span>
                        <span className={`min-w-0 truncate ${names.length === 0 ? 'text-ink-subtle' : ''}`}>
                          {names.length === 0 ? m.noTopicYet : names.map((tag) => topicName(tag, 'both')).join(' · ')}
                        </span>
                      </span>
                    );
                  })}
                </span>
              ) : (
                <span title={tagTitle(topicTags)}>{topicTags.map((tag) => topicName(tag, 'both')).join(' · ')}</span>
              )}
              {onEditTopics && worksheet && !isNewerThanBuild(worksheet) && (
                <button
                  type="button"
                  onClick={() => onEditTopics(row)}
                  className="ml-2 cursor-pointer font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {row.tags.length === 0 ? m.add : m.edit}
                </button>
              )}
            </dd>
            {patterns.length > 0 && (
              <>
                <dt className="text-ink-subtle">{m.pattern}</dt>
                <dd className="min-w-0" data-fact-patterns>
                  {patterns.map((ref, i) => (
                    <span key={`${ref.topic} ${ref.name}`} title={`${topicName(ref.topic, 'both')} · ${ref.name}`}>
                      {i > 0 && ' · '}
                      {ref.name}
                    </span>
                  ))}
                </dd>
              </>
            )}
            <dt className="text-ink-subtle">{m.livesIn}</dt>
            <dd className="min-w-0">
              <SourceText title={docLabel(state, row)} number={row.number}>
                {row.docKind === 'bank' && <span className="shrink-0 whitespace-pre text-ink-subtle">{m.bankSuffix}</span>}
              </SourceText>
            </dd>
          </Facts>
          <Facts>
            <dt className="text-ink-subtle">{m.usedIn}</dt>
            <dd className="min-w-0">
              <UsedIn group={fullGroup} usedWith={usedWith} labels={state.docLabels} />
            </dd>
            <dt className="text-ink-subtle">{m.versionsFact}</dt>
            <dd className="min-w-0">
              <Versions group={fullGroup} row={row} labels={state.docLabels} language={language} onFocus={onFocus} />
            </dd>
          </Facts>
          <div className="flex flex-wrap items-start gap-2 md:flex-col md:items-end">
            <Button
              size="sm"
              variant={inList ? 'ghostAccent' : 'default'}
              aria-pressed={inList}
              onClick={() => onPick(row)}
              title={inList ? m.takeOffTitle : m.addTitle}
            >
              {inList ? m.inListButton : m.addToList}
            </Button>
            <Button size="sm" onClick={() => onOpen(row)} title={m.openTitle}>
              {m.open}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="m-0 grid grid-cols-[70px_minmax(0,1fr)] content-start gap-x-2.5 gap-y-1 text-[12.5px] tabular-nums text-ink">{children}</dl>;
}

/**
 * Each paper holding a copy: who sat it and when, then the paper and question number on
 * their own line (up to two lines, so a long title stays readable in the narrow column).
 * A draft names no class.
 */
function UsedIn({
  group,
  usedWith,
  labels,
}: {
  group: BankGroup | undefined;
  usedWith?: ClassChoice;
  labels?: ReadonlyMap<string, string>;
}) {
  const m = useMessages(REVIEW_PAGE_MESSAGES);
  const uses = group?.usedIn ?? [];
  if (uses.length === 0) return <span className="text-ink-subtle">{m.noPaperYet}</span>;
  return (
    <ul className="space-y-1">
      {uses.slice(0, 3).map((use) => {
        const amber = usedWith && anySameStudents(refsOf(use), [usedWith.target]);
        const where = sourceLabel({ docTitle: labels?.get(use.docId) ?? use.docTitle, number: use.number });
        return (
          <li key={use.docId} className={amber ? 'text-warn-ink' : ''} title={`${sittingLabel(use)} · ${where}`} data-used-in>
            <span className={`block truncate ${amber ? '' : use.classes?.length ? 'text-ink' : 'text-ink-subtle'}`}>{sittingLabel(use)}</span>
            <span className={`line-clamp-2 break-words leading-snug ${amber ? '' : 'text-ink-muted'}`}>{where}</span>
          </li>
        );
      })}
      {uses.length > 3 && <li className="text-ink-subtle">{m.andMore(uses.length - 3)}</li>}
    </ul>
  );
}

/**
 * The count, and (when edited copies differ) each version as a line that previews it: where
 * it lives, and what it says that the one showing does not.
 */
function Versions({
  group,
  row,
  labels,
  language,
  onFocus,
}: {
  group: BankGroup | undefined;
  row: BankRow;
  labels?: ReadonlyMap<string, string>;
  language: LanguageMode;
  onFocus: (row: BankRow) => void;
}) {
  const m = useMessages(REVIEW_PAGE_MESSAGES);
  if (!group || group.versions <= 1) return <span>1</span>;
  const versions = distinctVersions(group);
  return (
    <span className="grid">
      <span>{group.versions}</span>
      {versions.map((version) => {
        const on = version.contentKey === row.contentKey;
        return (
          <button
            key={rowKey(version)}
            type="button"
            onClick={() => onFocus(version)}
            disabled={on}
            className="grid cursor-pointer text-left text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:text-ink disabled:no-underline"
          >
            <SourceText title={labels?.get(version.docId) ?? version.docTitle} number={version.number}>
              {on && <span className="shrink-0 whitespace-pre text-ink-subtle">{m.showing}</span>}
            </SourceText>
            {!on && <span className="truncate text-[11.5px] text-ink-muted">{versionDiff(version, row, language)}</span>}
          </button>
        );
      })}
    </span>
  );
}

function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="sticky top-[140px] mt-[60px] grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-full border border-line-strong bg-surface text-[15px] leading-none text-ink transition-[background-color,opacity] duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** A document's name in the review: its title, or the one telling it from another of that title. */
function docLabel(state: Pick<ReviewState, 'docLabels'>, row: Pick<BankRow, 'docId' | 'docTitle'>): string {
  return state.docLabels?.get(row.docId) ?? row.docTitle;
}

/** The language drawn: the one asked for when the question has it, else what it has. */
export function shownLanguage(row: Pick<BankRow, 'languages'>, language: LanguageMode): LanguageMode {
  const hasEn = row.languages.includes('en');
  const hasZh = row.languages.includes('zh');
  if (language === 'bilingual') return hasEn && hasZh ? 'bilingual' : hasZh ? 'zh' : 'en';
  if (language === 'zh') return hasZh || !hasEn ? 'zh' : 'en';
  return hasEn || !hasZh ? 'en' : 'zh';
}
