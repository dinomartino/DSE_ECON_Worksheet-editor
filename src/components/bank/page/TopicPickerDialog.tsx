'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Button, Segmented } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import type { StateEdit } from '@/library/tagWrites';
import { thenState } from '@/library/tagWrites';
import { holdsPatterns } from '@/model/patterns';
import { sameTagState, type TagState } from '@/model/tagSlots';
import { TOPICS, topicOf, type Topic } from '@/model/topics';
import { useMessages, useUiLanguage } from '@/i18n/language';
import type { Messages } from '@/i18n/catalogue';
import type { UiLanguage } from '@/settings/language';
import { escapeClears } from '../escapeClears';
import { PatternPicker } from '../PatternPicker';
import {
  applyDraft,
  partLines,
  patternAt,
  patternEditAt,
  sameAsPart,
  targetName,
  ticksAt,
  toggleAt,
  type PartLine,
  type PartTarget,
} from './partTopics';
import { BANK_PAGE_MESSAGES } from './bankPage.messages';
import { TOPIC_PICKER_MESSAGES } from './TopicPickerDialog.messages';
import { topicName, topicTitle } from './topicText';

/** A row of choices over the list (bulk: Add, Remove, Replace), owned by the caller. */
export interface PickerModes<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** 題型 under the ticked sub-topics. */
export interface PickerPatterns {
  /** The one question type in hand. Absent for a mix of types, which can only clear a 題型. */
  typeId?: string;
  /** "MCQ" or "LQ". */
  kind: string;
  /** The 題型 offered under a sub-topic (`patternNames`). */
  names: (topic: string) => string[];
  /** Each sub-topic's 題型 on open. */
  initial?: Readonly<Record<string, string>>;
  /** Bulk: offer "No 題型", which clears it on every question in hand. */
  clearable?: boolean;
  /** Sub-topic → questions in hand carrying a 題型 under it; a mix of types offers Clear only there. */
  present?: ReadonlyMap<string, number>;
}

/**
 * Each ticked sub-topic's 題型: a name sets it, `null` clears it, `undefined` is none
 * chosen. New names are not here: the picker registers one as it is made.
 */
export interface PickedPatterns {
  patterns: Record<string, string | null | undefined>;
}

/**
 * Tick topics from the guide's list. Edits one question's codes (its free tags are kept by
 * the caller) or, in bulk, adds, removes or replaces codes on many. The dialog pads its
 * own body and keeps its actions in the footer.
 */
