'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { isModalLayerOpen } from '@/components/ui/modalLayer';
import { sortBuckets, sortSections, type PatternId, type PatternItem, type SortBucket } from '@/library/patterns';
import type { BankRow } from '@/library/types';
import { cleanPatternName, PATTERN_NAME_MAX, samePatternName } from '@/model/patterns';
import type { LanguageMode } from '@/model/types';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { listQuestionTypes } from '@/registry';
import { escapeClears } from '../escapeClears';
import { typeName } from './bankPage';
import { SORT_BOARD_MESSAGES } from './PatternSortBoard.messages';
import { shownLanguage } from './ReviewPage';
import { chromeTopicName } from './topicText';

/** Questions sorted into a 題型 under one sub-topic: what the caller writes. */
export interface SortRequest {
  /** A sub-topic code. */
  topic: string;
  name: string;
  /** Distinct questions (`rootId`). */
  roots: string[];
  /** Their question types: the 題型 is registered under each. */
  typeIds: string[];
}

/** A sort taken back: the 題型 comes off the questions, and names it created leave the registry. */
export interface UnsortRequest {
  topic: string;
  roots: string[];
  created: PatternId[];
}

interface Sorted extends SortRequest {
  created: PatternId[];
}

const keyOf = (topic: string, root: string) => `${topic}\n${root}`;

/**
 * The 題型 sort board (`docs/design/question-types-empty-state.md` § Screen B): one coarse
 * topic's questions without a 題型, a section per sub-topic. Select questions that are
 * alike and name them: that one act defines the 題型 and files them under it. A 題型
 * then becomes a numbered bucket (1–9) that more questions go into. A selection stays in
 * one sub-topic, since a 題型 belongs to one. MCQ and LQ may share a name: the tag never
 * held the type. Each sort can be taken back (Z), last first.
 *
 * The index catches up after a write; until then a sorted card is hidden here (`pending`),
 * so the board answers at once, as tag as you go does.
 */
