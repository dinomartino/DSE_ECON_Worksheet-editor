'use client';

import { useMemo, useState } from 'react';
import { PatternPicker } from '@/components/bank/PatternPicker';
import { typeLabel } from '@/components/bank/BankRow';
import { Button, GroupHeader, IconButton } from '@/components/ui';
import { CloseIcon } from '@/components/ui/icons';
import { patternNames } from '@/library/patterns';
import { useBank } from '@/library/useBank';
import { usePatternRegistry } from '@/library/usePatterns';
import { freeTagIssue, holdsPatterns, isPatternTag, parsePatternTag, patternsIn, tagText, withPattern, type FreeTagIssue } from '@/model/patterns';
import { isTopicCode, stringTags, TOPICS, topicHeading, topicOf, type Topic } from '@/model/topics';

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
 * Why a typed tag cannot be a free tag, in words a teacher reads (§ the tag grammar,
 * `model/topics.ts`): those forms are kept for topics and for later versions of the app.
 */
export function freeTagMessage(issue: FreeTagIssue, typed: string): string {
  if (issue === 'code') return `“${typed}” is written like a topic code, so it can’t be a tag. Add a word, for example “${typed} notes”.`;
  if (issue === 'separator') return 'A tag can’t contain “::”.';
  return 'A tag can’t start with “@”.';
}

/**
 * The shared "Topics 課題" row of the Edit panel: a question's tags as quiet text, each
 * removable, plus an inline picker over the taxonomy and free text. Each sub-topic takes
 * one 題型 (Pattern) from its list for this question's type, or a new name. Tags never print.
 */
export function TopicRow({
  tags,
  typeId,
  note,
  onChange,
}: {
  tags: readonly string[] | undefined;
  /** The question's registry type: its 題型 list (MCQ and LQ lists are separate). */
  typeId: string;
  /** A quiet line after an edit, e.g. "Also updated in 2 other worksheets." */
  note?: string;
  /** `undefined` clears the field, so an untagged question carries none. */
  onChange: (tags: string[] | undefined) => void;
}) {
  const current = tags ?? [];
  const { rows } = useBank();
  const registry = usePatternRegistry();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** Enter was pressed on a tag that cannot be added: say why until the text changes. */
  const [refused, setRefused] = useState(false);
  const groups = useMemo(() => filterTopics(query), [query]);
  const typed = query.trim();
  const issue = freeTagIssue(typed);

  const add = (code: string) => {
    const value = code.trim();
    if (!value || current.includes(value)) return;
    if (freeTagIssue(value)) {
      setRefused(true);
      return;
    }
    onChange([...current, value]);
    setQuery('');
  };
  const remove = (code: string) => {
    // A sub-topic's 題型 goes with it.
    const next = current.filter((tag) => tag !== code && parsePatternTag(tag)?.topic !== code);
    onChange(next.length > 0 ? next : undefined);
  };
  // A new name is registered by the picker as it is made.
  const setPattern = (code: string, name: string | undefined) => {
    const next = withPattern(current, code, name);
    if (next !== current) onChange(next.length > 0 ? next : undefined);
  };
  // Only string tags are shown; anything else rides along untouched through every write.
  const listed = stringTags(current).filter((tag) => !isPatternTag(tag));

  const option = (topic: Topic, indent: boolean) => {
    const chosen = current.includes(topic.code);
    return (
      <li key={topic.code}>
        <button
          type="button"
          disabled={chosen}
          onClick={() => add(topic.code)}
          className={`flex w-full cursor-pointer items-baseline gap-2 rounded-md py-1 pr-2 text-left text-xs text-ink transition-colors duration-150 ease-out-soft hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent ${
            indent ? 'pl-10' : 'pl-1 font-medium'
          }`}
        >
          {/* A topic's letter; a sub-topic, indented under it, reads by its name alone. */}
          {!indent && <span className="w-7 shrink-0 tabular-nums text-ink-subtle">{topic.code}</span>}
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
          // A quiet panel action, like "+ Statement" beside it: the filled CTA is ink, and
          // accent is for links, focus and selection.
          <Button size="sm" variant="subtle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? 'Done' : 'Add topic'}
          </Button>
        }
      />

      {current.length === 0 && !open && (
        <p className="text-[11px] text-ink-subtle">No topic yet. Tags feed the question bank.</p>
      )}
      {listed.length > 0 && (
        <ul className="space-y-0.5">
          {listed.map((tag) => {
            const topic = topicOf(tag);
            return (
              <li key={tag} className="text-xs text-ink-muted">
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate" title={topic ? topicHeading(tag, 'both') : tag}>
                    {topic ? (
                      <>
                        <span className="tabular-nums text-ink-subtle">{topic.parent ?? topic.code}</span> {topic.en}{' '}
                        <span className="text-ink-subtle">{topic.zh}</span>
                      </>
                    ) : isTopicCode(tag) ? (
                      // A code this version does not list (a later version's topic): its code.
                      <span className="tabular-nums text-ink-subtle">{tag}</span>
                    ) : (
                      tag
                    )}
                  </span>
                  <IconButton label={`Remove topic ${tagText(tag)}`} onClick={() => remove(tag)}>
                    <CloseIcon size={12} />
                  </IconButton>
                </div>
                {holdsPatterns(tag) && (
                  <div className="pb-1 pl-3">
                    <PatternPicker
                      topic={tag}
                      kind={typeLabel(typeId)}
                      typeId={typeId}
                      names={patternNames(rows, registry, tag, typeId)}
                      value={patternsIn(current, tag)[0]}
                      onChange={(name) => setPattern(tag, name ?? undefined)}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {note && (
        <p role="status" className="animate-fade-in text-[11px] text-ink-subtle">
          {note}
        </p>
      )}

      {open && (
        <div className="space-y-1.5 rounded-lg border border-line bg-surface p-2">
          <input
            autoFocus
            value={query}
            aria-label="Filter topics or type a free tag"
            placeholder="Filter, or type a tag and press Enter"
            aria-invalid={refused && issue ? true : undefined}
            aria-describedby={issue ? 'topic-row-tag-issue' : undefined}
            onChange={(event) => {
              setQuery(event.target.value);
              setRefused(false);
            }}
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
          {issue && (refused || groups.length === 0) && (
            <p id="topic-row-tag-issue" role="status" className="px-1 text-[11px] text-ink-muted">
              {freeTagMessage(issue, typed)}
            </p>
          )}
          <ul className="scroll-slim max-h-56 overflow-y-auto">
            {groups.map(({ topic, children }) => (
              <li key={topic.code}>
                <ul>
                  {option(topic, false)}
                  {children.map((child) => option(child, true))}
                </ul>
              </li>
            ))}
            {groups.length === 0 && !issue && (
              <li className="px-1 py-2 text-[11px] text-ink-subtle">
                No matching topic. Press Enter to add “{typed}” as a free tag.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
