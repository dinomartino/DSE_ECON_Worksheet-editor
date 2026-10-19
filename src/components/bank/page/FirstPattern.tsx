'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { sortSections, topicsToSort, type SortProgress, type SubTopicTally } from '@/library/patterns';
import type { BankRow } from '@/library/types';
import { cleanPatternName, PATTERN_NAME_MAX } from '@/model/patterns';
import type { LanguageMode } from '@/model/types';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { listQuestionTypes } from '@/registry';
import { escapeClears } from '../escapeClears';
import { typeName } from './bankPage';
import { FIRST_PATTERN_MESSAGES } from './FirstPattern.messages';
import { SortCard, type SortRequest } from './PatternSortBoard';
import { PATTERNS_PAGE_MESSAGES } from './PatternsPage.messages';
import { chromeTopicName } from './topicText';

/** Cards shown before "Show n more": two rows of three on a wide window. */
const FIRST_CARDS = 6;

const LINK =
  'cursor-pointer text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** A sub-topic's coarse letter: "C" for C.ped. */
const letterOf = (code: string) => (code.includes('.') ? code.slice(0, code.indexOf('.')) : code);

/**
 * The 題型 map with nothing named yet: the first 題型 is made here, on the page that
 * explains it, in three steps that are all on screen at once. Pick a topic (the cards
 * select, they do not leave), click questions that are alike in one of its sub-topics,
 * name them. The preview beside the steps is the sub-topic as the map will show it,
 * filled as the teacher selects and types, so the example is their own questions.
 * Creating writes exactly what the sort board writes (`onSortInto`); the whole board
 * stays one link away for sorting a topic in one go.
 */
