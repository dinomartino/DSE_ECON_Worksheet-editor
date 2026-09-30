'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { BarButton, ErrorBody, RunningBody, Sparkle } from '@/components/ai/barParts';
import type { RunControl } from '@/components/ai/errorActions';
import type { BankItemTone, BankReviewItem } from '@/assist/bankRun';
import { Button } from '@/components/ui';
import type { BankAiState } from './bankAi';

const NOTHING_DISMISS_MS = 4000;

const CHIP: Record<Exclude<BankItemTone, 'inserted'>, { className: string; label: (n: number) => string }> = {
  look: { className: 'bg-warn-soft text-warn-ink', label: (n) => `${n} to look at` },
  failed: { className: 'bg-danger-soft text-danger-ink', label: (n) => `${n} failed` },
  finding: { className: 'bg-warn-soft text-warn-ink', label: (n) => `${n} ${n === 1 ? 'finding' : 'findings'}` },
};

/**
 * The bank's ✦ run bar, floating over the stage (never reflowing it), in the editor's
 * voice and look: progress and Stop while running; then the summary, ‹ › through what
 * changed (the screen shows each on the paper), Undo all or Replace N, and Done; or an
 * error with exactly the actions it names. Escape inside it ends the review.
 */
export function BankAiBar({ run, left }: { run: UseBoundStore<StoreApi<BankAiState>>; left: number }) {
  const phase = run((s) => s.phase);
  const control: RunControl = useMemo(() => ({ retry: () => run.getState().retry(), dismiss: () => run.getState().dismiss() }), [run]);

  useEffect(() => {
    if (phase.kind !== 'nothing') return;
    const timer = setTimeout(() => {
      if (run.getState().phase === phase) run.getState().dismiss();
    }, NOTHING_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [phase, run]);

  if (phase.kind === 'idle') return null;
  const state = run.getState();
  let body: ReactNode;
  if (phase.kind === 'running') {
    body = <RunningBody label={phase.label} done={phase.done} total={phase.total} onStop={state.stop} />;
  } else if (phase.kind === 'error') {
    body = <ErrorBody error={phase.error} onClose={state.dismiss} run={control} />;
  } else if (phase.kind === 'nothing') {
    body = (
      <>
        <Sparkle />
        <span className="min-w-0 truncate">{phase.summary}</span>
      </>
    );
  } else {
    const { items, index } = phase;
    const tones = (['look', 'failed', 'finding'] as const).flatMap((tone) => {
      const n = items.filter((item) => item.tone === tone).length;
      return n > 0 ? [{ tone, n }] : [];
    });
    body = (
      <>
        <Sparkle />
        <span className="min-w-0 max-w-[26rem] truncate" title={phase.summary}>
          {phase.summary}
        </span>
        {tones.map(({ tone, n }) => (
          <button
            key={tone}
            type="button"
            onClick={() => state.goTo(items.findIndex((item) => item.tone === tone))}
            className={`shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-medium ${CHIP[tone].className}`}
          >
            {CHIP[tone].label(n)}
          </button>
        ))}
        {items.length > 1 && (
          <span className="flex shrink-0 items-center">
            <BarButton aria-label="Previous" onClick={state.prev}>
              ‹
            </BarButton>
            <span className="text-[11px] tabular-nums text-on-cta/70">
              {index + 1} / {items.length}
            </span>
            <BarButton aria-label="Next" onClick={state.next}>
              ›
            </BarButton>
          </span>
        )}
        {phase.undoable && (
          <BarButton disabled={phase.busy} onClick={() => void state.undoAll()}>
            Undo all
          </BarButton>
        )}
        {phase.applyAll && (
          <BarButton primary disabled={phase.busy} onClick={() => void state.applyAll()}>
            {phase.applyAll.label}
          </BarButton>
        )}
        <BarButton primary={!phase.applyAll} disabled={phase.busy} onClick={state.dismiss}>
          Done
        </BarButton>
      </>
    );
  }

  return (
    <div data-print-hide className="pointer-events-none absolute inset-x-0 bottom-5 z-[35] flex justify-center px-4" style={{ left }}>
      <div
        role={phase.kind === 'error' ? 'alert' : 'status'}
        aria-label="AI"
        data-bank-ai-bar={phase.kind}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || phase.kind === 'running') return;
          event.stopPropagation();
          state.dismiss();
        }}
        className="pointer-events-auto flex max-w-full animate-slide-up-in flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-cta py-1.5 pl-3.5 pr-1.5 text-[13px] text-on-cta shadow-2xl"
      >
        {body}
      </div>
    </div>
  );
}

const TONE_LABEL: Record<BankItemTone, string> = {
  inserted: 'Filled',
  look: 'Needs a look',
  failed: "Couldn't translate",
  finding: 'Finding',
};
const TONE_CLASS: Record<BankItemTone, string> = {
  inserted: 'text-accent-ink',
  look: 'text-warn-ink',
  failed: 'text-danger-ink',
  finding: 'text-warn-ink',
};

/**
 * The reviewed item for the question on the stage, above its paper: what kind, where, the
 * source a finding reads, its notes, and a finding's own fix (every identical copy).
 */
export function BankAiNote({ item, busy, onFix }: { item: BankReviewItem; busy: boolean; onFix?: () => void }) {
  return (
    <div data-print-hide data-bank-ai-note={item.tone} className="mb-3 rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 text-[13px] text-ink shadow-sm">
      <div className="flex items-baseline gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${TONE_CLASS[item.tone]}`}>✦ {TONE_LABEL[item.tone]}</span>
        <span className="min-w-0 truncate text-[12px] text-ink-muted">{item.unit.label}</span>
      </div>
      {item.source && <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{item.source}</p>}
      {item.notes.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {item.notes.map((note, i) => (
            <li key={i} className="text-xs text-ink" lang="zh-HK">
              {note}
            </li>
          ))}
        </ul>
      )}
      {item.fix && onFix && (
        <div className="mt-2">
          <Button size="sm" disabled={busy} onClick={onFix} title="Changes every copy of this question that says the same">
            {item.fix.label}
          </Button>
        </div>
      )}
    </div>
  );
}