export function PatternSortBoard({
  topic,
  rows,
  items,
  language,
  busy,
  nextTopic,
  onSortInto,
  onUnsort,
  onNext,
  onDone,
}: {
  /** A coarse topic code. */
  topic: string;
  rows: readonly BankRow[];
  /** Every 題型 (`listPatterns`). */
  items: readonly PatternItem[];
  /** The language questions are shown in. */
  language: LanguageMode;
  busy: boolean;
  /** The next coarse topic with questions to sort, offered once this one is done. */
  nextTopic?: string;
  onSortInto: (request: SortRequest) => void;
  onUnsort: (request: UnsortRequest) => void;
  onNext: (topic: string) => void;
  onDone: () => void;
}) {
  const m = useMessages(SORT_BOARD_MESSAGES);
  const ui = useUiLanguage();
  const sections = useMemo(() => sortSections(rows, topic), [rows, topic]);
  const [selection, setSelection] = useState<{ topic: string; roots: string[]; anchor: string }>();
  const [name, setName] = useState('');
  const [pending, setPending] = useState<Map<string, string>>(() => new Map());
  const [history, setHistory] = useState<Sorted[]>([]);
  const [said, setSaid] = useState<string>();
  const nameRef = useRef<HTMLInputElement>(null);

  // A card the index now shows sorted no longer needs hiding; one it shows unsorted again
  // after an undo is shown (the undo dropped its key).
  const left = sections.map((section) => ({
    ...section,
    cards: section.notSorted.filter((row) => !pending.has(keyOf(section.topic, row.rootId))),
  }));
  const bucketsFor = (code: string): SortBucket[] => {
    const list = sortBuckets(items, code).map((bucket) => ({ ...bucket, typeIds: [...bucket.typeIds] }));
    const section = sections.find((entry) => entry.topic === code);
    for (const row of section?.notSorted ?? []) {
      const into = pending.get(keyOf(code, row.rootId));
      if (!into) continue;
      const bucket = list.find((entry) => samePatternName(entry.name, into));
      if (bucket) {
        bucket.count += 1;
        if (!bucket.typeIds.includes(row.typeId)) bucket.typeIds.push(row.typeId);
      } else list.push({ name: into, typeIds: [row.typeId], count: 1 });
    }
    return list;
  };

  // Counted per question, as the map counts: one under two sub-topics is sorted once both are.
  const everyRoot = new Set(rows.filter((row) => sections.some((section) => row.tags.includes(section.topic))).map((row) => row.rootId));
  const leftRoots = new Set(left.flatMap((section) => section.cards.map((row) => row.rootId)));
  const totalLeft = leftRoots.size;
  const totalSorted = everyRoot.size - leftRoots.size;

  const selectedRows = selection
    ? (left.find((section) => section.topic === selection.topic)?.cards ?? []).filter((row) => selection.roots.includes(row.rootId))
    : [];
  const selectionBuckets = selection ? bucketsFor(selection.topic) : [];
  const clean = cleanPatternName(name);
  const existing = clean ? selectionBuckets.find((bucket) => samePatternName(bucket.name, clean)) : undefined;

  const sortInto = (into: string) => {
    if (!selection || selectedRows.length === 0 || busy) return;
    const bucket = selectionBuckets.find((entry) => samePatternName(entry.name, into));
    const finalName = bucket?.name ?? cleanPatternName(into);
    if (!finalName) return;
    const typeIds = listQuestionTypes()
      .map((type) => type.id)
      .filter((id) => selectedRows.some((row) => row.typeId === id));
    const roots = selectedRows.map((row) => row.rootId);
    const created = typeIds
      .filter((id) => !items.some((item) => item.topic === selection.topic && item.typeId === id && samePatternName(item.name, finalName)))
      .map((typeId) => ({ topic: selection.topic, typeId, name: finalName }));
    const request: Sorted = { topic: selection.topic, name: finalName, roots, typeIds, created };
    onSortInto(request);
    setPending((current) => {
      const next = new Map(current);
      for (const root of roots) next.set(keyOf(selection.topic, root), finalName);
      return next;
    });
    setHistory((current) => [...current, request]);
    setSaid(m.sorted(roots.length, finalName));
    setSelection(undefined);
    setName('');
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    onUnsort({ topic: last.topic, roots: last.roots, created: last.created });
    setHistory((current) => current.slice(0, -1));
    setPending((current) => {
      const next = new Map(current);
      for (const root of last.roots) next.delete(keyOf(last.topic, root));
      return next;
    });
    setSaid(m.undone(last.name));
  };

  const toggle = (code: string, row: BankRow, range: boolean) => {
    setSelection((current) => {
      if (!current || current.topic !== code) return { topic: code, roots: [row.rootId], anchor: row.rootId };
      if (range) {
        const cards = left.find((section) => section.topic === code)?.cards ?? [];
        const from = cards.findIndex((card) => card.rootId === current.anchor);
        const to = cards.findIndex((card) => card.rootId === row.rootId);
        if (from >= 0 && to >= 0) {
          const run = cards.slice(Math.min(from, to), Math.max(from, to) + 1).map((card) => card.rootId);
          return { ...current, roots: [...new Set([...current.roots, ...run])] };
        }
      }
      const roots = current.roots.includes(row.rootId)
        ? current.roots.filter((root) => root !== row.rootId)
        : [...current.roots, row.rootId];
      return roots.length > 0 ? { topic: code, roots, anchor: row.rootId } : undefined;
    });
  };

  // Keys: on the document, so they come before the bank screen's window listener (which
  // takes Esc to go up a level); a key handled here is marked so that one stands down.
  const keyRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const handleKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || isModalLayerOpen()) return;
    const target = event.target as HTMLElement | null;
    const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable;
    if (event.key === 'Escape' && selection && !(typing && name)) {
      event.preventDefault();
      setSelection(undefined);
      if (typing) target?.blur();
      return;
    }
    if (typing || event.altKey) return;
    const undoChord = (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
    if (undoChord || (!event.metaKey && !event.ctrlKey && (event.key === 'z' || event.key === 'Z'))) {
      if (history.length === 0) return;
      event.preventDefault();
      undo();
      return;
    }
    if (event.metaKey || event.ctrlKey) return;
    if ((event.key === 'n' || event.key === 'N') && selection) {
      event.preventDefault();
      nameRef.current?.focus();
      return;
    }
    const digit = Number(event.key);
    if (selection && Number.isInteger(digit) && digit >= 1 && digit <= Math.min(9, selectionBuckets.length)) {
      event.preventDefault();
      sortInto(selectionBuckets[digit - 1].name);
    }
  };
  useEffect(() => {
    keyRef.current = handleKey;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => keyRef.current(event);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const topicLabel = (code: string) => chromeTopicName(code, ui);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-pattern-board={topic}>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-7 pb-28 pt-[18px]">
        <div className="mx-auto grid w-full max-w-[1100px] gap-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
            <div className="grid gap-1">
              <p className="text-[13px] text-ink-muted">{m.hint}</p>
              <p className="text-[11.5px] text-ink-subtle">{m.keys}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] tabular-nums text-ink-subtle" data-board-counts>
                {m.counts(totalLeft, totalSorted)}
              </span>
              <Button size="sm" onClick={onDone}>
                {m.done}
              </Button>
            </div>
          </div>

          <p role="status" aria-live="polite" className={`-mb-2 min-h-[20px] text-[12.5px] text-ink ${said ? '' : 'invisible'}`} data-board-said>
            {said}
            {said && history.length > 0 && (
              <button
                type="button"
                onClick={undo}
                className="ml-2 cursor-pointer text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {m.undo}
              </button>
            )}
          </p>

          {sections.length === 0 && <p className="max-w-[560px] text-[13px] text-ink-muted">{m.nothing}</p>}

          {sections.length > 0 && totalLeft === 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-surface-raised px-4 py-3" data-board-done>
              <p className="text-[13px] font-medium text-ink">{m.topicDone(topic)}</p>
              {nextTopic && (
                <Button size="sm" variant="primary" onClick={() => onNext(nextTopic)}>
                  {m.next(nextTopic)}
                </Button>
              )}
              <Button size="sm" variant={nextTopic ? 'default' : 'primary'} onClick={onDone}>
                {m.backToMap}
              </Button>
            </div>
          )}

          {left.map((section) => {
            const buckets = bucketsFor(section.topic);
            const active = selection?.topic === section.topic;
            return (
              <section key={section.topic} aria-label={topicLabel(section.topic)} className="grid gap-2.5" data-board-section={section.topic}>
                <h3 className="flex flex-wrap items-baseline gap-x-3 text-[13.5px] text-ink">
                  <span className="font-semibold">{topicLabel(section.topic)}</span>
                  <span className="text-[11.5px] tabular-nums text-ink-subtle">
                    {section.cards.length > 0 ? m.sectionLeft(section.cards.length) : m.allSorted}
                  </span>
                </h3>
                {buckets.length > 0 && (
                  <ul className="flex flex-wrap gap-2" aria-label={topicLabel(section.topic)}>
                    {buckets.map((bucket, i) => {
                      const ready = active && selectedRows.length > 0 && !busy;
                      return (
                        <li key={bucket.name}>
                          <button
                            type="button"
                            disabled={!ready}
                            onClick={() => sortInto(bucket.name)}
                            title={ready ? m.bucketTitle(bucket.name) : m.bucketIdle}
                            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                              ready
                                ? 'cursor-pointer border-accent/50 bg-accent-soft text-ink hover:border-accent'
                                : 'cursor-default border-line bg-surface-raised text-ink'
                            }`}
                            data-board-bucket={bucket.name}
                          >
                            {i < 9 && (
                              <kbd className={`rounded border px-1 text-[10.5px] font-semibold tabular-nums ${ready ? 'border-accent/50 text-accent-ink' : 'border-line text-ink-subtle'}`}>
                                {i + 1}
                              </kbd>
                            )}
                            <span className="max-w-[320px] truncate font-medium">{bucket.name}</span>
                            {bucket.typeIds.map((id) => (
                              <span key={id} className="rounded border border-line px-1 py-px text-[10px] font-semibold leading-none tracking-[0.04em] text-ink-subtle">
                                {typeName(id)}
                              </span>
                            ))}
                            <span className="tabular-nums text-ink-subtle">{bucket.count}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {section.cards.length > 0 && (
                  <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {section.cards.map((row) => (
                      <li key={row.rootId}>
                        <SortCard
                          row={row}
                          language={language}
                          selected={active && selection!.roots.includes(row.rootId)}
                          onToggle={(range) => toggle(section.topic, row, range)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {selection && selectedRows.length > 0 && (
        <form
          aria-label={m.nameLabel}
          className="absolute inset-x-0 bottom-0 border-t border-line bg-surface/95 px-7 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur"
          data-board-tray
          onSubmit={(event) => {
            event.preventDefault();
            if (clean) sortInto(clean);
          }}
        >
          <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[12.5px] font-medium tabular-nums text-ink">{m.selected(selectedRows.length)}</span>
            <span className="text-[12px] text-ink-subtle">{topicLabel(selection.topic)}</span>
            <input
              ref={nameRef}
              value={name}
              maxLength={PATTERN_NAME_MAX}
              aria-label={m.nameLabel}
              placeholder={m.namePlaceholder}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => void escapeClears(event, name, () => setName(''))}
              className="h-[34px] min-w-[260px] flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <Button type="submit" variant="primary" disabled={busy || !clean}>
              {existing ? m.addTo(existing.name) : m.create}
            </Button>
            <Button variant="subtle" onClick={() => setSelection(undefined)}>
              {m.clear}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** One question to sort: what it is (type, marks, a diagram), and enough of its stem to recognise it. */
export function SortCard({
  row,
  language,
  selected,
  onToggle,
}: {
  row: BankRow;
  language: LanguageMode;
  selected: boolean;
  onToggle: (range: boolean) => void;
}) {
  const m = useMessages(SORT_BOARD_MESSAGES);
  const shown = shownLanguage(row, language);
  const lines = shown === 'bilingual' ? [row.excerpt.en, row.excerpt.zh] : [shown === 'zh' ? row.excerpt.zh : row.excerpt.en];
  const text = lines.filter(Boolean);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={m.select(text[0] ?? m.noText)}
      onClick={(event) => onToggle(event.shiftKey)}
      className={`flex h-full w-full cursor-pointer flex-col gap-1.5 rounded-[10px] border px-3 pb-2.5 pt-2 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface-raised hover:border-line-strong'
      }`}
      data-board-card={row.rootId}
    >
      <span className="flex items-center gap-2 text-[11px] text-ink-subtle">
        <span
          aria-hidden
          className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border text-[10px] leading-none ${
            selected ? 'border-accent bg-accent text-on-cta' : 'border-line-strong bg-surface'
          }`}
        >
          {selected ? '✓' : ''}
        </span>
        <span className="rounded border border-line px-1 py-px text-[10px] font-semibold leading-none tracking-[0.04em]">{typeName(row.typeId)}</span>
        <span className="tabular-nums">{m.marks(row.marks)}</span>
        {row.hasDiagram && <span>· {m.diagram}</span>}
      </span>
      {text.length > 0 ? (
        text.map((line, i) => (
          <span key={i} className={`line-clamp-3 text-[12.5px] leading-snug ${i === 0 ? 'text-ink' : 'text-ink-muted'}`}>
            {line}
          </span>
        ))
      ) : (
        <span className="text-[12.5px] italic text-ink-subtle">{m.noText}</span>
      )}
    </button>
  );
}
