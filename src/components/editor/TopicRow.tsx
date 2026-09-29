'use client';

import { useMemo, useState } from 'react';
import { GroupHeader, IconButton } from '@/components/ui';
import { CloseIcon } from '@/components/ui/icons';
import { TOPICS, topicOf, type Topic } from '@/model/topics';

/** Does the topic match a typed query — by code, English or 中文? */
function matches(topic: Topic, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return topic.code.toLowerCase().includes(q) || topic.en.toLowerCase().includes(q) || topic.zh.includes(q);
}

/** Coarse topics with the fine ones beneath; a coarse topic stays when any child matches. */
export function filterTopics(query: string): Array<{ topic: Topic; children: Topic[] }> {
  return TOPICS.flatMap((topic) => {
    const self = matches(topic, query);
    const children = topic.children.filter((child) => self || matches(child, query));
    return self || children.length > 0 ? [{ topic, children }] : [];
  });
}

/**
 * The shared "Topics 課題" row of the Edit panel: a question's tags as quiet text, each
 * removable, plus an inline picker over the taxonomy and free text. Tags never print.
 */
export function TopicRow({
  tags,
  onChange,
}: {
  tags: readonly string[] | undefined;
  /** `undefined` clears the field, so an untagged question carries none. */
  onChange: (tags: string[] | undefined) => void;
}) {
  const current = tags ?? [];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const groups = useMemo(() => filterTopics(query), [query]);

  const add = (code: string) => {
    const value = code.trim();
    if (!value || current.includes(value)) return;
    onChange([...current, value]);
    setQuery('');
  };
  const remove = (code: string) => {
    const next = current.filter((tag) => tag !== code);
    onChange(next.length > 0 ? next : undefined);
  };

  const option = (topic: Topic, indent: boolean) => {
    const chosen = current.includes(topic.code);
    return (
      <li key={topic.code}>
        <button
          type="button"
          disabled={chosen}
          onClick={() => add(topic.code)}
          className={`flex w-full cursor-pointer items-baseline gap-2 rounded-md py-1 pr-2 text-left text-xs text-ink transition-colors duration-150 ease-out-soft hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent ${
            indent ? 'pl-5' : 'pl-1 font-medium'
          }`}
        >
          <span className="w-14 shrink-0 truncate tabular-nums text-ink-subtle">{topic.code}</span>
          <span className="min-w-0 flex-1">
            {topic.en}
            <span className="ml-1.5 font-normal text-ink-muted">{topic.zh}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-2 border-t border-line pt-3" data-topic-row>
      <GroupHeader
        title="Topics"
        hint="課題 · never printed"
        action={
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-medium text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {open ? 'Done' : 'Add topic'}
          </button>
        }
      />

      {current.length === 0 && !open && (
        <p className="text-[11px] text-ink-subtle">No topic yet. Tags feed the question bank.</p>
      )}
      {current.length > 0 && (
        <ul className="space-y-0.5">
          {current.map((tag) => {
            const topic = topicOf(tag);
            return (
              <li key={tag} className="flex items-center gap-1 text-xs text-ink-muted">
                <span className="min-w-0 flex-1 truncate" title={topic ? `${topic.en} ${topic.zh}` : tag}>
                  {topic ? (
                    <>
                      <span className="tabular-nums text-ink-subtle">{tag}</span> {topic.en}
                    </>
                  ) : (
                    tag
                  )}
                </span>
                <IconButton label={`Remove topic ${tag}`} onClick={() => remove(tag)}>
                  <CloseIcon size={12} />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <div className="space-y-1.5 rounded-lg border border-line bg-surface p-2">
          <input
            autoFocus
            value={query}
            aria-label="Filter topics or type a free tag"
            placeholder="Filter, or type a tag and press Enter"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add(query);
              } else if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
              }
            }}
            className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-xs text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          <ul className="scroll-slim max-h-56 overflow-y-auto">
            {groups.map(({ topic, children }) => (
              <li key={topic.code}>
                <ul>
                  {option(topic, false)}
                  {children.map((child) => option(child, true))}
                </ul>
              </li>
            ))}
            {groups.length === 0 && (
              <li className="px-1 py-2 text-[11px] text-ink-subtle">
                No matching topic. Press Enter to add “{query.trim()}” as a free tag.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
