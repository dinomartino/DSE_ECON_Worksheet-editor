'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { PatternPicker } from '@/components/bank/PatternPicker';
import { typeLabel } from '@/components/bank/BankRow';
import { Button, GroupHeader, IconButton } from '@/components/ui';
import { CloseIcon } from '@/components/ui/icons';
import { patternNames } from '@/library/patterns';
import { useBank } from '@/library/useBank';
import { usePatternRegistry } from '@/library/usePatterns';
import { freeTagIssue, holdsPatterns, isPatternTag, parsePatternTag, patternsIn, tagText, withPattern, type FreeTagIssue } from '@/model/patterns';
import { isTopicCode, stringTags, TOPICS, topicHeading, topicOf, type Topic } from '@/model/topics';
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage, useMessages, useUiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { TOPIC_ROW_MESSAGES } from './TopicRow.messages';

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
export function freeTagMessage(issue: FreeTagIssue, typed: string, lang: UiLanguage = uiLanguage()): string {
  const m = resolveMessages(TOPIC_ROW_MESSAGES, lang);
  if (issue === 'code') return m.codeLike(typed);
  if (issue === 'separator') return m.separator;
  return m.atSign;
}

/**
 * The one topic typed text names, if it names exactly one: a known code, or a filter
 * that leaves a single topic. How Enter picks where free tags are not taken.
 */
export function onlyTopic(typed: string): string | undefined {
  const text = typed.trim();
  if (!text) return undefined;
  if (topicOf(text)) return text;
  const hits = filterTopics(text).flatMap(({ topic, children }) => [
    ...(matches(topic, text) ? [topic] : []),
    ...children.filter((child) => matches(child, text)),
  ]);
  return hits.length === 1 ? hits[0].code : undefined;
}

/**
 * The taxonomy picker the Topic row opens: a filter box over every topic and sub-topic,
 * and (with `onFreeTag`) typed text taken as a free tag on Enter. Without `onFreeTag`,
 * Enter takes the one topic the text names, and anything else is refused with `noFreeTag`.
 */
