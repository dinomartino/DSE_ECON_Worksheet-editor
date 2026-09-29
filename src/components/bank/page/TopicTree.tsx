'use client';

import { useState } from 'react';
import { ChevronRightIcon } from '@/components/ui/icons';
import { TOPICS, topicOf } from '@/model/topics';
import { shortTopicName, type TopicPick } from './bankPage';

/**
 * The Topics tree, in the Folders column's slot (same width), so switching tabs does not
 * move the layout. A coarse topic's count includes its sub-topics, and picking it matches
 * them. The picked entry wears the 2px accent bar.
 */
export function TopicTree({
  counts,
  value,
  onChange,
}: {
  counts: ReadonlyMap<TopicPick, number>;
  value: TopicPick;
  onChange: (value: TopicPick) => void;
}) {
  const selectedCoarse = value === 'all' || value === 'untagged' ? undefined : (topicOf(value)?.parent ?? value);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(selectedCoarse ? [selectedCoarse] : []));
  const isOpen = (code: string) => open.has(code) || code === selectedCoarse;
  const toggle = (code: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (isOpen(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <nav aria-label="Topics" className="flex min-h-0 shrink-0 flex-col md:w-48">
      <div className="flex h-7 items-center pb-1 pl-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">Topics</span>
      </div>
      <ul className="scroll-slim min-h-0 flex-1 overflow-y-auto pb-2">
        <TreeRow label="All questions" count={counts.get('all') ?? 0} active={value === 'all'} onPick={() => onChange('all')} />
        {TOPICS.map((topic) => {
          const count = counts.get(topic.code) ?? 0;
          return (
            <li key={topic.code}>
              <ul>
                <TreeRow
                  code={topic.code}
                  label={shortTopicName(topic.code)}
                  full={topic.en}
                  count={count}
                  active={value === topic.code}
                  expanded={isOpen(topic.code)}
                  onToggle={topic.children.length > 0 ? () => toggle(topic.code) : undefined}
                  onPick={() => onChange(topic.code)}
                />
                {isOpen(topic.code) &&
                  topic.children.map((child) => (
                    <TreeRow
                      key={child.code}
                      label={child.en}
                      count={counts.get(child.code) ?? 0}
                      active={value === child.code}
                      sub
                      onPick={() => onChange(child.code)}
                    />
                  ))}
              </ul>
            </li>
          );
        })}
        <TreeRow label="Untagged" count={counts.get('untagged') ?? 0} active={value === 'untagged'} onPick={() => onChange('untagged')} />
      </ul>
    </nav>
  );
}

function TreeRow({
  code,
  label,
  full,
  count,
  active,
  sub = false,
  expanded,
  onToggle,
  onPick,
}: {
  code?: string;
  label: string;
  /** The full name, for the tooltip, when `label` is shortened. */
  full?: string;
  count: number;
  active: boolean;
  sub?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onPick: () => void;
}) {
  return (
    <li
      className={`group relative flex min-w-0 items-center rounded-lg transition-colors duration-150 ease-out-soft ${
        active ? 'bg-surface-hover' : 'hover:bg-surface-hover'
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent transition-opacity duration-150 ease-out-soft ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <button
        type="button"
        onClick={onPick}
        aria-current={active ? 'true' : undefined}
        title={code ? `${code} · ${full ?? label}` : (full ?? label)}
        className={`flex min-w-0 flex-1 cursor-pointer items-baseline gap-1.5 rounded-lg py-[5px] pr-1 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
          sub ? 'pl-6 text-[11.5px]' : 'pl-2 text-[12.5px]'
        } ${active ? 'text-ink' : count === 0 ? 'text-ink-subtle hover:text-ink' : 'text-ink-muted hover:text-ink'}`}
      >
        {code && <b className="w-6 shrink-0 font-semibold tabular-nums text-ink">{code}</b>}
        {/* Two lines rather than an ellipsis: the slot's width is the Folders column's,
            and "Scarcity, choice and opportunity cost" must still be readable in it. */}
        <span className={`line-clamp-2 min-w-0 flex-1 break-words leading-snug ${active ? 'font-medium' : ''}`}>{label}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">{count}</span>
      </button>
      {/* The chevron's slot is kept on every row, so counts sit in one column. */}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? `Hide ${code} sub-topics` : `Show ${code} sub-topics`}
          aria-expanded={expanded}
          className="flex h-6 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-ink-subtle transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronRightIcon size={12} className={`transition-transform duration-150 ease-out-soft ${expanded ? 'rotate-90' : ''}`} />
        </button>
      ) : (
        <span aria-hidden className="w-5 shrink-0" />
      )}
    </li>
  );
}
