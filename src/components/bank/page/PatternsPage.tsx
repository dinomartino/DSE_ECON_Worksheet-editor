'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { likelyType, startingSubTopics, subTopicList, type PatternId, type PatternItem, type SubTopicTally } from '@/library/patterns';
import { cleanPatternName, matchPatternName, PATTERN_NAME_MAX, samePatternName } from '@/model/patterns';
import { TOPICS, topicNamesFor, type Topic } from '@/model/topics';
import { useMessages } from '@/i18n/language';
import { useViewLanguage } from '@/settings/paperLanguage';
import { listQuestionTypes } from '@/registry';
import { escapeClears } from '../escapeClears';
import { typeName } from './bankPage';
import { PATTERNS_PAGE_MESSAGES } from './PatternsPage.messages';
import { topicName } from './topicText';

type Confirm = { kind: 'merge'; item: PatternItem; into: PatternItem } | { kind: 'delete'; item: PatternItem };

const SELECT =
  'h-8 cursor-pointer rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25';
const LINK =
  'cursor-pointer text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * The 題型 map (question patterns): every sub-topic with questions or 題型, each with one
 * list (MCQ and LQ together, a type badge on each line), how many of its questions have
 * none yet, and "+ New 題型 here", so a sub-topic is never chosen from the full list. On
 * first run, an intro, a greyed example (chrome, from the catalogue: we ship no list) and
 * the sub-topics with the most questions to start on. Rename, merge and delete rewrite
 * every copy of every question that uses the 題型 (the caller does the writing).
 */
