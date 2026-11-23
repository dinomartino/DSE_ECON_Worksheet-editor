'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { escapeClears } from '@/components/bank/escapeClears';
import { ChevronDownIcon, ChevronRightIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import { topicNamesFor } from '@/model/topics';
import type { LanguageMode } from '@/model/types';
import { filterGroups, groupOf, groupTopics, OTHER_PART, partName, type TopicGroup } from '@/pastpapers/groups';
import { packName, type TopicEntry } from '@/pastpapers/pack';
import { PAST_PAPER_MESSAGES } from './messages';
import { SearchGlyph } from './PastPaperControls';

/**
 * The Past paper bank screen's topic picker (k-0446): the topics under their syllabus part,
 * A to J (`pastpapers/groups.ts`, the editor's own syllabus names), each part a collapsible
 * group with its question count, the open topic's part open, and a filter across every part.
 * A bank whose list names no parts gets the flat list, as before.
 *
 * Wider than a phone it is the screen's left column. At phone width it folds to one bar naming
 * the open topic, so the questions keep the screen; the bar opens the list over them, and
 * choosing a topic folds it again. Names follow the question language, as all pack names do.
 */
export function PastPaperTopicPicker({
  topics,
  current,
  active,
  language,
  top,
  onPick,
}: {
  topics: readonly TopicEntry[];
  /** The open topic, highlighted when `active`; its part opens. */
  current?: TopicEntry;
  /** False while the screen shows the bank as a whole (a search of every topic, one paper). */
  active: boolean;
  language: LanguageMode;
  /** Drawn above the list (the By topic / By year switch, k-0497). */
  top?: ReactNode;
  onPick: (id: string) => void;
}) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  const names = topicNamesFor(language);
  const groups = useMemo(() => groupTopics(topics), [topics]);
  const [filter, setFilter] = useState('');
  const [phoneOpen, setPhoneOpen] = useState(false);
  const currentPart = groupOf(groups, current?.id)?.code;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(currentPart !== undefined ? [currentPart] : []));
  const activeRow = useRef<HTMLButtonElement>(null);

  // The open topic's part opens whenever the topic changes (a pick, a remembered topic, a new
  // list), adjusted while rendering rather than in an effect.
  const [seenPart, setSeenPart] = useState(currentPart);
  if (currentPart !== seenPart) {
    setSeenPart(currentPart);
    if (currentPart !== undefined && !open.has(currentPart)) setOpen(new Set([...open, currentPart]));
  }

  // Bring the open topic into view when the list first shows it (a topic in J sits far down).
  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: 'nearest' });
  }, [phoneOpen, groups]);

  const filtering = filter.trim() !== '';
  const shown = useMemo(() => filterGroups(groups ?? [{ code: OTHER_PART, topics: [...topics] }], filter), [groups, topics, filter]);
  const allOpen = groups !== undefined && groups.every((g) => open.has(g.code));

  const pick = (id: string) => {
    onPick(id);
    setPhoneOpen(false);
  };
  const toggle = (code: string) =>
    setOpen((now) => {
      const next = new Set(now);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const topicRow = (entry: TopicEntry, indent: boolean) => {
    const on = active && entry.id === current?.id;
    return (
      <li key={entry.id}>
        <button
          ref={entry.id === current?.id ? activeRow : undefined}
          type="button"
          aria-current={on ? 'true' : undefined}
          data-pastpaper-topic={entry.id}
          onClick={() => pick(entry.id)}
          className={`flex w-full cursor-pointer items-baseline gap-2 py-1.5 pr-4 text-left text-[12.5px] transition-colors duration-150 pointer-coarse:py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
            indent ? 'pl-10' : 'pl-5'
          } ${on ? 'bg-accent-soft font-medium text-ink' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'}`}
        >
          <span className="min-w-0 flex-1 truncate" title={packName(entry.title, language)}>
            {packName(entry.title, language)}
          </span>
          {entry.questions !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">{entry.questions}</span>}
        </button>
      </li>
    );
  };

  const groupBlock = (group: TopicGroup) => {
    const expanded = filtering || open.has(group.code);
    const name = partName(group, names, m.otherTopics);
    const listId = `pastpaper-part-${group.code || 'other'}`;
    const heading = (
      <>
        <span
          aria-hidden
          className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1 text-[11px] font-semibold tabular-nums ${
            group.code === currentPart ? 'bg-accent-soft text-ink' : 'bg-surface-sunken text-ink-muted'
          }`}
        >
          {group.code || '·'}
        </span>
        <span className="line-clamp-2 min-w-0 flex-1 text-left leading-snug" title={name}>
          {name}
        </span>
        {group.questions !== undefined && (
          <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle" title={m.partQuestions(group.questions)}>
            {group.questions}
          </span>
        )}
      </>
    );
    const head = 'flex w-full items-center gap-2 py-1.5 pl-3 pr-4 text-[12.5px] font-semibold text-ink pointer-coarse:py-2.5';
    return (
      <li key={group.code || 'other'} data-pastpaper-part={group.code || 'other'}>
        {filtering ? (
          <div className={head}>
            <span className="w-3.5 shrink-0" />
            {heading}
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => toggle(group.code)}
            className={`${head} cursor-pointer transition-colors duration-150 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent`}
          >
            <ChevronRightIcon size={14} className={`shrink-0 text-ink-subtle transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
            {heading}
          </button>
        )}
        {expanded && (
          <ul id={listId} className="pb-1">
            {group.topics.map((entry) => topicRow(entry, true))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav
      aria-label={m.topics}
      data-pastpaper-topics
      className="flex w-full shrink-0 flex-col border-b border-line md:w-[280px] md:border-b-0 md:border-r"
    >
      {top}
      {/* Phone width: one bar naming the open topic; the list opens under it. */}
      <button
        type="button"
        aria-expanded={phoneOpen}
        onClick={() => setPhoneOpen((now) => !now)}
        data-pastpaper-topic-bar
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent md:hidden"
      >
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">{m.topics}</span>
        {currentPart !== undefined && currentPart !== OTHER_PART && (
          <span aria-hidden className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-accent-soft px-1 text-[11px] font-semibold text-ink">
            {currentPart}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{current ? packName(current.title, language) : m.chooseTopic}</span>
        {current?.questions !== undefined && <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">{current.questions}</span>}
        <ChevronDownIcon size={16} className={`shrink-0 text-ink-subtle transition-transform duration-150 ${phoneOpen ? 'rotate-180' : ''}`} />
      </button>

      <div className={`${phoneOpen ? 'flex' : 'hidden'} max-h-[62vh] min-h-0 flex-1 flex-col border-t border-line md:flex md:max-h-none md:border-t-0`}>
        <div className="flex shrink-0 flex-col gap-2 px-4 pb-2 pt-3">
          <div className="hidden items-center md:flex">
            <h2 className="flex-1 pl-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">{m.topics}</h2>
            {groups && !filtering && (
              <button
                type="button"
                onClick={() => setOpen(allOpen ? new Set(currentPart !== undefined ? [currentPart] : []) : new Set(groups.map((g) => g.code)))}
                className="cursor-pointer rounded px-1.5 py-0.5 text-[11.5px] text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {allOpen ? m.closeAll : m.openAll}
              </button>
            )}
          </div>
          <label className="relative block">
            <span className="sr-only">{m.topicFilter}</span>
            <input
              type="search"
              value={filter}
              placeholder={m.topicFilter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (escapeClears(event, filter, () => setFilter(''))) return;
                const first = shown[0]?.topics[0];
                if (event.key === 'Enter' && filtering && first) {
                  event.preventDefault();
                  pick(first.id);
                  setFilter('');
                }
              }}
              className="h-8 w-full rounded-lg border border-transparent bg-surface-sunken pl-8 pr-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/25 pointer-coarse:h-10 pointer-coarse:text-[16px]"
            />
            <SearchGlyph />
          </label>
        </div>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto pb-3">
          {shown.length === 0 && <p className="px-5 py-2 text-[12.5px] text-ink-muted">{m.topicFilterNone}</p>}
          {groups ? <ul>{shown.map(groupBlock)}</ul> : <ul>{shown.flatMap((g) => g.topics).map((entry) => topicRow(entry, false))}</ul>}
        </div>
      </div>
    </nav>
  );
}
