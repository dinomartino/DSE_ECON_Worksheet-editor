'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import {
  likelyType,
  subTopicList,
  topicsToSort,
  type PatternId,
  type PatternItem,
  type SortProgress,
  type SubTopicTally,
} from '@/library/patterns';
import type { BankRow } from '@/library/types';
import { cleanPatternName, matchPatternName, PATTERN_NAME_MAX, samePatternName } from '@/model/patterns';
import { TOPICS, type Topic } from '@/model/topics';
import type { LanguageMode } from '@/model/types';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { listQuestionTypes } from '@/registry';
import { escapeClears } from '../escapeClears';
import { typeName } from './bankPage';
import { FirstPattern } from './FirstPattern';
import { FIRST_PATTERN_MESSAGES } from './FirstPattern.messages';
import type { SortRequest, UnsortRequest } from './PatternSortBoard';
import { PATTERNS_PAGE_MESSAGES } from './PatternsPage.messages';
import { chromeTopicName } from './topicText';

type Confirm = { kind: 'merge'; item: PatternItem; into: PatternItem } | { kind: 'delete'; item: PatternItem };

const SELECT =
  'h-8 cursor-pointer rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25';
const LINK =
  'cursor-pointer text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/** A sub-topic's coarse letter: "C" for C.ped. */
const letterOf = (code: string) => (code.includes('.') ? code.slice(0, code.indexOf('.')) : code);

/** Topic names here follow the interface (`chromeTopicName`): the page holds no paper. */
function useTopicName(): (code: string) => string {
  const ui = useUiLanguage();
  return (code) => chromeTopicName(code, ui);
}

/**
 * The 題型 map (question patterns). One layout whatever is sorted, so naming the first
 * 題型 never turns the page into another (`docs/design/question-types-empty-state.md`):
 * a heading with where the library stands, then, with nothing named yet, the first 題型
 * made in place (`FirstPattern`: pick a topic, click questions alike, name them, beside a
 * live preview; we ship no list), and a line saying it worked; once some 題型 exist, the topics to keep going on, a box per sub-topic with
 * 題型 (one list, type badges), and every other topic on one line. Sorting happens on the
 * sort board (`onSort`, a coarse topic), or for the first one, here. Rename, merge and delete rewrite every copy of
 * every question that uses the 題型 (the caller does the writing).
 */
