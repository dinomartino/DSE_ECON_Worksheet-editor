'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui';
import { SourceText } from '@/components/bank/BankRow';
import type { BankRow } from '@/library/types';
import { useMessages, useUiLanguage } from '@/i18n/language';
import type { LanguageMode } from '@/model/types';
import { suggestionLabel } from './bankScreen';
import type { PartLine, PartTarget } from './partTopics';
import { PaperPreview, SHEET_MAX_WIDTH } from './PaperPreview';
import { shownLanguage } from './ReviewPage';
import { useOwningDocument } from './useOwningDocument';
import { BANK_PAGE_MESSAGES } from './bankPage.messages';
import { TAG_AS_YOU_GO_MESSAGES } from './TagAsYouGo.messages';
import { topicName, topicTitle } from './topicText';

/**
 * Level 3: the untagged questions one at a time. The question large, then up to five
 * suggested topics and "… All topics" as six numbered keys; Enter saves and the next
 * question appears. Saving writes the owning documents directly, which is safe only
 * because no editor is mounted on this screen (`src/library/tagWrites.ts`).
 *
 * A question with parts adds a part strip over the keys: the keys tag the whole question
 * (every part) until a part is picked, by clicking it or with [ and ]; then they tag that
 * part alone, and the paper marks it. One save writes every part's topics.
 */
