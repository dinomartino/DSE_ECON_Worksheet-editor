'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { ErrorBody, RunningBody, Sparkle } from '@/components/ai/barParts';
import type { RunControl } from '@/components/ai/errorActions';
import { SourceText } from '@/components/bank/BankRow';
import { rowExcerpt } from '@/components/bank/bankText';
import { PaperPreview } from '@/components/bank/page/PaperPreview';
import { shownLanguage } from '@/components/bank/page/ReviewPage';
import { TopicPickerDialog, type PickerPatterns } from '@/components/bank/page/TopicPickerDialog';
import { topicName } from '@/components/bank/page/topicText';
import { useOwningDocument } from '@/components/bank/page/useOwningDocument';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { useMessages } from '@/i18n/language';
import { holdsPatterns } from '@/model/patterns';
import { topicOf } from '@/model/topics';
import type { LanguageMode } from '@/model/types';
import { AI_TAG_MESSAGES } from './AiTag.messages';
import type { AiTagItem, AiTagState } from './aiTagStore';

type Words = ReturnType<typeof useMessages<typeof AI_TAG_MESSAGES>>;

/** Items waiting for the teacher's call. */
export const reviewable = (items: readonly AiTagItem[]) => items.filter((item) => item.state === 'ready');

/**
 * The review of an AI tagging run (k-0560): one card per question with the suggested topics
 * (main first), the teacher's 題型 when one fits, how sure the AI is and why; Accept, Change…
 * (the bank's topic picker; saving it accepts) or Skip; Undo on a saved one; Accept all for
 * what is still waiting. Suggestions arrive while the run goes on. Nothing is written but by
 * Accept. A card opens to show the question as it prints.
 */
export function AiTagPanel({
  run,
  language,
  patterns,
  onClose,
}: {
  run: UseBoundStore<StoreApi<AiTagState>>;
  language: LanguageMode;
  /** The topic picker's 題型 for a question type (the bank screen's `pickerPatterns`). */
  patterns: (typeId: string) => PickerPatterns;
  onClose: () => void;
}) {
  const m = useMessages(AI_TAG_MESSAGES);
  const state = run();
  const [open, setOpen] = useState<string>();
  const [changing, setChanging] = useState<AiTagItem>();
  const control: RunControl = useMemo(() => ({ retry: () => run.getState().retry(), dismiss: () => run.getState().dismissError() }), [run]);
  const { items, status } = state;
  const waiting = reviewable(items);
  const saved = items.filter((item) => item.state === 'saved').length;
  const skipped = items.filter((item) => item.state === 'skipped').length;
  const busy = items.some((item) => item.state === 'saving');
  const answered = items.filter((item) => item.suggestion).length;
  const shownOpen = open ?? items.find((item) => item.state === 'ready')?.rootId;

  let strip: ReactNode = null;
  if (status === 'reading') strip = <RunningBody label={m.reading} done={0} total={0} onStop={state.stop} />;
  else if (status === 'running') strip = <RunningBody label={m.running(state.done, state.total)} done={state.done} total={state.total} onStop={state.stop} />;
  else if (status === 'error' && state.error) strip = <ErrorBody error={state.error} onClose={state.dismissError} run={control} />;

  const footer = (
    <div className="flex w-full flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1 text-[12.5px] tabular-nums text-ink-muted" role="status" data-ai-tag-tally>
        {m.tally(saved, skipped, waiting.length)}
      </p>
      <Button variant="default" onClick={onClose} disabled={busy} title={m.closeTitle} data-ai-tag-close>
        {m.close}
      </Button>
      <Button variant="primary" onClick={() => void state.acceptAll()} disabled={busy || waiting.length === 0} title={m.acceptAllTitle} data-ai-tag-accept-all>
        {m.acceptAll(waiting.length)}
      </Button>
    </div>
  );

  return (
    <Dialog title={m.title} description={m.description} onClose={() => !busy && onClose()} size="large" footer={footer}>
      <div data-ai-tag-panel={status} className="grid gap-3 px-5 py-4">
        {strip && (
          <div role={status === 'error' ? 'alert' : 'status'} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-cta py-1.5 pl-3.5 pr-1.5 text-[13px] text-on-cta">
            {strip}
          </div>
        )}
        {(status === 'done' || status === 'stopped') && (
          <p role="status" className="flex items-center gap-2 text-[13px] text-ink-muted">
            <Sparkle />
            {status === 'stopped' ? m.stopped : m.finished(answered, items.length)}
          </p>
        )}
        <ul className="grid gap-2">
          {items.map((item) => (
            <AiTagCard
              key={item.rootId}
              item={item}
              again={state.again}
              language={language}
              open={item.rootId === shownOpen}
              m={m}
              onOpen={() => setOpen(item.rootId === shownOpen ? '' : item.rootId)}
              onAccept={() => void state.accept(item.rootId)}
              onSkip={() => state.skip(item.rootId)}
              onReview={() => state.review(item.rootId)}
              onUndo={() => void state.undo(item.rootId)}
              onChange={() => setChanging(item)}
            />
          ))}
        </ul>
      </div>
      {changing && (
        <TopicPickerDialog
          title={m.changeTitle}
          description={m.changeDescription}
          initial={changing.topics}
          patterns={{
            ...patterns(changing.row.typeId),
            initial: changing.pattern ? { [changing.pattern.topic]: changing.pattern.name } : undefined,
          }}
          allowEmpty={false}
          confirmLabel={m.saveTopics}
          onClose={() => setChanging(undefined)}
          onDone={(codes, picked) => {
            const item = changing;
            setChanging(undefined);
            // The 題型 under the first ticked sub-topic that has one.
            const withName = codes.filter(holdsPatterns).find((code) => typeof picked.patterns[code] === 'string');
            const name = withName ? picked.patterns[withName] : undefined;
            void run.getState().change(item.rootId, codes, withName && typeof name === 'string' ? { topic: withName, name } : undefined);
          }}
        />
      )}
    </Dialog>
  );
}

