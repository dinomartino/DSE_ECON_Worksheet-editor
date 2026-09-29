'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AiErrorInfo } from '@/ai/types';
import { useAiRun, type AiRunPhase, type ReviewOutcome } from '@/assist/runStore';
import type { ReviewItem, ReviewTone } from '@/assist/types';
import * as copy from '@/components/translate/copy';
import { scrollPageTo } from '@/components/editor/panelRows';
import { useWorksheetStore } from '@/store/worksheetStore';
import { errorActions, errorNote, runErrorAction } from './errorActions';
import { ItemCard } from './ItemCard';
import { markTones, pageTextFor, useMarkClicks, usePageMarks } from './pageMarks';

const NOTHING_DISMISS_MS = 4000;
const NO_ITEMS: readonly ReviewItem[] = [];

const CHIP: Record<Exclude<ReviewTone, 'inserted'>, { className: string; label: (n: number) => string }> = {
  look: { className: 'bg-warn-soft text-warn-ink', label: (n) => `${n} to look at` },
  failed: { className: 'bg-danger-soft text-danger-ink', label: (n) => `${n} failed` },
  finding: { className: 'bg-warn-soft text-warn-ink', label: (n) => `${n} ${n === 1 ? 'finding' : 'findings'}` },
};

export function BarButton({ primary = false, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  const look = primary ? 'bg-on-cta text-cta hover:opacity-90' : 'text-on-cta/80 hover:bg-cta-hover hover:text-on-cta';
  return (
    <button
      type="button"
      className={`shrink-0 cursor-pointer rounded-md px-2 py-1 text-[12px] font-medium transition-[background-color,color,opacity,scale] duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97] ${look} ${className}`}
      {...rest}
    />
  );
}

const Sparkle = () => (
  <span aria-hidden className="shrink-0 text-[13px]">
    ✦
  </span>
);

/** Shows the item: scrolls to its page text, or selects its question when it has none. */
function reveal(item: ReviewItem | undefined) {
  if (!item) return;
  if (item.targetKey && pageTextFor(item.targetKey)) scrollPageTo(item.targetKey);
  else if (item.questionId) useWorksheetStore.getState().select(item.questionId);
}

/**
 * The run bar, floating over the page column (never reflowing it): progress and Stop
 * while running; after a direct insert, the summary, ‹ › through the items, Undo all
 * and Done, with the items highlighted on the page; an error with its actions. It claims
 * no modal layer — the page stays editable — but Escape inside it ends the review.
 */
export function AiBar() {
  const phase = useAiRun((s) => s.phase);
  // Re-render on every edit: Undo all hides once its commit is no longer the latest.
  const worksheet = useWorksheetStore((s) => s.worksheet);
  // The card belongs to one outcome: a new run, Done or Undo all closes it by itself.
  const [cardFor, setCardFor] = useState<ReviewOutcome | null>(null);

  // Another document: highlights and Undo all belong to the one that ran.
  const docId = useRef(worksheet.id);
  useEffect(() => {
    if (docId.current === worksheet.id) return;
    docId.current = worksheet.id;
    const run = useAiRun.getState();
    if (run.phase.kind === 'running') run.stop();
    else run.dismiss();
  }, [worksheet.id]);

  const review = phase.kind === 'review' ? phase : null;
  const items = review && review.outcome.kind !== 'nothing' ? review.outcome.items : NO_ITEMS;
  const current = review ? items[review.index] : undefined;
  const cardOpen = review !== null && cardFor === review.outcome;
  const setCardOpen = useCallback((on: boolean) => {
    const now = useAiRun.getState().phase;
    setCardFor(on && now.kind === 'review' ? now.outcome : null);
  }, []);
  const marks = useMemo(() => (items.length ? markTones(items) : null), [items]);
  usePageMarks(marks, cardOpen ? current?.targetKey : undefined);

  useEffect(() => {
    if (phase.kind !== 'review' || phase.outcome.kind !== 'nothing') return;
    const timer = setTimeout(() => {
      if (useAiRun.getState().phase === phase) useAiRun.getState().dismiss();
    }, NOTHING_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const open = useCallback(
    (index: number) => {
      const run = useAiRun.getState();
      run.goTo(index);
      const now = run.phase.kind === 'review' && run.phase.outcome.kind !== 'nothing' ? run.phase.outcome.items : [];
      setCardOpen(true);
      reveal(now[index]);
    },
    [setCardOpen],
  );

  const walk = useCallback(
    (step: 1 | -1) => {
      const now = useAiRun.getState().phase;
      if (now.kind !== 'review' || now.outcome.kind === 'nothing' || now.outcome.items.length === 0) return;
      const count = now.outcome.items.length;
      open(cardOpen ? (now.index + step + count) % count : now.index);
    },
    [cardOpen, open],
  );

  const onMarkClick = useCallback(
    (key: string) => {
      const index = items.findIndex((item) => item.targetKey === key && item.tone !== 'failed');
      if (index < 0) return;
      useAiRun.getState().goTo(index);
      setCardOpen(true);
    },
    [items, setCardOpen],
  );
  useMarkClicks(items.length > 0, onMarkClick);

  if (phase.kind === 'idle') return null;
  const run = useAiRun.getState();
  const position = items.length > 1 && review ? `${review.index + 1} / ${items.length}` : undefined;

  return (
    <>
      {cardOpen && current && (
        <ItemCard item={current} position={position} onPrev={() => walk(-1)} onNext={() => walk(1)} onClose={() => setCardOpen(false)} />
      )}
      <div data-print-hide className="pointer-events-none fixed bottom-16 left-[76px] right-[400px] z-[45] flex justify-center px-4">
        <div
          role={phase.kind === 'error' ? 'alert' : 'status'}
          aria-label="AI"
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || phase.kind === 'running') return;
            event.stopPropagation();
            run.dismiss();
          }}
          className="pointer-events-auto flex max-w-full animate-slide-up-in flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-cta py-1.5 pl-3.5 pr-1.5 text-[13px] text-on-cta shadow-2xl"
        >
          {phase.kind === 'running' && <Running phase={phase} onStop={run.stop} />}
          {phase.kind === 'error' && <ErrorBody error={phase.error} onClose={run.dismiss} />}
          {review && (
            <ReviewBody
              outcome={review.outcome}
              items={items}
              position={position}
              undoLive={review.outcome.kind === 'inserted' && worksheet !== null && !!review.outcome.undo?.live()}
              onChip={(tone) => open(items.findIndex((item) => item.tone === tone))}
              onWalk={walk}
            />
          )}
        </div>
      </div>
    </>
  );
}

function Running({ phase, onStop }: { phase: Extract<AiRunPhase, { kind: 'running' }>; onStop(): void }) {
  const share = phase.total > 0 ? Math.min(1, phase.done / phase.total) : 0;
  return (
    <>
      <Sparkle />
      <span className="min-w-0 truncate">{phase.label}</span>
      {phase.total > 0 && (
        <>
          <span className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-on-cta/20" aria-hidden>
            <span className="block h-full rounded-full bg-on-cta transition-[width] duration-300 ease-out-soft" style={{ width: `${share * 100}%` }} />
          </span>
          <span className="shrink-0 tabular-nums text-on-cta/70">
            {phase.done} of {phase.total}
          </span>
        </>
      )}
      <BarButton onClick={onStop}>{copy.STOP}</BarButton>
    </>
  );
}

function ReviewBody({
  outcome,
  items,
  position,
  undoLive,
  onChip,
  onWalk,
}: {
  outcome: ReviewOutcome;
  items: readonly ReviewItem[];
  position?: string;
  undoLive: boolean;
  onChip(tone: ReviewTone): void;
  onWalk(step: 1 | -1): void;
}) {
  const run = useAiRun.getState();
  const tones = (['look', 'failed', 'finding'] as const).flatMap((tone) => {
    const n = items.filter((item) => item.tone === tone).length;
    return n > 0 ? [{ tone, n }] : [];
  });
  let actions: ReactNode = null;
  if (outcome.kind === 'inserted') {
    actions = undoLive && <BarButton onClick={run.undoAll}>Undo all</BarButton>;
  } else if (outcome.kind === 'findings' && outcome.applyAll) {
    const applyAll = outcome.applyAll;
    actions = (
      <BarButton
        primary
        onClick={() => {
          applyAll.run();
          run.dismiss();
        }}
      >
        {applyAll.label}
      </BarButton>
    );
  }
  return (
    <>
      <Sparkle />
      <span className="min-w-0 max-w-[28rem] truncate" title={outcome.summary}>
        {outcome.summary}
      </span>
      {tones.map(({ tone, n }) => (
        <button
          key={tone}
          type="button"
          onClick={() => onChip(tone)}
          className={`shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-medium ${CHIP[tone as keyof typeof CHIP].className}`}
        >
          {CHIP[tone as keyof typeof CHIP].label(n)}
        </button>
      ))}
      {items.length > 0 && (
        <span className="flex shrink-0 items-center">
          <BarButton aria-label="Previous" onClick={() => onWalk(-1)}>‹</BarButton>
          {position && <span className="text-[11px] tabular-nums text-on-cta/70">{position}</span>}
          <BarButton aria-label="Next" onClick={() => onWalk(1)}>›</BarButton>
        </span>
      )}
      {actions}
      {outcome.kind !== 'nothing' && (
        <BarButton primary={!(outcome.kind === 'findings' && outcome.applyAll)} onClick={run.dismiss}>
          Done
        </BarButton>
      )}
    </>
  );
}

function ErrorBody({ error, onClose }: { error: AiErrorInfo; onClose(): void }) {
  const note = errorNote(error);
  return (
    <>
      <Sparkle />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{error.message}</span>
        {note && <span className="block text-[11px] text-on-cta/70">{note}</span>}
        {error.detail && (
          <details className="text-[11px] text-on-cta/70">
            <summary className="cursor-pointer select-none">{copy.TECHNICAL_DETAIL}</summary>
            <span className="mt-0.5 block max-w-[32rem] break-words font-mono">{error.detail.slice(0, 300)}</span>
          </details>
        )}
      </span>
      {errorActions(error).map((action) => (
        <BarButton key={`${action.kind}:${action.label}`} primary={action.kind === 'retry'} onClick={() => runErrorAction(action, error)}>
          {action.label}
        </BarButton>
      ))}
      <BarButton onClick={onClose}>{copy.CLOSE}</BarButton>
    </>
  );
}
