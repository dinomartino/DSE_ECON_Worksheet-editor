'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAiRun, type ReviewOutcome } from '@/assist/runStore';
import type { ReviewItem, ReviewTone } from '@/assist/types';
import { scrollPageTo } from '@/components/editor/panelRows';
import { useMessages } from '@/i18n/language';
import { useWorksheetStore } from '@/store/worksheetStore';
import { BarButton, ErrorBody, RunningBody, Sparkle } from './barParts';
import { ItemCard } from './ItemCard';
import { AI_UI_MESSAGES } from './messages';
import { markTones, pageTextFor, useMarkClicks, usePageMarks } from './pageMarks';

const NOTHING_DISMISS_MS = 4000;
const NO_ITEMS: readonly ReviewItem[] = [];

const CHIP: Record<Exclude<ReviewTone, 'inserted'>, { className: string; label: 'chipLook' | 'chipFailed' | 'chipFinding' }> = {
  look: { className: 'bg-warn-soft text-warn-ink', label: 'chipLook' }, // i18n-ignore: catalogue key
  failed: { className: 'bg-danger-soft text-danger-ink', label: 'chipFailed' }, // i18n-ignore: catalogue key
  finding: { className: 'bg-warn-soft text-warn-ink', label: 'chipFinding' }, // i18n-ignore: catalogue key
};

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
  const m = useMessages(AI_UI_MESSAGES);
  const phase = useAiRun((s) => s.phase);
  // Re-render on every edit: Undo all hides once its commit is no longer the latest.
  const worksheet = useWorksheetStore((s) => s.worksheet);
  // The card belongs to one run: a new run, Done or Undo all closes it by itself.
  const [cardFor, setCardFor] = useState<number | null>(null);

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
  const cardOpen = review !== null && cardFor === review.runId;
  const setCardOpen = useCallback((on: boolean) => {
    const now = useAiRun.getState().phase;
    setCardFor(on && now.kind === 'review' ? now.runId : null);
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
        <ItemCard
          item={current}
          position={position}
          onAct={() => review && run.act(review.index)}
          onPrev={() => walk(-1)}
          onNext={() => walk(1)}
          onClose={() => setCardOpen(false)}
        />
      )}
      <div data-print-hide className="pointer-events-none fixed bottom-16 left-[76px] right-[400px] z-[45] flex justify-center px-4">
        <div
          role={phase.kind === 'error' ? 'alert' : 'status'}
          aria-label={m.ai}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || phase.kind === 'running') return;
            event.stopPropagation();
            run.dismiss();
          }}
          className="pointer-events-auto flex max-w-full animate-slide-up-in flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-cta py-1.5 pl-3.5 pr-1.5 text-[13px] text-on-cta shadow-2xl"
        >
          {phase.kind === 'running' && <RunningBody label={phase.label} done={phase.done} total={phase.total} onStop={run.stop} />}
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
  const m = useMessages(AI_UI_MESSAGES);
  const run = useAiRun.getState();
  const tones = (['look', 'failed', 'finding'] as const).flatMap((tone) => {
    const n = items.filter((item) => item.tone === tone && !item.resolved).length;
    return n > 0 ? [{ tone, n }] : [];
  });
  let actions: ReactNode = null;
  if (outcome.kind === 'inserted') {
    actions = undoLive && <BarButton onClick={run.undoAll}>{m.undoAll}</BarButton>;
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
          {m[CHIP[tone as keyof typeof CHIP].label](n)}
        </button>
      ))}
      {items.length > 0 && (
        <span className="flex shrink-0 items-center">
          <BarButton aria-label={m.previous} onClick={() => onWalk(-1)}>‹</BarButton>
          {position && <span className="text-[11px] tabular-nums text-on-cta/70">{position}</span>}
          <BarButton aria-label={m.next} onClick={() => onWalk(1)}>›</BarButton>
        </span>
      )}
      {actions}
      {outcome.kind !== 'nothing' && (
        <BarButton primary={!(outcome.kind === 'findings' && outcome.applyAll)} onClick={run.dismiss}>
          {m.done}
        </BarButton>
      )}
    </>
  );
}