const CONF_CLASS = { high: 'bg-ok-soft text-ok', medium: 'bg-warn-soft text-warn-ink', low: 'bg-danger-soft text-danger-ink' } as const;

function AiTagCard({
  item,
  again,
  language,
  open,
  m,
  onOpen,
  onAccept,
  onSkip,
  onReview,
  onUndo,
  onChange,
}: {
  item: AiTagItem;
  again: boolean;
  language: LanguageMode;
  open: boolean;
  m: Words;
  onOpen(): void;
  onAccept(): void;
  onSkip(): void;
  onReview(): void;
  onUndo(): void;
  onChange(): void;
}) {
  const { row, suggestion, state } = item;
  const excerpt = rowExcerpt(row, language);
  const done = state === 'saved' || state === 'skipped';
  const conf = suggestion?.conf;
  return (
    <li
      data-ai-tag-item={state}
      data-root={item.rootId}
      data-doc={row.docId}
      data-question={row.questionId}
      className={`rounded-xl border bg-surface-raised px-3.5 py-2.5 text-[13px] transition-colors duration-150 ${
        open ? 'border-line-strong shadow-sm' : 'border-line'
      } ${done ? 'opacity-75' : ''}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          className="grid min-w-0 flex-1 cursor-pointer gap-0.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <SourceText title={row.docTitle} number={row.number} className="text-[12px] text-ink-subtle" />
          <span className={`text-ink ${open ? '' : 'line-clamp-2'}`}>{excerpt}</span>
        </button>
        <StateLine item={item} m={m} />
      </div>

      {again && item.current.length > 0 && (
        <p className="mt-1.5 text-[12px] text-ink-muted">
          <span className="text-ink-subtle">{m.now}</span> {item.current.map((code) => label(code, language)).join(' · ')}
          {(state === 'ready' || state === 'notSaved') && <span className="ml-2 text-warn-ink">{m.replaces}</span>}
        </p>
      )}

      {item.topics.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-ai-tag-topics>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-ink">✦ {item.changed ? m.yourPick : m.suggested}</span>
          {item.topics.map((code, index) => (
            <TopicChip key={code} code={code} language={language} main={index === 0} />
          ))}
          {item.pattern && item.topics.includes(item.pattern.topic) && (
            <span className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink-muted">
              {m.pattern} {item.pattern.name}
            </span>
          )}
          {conf && !item.changed && (
            <span title={m.confTitle} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CONF_CLASS[conf]}`}>
              {conf === 'high' ? m.confHigh : conf === 'medium' ? m.confMedium : m.confLow}
            </span>
          )}
        </div>
      )}
      {suggestion?.why && !item.changed && <p className="mt-1 text-[12px] leading-snug text-ink-muted">{suggestion.why}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(state === 'ready' || state === 'notSaved') && (
          <>
            <Button size="sm" variant="primary" onClick={onAccept} data-ai-tag-accept>
              {m.accept}
            </Button>
            <Button size="sm" onClick={onChange} data-ai-tag-change>
              {m.change}
            </Button>
            {state === 'ready' && (
              <Button size="sm" variant="subtle" onClick={onSkip} data-ai-tag-skip>
                {m.skip}
              </Button>
            )}
          </>
        )}
        {(state === 'noAnswer' || state === 'skipped') && (
          <Button size="sm" onClick={onChange} data-ai-tag-change>
            {m.change}
          </Button>
        )}
        {state === 'skipped' && item.suggestion && (
          <Button size="sm" variant="subtle" onClick={onReview}>
            {m.review}
          </Button>
        )}
        {state === 'saved' && item.changes && (
          <Button size="sm" variant="subtle" onClick={onUndo} data-ai-tag-undo>
            {m.undo}
          </Button>
        )}
      </div>

      {open && <QuestionPreview item={item} language={language} />}
    </li>
  );
}

