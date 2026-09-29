'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { TOPICS, topicOf, type Topic } from '@/model/topics';

/**
 * Tick topics from the guide's list. Edits one question's codes (its free tags are kept by
 * the caller) or, in bulk, adds codes to many. The dialog pads its own body and keeps its
 * actions in the footer.
 */
export function TopicPickerDialog({
  title,
  description,
  initial,
  confirmLabel,
  onClose,
  onDone,
}: {
  title: string;
  description: string;
  /** Codes ticked on open; free tags are ignored here. */
  initial: readonly string[];
  confirmLabel: string;
  onClose: () => void;
  onDone: (codes: string[]) => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(initial.filter((tag) => topicOf(tag))));
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(initial.flatMap((tag) => (topicOf(tag)?.parent ? [topicOf(tag)!.parent!] : []))),
  );
  const needle = query.trim().toLowerCase();
  const matches = (topic: Topic) =>
    !needle || topic.code.toLowerCase().includes(needle) || topic.en.toLowerCase().includes(needle) || topic.zh.includes(needle);
  const shown = useMemo(
    () =>
      TOPICS.map((topic) => ({ topic, children: topic.children.filter((child) => matches(child) || matches(topic)) })).filter(
        ({ topic, children }) => matches(topic) || children.length > 0,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [needle],
  );
  const toggle = (code: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  // Guide order, so a question's tags read A before C and a coarse code before its fine ones.
  const ordered = () => TOPICS.flatMap((topic) => [topic, ...topic.children]).map((t) => t.code).filter((code) => picked.has(code));

  return (
    <Dialog
      title={title}
      description={description}
      width={520}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-[11.5px] tabular-nums text-ink-subtle">
            {picked.size === 0 ? 'No topic ticked' : `${picked.size} ticked`}
          </span>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onDone(ordered())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="px-5 pb-4 pt-4">
        <input
          type="search"
          value={query}
          autoFocus
          placeholder="Find a topic by name, code or 中文"
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <ul className="mt-3 space-y-0.5">
          {shown.map(({ topic, children }) => {
            const expanded = Boolean(needle) || open.has(topic.code);
            return (
              <li key={topic.code}>
                <div className="flex items-center gap-1">
                  <TopicCheck topic={topic} checked={picked.has(topic.code)} onToggle={() => toggle(topic.code)} />
                  {topic.children.length > 0 && !needle && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpen((current) => {
                          const next = new Set(current);
                          if (next.has(topic.code)) next.delete(topic.code);
                          else next.add(topic.code);
                          return next;
                        })
                      }
                      className="shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-[11px] tabular-nums text-ink-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      aria-expanded={expanded}
                    >
                      {expanded ? 'Hide' : `${topic.children.length} sub-topics`}
                      {!expanded && countIn(topic, picked) > 0 && ` · ${countIn(topic, picked)} ticked`}
                    </button>
                  )}
                </div>
                {expanded && (
                  <ul className="mb-1 ml-6">
                    {children.map((child) => (
                      <li key={child.code}>
                        <TopicCheck topic={child} checked={picked.has(child.code)} onToggle={() => toggle(child.code)} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {shown.length === 0 && <li className="py-2 text-[12px] text-ink-subtle">No topic matches “{query.trim()}”.</li>}
        </ul>
      </div>
    </Dialog>
  );
}

function countIn(topic: Topic, picked: ReadonlySet<string>): number {
  return topic.children.filter((child) => picked.has(child.code)).length;
}

function TopicCheck({ topic, checked, onToggle }: { topic: Topic; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 rounded-md px-1.5 py-1 text-[12.5px] text-ink transition-colors hover:bg-surface-hover">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 shrink-0 translate-y-[2px] cursor-pointer accent-[var(--accent)]"
      />
      <span className="w-[74px] shrink-0 truncate text-[11px] tabular-nums text-ink-subtle">{topic.code}</span>
      <span className="min-w-0 flex-1">
        {topic.en} <span className="text-ink-subtle">{topic.zh}</span>
      </span>
    </label>
  );
}