export function FirstPattern({
  rows,
  progress,
  tallies,
  language,
  busy,
  onSortInto,
  onSort,
}: {
  rows: readonly BankRow[];
  progress: SortProgress;
  tallies: ReadonlyMap<string, SubTopicTally>;
  /** The language questions are shown in. */
  language: LanguageMode;
  busy: boolean;
  onSortInto: (request: SortRequest) => void;
  /** Open the sort board for a coarse topic. */
  onSort: (topic: string) => void;
}) {
  const m = useMessages(FIRST_PATTERN_MESSAGES);
  const ui = useUiLanguage();
  const whyId = useId();
  const name = (code: string) => chromeTopicName(code, ui);
  const starts = topicsToSort(progress);
  const rest = progress.topics.filter((entry) => entry.notSorted > 0 && !starts.includes(entry));

  const [topic, setTopic] = useState(starts[0]?.topic);
  const sections = useMemo(
    () => (topic ? sortSections(rows, topic).filter((section) => section.notSorted.length > 0) : []),
    [rows, topic],
  );
  // The sub-topic with most to sort leads: the likeliest place for two questions alike.
  const busiest = sections.reduce<string | undefined>(
    (best, section) =>
      !best || section.notSorted.length > (sections.find((entry) => entry.topic === best)?.notSorted.length ?? 0)
        ? section.topic
        : best,
    undefined,
  );
  const [chosenSub, setSub] = useState<string>();
  const sub = sections.some((section) => section.topic === chosenSub) ? chosenSub : busiest;
  const cards = sections.find((section) => section.topic === sub)?.notSorted ?? [];

  const [selected, setSelected] = useState<{ roots: string[]; anchor?: string }>({ roots: [] });
  const [all, setAll] = useState(false);
  const [patternName, setPatternName] = useState('');
  const picked = cards.filter((row) => selected.roots.includes(row.rootId));
  const clean = cleanPatternName(patternName);
  const pickedTypes = listQuestionTypes()
    .map((type) => type.id)
    .filter((id) => picked.some((row) => row.typeId === id));
  const ready = Boolean(sub) && picked.length > 0 && Boolean(clean) && !busy;

  const reset = () => {
    setSelected({ roots: [] });
    setAll(false);
  };
  const pickTopic = (code: string) => {
    if (code === topic) return;
    setTopic(code);
    setSub(undefined);
    reset();
  };
  const pickSub = (code: string) => {
    setSub(code);
    reset();
  };
  const toggle = (row: BankRow, range: boolean) =>
    setSelected((current) => {
      if (range && current.anchor) {
        const from = cards.findIndex((card) => card.rootId === current.anchor);
        const to = cards.findIndex((card) => card.rootId === row.rootId);
        if (from >= 0 && to >= 0) {
          const run = cards.slice(Math.min(from, to), Math.max(from, to) + 1).map((card) => card.rootId);
          return { roots: [...new Set([...current.roots, ...run])], anchor: row.rootId };
        }
      }
      const roots = current.roots.includes(row.rootId)
        ? current.roots.filter((root) => root !== row.rootId)
        : [...current.roots, row.rootId];
      return { roots, anchor: row.rootId };
    });
  const create = () => {
    if (!ready || !sub) return;
    onSortInto({
      topic: sub,
      name: clean,
      roots: picked.map((row) => row.rootId),
      typeIds: pickedTypes,
    });
  };

  const shown = all ? cards : cards.slice(0, FIRST_CARDS);
  const why = picked.length === 0 ? m.whySelect : !clean ? m.whyName : m.ready(picked.length);

  return (
    <div className="grid gap-6" data-first-pattern>
      <Step n={1} title={m.step1} aside={<span className="text-[11.5px] text-ink-subtle">{m.mostFirst}</span>}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-patterns-starts>
          {starts.map((entry) => {
            const on = entry.topic === topic;
            const subs = [...tallies.values()].filter((tally) => tally.without > 0 && letterOf(tally.topic) === entry.topic).length;
            return (
              <li key={entry.topic}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={m.pickLabel(name(entry.topic))}
                  onClick={() => pickTopic(entry.topic)}
                  className={`flex h-full w-full cursor-pointer flex-col gap-1 rounded-[12px] border px-4 py-3 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    on ? 'border-accent bg-accent-soft' : 'border-line bg-surface-raised hover:border-line-strong'
                  }`}
                  data-pattern-start={entry.topic}
                >
                  <span className="flex items-baseline gap-2 text-ink">
                    <span className="font-display text-[20px] leading-none">{entry.topic}</span>
                    <span className="min-w-0 text-[13.5px] font-semibold">{name(entry.topic)}</span>
                  </span>
                  <span className="text-[12px] tabular-nums text-ink-subtle">{m.topicCount(entry.notSorted, subs)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {rest.length > 0 && (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px] text-ink-subtle" data-patterns-other>
            <span>{m.otherTopics}</span>
            {rest.map((entry) => (
              <button
                key={entry.topic}
                type="button"
                aria-pressed={entry.topic === topic}
                onClick={() => pickTopic(entry.topic)}
                title={m.pickLabel(name(entry.topic))}
                className={`rounded px-1 ${entry.topic === topic ? 'bg-accent-soft font-semibold text-accent-ink' : LINK}`}
              >
                <span className="font-medium">{entry.topic}</span> <span className="tabular-nums">{entry.notSorted}</span>
              </button>
            ))}
          </p>
        )}
      </Step>

      {topic && sub && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid min-w-0 gap-6">
            <Step
              n={2}
              title={m.step2}
              aside={
                <button type="button" onClick={() => onSort(topic)} className={`text-[12px] ${LINK}`} data-first-board>
                  {m.wholeBoard(topic)}
                </button>
              }
            >
              {sections.length > 1 && (
                <div role="radiogroup" aria-label={m.subTopics} className="flex flex-wrap gap-1.5" data-first-subtopics>
                  {sections.map((section) => {
                    const on = section.topic === sub;
                    return (
                      <button
                        key={section.topic}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => pickSub(section.topic)}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface-raised text-ink hover:border-line-strong'
                        }`}
                        data-first-subtopic={section.topic}
                      >
                        {name(section.topic)}
                        <span className={`tabular-nums ${on ? 'opacity-70' : 'text-ink-subtle'}`}>{section.notSorted.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[12px] text-ink-subtle">{m.step2Hint}</p>
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((row) => (
                  <li key={row.rootId}>
                    <SortCard
                      row={row}
                      language={language}
                      selected={selected.roots.includes(row.rootId)}
                      onToggle={(range) => toggle(row, range)}
                    />
                  </li>
                ))}
              </ul>
              {cards.length > FIRST_CARDS && (
                <button type="button" onClick={() => setAll(!all)} className={`justify-self-start text-[12.5px] ${LINK}`}>
                  {all ? m.showFewer : m.showMore(cards.length - FIRST_CARDS)}
                </button>
              )}
            </Step>

            <Step n={3} title={m.step3}>
              <form
                aria-label={m.nameLabel}
                className="flex flex-wrap items-center gap-x-3 gap-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  create();
                }}
                data-first-form
              >
                <input
                  value={patternName}
                  maxLength={PATTERN_NAME_MAX}
                  aria-label={m.nameLabel}
                  aria-describedby={whyId}
                  placeholder={m.namePlaceholder}
                  onChange={(event) => setPatternName(event.target.value)}
                  onKeyDown={(event) => void escapeClears(event, patternName, () => setPatternName(''))}
                  className="h-[36px] min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
                <Button type="submit" variant="primary" disabled={!ready}>
                  {m.create}
                </Button>
                <p id={whyId} role="status" aria-live="polite" className={`basis-full text-[12px] ${ready ? 'text-ink-muted' : 'text-ink-subtle'}`} data-first-why>
                  {picked.length > 0 && (
                    <>
                      <span className="font-medium tabular-nums text-ink">{m.selectedCount(picked.length)}</span>
                      <button type="button" onClick={reset} className={`ml-1.5 mr-2 ${LINK}`}>
                        {m.clear}
                      </button>
                    </>
                  )}
                  {why}
                </p>
              </form>
            </Step>
          </div>

          <Preview
            sub={sub}
            label={clean}
            typeIds={pickedTypes}
            picked={picked.length}
            left={cards.length - picked.length}
          />
        </div>
      )}
    </div>
  );
}

/** One of the three steps: a number, a title, what to do. */
function Step({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-2.5" data-first-step={n}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-baseline gap-2 text-[13.5px] font-semibold text-ink">
          <span
            aria-hidden
            className="flex h-5 w-5 shrink-0 items-center justify-center self-center rounded-full bg-ink text-[11px] font-semibold tabular-nums text-surface"
          >
            {n}
          </span>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * The chosen sub-topic as the map will draw it once the 題型 exists: the name being typed,
 * the types and count of what is selected, and what stays unsorted. Until something is
 * selected and named it shows the shape, with "Your 題型" where the name goes.
 */
function Preview({ sub, label, typeIds, picked, left }: { sub: string; label: string; typeIds: string[]; picked: number; left: number }) {
  const m = useMessages(FIRST_PATTERN_MESSAGES);
  const page = useMessages(PATTERNS_PAGE_MESSAGES);
  const ui = useUiLanguage();
  const live = picked > 0;
  return (
    <figure
      aria-label={m.preview}
      data-patterns-example
      className="rounded-[12px] border border-line bg-surface-raised px-4 pb-3 pt-2.5 lg:sticky lg:top-0"
    >
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-2 text-[11.5px] font-semibold text-ink-muted">
        <span>{m.preview}</span>
        <span className="rounded bg-surface-sunken px-1.5 py-px text-[10.5px] font-medium text-ink-subtle">{m.previewNote}</span>
      </figcaption>
      <p className="text-[12.5px] text-ink">
        <span className="tabular-nums text-ink-subtle">{letterOf(sub)}</span> · <span className="font-medium">{chromeTopicName(sub, ui)}</span>
      </p>
      <ul className="mt-1 text-[12.5px]">
        <li
          className={`flex items-center gap-2 rounded-md border-b border-line/60 px-1.5 py-1.5 transition-colors duration-150 ease-out-soft ${
            live ? 'bg-accent-soft' : ''
          }`}
          data-first-preview-line
        >
          <span className={`min-w-0 flex-1 truncate ${label ? 'font-medium text-ink' : 'italic text-ink-subtle'}`}>{label || m.yourName}</span>
          {typeIds.map((id) => (
            <span key={id} className="shrink-0 rounded border border-line px-1 py-px text-[10px] font-semibold leading-none tracking-[0.04em] text-ink-subtle">
              {typeName(id)}
            </span>
          ))}
          <span className="w-[28px] shrink-0 text-right tabular-nums text-ink-muted">{picked}</span>
        </li>
        <li className="flex items-center gap-2 px-1.5 py-1.5 text-ink-subtle">
          <span className="min-w-0 flex-1">{m.notSorted}</span>
          <span className="w-[28px] shrink-0 text-right tabular-nums">{left}</span>
        </li>
      </ul>
      <p className="mt-2 border-t border-line/60 pt-2 text-[11.5px] leading-relaxed text-ink-subtle">
        {m.shapes} {page.example1} · {page.example2} · {page.example3}
      </p>
    </figure>
  );
}
