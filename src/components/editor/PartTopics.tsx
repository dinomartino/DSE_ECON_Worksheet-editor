'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, GroupHeader, IconButton, Segmented } from '@/components/ui';
import { CloseIcon } from '@/components/ui/icons';
import { addTopics, atSlot, freeTags, inheritAtSlot, matchEdit, wholeQuestion, type StateEdit } from '@/library/tagWrites';
import { freeTagIssue, tagText } from '@/model/patterns';
import { effectiveSlotTags, isTopicalTag, questionTagSlots, slotRef, type SlotState, type TagState } from '@/model/tagSlots';
import { topicDisplay, topicHeading, topicNamesFor, topicOf } from '@/model/topics';
import { useViewLanguage } from '@/settings/paperLanguage';
import type { Question } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { CURRENT_ATTR } from './panelTarget';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { PART_TOPICS_MESSAGES } from './TopicRow.messages';
import { freeTagMessage, TopicPicker, TopicRow } from './TopicRow';
import { partTopicLines, questionFreeTags, topicMode, topicsWithPatterns, type TopicFocus } from './partTopicView';

/**
 * The Edit panel's Topic row on a question tagged per part (§ part-tags.md F1). The page's
 * selection picks what it edits: the stem shows every part, a click in part (b) edits (b),
 * a click in sub-part (a)(ii) edits (a)(ii). A part named in the row points it there too,
 * until the page's selection moves. Every change is one `StateEdit` (`onEdit`): one ⌘Z
 * for the open copy, and the other copies take it part by part.
 */