export function TopicPickerDialog<M extends string = never>({
  title,
  description,
  initial,
  confirmLabel,
  modes,
  present,
  allowEmpty = true,
  patterns,
  patternRemoval,
  patternNote,
  onClose,
  onDone,
}: {
  title: string;
  description: string;
  /** Codes ticked on open; free tags are ignored here. */
  initial: readonly string[];
  /** The confirm button's words, given how many topics are ticked. */
  confirmLabel: string | ((ticked: number) => string);
  modes?: PickerModes<M>;
  /** How many of the questions in hand carry each code: shown beside it, and its topic opens. */
  present?: ReadonlyMap<string, number>;
  /** Whether confirming with nothing ticked means something (clearing); else it is disabled. */
  allowEmpty?: boolean;
  /** Offer a 題型 under each ticked sub-topic. */
  patterns?: PickerPatterns;
  /**
   * Bulk Remove: sub-topic → questions in hand carrying a 題型 under it. A ticked one can
   * stay and lose only its 題型 (it is left out of the codes and set to `null`).
   */
  patternRemoval?: ReadonlyMap<string, number>;
  /** Why no 題型 is offered (e.g. questions of two types), shown quietly. */
  patternNote?: string;
  onClose: () => void;
  onDone: (codes: string[], picked: PickedPatterns) => void;
}) {
  const m = useMessages(TOPIC_PICKER_MESSAGES);
  const lang = useUiLanguage();
  const [chosenPatterns, setChosenPatterns] = useState<Record<string, string | null | undefined>>(() => ({ ...(patterns?.initial ?? {}) }));
  const [onlyPattern, setOnlyPattern] = useState<ReadonlySet<string>>(new Set());
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(initial.filter((tag) => topicOf(tag))));
  const toggle = (code: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  // Guide order, so a question's tags read A before C and a coarse code before its fine ones.
  const ordered = () => GUIDE_CODES.filter((code) => picked.has(code));
  const keepsTopic = (code: string) => Boolean(patternRemoval?.get(code)) && onlyPattern.has(code);
  const done = () => {
    const codes = ordered();
    const chosen: Record<string, string | null | undefined> = {};
    if (patterns) for (const code of codes.filter(holdsPatterns)) chosen[code] = chosenPatterns[code];
    for (const code of codes.filter(keepsTopic)) chosen[code] = null;
    onDone(
      codes.filter((code) => !keepsTopic(code)),
      { patterns: chosen },
    );
  };
  const patternFor = (child: Topic) => {
    if (!picked.has(child.code) || !holdsPatterns(child.code)) return null;
    const carrying = patternRemoval?.get(child.code) ?? 0;
    if (patternRemoval) {
      if (carrying === 0) return null;
      return (
        <label className="mb-1 ml-[28px] mr-2 flex cursor-pointer items-baseline gap-1.5 text-[11px] text-ink-muted">
          <input
            type="checkbox"
            checked={onlyPattern.has(child.code)}
            onChange={() =>
              setOnlyPattern((current) => {
                const next = new Set(current);
                if (next.has(child.code)) next.delete(child.code);
                else next.add(child.code);
                return next;
              })
            }
            className="h-3 w-3 shrink-0 translate-y-[1px] cursor-pointer accent-[var(--accent)]"
          />
          {m.keepOnly(lang === 'zh-HK' ? child.zh : child.en)}
          <span className="tabular-nums text-ink-subtle">{m.onCount(carrying)}</span>
        </label>
      );
    }
    if (!patterns) return null;
    const canSet = patterns.typeId !== undefined;
    if (!canSet && !patterns.present?.get(child.code)) return null;
    return (
      <div className="mb-1 ml-[28px] mr-2">
        <PatternPicker
          topic={child.code}
          kind={patterns.kind}
          typeId={patterns.typeId}
          names={canSet ? patterns.names(child.code) : []}
          value={chosenPatterns[child.code]}
          clearable={patterns.clearable}
          canSet={canSet}
          onChange={(name) => setChosenPatterns((current) => ({ ...current, [child.code]: name }))}
        />
      </div>
    );
  };

  return (
    <Dialog
      title={title}
      description={description}
      width={520}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-[11.5px] tabular-nums text-ink-subtle">
            {picked.size === 0 ? m.noneTicked : m.ticked(picked.size)}
          </span>
          <Button variant="subtle" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button variant="primary" disabled={!allowEmpty && picked.size === 0} onClick={done}>
            {typeof confirmLabel === 'function' ? confirmLabel(picked.size) : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="px-5 pb-4 pt-4">
        {modes && (
          <div className="-ml-2.5 -mt-2 mb-2">
            <Segmented<M> label={modes.label} value={modes.value} options={modes.options} onChange={modes.onChange} />
          </div>
        )}
        {patternNote && <p className="mb-2 text-[11.5px] text-ink-subtle">{patternNote}</p>}
        <TopicChecklist
          ticked={picked}
          openFor={[...initial, ...(present?.keys() ?? [])]}
          count={(code) => present?.get(code)}
          onToggle={toggle}
          below={patternFor}
        />
      </div>
    </Dialog>
  );
}

const GUIDE_CODES = TOPICS.flatMap((topic) => [topic, ...topic.children]).map((topic) => topic.code);

/**
 * Edit topics for one question with parts: a part column ("Whole question", then each part
 * and sub-part) beside the topic list. Ticks on the whole question go on every part; a
 * part then changes alone; a sub-part has its part's topics until it is given its own,
 * which replace them. Confirming hands back one edit, every pick in order, which a save
 * replays on each copy (`partTopics.ts`); nothing changed hands back `undefined`.
 */
export function PartTopicPickerDialog({
  title,
  description,
  state,
  patterns,
  confirmLabel,
  onClose,
  onDone,
}: {
  title: string;
  description: string;
  /** The question's tag state as the bank shows it, in stored form (`draftOf`). */
  state: TagState;
  /** 題型 under each ticked sub-topic; `initial` is read from the draft, not from here. */
  patterns?: Omit<PickerPatterns, 'initial' | 'clearable' | 'present'>;
  confirmLabel: string;
  onClose: () => void;
  onDone: (edit: StateEdit | undefined) => void;
}) {
  const m = useMessages(TOPIC_PICKER_MESSAGES);
  const w = useMessages(BANK_PAGE_MESSAGES);
  const lang = useUiLanguage();
  const [draft, setDraft] = useState(state);
  const [edits, setEdits] = useState<StateEdit[]>([]);
  const [at, setAt] = useState<PartTarget>(undefined);
  const lines = useMemo(() => partLines(draft), [draft]);
  const ticks = useMemo(() => ticksAt(draft, at), [draft, at]);
  const apply = (edit: StateEdit) => {
    setDraft((current) => applyDraft(current, edit));
    setEdits((current) => [...current, edit]);
  };
  const line = lines.find((entry) => entry.key === at);
  const untagged = lines.filter((entry) => draft.slots.find((slot) => slot.key === entry.key)?.leaf && entry.codes.length === 0);
  const changed = edits.length > 0 && !sameTagState(draft, state);

  const patternFor = (child: Topic) => {
    if (!patterns || !ticks.ticked.has(child.code) || !holdsPatterns(child.code)) return null;
    const { name, mixed } = patternAt(draft, at, child.code);
    return (
      <div className="mb-1 ml-[28px] mr-2">
        {mixed && <p className="mb-0.5 text-[11px] text-ink-subtle">{m.patternsDiffer}</p>}
        <PatternPicker
          topic={child.code}
          kind={patterns.kind}
          typeId={patterns.typeId}
          names={patterns.names(child.code)}
          value={name}
          onChange={(next) => apply(patternEditAt(draft, at, child.code, next ?? undefined))}
        />
      </div>
    );
  };

  return (
    <Dialog
      title={title}
      description={description}
      width={720}
      height={640}
      scrollBody={false}
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto min-w-0 truncate text-[11.5px] text-ink-subtle">
            {untagged.length === 0
              ? m.everyPartHas
              : untagged.length === lines.filter((entry) => draft.slots.find((slot) => slot.key === entry.key)?.leaf).length
                ? m.noPartHas
                : m.noTopicOn(untagged.map((entry) => entry.label).join(w.sep))}
          </span>
          <Button variant="subtle" onClick={onClose}>
            {m.cancel}
          </Button>
          <Button variant="primary" onClick={() => onDone(changed ? thenState(...edits) : undefined)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1">
        <nav aria-label={m.whereLabel} className="scroll-slim w-[196px] shrink-0 overflow-y-auto border-r border-line bg-surface-sunken px-2 py-3">
          <PartButton selected={at === undefined} onClick={() => setAt(undefined)} label={m.whole} detail={m.everyPart} />
          {lines.map((entry) => (
            <PartButton
              key={entry.key}
              selected={at === entry.key}
              sub={entry.sub}
              onClick={() => setAt(entry.key)}
              label={entry.sub ? entry.short : entry.label}
              title={entry.label}
              detail={partDetail(entry, m, w.sep, lang)}
              quiet={entry.inherits || entry.codes.length === 0}
            />
          ))}
        </nav>
        <div className="scroll-slim min-w-0 flex-1 overflow-y-auto px-5 pb-4 pt-3">
          <TargetNote line={line} onSameAsPart={line ? () => apply(sameAsPart(draft, line.key)) : undefined} name={targetName(draft, at, lang)} />
          <TopicChecklist
            // Each target opens on its own topics.
            key={at ?? ''}
            ticked={ticks.ticked}
            openFor={[...ticks.ticked, ...ticks.partial.keys()]}
            partial={ticks.partial}
            onToggle={(code) => apply(toggleAt(draft, at, code, !ticks.ticked.has(code)))}
            below={patternFor}
          />
        </div>
      </div>
    </Dialog>
  );
}

/** A part's line in the column: its topics' names, "Same as (a)", or "No topic yet". */
function partDetail(line: PartLine, m: Messages<typeof TOPIC_PICKER_MESSAGES>, sep: string, lang: UiLanguage): string {
  if (line.inherits) return m.sameAs(line.parentLabel ?? '');
  if (line.codes.length === 0) return m.noTopicYet;
  return line.codes.map((code) => topicName(code, 'en', lang)).join(sep);
}

/** What ticking does here, in one line; a sub-part also says whose topics it has. */
function TargetNote({ line, name, onSameAsPart }: { line?: PartLine; name: string; onSameAsPart?: () => void }) {
  const m = useMessages(TOPIC_PICKER_MESSAGES);
  let text: ReactNode;
  if (!line) text = m.noteWhole;
  else if (!line.sub) text = m.notePart(name);
  else if (line.inherits) text = m.noteInherits(line.label, line.parentLabel ?? '');
  else
    text = (
      <>
        {m.noteOwn(line.label, line.parentLabel ?? '')}{' '}
        <button
          type="button"
          onClick={onSameAsPart}
          className="cursor-pointer rounded px-1 font-medium text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {m.sameAs(line.parentLabel ?? '')}
        </button>
      </>
    );
  return <p className="mb-2.5 text-[12px] leading-snug text-ink-muted">{text}</p>;
}

function PartButton({
  selected,
  sub = false,
  quiet = false,
  label,
  title,
  detail,
  onClick,
}: {
  selected: boolean;
  sub?: boolean;
  quiet?: boolean;
  label: string;
  title?: string;
  detail: string;
  onClick: () => void;
}) {
  const m = useMessages(TOPIC_PICKER_MESSAGES);
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={title ? m.partTitle(title, detail) : detail}
      onClick={onClick}
      className={`mb-0.5 grid w-full min-w-0 cursor-pointer rounded-md py-1.5 pr-2 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        sub ? 'pl-6' : 'pl-2'
      } ${selected ? 'bg-accent-soft' : 'hover:bg-surface-hover'}`}
    >
      <span className={`text-[12.5px] font-medium ${selected ? 'text-accent-ink' : 'text-ink'}`}>{label}</span>
      <span className={`truncate text-[11.5px] ${quiet ? 'text-ink-subtle' : 'text-ink-muted'}`}>{detail}</span>
    </button>
  );
}

/**
 * The guide's topics to tick, with a search. A topic opens when one of `openFor` is under
 * it. `partial` (a whole question with parts): codes on some parts only, shown half-ticked
 * with the parts' labels; ticking one puts it on every part.
 */
function TopicChecklist({
  ticked,
  openFor,
  partial,
  count,
  onToggle,
  below,
}: {
  ticked: ReadonlySet<string>;
  openFor: readonly string[];
  partial?: ReadonlyMap<string, string[]>;
  count?: (code: string) => number | undefined;
  onToggle: (code: string) => void;
  /** Under a sub-topic: its 題型 picker, or nothing. */
  below: (child: Topic) => ReactNode;
}) {
  const m = useMessages(TOPIC_PICKER_MESSAGES);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(openFor.flatMap((tag) => (topicOf(tag)?.parent ? [topicOf(tag)!.parent!] : []))),
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
  const check = (topic: Topic) => (
    <TopicCheck
      topic={topic}
      checked={ticked.has(topic.code)}
      where={partial?.get(topic.code)}
      count={count?.(topic.code)}
      onToggle={() => onToggle(topic.code)}
    />
  );
  return (
    <>
      <input
        type="search"
        value={query}
        autoFocus
        placeholder={m.find}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => void escapeClears(event, query, () => setQuery(''))}
        className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      <ul className="mt-3 space-y-0.5">
        {shown.map(({ topic, children }) => {
          const expanded = Boolean(needle) || open.has(topic.code);
          const inside = countIn(topic, ticked);
          return (
            <li key={topic.code}>
              <div className="flex items-center gap-1">
                {check(topic)}
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
                    {expanded ? m.hide : m.subTopics(topic.children.length)}
                    {!expanded && inside > 0 && m.insideTicked(inside)}
                  </button>
                )}
              </div>
              {expanded && (
                <ul className="mb-1 ml-6">
                  {children.map((child) => (
                    <li key={child.code}>
                      {check(child)}
                      {below(child)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-2 text-[12px] text-ink-subtle">{m.noMatch(query.trim())}</li>}
      </ul>
    </>
  );
}

function countIn(topic: Topic, picked: ReadonlySet<string>): number {
  return topic.children.filter((child) => picked.has(child.code)).length;
}

function TopicCheck({
  topic,
  checked,
  where,
  count,
  onToggle,
}: {
  topic: Topic;
  checked: boolean;
  /** On some parts only: their labels, and the box shows half-ticked. */
  where?: readonly string[];
  count?: number;
  onToggle: () => void;
}) {
  const m = useMessages(TOPIC_PICKER_MESSAGES);
  const lang = useUiLanguage();
  const partial = !checked && where !== undefined && where.length > 0;
  return (
    <label className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 rounded-md px-1.5 py-1 text-[12.5px] text-ink transition-colors hover:bg-surface-hover">
      <input
        type="checkbox"
        checked={checked}
        ref={(element) => {
          if (element) element.indeterminate = partial;
        }}
        aria-checked={partial ? 'mixed' : checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 shrink-0 translate-y-[2px] cursor-pointer accent-[var(--accent)]"
      />
      {/* A topic's letter, which its card shows too; a sub-topic reads by its name alone. */}
      {!topic.parent && <span className="w-7 shrink-0 text-[11px] font-semibold tabular-nums text-ink-subtle">{topic.code}</span>}
      <span className="min-w-0 flex-1" title={topicTitle(topic.code, 'both', lang)}>
        {lang === 'zh-HK' ? (
          topic.zh
        ) : (
          <>
            {topic.en} <span className="text-ink-subtle">{topic.zh}</span>
          </>
        )}
      </span>
      {partial && (
        <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle" title={m.partialTitle(where.join(', '))}>
          {where.join(' ')}
        </span>
      )}
      {count !== undefined && count > 0 && (
        <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle" title={m.onSelected(count)}>
          ×{count}
        </span>
      )}
    </label>
  );
}