export function PatternsPage({
  rows,
  language,
  items,
  tallies,
  progress,
  hasQuestions,
  scope,
  busy,
  readOnly = false,
  onScope,
  onCreate,
  onRename,
  onMerge,
  onDelete,
  onShow,
  onSort,
  onSortInto,
  onUnsort,
  onStartNew,
}: {
  /** The bank's rows: the first-run steps show the questions to sort. */
  rows: readonly BankRow[];
  /** The language questions are shown in. */
  language: LanguageMode;
  /** Every 題型 (`listPatterns`), unscoped. */
  items: PatternItem[];
  /** Each sub-topic's questions and how many lack a 題型 (`subTopicTallies`). */
  tallies: ReadonlyMap<string, SubTopicTally>;
  /** Where the sorting stands, per coarse topic (`sortProgress`). */
  progress: SortProgress;
  /** The library holds any question at all. */
  hasQuestions: boolean;
  /** A coarse or fine topic code; undefined = all. */
  scope: string | undefined;
  busy: boolean;
  /** The registry is from a newer build (`isReadOnlyRegistry`): changes are not saved. */
  readOnly?: boolean;
  onScope: (topic: string | undefined) => void;
  onCreate: (pattern: PatternId) => void;
  onRename: (item: PatternItem, to: string) => void;
  onMerge: (item: PatternItem, into: PatternItem) => void;
  onDelete: (item: PatternItem) => void;
  /** Review the questions filed under it. */
  onShow: (item: PatternItem) => void;
  /** Open the sort board for a coarse topic. */
  onSort: (topic: string) => void;
  /** File questions under a 題型, as the sort board does (the first one is made here). */
  onSortInto: (request: SortRequest) => void;
  onUnsort: (request: UnsortRequest) => void;
  onStartNew: () => void;
}) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const [confirm, setConfirm] = useState<Confirm>();
  // The 題型 just made from the first-run steps, until undone or dismissed.
  const [made, setMade] = useState<UnsortRequest & { name: string }>();
  const [runs, setRuns] = useState(0);
  const [showEmpty, setShowEmpty] = useState(false);
  const types = listQuestionTypes().map((type) => type.id);
  const subTopics = useMemo(
    () =>
      TOPICS.flatMap((topic) => topic.children).filter(
        (child) => !scope || child.code === scope || child.parent === scope,
      ),
    [scope],
  );
  const scoped = items.filter((item) => subTopics.some((child) => child.code === item.topic));
  const named = new Set(items.map((item) => `${item.topic}\n${item.name.toLowerCase()}`)).size;
  const box = {
    items,
    tallies,
    types,
    busy,
    onCreate,
    onRename,
    onShow,
    onSort,
    onMerge: (item: PatternItem, into: PatternItem) => setConfirm({ kind: 'merge', item, into }),
    onDelete: (item: PatternItem) => setConfirm({ kind: 'delete', item }),
  };

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-7 py-[22px]">
      <div className="mx-auto grid w-full max-w-[1100px] gap-5">
        {readOnly && (
          <p role="status" data-patterns-read-only className="max-w-[720px] rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] leading-relaxed text-warn-ink">
            {m.readOnly}
          </p>
        )}
        <header className="grid max-w-[760px] gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="font-display text-[22px] font-normal leading-tight text-ink">{m.heading}</h2>
            {progress.questions > 0 && (
              <p className="text-[12.5px] tabular-nums text-ink-subtle" data-patterns-summary>
                {m.status(progress.questions, progress.sorted, named)}
              </p>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-ink-muted" data-patterns-intro>
            {m.intro}
          </p>
        </header>

        {!hasQuestions ? (
          <div className="grid gap-5" data-patterns-empty-library>
            <div>
              <p className="max-w-[560px] text-[13px] leading-relaxed text-ink-muted">{m.emptyLibrary}</p>
              <Button className="mt-2.5" variant="primary" onClick={onStartNew}>
                {m.startClassroom}
              </Button>
            </div>
            <Example />
          </div>
        ) : progress.questions === 0 ? (
          <div className="grid gap-5">
            <p className="max-w-[560px] text-[13px] leading-relaxed text-ink-muted">{m.noSubTopic}</p>
            <Example />
          </div>
        ) : items.length === 0 && !made ? (
          <FirstPattern
            key={runs}
            rows={rows}
            progress={progress}
            tallies={tallies}
            language={language}
            busy={busy}
            onSort={onSort}
            onSortInto={(request) => {
              onSortInto(request);
              setMade({
                topic: request.topic,
                roots: request.roots,
                name: request.name,
                created: request.typeIds.map((typeId) => ({ topic: request.topic, typeId, name: request.name })),
              });
            }}
          />
        ) : (
          <>
          {made && (
            <Made
              made={made}
              busy={busy}
              onUndo={() => {
                onUnsort(made);
                setMade(undefined);
                setRuns((n) => n + 1);
              }}
              onSort={() => onSort(letterOf(made.topic))}
            />
          )}
          <InUse
            scoped={scoped}
            subTopics={subTopics}
            scope={scope}
            progress={progress}
            showEmpty={showEmpty}
            onShowEmpty={setShowEmpty}
            onScope={onScope}
            box={box}
          />
          </>
        )}
      </div>

      {confirm?.kind === 'merge' && (
        <Dialog
          title={m.mergeTitle(confirm.item.name, confirm.into.name)}
          description={m.mergeText(confirm.item.count, confirm.item.name, confirm.into.name)}
          width={480}
          onClose={() => setConfirm(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setConfirm(undefined)}>
                {m.cancel}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onMerge(confirm.item, confirm.into);
                  setConfirm(undefined);
                }}
              >
                {m.merge}
              </Button>
            </>
          }
        >
          <span />
        </Dialog>
      )}
      {confirm?.kind === 'delete' && (
        <Dialog
          title={m.deleteTitle(confirm.item.name)}
          description={
            confirm.item.count > 0 ? m.deleteText(confirm.item.count) : m.deleteUnused
          }
          width={480}
          onClose={() => setConfirm(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setConfirm(undefined)}>
                {m.cancel}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onDelete(confirm.item);
                  setConfirm(undefined);
                }}
              >
                {m.deleteButton}
              </Button>
            </>
          }
        >
          <span />
        </Dialog>
      )}
    </div>
  );
}

