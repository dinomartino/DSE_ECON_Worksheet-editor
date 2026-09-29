'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { samePattern, type PatternId, type PatternItem } from '@/library/patterns';
import { cleanPatternName, PATTERN_NAME_MAX, samePatternName } from '@/model/patterns';
import { TOPICS, topicOf } from '@/model/topics';
import { listQuestionTypes } from '@/registry';
import { typeName } from './bankPage';

type Confirm = { kind: 'merge'; item: PatternItem; into: PatternItem } | { kind: 'delete'; item: PatternItem };

const questions = (count: number) => `${count} ${count === 1 ? 'question' : 'questions'}`;

/**
 * The 題型 (Pattern) manage page: every 題型 per sub-topic, MCQ and LQ side by side, with
 * how many questions use each. New, rename, merge and delete. Rename, merge and delete
 * rewrite every copy of every question that uses the 題型 (the caller does the writing).
 * We ship no list: each teacher defines their own.
 */
export function PatternsPage({
  items,
  scope,
  busy,
  onScope,
  onCreate,
  onRename,
  onMerge,
  onDelete,
  onShow,
}: {
  /** Every 題型 (`listPatterns`), unscoped. */
  items: PatternItem[];
  /** A coarse or fine topic code; undefined = all. */
  scope: string | undefined;
  busy: boolean;
  onScope: (topic: string | undefined) => void;
  onCreate: (pattern: PatternId) => void;
  onRename: (item: PatternItem, to: string) => void;
  onMerge: (item: PatternItem, into: PatternItem) => void;
  onDelete: (item: PatternItem) => void;
  /** Review the questions filed under it. */
  onShow: (item: PatternItem) => void;
}) {
  const [confirm, setConfirm] = useState<Confirm>();
  const types = listQuestionTypes().map((type) => type.id);
  const subTopics = useMemo(
    () =>
      TOPICS.flatMap((topic) => topic.children).filter(
        (child) => !scope || child.code === scope || child.parent === scope,
      ),
    [scope],
  );
  const shown = subTopics.filter((child) => items.some((item) => item.topic === child.code));

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-7 py-[22px]">
      <div className="mx-auto grid w-full max-w-[1100px] gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-[560px] text-[13px] leading-relaxed text-ink-muted">
            題型 (Patterns) are the kinds of question you set within a sub-topic. MCQ and LQ keep separate lists.
            Renaming, merging or deleting one changes every question that uses it, in every worksheet. Never printed.
          </p>
          <label className="flex items-center gap-2 text-[12px] text-ink-subtle">
            Show
            <select
              value={scope ?? ''}
              onChange={(event) => onScope(event.target.value || undefined)}
              className="h-8 max-w-[280px] cursor-pointer rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            >
              <option value="">All topics</option>
              {TOPICS.map((topic) => (
                <optgroup key={topic.code} label={`${topic.code} · ${topic.en}`}>
                  <option value={topic.code}>
                    {topic.code} · all sub-topics
                  </option>
                  {topic.children.map((child) => (
                    <option key={child.code} value={child.code}>
                      {child.code} · {child.en}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <NewPattern subTopics={subTopics} types={types} items={items} busy={busy} onCreate={onCreate} />

        {shown.length === 0 ? (
          <p className="text-[13px] text-ink-muted">
            No 題型 {scope ? `in ${scope} ` : ''}yet. Add one above, or while you set a question&apos;s topic.
          </p>
        ) : (
          shown.map((child) => (
            <section
              key={child.code}
              aria-label={`${child.code} ${child.en}`}
              className="rounded-[10px] border border-line bg-surface-raised px-4 pb-3 pt-3.5"
              data-pattern-topic={child.code}
            >
              <h2 className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] text-ink">
                <span className="tabular-nums text-ink-subtle">{child.code}</span>
                <span className="font-semibold">{child.en}</span>
                <span className="text-ink-subtle">{child.zh}</span>
              </h2>
              <div className="mt-2.5 grid gap-x-6 gap-y-3 md:grid-cols-2">
                {types.map((typeId) => {
                  const list = items.filter((item) => item.topic === child.code && item.typeId === typeId);
                  return (
                    <div key={typeId} className="min-w-0">
                      <h3 className="border-b border-line pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                        {typeName(typeId)} 題型 · {list.length}
                      </h3>
                      {list.length === 0 ? (
                        <p className="py-1.5 text-[12px] text-ink-subtle">None yet</p>
                      ) : (
                        <ul>
                          {list.map((item) => (
                            <PatternLine
                              key={item.name}
                              item={item}
                              siblings={list.filter((other) => other !== item)}
                              busy={busy}
                              onRename={(to) => onRename(item, to)}
                              onMerge={(into) => setConfirm({ kind: 'merge', item, into })}
                              onDelete={() => setConfirm({ kind: 'delete', item })}
                              onShow={() => onShow(item)}
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {confirm?.kind === 'merge' && (
        <Dialog
          title={`Merge “${confirm.item.name}” into “${confirm.into.name}”?`}
          description={`${questions(confirm.item.count)} filed under “${confirm.item.name}” ${confirm.item.count === 1 ? 'moves' : 'move'} to “${confirm.into.name}”, in every worksheet that holds a copy. “${confirm.item.name}” is then removed.`}
          width={480}
          onClose={() => setConfirm(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setConfirm(undefined)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onMerge(confirm.item, confirm.into);
                  setConfirm(undefined);
                }}
              >
                Merge
              </Button>
            </>
          }
        >
          <span />
        </Dialog>
      )}
      {confirm?.kind === 'delete' && (
        <Dialog
          title={`Delete 題型 “${confirm.item.name}”?`}
          description={
            confirm.item.count > 0
              ? `${questions(confirm.item.count)} ${confirm.item.count === 1 ? 'loses' : 'lose'} this 題型, in every worksheet that holds a copy. The questions and their topics stay.`
              : 'No question uses it. It is removed from the list.'
          }
          width={480}
          onClose={() => setConfirm(undefined)}
          footer={
            <>
              <Button variant="subtle" onClick={() => setConfirm(undefined)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onDelete(confirm.item);
                  setConfirm(undefined);
                }}
              >
                Delete 題型
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
  const [mode, setMode] = useState<'view' | 'rename' | 'merge'>('view');
  const [name, setName] = useState(item.name);
  const [into, setInto] = useState('');
  const clean = cleanPatternName(name);
  const clash = siblings.find((other) => samePatternName(other.name, clean));
  const renameProblem = !clean ? 'Type a name.' : clash ? `“${clash.name}” is already here. Use Merge to combine them.` : undefined;

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
            aria-label={`New name for ${item.name}`}
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
            Save
          </Button>
          <Button size="sm" variant="subtle" onClick={() => setMode('view')}>
            Cancel
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
          <span className="shrink-0">Merge “{item.name}” into</span>
          <select
            autoFocus
            value={into}
            aria-label={`Merge ${item.name} into`}
            onChange={(event) => setInto(event.target.value)}
            className="h-7 min-w-0 flex-1 cursor-pointer rounded-md border border-line bg-surface px-1.5 text-[12.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          >
            <option value="">Choose a 題型</option>
            {siblings.map((other) => (
              <option key={other.name} value={other.name}>
                {other.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" disabled={busy || !target} onClick={() => target && onMerge(target)}>
            Merge…
          </Button>
          <Button size="sm" variant="subtle" onClick={() => setMode('view')}>
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-2 border-b border-line/60 py-1.5 text-[12.5px] last:border-b-0" data-pattern-name={item.name}>
      <span className="min-w-0 flex-1 truncate text-ink" title={item.name}>
        {item.name}
      </span>
      {item.count > 0 ? (
        <button
          type="button"
          onClick={onShow}
          title="Review these questions"
          className="shrink-0 cursor-pointer tabular-nums text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {questions(item.count)} →
        </button>
      ) : (
        <span className="shrink-0 text-ink-subtle">Not used yet</span>
      )}
      <span className="flex shrink-0 gap-0.5">
        <LineAction disabled={busy} onClick={() => setMode('rename')}>
          Rename
        </LineAction>
        {siblings.length > 0 && (
          <LineAction disabled={busy} onClick={() => setMode('merge')}>
            Merge
          </LineAction>
        )}
        <LineAction disabled={busy} onClick={onDelete}>
          Delete
        </LineAction>
      </span>
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

/** Define a 題型 before any question uses it. */
function NewPattern({
  subTopics,
  types,
  items,
  busy,
  onCreate,
}: {
  subTopics: { code: string; en: string }[];
  types: string[];
  items: PatternItem[];
  busy: boolean;
  onCreate: (pattern: PatternId) => void;
}) {
  const [topic, setTopic] = useState('');
  const [typeId, setTypeId] = useState(types[0] ?? '');
  const [name, setName] = useState('');
  const chosenTopic = subTopics.some((child) => child.code === topic) ? topic : (subTopics[0]?.code ?? '');
  const clean = cleanPatternName(name);
  const exists = items.find((item) => samePattern(item, { topic: chosenTopic, typeId, name: clean }));
  return (
    <form
      aria-label="New 題型"
      className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3.5 py-2.5 text-[12px] text-ink-subtle"
      onSubmit={(event) => {
        event.preventDefault();
        if (!clean || exists || !chosenTopic) return;
        onCreate({ topic: chosenTopic, typeId, name: clean });
        setName('');
      }}
    >
      <span className="font-medium text-ink">New 題型</span>
      <select
        value={chosenTopic}
        aria-label="Sub-topic"
        onChange={(event) => setTopic(event.target.value)}
        className="h-8 w-[220px] cursor-pointer rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
      >
        {subTopics.map((child) => (
          <option key={child.code} value={child.code}>
            {child.code} · {topicOf(child.code)?.en}
          </option>
        ))}
      </select>
      <select
        value={typeId}
        aria-label="Question type"
        onChange={(event) => setTypeId(event.target.value)}
        className="h-8 cursor-pointer rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
      >
        {types.map((id) => (
          <option key={id} value={id}>
            {typeName(id)}
          </option>
        ))}
      </select>
      <input
        value={name}
        maxLength={PATTERN_NAME_MAX}
        aria-label="題型 name"
        placeholder="e.g. Calculate PED from a change in TR"
        onChange={(event) => setName(event.target.value)}
        className="h-8 min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      <Button size="sm" type="submit" variant="primary" disabled={busy || !clean || Boolean(exists)}>
        Add
      </Button>
      {exists && <span className="basis-full text-[11.5px] text-warn-ink">“{exists.name}” is already in this list.</span>}
    </form>
  );
}