export function PartTopics({
  question,
  shown,
  onEdit,
}: {
  question: Question;
  /** The question's tag state as the editor shows it (`useShownTagState`). */
  shown: TagState;
  onEdit: (edit: StateEdit) => void;
}) {
  const m = useMessages(PART_TOPICS_MESSAGES);
  const selectedTargetKey = useWorksheetStore((s) => s.selectedTargetKey);
  const infos = useMemo(() => questionTagSlots(question), [question]);
  const [focus, setFocus] = useState<TopicFocus>();
  // A new click on the page wins over a part picked here.
  const [focusFor, setFocusFor] = useState(selectedTargetKey);
  if (focusFor !== selectedTargetKey) {
    setFocusFor(selectedTargetKey);
    setFocus(undefined);
  }
  const mode = topicMode(infos, selectedTargetKey, focus);
  // A click on the page that points the row at another part brings the row into view: it
  // sits under the long parts grid, so its change would otherwise go unseen.
  const rowRef = useRef<HTMLDivElement>(null);
  const modeKey = mode.kind === 'question' ? '' : mode.key;
  const lastMode = useRef<string | undefined>(undefined);
  useEffect(() => {
    const before = lastMode.current;
    lastMode.current = modeKey;
    if (!modeKey || modeKey === before || focus !== undefined) return;
    const row = rowRef.current;
    if (row && isOffScreen(row) && !hidesCurrent(row)) row.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [modeKey, focus]);

  return (
    <div ref={rowRef} className="scroll-my-3.5">
      {partTopicsBody()}
    </div>
  );

  function partTopicsBody(): ReactNode {
    const effective = effectiveSlotTags(shown);
    const slotOf = (key: string) => shown.slots.find((slot) => slot.key === key);
    const topicsOf = (key: string) => (effective.get(key) ?? []).filter(isTopicalTag);
    const wholeLink = <QuietLink onClick={() => setFocus('question')}>{m.wholeQuestion}</QuietLink>;

    if (mode.kind === 'question') {
      return <WholeQuestionTopics shown={shown} onEdit={onEdit} onPick={(key) => setFocus({ key })} />;
    }

    const slot = slotOf(mode.key);
    const ref = slotRef(shown.slots, mode.key);
    if (!slot || !ref) return null;
    const tags = topicsOf(slot.key);
    const setTags = (next: string[] | undefined) => onEdit(atSlot(ref, matchEdit(tags, next ?? [])));
    const noFreeTag = m.partsOnly;

    if (mode.kind === 'part') {
      const ownSubs = shown.slots.filter((sub) => sub.parent === slot.key && sub.own);
      return (
        <TopicRow
          key={slot.key}
          title={m.topicsFor(slot.label)}
          tags={tags}
          typeId={question.type}
         
          noFreeTag={noFreeTag}
          empty={m.noTopicDot}
          onChange={setTags}
          intro={
            <div className="space-y-1 text-[11px] text-ink-subtle">
              {!slot.own && tags.length > 0 && <p>{m.setOnWhole(slot.label)}</p>}
              {ownSubs.length > 0 && (
                <p>{m.ownTopicsInstead(ownSubs.map((sub) => sub.label).join(m.and), ownSubs.length)}</p>
              )}
              <p>{wholeLink}</p>
            </div>
          }
        />
      );
    }

    const parent = slotOf(mode.parent);
    if (!parent) return null;
    return (
      <SubPartTopics
        key={slot.key}
        slot={slot}
        parent={parent}
        tags={tags}
        parentTags={topicsOf(parent.key)}
        typeId={question.type}
       
        noFreeTag={noFreeTag}
        wholeLink={wholeLink}
        onSetTags={setTags}
        onSame={() => onEdit(inheritAtSlot(ref))}
      />
    );
  }
}

/** Whether a row's first line is out of its scrolling panel's view (a sliver counts as out). */
function scrollerOf(element: HTMLElement): HTMLElement | null {
  let scroller = element.parentElement;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
  return scroller;
}

function isOffScreen(element: HTMLElement): boolean {
  const scroller = scrollerOf(element);
  const box = element.getBoundingClientRect();
  const view = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const LINE = 32;
  return box.top > view.bottom - LINE || box.bottom < view.top + LINE;
}

/**
 * Would scrolling `row` into view push the control matching the page's selection
 * (`data-edit-current`, § panelTarget) out of it? That control is what the click was
 * about, so it keeps the view; the topic row follows only when both fit.
 */
function hidesCurrent(row: HTMLElement): boolean {
  const scroller = scrollerOf(row);
  const current = scroller?.querySelector(`[${CURRENT_ATTR}]`);
  if (!scroller || !current) return false;
  const view = scroller.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  const mark = current.getBoundingClientRect();
  const shift =
    box.bottom > view.bottom ? box.bottom - view.bottom : box.top < view.top ? box.top - view.top : 0;
  return mark.top - shift < view.top || mark.bottom - shift > view.bottom;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** "(ii)" from "(a)(ii)": a sub-part named beside its part. */
const shortLabel = (slot: SlotState, parent: SlotState) =>
  slot.label.startsWith(parent.label) ? slot.label.slice(parent.label.length) : slot.label;

/**
 * A sub-part: "Same as (a)" (its part's topics) or "Its own", which replace its part's.
 * "Its own" starts from the part's set and writes nothing until a topic is added or taken
 * off, so "(a)'s topic and one more" is one pick.
 */
function SubPartTopics({
  slot,
  parent,
  tags,
  parentTags,
  typeId,
  noFreeTag,
  wholeLink,
  onSetTags,
  onSame,
}: {
  slot: SlotState;
  parent: SlotState;
  tags: string[];
  parentTags: string[];
  typeId: string;
  noFreeTag: string;
  wholeLink: ReactNode;
  onSetTags: (tags: string[] | undefined) => void;
  onSame: () => void;
}) {
  const m = useMessages(PART_TOPICS_MESSAGES);
  const [draft, setDraft] = useState(false);
  const own = Boolean(slot.own);
  const choice = own || draft ? 'own' : 'same';
  const sub = shortLabel(slot, parent);
  const toggle = (
    <Segmented<'same' | 'own'>
      label={m.topicsFor(slot.label)}
      value={choice}
      options={[
        { value: 'same', label: m.sameAs(parent.label), title: m.sameAsTitle(sub, parent.label) },
        { value: 'own', label: m.itsOwn, title: m.itsOwnTitle(sub, parent.label) },
      ]}
      onChange={(value) => {
        if (value === 'own') setDraft(true);
        else {
          setDraft(false);
          if (own) onSame();
        }
      }}
    />
  );

  if (choice === 'own') {
    return (
      <TopicRow
        title={m.topicsFor(slot.label)}
        tags={tags}
        typeId={typeId}
       
        noFreeTag={noFreeTag}
        empty={m.noTopicDot}
        startOpen={!own}
        onChange={onSetTags}
        intro={
          <div className="space-y-1">
            <div className="-ml-2.5">{toggle}</div>
            <p className="text-[11px] text-ink-subtle">
              {own ? m.inPlaceOf(parent.label) : m.startsFrom(parent.label, sub)}
            </p>
            <p className="text-[11px] text-ink-subtle">{wholeLink}</p>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-2 border-t border-line pt-3" data-topic-row>
      <GroupHeader title={m.topicsFor(slot.label)} hint={m.hintNeverPrinted} />
      <div className="-ml-2.5">{toggle}</div>
      {parentTags.length > 0 ? (
        <TopicLines tags={parentTags} />
      ) : (
        <p className="text-[11px] text-ink-subtle">{m.parentNoTopic(parent.label)}</p>
      )}
      <p className="text-[11px] text-ink-subtle">{wholeLink}</p>
    </div>
  );
}

/** Topics as read-only lines: "C Law of demand 需求定律 · 題型 Price ceiling". */
function TopicLines({ tags }: { tags: string[] }) {
  const names = topicNamesFor(useViewLanguage(), 'wide');
  return (
    <ul className="space-y-0.5">
      {topicsWithPatterns(tags).map(({ topic, pattern }) => {
        const known = topicOf(topic);
        return (
          <li key={topic} className="truncate text-xs text-ink-muted" title={topicHeading(topic, names)}>
            {known ? (
              <>
                <span className="tabular-nums text-ink-subtle">{known.parent ?? known.code}</span>{' '}
                {names === 'both' ? (
                  <>
                    {known.en} <span className="text-ink-subtle">{known.zh}</span>
                  </>
                ) : (
                  topicDisplay(topic, names)
                )}
              </>
            ) : (
              topic
            )}
            {pattern && <span className="text-ink-subtle"> · 題型 {pattern}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The whole question: each part and what it tests (a part with none says so), a sub-part
 * with its own topics under its part, "Add to every part", and the question's free tags.
 */
function WholeQuestionTopics({
  shown,
  onEdit,
  onPick,
}: {
  shown: TagState;
  onEdit: (edit: StateEdit) => void;
  onPick: (key: string) => void;
}) {
  const m = useMessages(PART_TOPICS_MESSAGES);
  const view = useViewLanguage();
  const names = topicNamesFor(view);
  const [open, setOpen] = useState(false);
  const lines = partTopicLines(shown);
  const effective = effectiveSlotTags(shown);
  const leaves = shown.slots.filter((slot) => slot.leaf);
  const everyPartHas = (code: string) => leaves.length > 0 && leaves.every((slot) => (effective.get(slot.key) ?? []).includes(code));
  const fromQuestion = lines.some((line) => line.from === 'question');

  return (
    <div className="space-y-2 border-t border-line pt-3" data-topic-row>
      <GroupHeader
        title={m.topics}
        hint={m.hintByPart}
        action={
          <Button size="sm" variant="subtle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? m.done : m.addToEvery}
          </Button>
        }
      />
      <ul className="-mx-1 space-y-px">
        {lines.map((line) => (
          <li key={line.key}>
            <button
              type="button"
              onClick={() => onPick(line.key)}
              title={m.topicsFor(line.fullLabel)}
              className={`flex w-full cursor-pointer items-baseline gap-2 rounded-md py-1 pr-1 text-left text-xs transition-colors duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                line.depth === 1 ? 'pl-5' : 'pl-1'
              }`}
            >
              <span className="w-8 shrink-0 font-semibold tabular-nums text-ink-muted">{line.label}</span>
              {line.tags.length > 0 ? (
                <span className="min-w-0 flex-1 truncate text-ink-muted" title={line.tags.map((tag) => topicHeading(tag, topicNamesFor(view, 'wide'))).join('\n')}>
                  {topicsWithPatterns(line.tags).map(({ topic, pattern }, index) => (
                    <span key={topic}>
                      {index > 0 && ' · '}
                      {tagText(topic, names)}
                      {pattern && <span className="text-ink-subtle"> · 題型 {pattern}</span>}
                    </span>
                  ))}
                  {line.depth === 1 && <span className="text-ink-subtle">{m.itsOwnSuffix}</span>}
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate text-ink-subtle">{m.noTopicYet}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-ink-subtle">
        {fromQuestion ? m.fromQuestion : m.clickAPart}
      </p>
      {open && (
        <TopicPicker
          isChosen={everyPartHas}
          onPick={(code) => onEdit(wholeQuestion(addTopics([code])))}
          noFreeTag={m.topicsOnlyEvery}
          onClose={() => setOpen(false)}
        />
      )}
      <FreeTagsLine tags={questionFreeTags(shown)} onEdit={onEdit} />
    </div>
  );
}

/** The question's free tags ("mock 2025"), each removable, and "+ Tag" to type one. */
function FreeTagsLine({ tags, onEdit }: { tags: string[]; onEdit: (edit: StateEdit) => void }) {
  const m = useMessages(PART_TOPICS_MESSAGES);
  const lang = useUiLanguage();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [refused, setRefused] = useState<string>();
  const add = () => {
    const typed = text.trim();
    if (!typed) return;
    const issue = freeTagIssue(typed);
    if (topicOf(typed) || isTopicalTag(typed)) {
      setRefused(m.thatIsATopic);
      return;
    }
    if (issue) {
      setRefused(freeTagMessage(issue, typed, lang));
      return;
    }
    onEdit(freeTags((list) => [...list, typed]));
    setText('');
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-[11px] font-medium text-ink-muted">{m.tags}</span>
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center text-ink-muted">
            {tag}
            <IconButton label={m.removeTag(tag)} onClick={() => onEdit(freeTags((list) => list.filter((entry) => entry !== tag)))}>
              <CloseIcon size={11} />
            </IconButton>
          </span>
        ))}
        {!typing && <QuietLink onClick={() => setTyping(true)}>{m.addTag}</QuietLink>}
      </div>
      {typing && (
        <input
          autoFocus
          value={text}
          aria-label={m.newTag}
          placeholder={m.typeATag}
          aria-invalid={refused ? true : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setRefused(undefined);
          }}
          onBlur={() => {
            if (!text.trim()) setTyping(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            } else if (event.key === 'Escape') {
              event.stopPropagation();
              setTyping(false);
              setText('');
              setRefused(undefined);
            }
          }}
          className="h-7 w-full rounded-lg border border-line bg-surface px-2 text-xs text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      )}
      {refused && (
        <p role="status" className="text-[11px] text-ink-muted">
          {refused}
        </p>
      )}
    </div>
  );
}

/** A quiet in-text action: accent ink, underlined on hover. */
function QuietLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer text-[11px] font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </button>
  );
}