/** What every sub-topic box needs. */
interface BoxProps {
  items: PatternItem[];
  tallies: ReadonlyMap<string, SubTopicTally>;
  types: string[];
  busy: boolean;
  onCreate: (pattern: PatternId) => void;
  onRename: (item: PatternItem, to: string) => void;
  onMerge: (item: PatternItem, into: PatternItem) => void;
  onDelete: (item: PatternItem) => void;
  onShow: (item: PatternItem) => void;
  onSort: (topic: string) => void;
}

/**
 * The first 題型 made: what it holds, where to go on, and a way to take it back. A status
 * line as the sort board's, not a banner (SYSTEM_ARCHITECTURE.md § Notices); it lasts
 * while the map is open.
 */
function Made({ made, busy, onUndo, onSort }: { made: UnsortRequest & { name: string }; busy: boolean; onUndo: () => void; onSort: () => void }) {
  const m = useMessages(FIRST_PATTERN_MESSAGES);
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink" data-patterns-made>
      <span aria-hidden className="text-accent-ink">✓</span>
      <span>{m.made(made.name, made.roots.length)}</span>
      <button type="button" disabled={busy} onClick={onUndo} className={LINK}>
        {m.undo}
      </button>
      <button type="button" onClick={onSort} className={`font-medium ${LINK}`}>
        {m.keepSorting(letterOf(made.topic))}
      </button>
    </p>
  );
}

/** Topics on one line, each a link to its sort board: "Other topics: A 2 · B 3". */
function OtherTopics({ topics, onSort }: { topics: [string, number][]; onSort: (topic: string) => void }) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const name = useTopicName();
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px] text-ink-subtle" data-patterns-other>
      <span>{m.otherTopics}</span>
      {topics.map(([topic, n]) => (
        <button key={topic} type="button" onClick={() => onSort(topic)} title={m.sortTopicLabel(name(topic))} className={LINK}>
          <span className="font-medium">{topic}</span> <span className="tabular-nums">{n}</span>
        </button>
      ))}
    </p>
  );
}

/** The sub-topic the example shows: price elasticity of demand, the one every teacher sets. */
const EXAMPLE_TOPIC = 'C.ped';

/**
 * A sorted sub-topic, as an illustration: chrome, never data, and drawn as a card rather
 * than greyed (a greyed card reads as disabled). Its names show how teachers shape them.
 */