export function TagAsYouGo({
  row,
  position,
  left,
  suggestions,
  fromText,
  chosen,
  partial,
  canSave,
  parts,
  language,
  busy,
  onToggle,
  onAllTopics,
  onSave,
  onStep,
  onDone,
  onOpen,
  lastSaved,
  onUndo,
}: {
  /** The question on screen; absent when none are left. */
  row: BankRow | undefined;
  /** Its index in the untagged list. */
  position: number;
  left: number;
  suggestions: string[];
  /** Suggestions the question's own words found, with the terms that did (`termsByTopic`): name underlined with dots. */
  fromText?: ReadonlyMap<string, string[]>;
  /** Topics on where the keys tag now: the whole question (on every part), or one part. */
  chosen: ReadonlySet<string>;
  /** The whole question: topics on some parts only, with where. */
  partial?: ReadonlyMap<string, string[]>;
  /** Some part (or the question) has a topic to save. */
  canSave: boolean;
  /** A question with parts: its parts, and where the keys tag. */
  parts?: { lines: PartLine[]; at: PartTarget; name: string; onAt: (at: PartTarget) => void };
  language: LanguageMode;
  busy: boolean;
  onToggle: (code: string) => void;
  onAllTopics: () => void;
  onSave: () => void;
  onStep: (delta: number) => void;
  onDone: () => void;
  /** Open the question where it sits in its worksheet. */
  onOpen: () => void;
  /** The last save this visit, as Undo names it; absent = nothing to take back. */
  lastSaved?: string;
  /** Take the last save back (also ⌫ or ⌘Z). */
  onUndo?: () => void;
}) {
  const m = useMessages(TAG_AS_YOU_GO_MESSAGES);
  const lang = useUiLanguage();
  const undoLine = lastSaved && onUndo && <UndoLine text={lastSaved} onUndo={onUndo} />;
  const { worksheet, failed } = useOwningDocument(row);
  const scrollRef = useRef<HTMLDivElement>(null);
  const key = row ? `${row.docId}/${row.questionId}` : '';
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [key]);

  if (!row) {
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center bg-surface px-8 py-20">
        <div className="max-w-md text-center">
          <p className="font-display text-[26px] font-normal leading-tight text-ink">{m.allTagged}</p>
          <p className="mt-2 text-[13px] text-ink-muted">{m.allTaggedHint}</p>
          {undoLine && <div className="mt-4 flex justify-center">{undoLine}</div>}
          <Button className="mt-5" onClick={onDone}>
            {m.backToTopics}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-[var(--chrome-sunken)]">
      <div className="px-4 pt-[22px]">
        <div className="mx-auto flex items-start justify-center gap-3" style={{ maxWidth: SHEET_MAX_WIDTH + 2 * 46 }}>
          <Nav label={m.previous} disabled={position <= 0} onClick={() => onStep(-1)}>
            ‹
          </Nav>
          <div className="min-w-0 flex-1" style={{ maxWidth: SHEET_MAX_WIDTH }}>
            <PaperPreview
              worksheet={worksheet}
              questionId={row.questionId}
              language={shownLanguage(row, language)}
              version="teacher"
              failed={failed}
              highlight={parts?.at === undefined ? undefined : [parts.at]}
            />
          </div>
          <Nav label={m.next} disabled={position >= left - 1} onClick={() => onStep(1)}>
            ›
          </Nav>
        </div>
      </div>

      <div className="mx-auto grid gap-3 px-[22px] pb-8 pt-4" style={{ maxWidth: SHEET_MAX_WIDTH + 44 }}>
        <div className="flex min-w-0 items-center gap-3">
          <p className="flex min-w-0 text-[12.5px] tabular-nums text-ink-muted">
            <span className="shrink-0 whitespace-pre text-ink-subtle">{m.livesIn}</span>
            <SourceText title={row.docTitle} number={row.number} />
          </p>
          <Button size="sm" onClick={onOpen} title={m.openTitle} className="shrink-0">
            {m.open}
          </Button>
        </div>
        {/* Its row is held from the start, so the first save (and the next question) never
            moves the topic buttons under the pointer. */}
        <div data-undo-slot className="grid h-6 min-w-0 items-center">
          {undoLine}
        </div>
        {parts && <PartStrip {...parts} />}
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" role="group" aria-label={parts ? m.topicsFor(parts.name) : m.topicsForQuestion}>
          {suggestions.map((code, index) => {
            const { code: coarse, name, zh } = suggestionLabel(code, lang);
            const on = chosen.has(code);
            const some = on ? undefined : partial?.get(code);
            const terms = fromText?.get(code);
            const heading = topicTitle(code, 'both', lang);
            const title = some ? m.partialTitle(heading, some.join(', ')) : heading;
            return (
              <button
                key={code}
                type="button"
                data-tag-key
                aria-pressed={on ? true : some ? 'mixed' : false}
                data-tag-from-text={terms ? '' : undefined}
                title={terms ? m.fromTextTitle(title, terms.join(m.termSep)) : title}
                onClick={() => onToggle(code)}
                className={`relative grid min-w-0 cursor-pointer content-start rounded-[7px] border px-2 py-1.5 text-left text-[12px] transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  on
                    ? 'border-accent bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]'
                    : some
                      ? 'border-dashed border-accent bg-surface-raised'
                      : 'border-line-strong bg-surface-raised hover:border-ink-subtle'
                }`}
              >
                <span className="absolute right-1.5 top-1 text-[10.5px] tabular-nums text-ink-subtle">
                  {some && <span className="mr-1 text-accent-ink">{some.join(' ')}</span>}
                  {index + 1}
                </span>
                <b className="text-[13px] font-semibold text-ink">{coarse}</b>
                <small
                  className={`line-clamp-2 text-[12px] leading-snug text-ink-muted ${terms ? 'underline decoration-ink-muted decoration-dotted underline-offset-2' : ''}`}
                >
                  {name}
                </small>
                {zh && <small className="truncate text-[12px] leading-snug text-ink-subtle">{zh}</small>}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onAllTopics}
            className="relative grid min-w-0 cursor-pointer content-start rounded-[7px] border border-line-strong bg-surface-raised px-2 py-1.5 text-left text-[12px] transition-colors duration-150 ease-out-soft hover:border-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="absolute right-1.5 top-1 text-[10.5px] tabular-nums text-ink-subtle">{suggestions.length + 1}</span>
            <b className="text-[13px] font-semibold text-ink">…</b>
            <small className="text-[12px] leading-snug text-ink-muted">{m.allTopics}</small>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 text-[12.5px] text-ink-muted">
            {suggestions.length > 0 ? (fromText?.size ? m.hintText(suggestions.length + 1) : m.hint(suggestions.length + 1)) : m.hintNone}
            {parts && m.hintParts}
          </p>
          <Button variant="primary" size="sm" disabled={busy || !canSave} onClick={onSave} data-tag-save>
            {m.saveNext}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Where the keys tag: "Whole question", then each part and sub-part with what it has so
 * far. Picked with a click, or [ and ] (`QuestionBankScreen`'s keys).
 */
function PartStrip({ lines, at, onAt }: { lines: PartLine[]; at: PartTarget; onAt: (at: PartTarget) => void }) {
  const m = useMessages(TAG_AS_YOU_GO_MESSAGES);
  const w = useMessages(BANK_PAGE_MESSAGES);
  const lang = useUiLanguage();
  return (
    <div role="group" aria-label={m.partsLabel} className="flex min-w-0 flex-wrap items-stretch gap-1.5">
      <PartChip selected={at === undefined} label={m.whole} detail={m.everyPart} onClick={() => onAt(undefined)} />
      {lines.map((line) => (
        <PartChip
          key={line.key}
          selected={at === line.key}
          label={line.sub ? line.short : line.label}
          title={line.label}
          detail={
            line.inherits
              ? m.sameAs(line.parentLabel ?? '')
              : line.codes.length === 0
                ? m.noTopicYet
                : line.codes.map((code) => topicName(code, 'en', lang)).join(w.sep)
          }
          quiet={line.inherits || line.codes.length === 0}
          onClick={() => onAt(line.key)}
        />
      ))}
      <span className="self-center pl-1 text-[11.5px] text-ink-subtle">{m.move}</span>
    </div>
  );
}

function PartChip({
  selected,
  label,
  title,
  detail,
  quiet = false,
  onClick,
}: {
  selected: boolean;
  label: string;
  title?: string;
  detail: string;
  quiet?: boolean;
  onClick: () => void;
}) {
  const m = useMessages(TAG_AS_YOU_GO_MESSAGES);
  return (
    <button
      type="button"
      data-tag-part
      aria-pressed={selected}
      title={title ? m.chipTitle(title, detail) : detail}
      onClick={onClick}
      className={`grid min-w-0 max-w-[180px] cursor-pointer content-start rounded-[7px] border px-2 py-1 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-hover'
      }`}
    >
      <span className={`text-[12px] font-medium ${selected ? 'text-accent-ink' : 'text-ink'}`}>{label}</span>
      <span className={`truncate text-[11px] ${quiet ? 'text-ink-subtle' : 'text-ink-muted'}`}>{detail}</span>
    </button>
  );
}

/** The last save, and the way back: one quiet line, never a block. */
function UndoLine({ text, onUndo }: { text: string; onUndo: () => void }) {
  const m = useMessages(TAG_AS_YOU_GO_MESSAGES);
  return (
    <p role="status" className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-muted">
      <span className="min-w-0 truncate" title={text}>
        {m.saved(text)}
      </span>
      <button
        type="button"
        onClick={onUndo}
        title={m.undoTitle}
        className="shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 font-medium text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {m.undo}
      </button>
      <span className="shrink-0 text-[11.5px] text-ink-subtle">⌫</span>
    </p>
  );
}

function Nav({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="sticky top-[120px] mt-[40px] grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-full border border-line-strong bg-surface text-[15px] leading-none text-ink transition-[background-color,opacity] duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-35"
    >
      {children}
    </button>
  );
}