export function PatternsPage({
  items,
  tallies,
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
  onReview,
  onStartNew,
}: {
  /** Every 題型 (`listPatterns`), unscoped. */
  items: PatternItem[];
  /** Each sub-topic's questions and how many lack a 題型 (`subTopicTallies`). */
  tallies: ReadonlyMap<string, SubTopicTally>;
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
  /** Review a sub-topic's questions, starting at one without a 題型. */
  onReview: (topic: string) => void;
  onStartNew: () => void;
}) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const [confirm, setConfirm] = useState<Confirm>();
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
  const firstRun = items.length === 0;
  const box = {
    items,
    tallies,
    types,
    busy,
    onCreate,
    onRename,
    onShow,
    onReview,
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
        <p className="max-w-[720px] text-[13px] leading-relaxed text-ink-muted" data-patterns-intro>
          {m.intro}
        </p>

        {firstRun ? (
          <FirstRun
            hasQuestions={hasQuestions}
            tallies={tallies}
            subTopics={TOPICS.flatMap((topic) => topic.children)}
            box={box}
            onStartNew={onStartNew}
          />
        ) : (
          <InUse
            scoped={scoped}
            subTopics={subTopics}
            scope={scope}
            showEmpty={showEmpty}
            onShowEmpty={setShowEmpty}
            onScope={onScope}
            box={box}
          />
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
  onReview: (topic: string) => void;
}

/** No 題型 yet: what one is, what a filled map looks like, and where to start. */
function FirstRun({
  hasQuestions,
  tallies,
  subTopics,
  box,
  onStartNew,
}: {
  hasQuestions: boolean;
  tallies: ReadonlyMap<string, SubTopicTally>;
  subTopics: Topic[];
  box: BoxProps;
  onStartNew: () => void;
}) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const starts = startingSubTopics(tallies);
  const [naming, setNaming] = useState(false);
  return (
    <>
      <Example />
      {!hasQuestions ? (
        <div data-patterns-empty-library>
          <p className="max-w-[560px] text-[13px] leading-relaxed text-ink-muted">{m.emptyLibrary}</p>
          <button type="button" onClick={onStartNew} className={`mt-2 text-[12.5px] font-medium ${LINK}`}>
            {m.startClassroom}
          </button>
        </div>
      ) : (
        <>
          {starts.length > 0 ? (
            <section aria-label={m.startHere} className="grid gap-2" data-patterns-starts>
              <h2 className="text-[13.5px] font-semibold text-ink">{m.startHere}</h2>
              <p className="-mt-1 max-w-[720px] text-[12.5px] text-ink-subtle">{m.startHint}</p>
              <ToSortList topics={starts.map((tally) => tally.topic)} {...box} />
            </section>
          ) : (
            <p className="max-w-[560px] text-[13px] leading-relaxed text-ink-muted">{m.noSubTopic}</p>
          )}
          <div>
            {naming ? (
              <NewPattern subTopics={subTopics} {...box} onCancel={() => setNaming(false)} />
            ) : (
              <p className="text-[12.5px] text-ink-subtle">
                {m.nameAny}{' '}
                <button type="button" onClick={() => setNaming(true)} className={`font-medium ${LINK}`}>
                  {m.newPattern}
                </button>
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** The sub-topic the example shows: price elasticity of demand, the one every teacher sets. */
const EXAMPLE_TOPIC = 'C.ped';

/** The greyed sample of a filled sub-topic: chrome, never data. */
function Example() {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const view = useViewLanguage();
  // The registry's first two types (MCQ, LQ), named as every badge names them.
  const [first, second = first] = listQuestionTypes().map((type) => typeName(type.id));
  const lines: [string, string, number][] = [
    [m.example1, first, 4],
    [m.example2, first, 3],
    [m.example2, second, 1],
    [m.example3, second, 2],
  ];
  return (
    <figure
      aria-label={m.example}
      data-patterns-example
      className="max-w-[560px] select-none rounded-[10px] border border-dashed border-line-strong bg-surface-sunken/60 px-4 pb-3 pt-2.5 text-ink-subtle"
    >
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.08em]">
        <span>{m.example}</span>
        <span className="font-normal normal-case tracking-normal">{m.exampleNote}</span>
      </figcaption>
      <p className="text-[12.5px] text-ink-muted">
        <span className="tabular-nums">{EXAMPLE_TOPIC.slice(0, EXAMPLE_TOPIC.indexOf('.'))}</span> ·{' '}
        <span className="font-medium">{topicName(EXAMPLE_TOPIC, view)}</span>
      </p>
      <ul className="mt-1 text-[12px]">
        {lines.map(([name, type, count]) => (
          <li key={`${name} ${type}`} className="flex items-center gap-2 border-b border-line/60 py-1 last:border-b-0">
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <TypeBadge>{type}</TypeBadge>
            <span className="w-[86px] shrink-0 text-right tabular-nums">{m.questionCount(count)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 py-1">
          <span className="min-w-0 flex-1 italic">{m.noPatternLine}</span>
          <span className="w-[86px] shrink-0 text-right tabular-nums">5</span>
        </li>
      </ul>
    </figure>
  );
}

/** 題型 in use: per topic, a box per sub-topic. */
function InUse({
  scoped,
  subTopics,
  scope,
  showEmpty,
  onShowEmpty,
  onScope,
  box,
}: {
  scoped: PatternItem[];
  subTopics: Topic[];
  scope: string | undefined;
  showEmpty: boolean;
  onShowEmpty: (show: boolean) => void;
  onScope: (topic: string | undefined) => void;
  box: BoxProps;
}) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const view = useViewLanguage();
  const inUse = scoped.filter((item) => item.count > 0).length;
  const listed = subTopics.filter(
    (child) => showEmpty || scoped.some((item) => item.topic === child.code) || (box.tallies.get(child.code)?.questions ?? 0) > 0,
  );
  const parents = TOPICS.filter((parent) => listed.some((child) => child.parent === parent.code));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
        <p className="text-[13px] tabular-nums text-ink" data-patterns-summary>
          {m.summary(inUse, scoped.length - inUse)}
        </p>
        <div className="flex flex-wrap items-center gap-4">
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
                <optgroup key={topic.code} label={`${topic.code} · ${topicName(topic.code, view)}`}>
                  <option value={topic.code}>{m.allSubTopics(topic.code)}</option>
                  {topic.children.map((child) => (
                    <option key={child.code} value={child.code}>
                      {topicName(child.code, view)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
      </div>
      {listed.length === 0 ? (
        <p className="text-[13px] text-ink-muted">{m.noneIn(scope ? topicName(scope, view) : '')}</p>
      ) : (
        parents.map((parent) => (
          <section key={parent.code} aria-label={`${parent.code} ${topicName(parent.code, view)}`} className="grid gap-2.5">
            <h2 className="flex items-baseline gap-2 text-[14px] text-ink">
              <span className="font-display text-[18px] leading-none">{parent.code}</span>
              <span className="font-semibold">{topicName(parent.code, view)}</span>
            </h2>
            {/* Sub-topics with 題型 get a box each; the rest, still to sort, share one compact list. */}
            {listed.some((child) => child.parent === parent.code && scoped.some((item) => item.topic === child.code)) && (
              <div className="grid items-start gap-3 lg:grid-cols-2">
                {listed
                  .filter((child) => child.parent === parent.code && scoped.some((item) => item.topic === child.code))
                  .map((child) => (
                    <SubTopicBox key={child.code} topic={child.code} {...box} />
                  ))}
              </div>
            )}
            <ToSortList
              topics={listed
                .filter((child) => child.parent === parent.code && !scoped.some((item) => item.topic === child.code))
                .map((child) => child.code)}
              {...box}
            />
          </section>
        ))
      )}
    </>
  );
}

/** Sub-topics with no 題型 yet, a line each: how many questions, Review these, + New 題型 here. */
function ToSortList({ topics, ...box }: BoxProps & { topics: string[] }) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  if (topics.length === 0) return null;
  return (
    <ul aria-label={m.noPatternYet} className="max-w-[760px] rounded-[10px] border border-line bg-surface-raised px-4 py-1" data-patterns-to-sort>
      {topics.map((topic) => (
        <ToSortLine key={topic} topic={topic} {...box} />
      ))}
    </ul>
  );
}

function ToSortLine({ topic, tallies, types, busy, onCreate, onReview }: BoxProps & { topic: string }) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const view = useViewLanguage();
  const [adding, setAdding] = useState(false);
  const tally = tallies.get(topic);
  return (
    <li className="border-b border-line/60 py-1.5 last:border-b-0" data-pattern-topic={topic}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12.5px]">
        <span className="min-w-0 flex-1 truncate text-ink">
          <span className="mr-1.5 tabular-nums text-ink-subtle">{topic.slice(0, topic.indexOf('.'))}</span>
          <span className="font-medium">{topicName(topic, view)}</span>
        </span>
        <span className="shrink-0 text-[11.5px] tabular-nums text-ink-subtle">{m.questionCount(tally?.questions ?? 0)}</span>
        {(tally?.without ?? 0) > 0 && (
          <button type="button" onClick={() => onReview(topic)} title={m.reviewTheseTitle} className={`shrink-0 text-[12px] ${LINK}`} data-pattern-none>
            {m.reviewThese}
          </button>
        )}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label={m.newIn(topicName(topic, view))}
            className={`shrink-0 text-[12px] ${LINK}`}
          >
            {m.newHere}
          </button>
        )}
      </div>
      {adding && (
        <NewHere
          topic={topic}
          types={types}
          defaultType={likelyType(tally, types) ?? types[0]}
          siblings={[]}
          busy={busy}
          onCreate={(pattern) => {
            onCreate(pattern);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </li>
  );
}

/** One sub-topic: its 題型 (one list, type badges), the questions without one, and "+ New 題型 here". */
function SubTopicBox({ topic, items, tallies, types, busy, onCreate, onRename, onMerge, onDelete, onShow, onReview }: BoxProps & { topic: string }) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const view = useViewLanguage();
  const [adding, setAdding] = useState(false);
  const list = subTopicList(items, topic);
  const tally = tallies.get(topic);
  const without = tally?.without ?? 0;
  const parent = TOPICS.find((entry) => entry.children.some((child) => child.code === topic));
  const child = parent?.children.find((entry) => entry.code === topic);
  return (
    <section
      aria-label={topicName(topic, view)}
      className="rounded-[10px] border border-line bg-surface-raised px-4 pb-2.5 pt-3"
      data-pattern-topic={topic}
    >
      <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] text-ink">
        <span className="flex min-w-0 items-baseline gap-x-2">
          <span className="tabular-nums text-ink-subtle">{parent?.code}</span>
          {child && topicNamesFor(view, 'wide') === 'both' ? (
            <span className="min-w-0">
              <span className="font-semibold">{child.en}</span> <span className="text-ink-subtle">{child.zh}</span>
            </span>
          ) : (
            <span className="min-w-0 font-semibold">{topicName(topic, view)}</span>
          )}
        </span>
        {tally && <span className="text-[11.5px] tabular-nums text-ink-subtle">{m.boxCounts(tally.questions, without)}</span>}
      </h3>
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
          />
        ))}
        {without > 0 && (
          <li className="flex items-center gap-2 py-1.5 text-[12.5px]">
            <span className="min-w-0 flex-1 italic text-ink-subtle">{m.noPatternLine}</span>
            <span className="shrink-0 tabular-nums text-ink-subtle">{without}</span>
            <button type="button" onClick={() => onReview(topic)} title={m.reviewTheseTitle} className={`w-[118px] shrink-0 text-right text-[12px] ${LINK}`} data-pattern-none>
              {m.reviewThese}
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
          aria-label={m.newIn(topicName(topic, view))}
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
}: {
  item: PatternItem;
  /** The other 題型 of the same sub-topic and type: what it can merge into. */
  siblings: PatternItem[];
  busy: boolean;
  onRename: (to: string) => void;
  onMerge: (into: PatternItem) => void;
  onDelete: () => void;
  onShow: () => void;
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
          ) : (
            <span className="w-[92px] shrink-0 text-right text-ink-subtle">{m.notUsed}</span>
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

/** Define a 題型 for any sub-topic, before any question uses it (first run only). */
function NewPattern({
  subTopics,
  types,
  items,
  busy,
  onCreate,
  onCancel,
}: {
  subTopics: Topic[];
  types: string[];
  items: PatternItem[];
  busy: boolean;
  onCreate: (pattern: PatternId) => void;
  onCancel: () => void;
}) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const view = useViewLanguage();
  const [topic, setTopic] = useState('');
  const [typeId, setTypeId] = useState(types[0] ?? '');
  const [name, setName] = useState('');
  const { clean, exists, close } = nameCheck(name, items.filter((item) => item.topic === topic), typeId);
  const why = !topic ? m.chooseSubTopicFirst : !clean ? m.typeName : undefined;
  return (
    <form
      aria-label={m.newPattern}
      className="flex max-w-[960px] flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3.5 py-2.5 text-[12px] text-ink-subtle"
      onSubmit={(event) => {
        event.preventDefault();
        if (!clean || exists || !topic) return;
        onCreate({ topic, typeId, name: clean });
        setName('');
      }}
    >
      <span className="font-medium text-ink">{m.newPattern}</span>
      <select value={topic} aria-label={m.subTopic} onChange={(event) => setTopic(event.target.value)} className={`${SELECT} w-[220px]`}>
        <option value="" disabled>
          {m.chooseSubTopic}
        </option>
        {TOPICS.map((parent) => (
          <optgroup key={parent.code} label={`${parent.code} · ${topicName(parent.code, view)}`}>
            {subTopics
              .filter((child) => child.parent === parent.code)
              .map((child) => (
                <option key={child.code} value={child.code}>
                  {topicName(child.code, view)}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <input
        value={name}
        maxLength={PATTERN_NAME_MAX}
        aria-label={m.nameLabel}
        placeholder={m.namePlaceholder}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => void escapeClears(event, name, () => setName(''))}
        className="h-8 min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      <label className="flex items-center gap-1.5">
        {m.questionType}
        <select value={typeId} onChange={(event) => setTypeId(event.target.value)} className={SELECT}>
          {types.map((id) => (
            <option key={id} value={id}>
              {typeName(id)}
            </option>
          ))}
        </select>
      </label>
      <Button size="sm" type="submit" variant="primary" disabled={busy || !clean || !topic || Boolean(exists)}>
        {m.add}
      </Button>
      <Button size="sm" variant="subtle" onClick={onCancel}>
        {m.cancel}
      </Button>
      <FormNote why={why} exists={exists} close={close} />
    </form>
  );
}
