'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import type { PatternId, PatternItem } from '@/library/patterns';
import { cleanPatternName, matchPatternName, PATTERN_NAME_MAX, samePatternName } from '@/model/patterns';
import { TOPICS, type Topic } from '@/model/topics';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { listQuestionTypes } from '@/registry';
import { escapeClears } from '../escapeClears';
import { typeName } from './bankPage';
import { PATTERNS_PAGE_MESSAGES } from './PatternsPage.messages';
import { topicName } from './topicText';

type Confirm = { kind: 'merge'; item: PatternItem; into: PatternItem } | { kind: 'delete'; item: PatternItem };

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
  readOnly = false,
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
  /** The registry is from a newer build (`isReadOnlyRegistry`): changes are not saved. */
  readOnly?: boolean;
  onScope: (topic: string | undefined) => void;
  onCreate: (pattern: PatternId) => void;
  onRename: (item: PatternItem, to: string) => void;
  onMerge: (item: PatternItem, into: PatternItem) => void;
  onDelete: (item: PatternItem) => void;
  /** Review the questions filed under it. */
  onShow: (item: PatternItem) => void;
}) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const lang = useUiLanguage();
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
        {readOnly && (
          <p role="status" data-patterns-read-only className="max-w-[720px] rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] leading-relaxed text-warn-ink">
            {m.readOnly}
          </p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-[560px] text-[13px] leading-relaxed text-ink-muted">
            {m.intro}
          </p>
          <label className="flex items-center gap-2 text-[12px] text-ink-subtle">
            {m.show}
            <select
              value={scope ?? ''}
              onChange={(event) => onScope(event.target.value || undefined)}
              className="h-8 max-w-[280px] cursor-pointer rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            >
              <option value="">{m.allTopics}</option>
              {TOPICS.map((topic) => (
                <optgroup key={topic.code} label={`${topic.code} · ${topicName(topic.code, 'en', lang)}`}>
                  <option value={topic.code}>
                    {m.allSubTopics(topic.code)}
                  </option>
                  {topic.children.map((child) => (
                    <option key={child.code} value={child.code}>
                      {topicName(child.code, 'en', lang)}
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
            {m.noneIn(scope ? topicName(scope, 'en', lang) : '')}
          </p>
        ) : (
          shown.map((child) => (
            <section
              key={child.code}
              aria-label={topicName(child.code, 'en', lang)}
              className="rounded-[10px] border border-line bg-surface-raised px-4 pb-3 pt-3.5"
              data-pattern-topic={child.code}
            >
              <h2 className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] text-ink">
                <span className="tabular-nums text-ink-subtle">{child.parent}</span>
                {lang === 'zh-HK' ? (
                  <span className="font-semibold">{child.zh}</span>
                ) : (
                  <>
                    <span className="font-semibold">{child.en}</span>
                    <span className="text-ink-subtle">{child.zh}</span>
                  </>
                )}
              </h2>
              <div className="mt-2.5 grid gap-x-6 gap-y-3 md:grid-cols-2">
                {types.map((typeId) => {
                  const list = items.filter((item) => item.topic === child.code && item.typeId === typeId);
                  return (
                    <div key={typeId} className="min-w-0">
                      <h3 className="border-b border-line pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                        {m.typeHeading(typeName(typeId), list.length)}
                      </h3>
                      {list.length === 0 ? (
                        <p className="py-1.5 text-[12px] text-ink-subtle">{m.noneYet}</p>
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
  const [mode, setMode] = useState<'view' | 'rename' | 'merge'>('view');
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
    <li className="group flex items-center gap-2 border-b border-line/60 py-1.5 text-[12.5px] last:border-b-0" data-pattern-name={item.name}>
      <span className="min-w-0 flex-1 truncate text-ink" title={item.name}>
        {item.name}
      </span>
      {item.count > 0 ? (
        <button
          type="button"
          onClick={onShow}
          title={m.reviewTitle}
          className="shrink-0 cursor-pointer tabular-nums text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {m.questionsLink(item.count)}
        </button>
      ) : (
        <span className="shrink-0 text-ink-subtle">{m.notUsed}</span>
      )}
      <span className="flex shrink-0 gap-0.5">
        <LineAction disabled={busy} onClick={() => setMode('rename')}>
          {m.rename}
        </LineAction>
        {siblings.length > 0 && (
          <LineAction disabled={busy} onClick={() => setMode('merge')}>
            {m.merge}
          </LineAction>
        )}
        <LineAction disabled={busy} onClick={onDelete}>
          {m.delete}
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
  subTopics: Topic[];
  types: string[];
  items: PatternItem[];
  busy: boolean;
  onCreate: (pattern: PatternId) => void;
}) {
  const m = useMessages(PATTERNS_PAGE_MESSAGES);
  const lang = useUiLanguage();
  const [topic, setTopic] = useState('');
  const [typeId, setTypeId] = useState(types[0] ?? '');
  const [name, setName] = useState('');
  // One sub-topic in view (the page is scoped to it) is the default; among several, the
  // teacher chooses: a guessed first one files the 題型 under the wrong topic.
  const chosenTopic = subTopics.some((child) => child.code === topic) ? topic : subTopics.length === 1 ? subTopics[0].code : '';
  const clean = cleanPatternName(name);
  // Same as the picker: a name differing only by case, spacing or punctuation is that one;
  // a close one is named, softly.
  const siblings = items.filter((item) => item.topic === chosenTopic && item.typeId === typeId);
  const exists = clean ? siblings.find((item) => matchPatternName(clean, item.name) === 'same') : undefined;
  const close = clean && !exists ? siblings.find((item) => matchPatternName(clean, item.name) !== undefined) : undefined;
  return (
    <form
      aria-label={m.newPattern}
      className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3.5 py-2.5 text-[12px] text-ink-subtle"
      onSubmit={(event) => {
        event.preventDefault();
        if (!clean || exists || !chosenTopic) return;
        onCreate({ topic: chosenTopic, typeId, name: clean });
        setName('');
      }}
    >
      <span className="font-medium text-ink">{m.newPattern}</span>
      <select
        value={chosenTopic}
        aria-label={m.subTopic}
        onChange={(event) => setTopic(event.target.value)}
        className="h-8 w-[220px] cursor-pointer rounded-lg border border-line bg-surface px-2 text-[12.5px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
      >
        {!chosenTopic && (
          <option value="" disabled>
            {m.chooseSubTopic}
          </option>
        )}
        {TOPICS.filter((parent) => subTopics.some((child) => child.parent === parent.code)).map((parent) => (
          <optgroup key={parent.code} label={`${parent.code} · ${topicName(parent.code, 'en', lang)}`}>
            {subTopics
              .filter((child) => child.parent === parent.code)
              .map((child) => (
                <option key={child.code} value={child.code}>
                  {topicName(child.code, 'en', lang)}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      <select
        value={typeId}
        aria-label={m.questionType}
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
        aria-label={m.nameLabel}
        placeholder={m.namePlaceholder}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => void escapeClears(event, name, () => setName(''))}
        className="h-8 min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      <Button size="sm" type="submit" variant="primary" disabled={busy || !clean || !chosenTopic || Boolean(exists)}>
        {m.add}
      </Button>
      {exists && <span className="basis-full text-[11.5px] text-warn-ink">{m.exists(exists.name)}</span>}
      {close && <span className="basis-full text-[11.5px] text-ink-subtle">{m.close(close.name)}</span>}
    </form>
  );
}