function Example() {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const name = useTopicName();
  // The registry's first two types (MCQ, LQ), named as every badge names them.
  const [first, second = first] = listQuestionTypes().map((type) => typeName(type.id));
  const lines: [string, string[], string][] = [
    [m.example1, [first], '4'],
    [m.example2, [first, second], '3 · 1'],
    [m.example3, [second], '2'],
  ];
  return (
    <figure
      aria-label={m.example}
      data-patterns-example
      className="max-w-[560px] select-none rounded-[12px] border border-line bg-surface-raised px-4 pb-3 pt-2.5"
    >
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-2 text-[11.5px] font-semibold text-ink-muted">
        <span>{m.example}</span>
        <span className="rounded bg-surface-sunken px-1.5 py-px text-[10.5px] font-medium text-ink-subtle">{m.exampleNote}</span>
      </figcaption>
      <p className="text-[12.5px] text-ink">
        <span className="tabular-nums text-ink-subtle">{letterOf(EXAMPLE_TOPIC)}</span> ·{' '}
        <span className="font-medium">{name(EXAMPLE_TOPIC)}</span>
      </p>
      <ul className="mt-1 text-[12.5px] text-ink">
        {lines.map(([label, badges, count]) => (
          <li key={label} className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-b-0">
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {badges.map((badge) => (
              <TypeBadge key={badge}>{badge}</TypeBadge>
            ))}
            <span className="w-[48px] shrink-0 text-right tabular-nums text-ink-muted">{count}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 py-1.5 text-ink-subtle">
          <span className="min-w-0 flex-1">{m.noPatternLine}</span>
          <span className="w-[48px] shrink-0 text-right tabular-nums">5</span>
        </li>
      </ul>
    </figure>
  );
}

/**
 * Some 題型 named: the topics to keep going on, then per topic with 題型 a box per
 * sub-topic that has some, and that topic's other sub-topics on one line. Topics with
 * none share one line at the end: never a row per sub-topic.
 */
function InUse({
  scoped,
  subTopics,
  scope,
  progress,
  showEmpty,
  onShowEmpty,
  onScope,
  box,
}: {
  scoped: PatternItem[];
  subTopics: Topic[];
  scope: string | undefined;
  progress: SortProgress;
  showEmpty: boolean;
  onShowEmpty: (show: boolean) => void;
  onScope: (topic: string | undefined) => void;
  box: BoxProps;
}) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const name = useTopicName();
  const withPatterns = (code: string) => scoped.some((item) => item.topic === code);
  const hasQuestions = (code: string) => (box.tallies.get(code)?.questions ?? 0) > 0;
  const parents = TOPICS.filter((parent) =>
    subTopics.some((child) => child.parent === parent.code && (withPatterns(child.code) || (showEmpty && !hasQuestions(child.code)))),
  );
  const keepGoing = topicsToSort(progress);
  const others = progress.topics.filter(
    (entry) =>
      entry.notSorted > 0 &&
      !parents.some((parent) => parent.code === entry.topic) &&
      !keepGoing.includes(entry) &&
      (!scope || letterOf(scope) === entry.topic),
  );
  return (
    <>
      {keepGoing.length > 0 && (
        <section aria-label={m.keepGoing} className="grid gap-2" data-patterns-keep-going>
          <h3 className="text-[13.5px] font-semibold text-ink">{m.keepGoing}</h3>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {keepGoing.map((entry, i) => (
              <li key={entry.topic} className="flex items-center gap-3 rounded-[10px] border border-line bg-surface-raised px-3.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-ink">
                    <span className="font-medium">{entry.topic}</span> {name(entry.topic)}
                  </span>
                  <span className="block text-[11.5px] tabular-nums text-ink-subtle">{m.notSortedIn(entry.notSorted)}</span>
                </span>
                <Button size="sm" variant={i === 0 ? 'primary' : 'default'} aria-label={m.sortTopicLabel(name(entry.topic))} onClick={() => box.onSort(entry.topic)}>
                  {m.sortTopic(entry.topic)}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap items-center justify-end gap-4 border-b border-line pb-3">
        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-subtle">
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(event) => onShowEmpty(event.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
          />
          {m.showEmpty}
        </label>
        <label className="flex items-center gap-2 text-[12px] text-ink-subtle">
          {m.show}
          <select value={scope ?? ''} onChange={(event) => onScope(event.target.value || undefined)} className={`${SELECT} max-w-[280px]`}>
            <option value="">{m.allTopics}</option>
            {TOPICS.map((topic) => (
              <optgroup key={topic.code} label={`${topic.code} · ${name(topic.code)}`}>
                <option value={topic.code}>{m.allSubTopics(topic.code)}</option>
                {topic.children.map((child) => (
                  <option key={child.code} value={child.code}>
                    {name(child.code)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      {parents.length === 0 && others.length === 0 && (
        <p className="text-[13px] text-ink-muted">{m.noneIn(scope ? name(scope) : '')}</p>
      )}
      {parents.map((parent) => {
        const children = subTopics.filter((child) => child.parent === parent.code);
        const boxes = children.filter((child) => withPatterns(child.code) || (showEmpty && !hasQuestions(child.code)));
        const toSort = children.filter((child) => !withPatterns(child.code) && (box.tallies.get(child.code)?.without ?? 0) > 0);
        return (
          <section key={parent.code} aria-label={`${parent.code} ${name(parent.code)}`} className="grid gap-2.5">
            <h3 className="flex items-baseline gap-2 text-[14px] text-ink">
              <span className="font-display text-[18px] leading-none">{parent.code}</span>
              <span className="font-semibold">{name(parent.code)}</span>
            </h3>
            {boxes.length > 0 && (
              <div className="grid items-start gap-3 lg:grid-cols-2">
                {boxes.map((child) => (
                  <SubTopicBox key={child.code} topic={child.code} {...box} />
                ))}
              </div>
            )}
            {toSort.length > 0 && (
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px] text-ink-subtle" data-patterns-to-sort={parent.code}>
                <span>{m.stillToSort}</span>
                {toSort.map((child) => (
                  <span key={child.code} className="text-ink-muted" data-pattern-topic={child.code}>
                    {name(child.code)} <span className="tabular-nums text-ink-subtle">{box.tallies.get(child.code)?.without}</span>
                  </span>
                ))}
                <button type="button" onClick={() => box.onSort(parent.code)} aria-label={m.sortTopicLabel(name(parent.code))} className={`font-medium ${LINK}`}>
                  {m.sortTopic(parent.code)}
                </button>
              </p>
            )}
          </section>
        );
      })}
      {others.length > 0 && <OtherTopics topics={others.map((entry) => [entry.topic, entry.notSorted])} onSort={box.onSort} />}
    </>
  );
}

/** One sub-topic: its 題型 (one list, type badges), the questions not sorted, and "+ New 題型 here". */
function SubTopicBox({ topic, items, tallies, types, busy, onCreate, onRename, onMerge, onDelete, onShow, onSort }: BoxProps & { topic: string }) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const name = useTopicName();
  const [adding, setAdding] = useState(false);
  const list = subTopicList(items, topic);
  const tally = tallies.get(topic);
  const without = tally?.without ?? 0;
  return (
    <section
      aria-label={name(topic)}
      className="rounded-[10px] border border-line bg-surface-raised px-4 pb-2.5 pt-3"
      data-pattern-topic={topic}
    >
      <h4 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] text-ink">
        <span className="flex min-w-0 items-baseline gap-x-2">
          <span className="tabular-nums text-ink-subtle">{letterOf(topic)}</span>
          <span className="min-w-0 font-semibold">{name(topic)}</span>
        </span>
        {tally && <span className="text-[11.5px] tabular-nums text-ink-subtle">{m.boxCounts(tally.questions, without)}</span>}
      </h4>
      <ul className="mt-1.5">
        {list.map((item) => (
          <PatternLine
            key={`${item.typeId}:${item.name}`}
            item={item}
            siblings={list.filter((other) => other !== item && other.typeId === item.typeId)}
            busy={busy}
            onRename={(to) => onRename(item, to)}
            onMerge={(into) => onMerge(item, into)}
            onDelete={() => onDelete(item)}
            onShow={() => onShow(item)}
            onSort={(tally?.questions ?? 0) > 0 ? () => onSort(letterOf(topic)) : undefined}
          />
        ))}
        {without > 0 && (
          <li className="flex items-center gap-2 py-1.5 text-[12.5px]">
            <span className="min-w-0 flex-1 text-ink-subtle">{m.noPatternLine}</span>
            <span className="shrink-0 tabular-nums text-ink-subtle">{without}</span>
            <button type="button" onClick={() => onSort(letterOf(topic))} className={`w-[118px] shrink-0 text-right text-[12px] ${LINK}`} data-pattern-none>
              {m.sortThese}
            </button>
          </li>
        )}
      </ul>
      {adding ? (
        <NewHere
          topic={topic}
          types={types}
          defaultType={likelyType(tally, types) ?? types[0]}
          siblings={list}
          busy={busy}
          onCreate={(pattern) => {
            onCreate(pattern);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label={m.newIn(name(topic))}
          className={`mt-1 rounded px-0.5 text-[12px] ${LINK}`}
        >
          {m.newHere}
        </button>
      )}
    </section>
  );
}

function TypeBadge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded border border-line px-1 py-px text-[10px] font-semibold leading-none tracking-[0.04em] text-ink-subtle">
      {children}
    </span>
  );
}

function PatternLine({
  item,
  siblings,
  busy,
  onRename,
  onMerge,
  onDelete,
  onShow,
  onSort,
}: {
  item: PatternItem;
  /** The other 題型 of the same sub-topic and type: what it can merge into. */
  siblings: PatternItem[];
  busy: boolean;
  onRename: (to: string) => void;
  onMerge: (into: PatternItem) => void;
  onDelete: () => void;
  onShow: () => void;
  /** Open the sort board to file questions under it; absent when the sub-topic has none. */
  onSort?: () => void;
}) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const [mode, setMode] = useState<'view' | 'actions' | 'rename' | 'merge'>('view');
  const [name, setName] = useState(item.name);
  const [into, setInto] = useState('');
  const clean = cleanPatternName(name);
  const clash = siblings.find((other) => samePatternName(other.name, clean));
  const renameProblem = !clean ? m.typeName : clash ? m.clash(clash.name) : undefined;

  if (mode === 'rename') {
    return (
      <li className="py-1.5">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (renameProblem) return;
            if (clean !== item.name) onRename(clean);
            setMode('view');
          }}
        >
          <input
            autoFocus
            value={name}
            maxLength={PATTERN_NAME_MAX}
            aria-label={m.newNameFor(item.name)}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setName(item.name);
                setMode('view');
              }
            }}
            className="h-7 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          <Button size="sm" type="submit" variant="primary" disabled={busy || Boolean(renameProblem)}>
            {m.save}
          </Button>
          <Button size="sm" variant="subtle" onClick={() => setMode('view')}>
            {m.cancel}
          </Button>
        </form>
        {renameProblem && clean && <p className="mt-1 text-[11.5px] text-warn-ink">{renameProblem}</p>}
      </li>
    );
  }

  if (mode === 'merge') {
    const target = siblings.find((other) => other.name === into);
    return (
      <li className="py-1.5">
        <div className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="shrink-0">{m.mergeInto(item.name)}</span>
          <select
            autoFocus
            value={into}
            aria-label={m.mergeIntoLabel(item.name)}
            onChange={(event) => setInto(event.target.value)}
            className="h-7 min-w-0 flex-1 cursor-pointer rounded-md border border-line bg-surface px-1.5 text-[12.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          >
            <option value="">{m.choosePattern}</option>
            {siblings.map((other) => (
              <option key={other.name} value={other.name}>
                {other.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" disabled={busy || !target} onClick={() => target && onMerge(target)}>
            {m.mergeEllipsis}
          </Button>
          <Button size="sm" variant="subtle" onClick={() => setMode('view')}>
            {m.cancel}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li
      className="group flex items-center gap-2 border-b border-line/60 py-1.5 text-[12.5px]"
      data-pattern-name={item.name}
      data-pattern-type={item.typeId}
    >
      {item.count > 0 ? (
        <button type="button" onClick={onShow} title={m.reviewTitle} className={`min-w-0 flex-1 truncate text-left text-ink ${LINK.replace('text-accent-ink ', '')} hover:text-accent-ink`}>
          {item.name}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate text-ink" title={item.name}>
          {item.name}
        </span>
      )}
      <TypeBadge>{typeName(item.typeId)}</TypeBadge>
      {mode === 'actions' ? (
        // The rare actions, behind ⋯ so the line stays a name, a type and a count.
        <span role="group" aria-label={m.actionsFor(item.name)} className="flex shrink-0 gap-0.5">
          <LineAction disabled={busy} onClick={() => setMode('rename')}>
            {m.rename}
          </LineAction>
          {siblings.length > 0 && (
            <LineAction disabled={busy} onClick={() => setMode('merge')}>
              {m.merge}
            </LineAction>
          )}
          <LineAction disabled={busy} onClick={() => {
            setMode('view');
            onDelete();
          }}>
            {m.delete}
          </LineAction>
          <LineAction disabled={false} onClick={() => setMode('view')}>
            {m.cancel}
          </LineAction>
        </span>
      ) : (
        <>
          {item.count > 0 ? (
            <button type="button" onClick={onShow} title={m.reviewTitle} className={`w-[92px] shrink-0 text-right tabular-nums ${LINK}`}>
              {m.questionsLink(item.count)}
            </button>
          ) : onSort ? (
            <button type="button" onClick={onSort} title={m.noQuestionsYet} className={`shrink-0 text-right text-[12px] ${LINK}`}>
              {m.sortInto}
            </button>
          ) : (
            <span className="w-[92px] shrink-0 text-right text-ink-subtle">{m.noQuestionsYet}</span>
          )}
          <button
            type="button"
            aria-label={m.actionsFor(item.name)}
            title={m.actionsFor(item.name)}
            onClick={() => setMode('actions')}
            className="h-6 w-6 shrink-0 cursor-pointer rounded text-[13px] leading-none text-ink-subtle transition-colors duration-150 ease-out-soft hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ⋯
          </button>
        </>
      )}
    </li>
  );
}

function LineAction({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="cursor-pointer rounded px-1.5 py-0.5 text-[11.5px] text-ink-muted transition-colors duration-150 ease-out-soft hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** Same as the picker: a name differing only by case, spacing or punctuation is that one; a close one is named, softly. */
function nameCheck(name: string, siblings: readonly PatternItem[], typeId: string) {
  const clean = cleanPatternName(name);
  const same = siblings.filter((item) => item.typeId === typeId);
  const exists = clean ? same.find((item) => matchPatternName(clean, item.name) === 'same') : undefined;
  const close = clean && !exists ? same.find((item) => matchPatternName(clean, item.name) !== undefined) : undefined;
  return { clean, exists, close };
}

/** Why Add is grey, said under the form; then a clash or a near-match. */
function FormNote({ why, exists, close }: { why?: string; exists?: PatternItem; close?: PatternItem }) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  if (exists) return <p className="basis-full text-[11.5px] text-warn-ink">{m.exists(exists.name)}</p>;
  if (why) return <p className="basis-full text-[11.5px] text-ink-subtle" data-add-why>{why}</p>;
  if (close) return <p className="basis-full text-[11.5px] text-ink-subtle">{m.close(close.name)}</p>;
  return null;
}

/** "+ New 題型 here": the sub-topic is the box's; the name first, then its question type. */
function NewHere({
  topic,
  types,
  defaultType,
  siblings,
  busy,
  onCreate,
  onCancel,
}: {
  topic: string;
  types: string[];
  defaultType: string;
  siblings: PatternItem[];
  busy: boolean;
  onCreate: (pattern: PatternId) => void;
  onCancel: () => void;
}) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const radio = useId();
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState(defaultType);
  const { clean, exists, close } = nameCheck(name, siblings, typeId);
  return (
    <form
      aria-label={m.newPattern}
      className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-dashed border-line-strong px-2.5 py-2 text-[12px] text-ink-subtle"
      onSubmit={(event) => {
        event.preventDefault();
        if (!clean || exists) return;
        onCreate({ topic, typeId, name: clean });
      }}
    >
      <input
        autoFocus
        value={name}
        maxLength={PATTERN_NAME_MAX}
        aria-label={m.nameLabel}
        placeholder={m.namePlaceholder}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          if (!escapeClears(event, name, () => setName(''))) {
            event.stopPropagation();
            onCancel();
          }
        }}
        className="h-7 min-w-[180px] flex-1 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      <span role="radiogroup" aria-label={m.questionType} className="flex items-center gap-2">
        <span>{m.questionType}</span>
        {types.map((id) => (
          <label key={id} className="flex cursor-pointer items-center gap-1 text-ink">
            <input
              type="radio"
              name={radio}
              value={id}
              checked={typeId === id}
              onChange={() => setTypeId(id)}
              className="h-3 w-3 cursor-pointer accent-[var(--accent)]"
            />
            {typeName(id)}
          </label>
        ))}
      </span>
      <Button size="sm" type="submit" variant="primary" disabled={busy || !clean || Boolean(exists)}>
        {m.add}
      </Button>
      <Button size="sm" variant="subtle" onClick={onCancel}>
        {m.cancel}
      </Button>
      <FormNote why={!clean ? m.typeName : undefined} exists={exists} close={close} />
    </form>
  );
}