function QuestionPreview({ item, language }: { item: AiTagItem; language: LanguageMode }) {
  const { worksheet, failed } = useOwningDocument(item.row);
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-line bg-[var(--chrome-sunken)] p-3" data-print-hide>
      <PaperPreview worksheet={worksheet} questionId={item.row.questionId} language={shownLanguage(item.row, language)} version="teacher" failed={failed} />
    </div>
  );
}

function StateLine({ item, m }: { item: AiTagItem; m: Words }) {
  const text: Partial<Record<AiTagItem['state'], { words: string; tone: string }>> = {
    waiting: { words: m.waiting, tone: 'text-ink-subtle' },
    saving: { words: m.saving, tone: 'text-ink-muted' },
    saved: { words: `✓ ${m.saved}`, tone: 'text-ok' },
    skipped: { words: m.skipped, tone: 'text-ink-subtle' },
    noAnswer: { words: m.noAnswer, tone: 'text-warn-ink' },
    noWords: { words: m.noWords, tone: 'text-warn-ink' },
    notRead: { words: m.notRead, tone: 'text-danger-ink' },
    notSaved: { words: m.notSaved(item.reason ?? ''), tone: 'text-danger-ink' },
  };
  const shown = text[item.state];
  const reason = item.state === 'saved' && item.reason ? m.notSaved(item.reason) : undefined;
  if (!shown && !reason) return null;
  return (
    <span className={`max-w-[45%] shrink-0 text-right text-[12px] ${reason ? 'text-danger-ink' : shown?.tone}`} data-ai-tag-state>
      {shown?.words}
      {reason && <span className="block">{reason}</span>}
    </span>
  );
}

/** "C · Price elasticity of demand", in the paper's language. */
function label(code: string, language: LanguageMode): string {
  const topic = topicOf(code);
  return `${topic?.parent ?? code} · ${topicName(code, language)}`;
}

function TopicChip({ code, language, main }: { code: string; language: LanguageMode; main: boolean }) {
  const topic = topicOf(code);
  return (
    <span
      data-ai-tag-topic={code}
      className={`inline-flex min-w-0 items-baseline gap-1 rounded-md border px-1.5 py-0.5 text-[12px] ${
        main ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink-muted'
      }`}
    >
      <b className="font-semibold">{topic?.parent ?? code}</b>
      <span className="truncate">{topicName(code, language)}</span>
    </span>
  );
}