export function TopicPicker({
  isChosen,
  onPick,
  onFreeTag,
  noFreeTag,
  onClose,
}: {
  /** Already there: shown greyed, not offered. */
  isChosen: (code: string) => boolean;
  onPick: (code: string) => void;
  /** Typed text on Enter, a known topic code included. Absent: only topics are taken. */
  onFreeTag?: (tag: string) => void;
  /** Why typed text is not taken, when `onFreeTag` is absent. */
  noFreeTag?: string;
  onClose: () => void;
}) {
  const m = useMessages(TOPIC_ROW_MESSAGES);
  const lang = useUiLanguage();
  const zh = lang === 'zh-HK';
  const [query, setQuery] = useState('');
  /** Enter was pressed on text that cannot be added: say why until the text changes. */
  const [refused, setRefused] = useState(false);
  const groups = useMemo(() => filterTopics(query), [query]);
  const typed = query.trim();
  const issue = freeTagIssue(typed);
  const issueId = useId();

  const enter = () => {
    if (!typed) return;
    if (!onFreeTag) {
      const only = onlyTopic(typed);
      if (only && !isChosen(only)) {
        onPick(only);
        setQuery('');
      } else setRefused(true);
      return;
    }
    if (issue) {
      setRefused(true);
      return;
    }
    onFreeTag(typed);
    setQuery('');
  };

  const refusal = !onFreeTag
    ? refused
      ? (noFreeTag ?? m.pickFromList)
      : undefined
    : issue && (refused || groups.length === 0)
      ? freeTagMessage(issue, typed, lang)
      : undefined;

  const option = (topic: Topic, indent: boolean) => {
    const chosen = isChosen(topic.code);
    return (
      <li key={topic.code}>
        <button
          type="button"
          disabled={chosen}
          onClick={() => {
            onPick(topic.code);
            setQuery('');
          }}
          className={`flex w-full cursor-pointer items-baseline gap-2 rounded-md py-1 pr-2 text-left text-xs text-ink transition-colors duration-150 ease-out-soft hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent ${
            indent ? 'pl-10' : 'pl-1 font-medium'
          }`}
        >
          {/* A topic's letter; a sub-topic, indented under it, reads by its name alone. */}
          {!indent && <span className="w-7 shrink-0 tabular-nums text-ink-subtle">{topic.code}</span>}
          <span className="min-w-0 flex-1">
            {zh ? (
              topic.zh
            ) : (
              <>
                {topic.en}
                <span className="ml-1.5 font-normal text-ink-muted">{topic.zh}</span>
              </>
            )}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-line bg-surface p-2">
      <input
        autoFocus
        value={query}
        aria-label={onFreeTag ? m.filterAria : m.filterAriaTopicsOnly}
        placeholder={onFreeTag ? m.filterPlaceholder : m.filterAriaTopicsOnly}
        aria-invalid={refusal ? true : undefined}
        aria-describedby={refusal ? issueId : undefined}
        onChange={(event) => {
          setQuery(event.target.value);
          setRefused(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            enter();
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
        className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-xs text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      {refusal && (
        <p id={issueId} role="status" className="px-1 text-[11px] text-ink-muted">
          {refusal}
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
        {groups.length === 0 && !refusal && (
          <li className="px-1 py-2 text-[11px] text-ink-subtle">
            {onFreeTag ? m.noMatchFreeTag(typed) : m.noMatch}
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * The shared "Topics 課題" row of the Edit panel: a list's tags as quiet text, each
 * removable, plus an inline picker over the taxonomy and free text. Each sub-topic takes
 * one 題型 (Pattern) from its list for this question's type, or a new name. Tags never print.
 *
 * By default the whole question's list (MCQ, a question without parts). `PartTopics.tsx`
 * also uses it for one part's list: titled for the part, `noFreeTag` set (a part holds
 * topics and 題型 only), and its own lines in `intro`.
 */
export function TopicRow({
  tags,
  typeId,
  onChange,
  title,
  hint,
  empty,
  noFreeTag,
  intro,
  startOpen = false,
}: {
  tags: readonly string[] | undefined;
  /** The question's registry type: its 題型 list (MCQ and LQ lists are separate). */
  typeId: string;
  /** `undefined` clears the field, so an untagged question carries none. */
  onChange: (tags: string[] | undefined) => void;
  title?: string;
  hint?: string;
  /** Shown while the list is empty and the picker closed. */
  empty?: ReactNode;
  /** Set: typed text is never a tag here, and this says why. */
  noFreeTag?: string;
  /** Lines between the header and the list: where the list comes from, a way back. */
  intro?: ReactNode;
  /** Open the picker at once (a list just made to be edited). */
  startOpen?: boolean;
}) {
  const m = useMessages(TOPIC_ROW_MESSAGES);
  const lang = useUiLanguage();
  const zh = lang === 'zh-HK';
  const current = tags ?? [];
  const { rows } = useBank();
  const registry = usePatternRegistry();
  const [open, setOpen] = useState(startOpen);

  // The picker refuses what cannot be a tag before it gets here.
  const add = (code: string) => {
    const value = code.trim();
    if (!value || current.includes(value)) return;
    onChange([...current, value]);
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

  return (
    <div className="space-y-2 border-t border-line pt-3" data-topic-row>
      <GroupHeader
        title={title ?? m.title}
        hint={hint ?? m.hint}
        action={
          // A quiet panel action, like "+ Statement" beside it: the filled CTA is ink, and
          // accent is for links, focus and selection.
          <Button size="sm" variant="subtle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? m.done : m.addTopic}
          </Button>
        }
      />
      {intro}

      {current.length === 0 && !open && <p className="text-[11px] text-ink-subtle">{empty ?? m.empty}</p>}
      {listed.length > 0 && (
        <ul className="space-y-0.5">
          {listed.map((tag) => {
            const topic = topicOf(tag);
            return (
              <li key={tag} className="text-xs text-ink-muted">
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate" title={topic ? topicHeading(tag, zh ? 'zh' : 'both') : tag}>
                    {topic ? (
                      <>
                        <span className="tabular-nums text-ink-subtle">{topic.parent ?? topic.code}</span>{' '}
                        {zh ? (
                          topic.zh
                        ) : (
                          <>
                            {topic.en} <span className="text-ink-subtle">{topic.zh}</span>
                          </>
                        )}
                      </>
                    ) : isTopicCode(tag) ? (
                      // A code this version does not list (a later version's topic): its code.
                      <span className="tabular-nums text-ink-subtle">{tag}</span>
                    ) : (
                      tag
                    )}
                  </span>
                  <IconButton label={m.removeTopic(tagText(tag, zh ? 'zh' : 'en'))} onClick={() => remove(tag)}>
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

      {open && (
        <TopicPicker
          isChosen={(code) => current.includes(code)}
          onPick={add}
          onFreeTag={noFreeTag === undefined ? add : undefined}
          noFreeTag={noFreeTag}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
