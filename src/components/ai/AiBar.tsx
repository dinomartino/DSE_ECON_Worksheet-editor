'use client';
// Minimal contract-step bar; the bar agent owns and fills this file.

import { useAiRun } from '@/assist/runStore';
import { Button } from '@/components/ui';

/** Running → Stop; review → summary, ‹ ›, Undo all, Done; error → message, Close. */
export function AiBar() {
  const phase = useAiRun((s) => s.phase);
  if (phase.kind === 'idle') return null;
  const run = useAiRun.getState();

  let body: React.ReactNode;
  if (phase.kind === 'running') {
    body = (
      <>
        <span className="flex-1">
          {phase.label}
          {phase.total > 0 ? ` · ${phase.done} of ${phase.total}` : '…'}
        </span>
        <Button size="sm" onClick={run.stop}>Stop</Button>
      </>
    );
  } else if (phase.kind === 'error') {
    body = (
      <>
        <span className="flex-1 text-danger-ink">{phase.error.message}</span>
        <Button size="sm" onClick={run.dismiss}>Close</Button>
      </>
    );
  } else {
    const { outcome } = phase;
    const count = outcome.kind === 'nothing' ? 0 : outcome.items.length;
    body = (
      <>
        <span className="flex-1">{outcome.summary}</span>
        {count > 1 && (
          <>
            <Button size="sm" variant="subtle" aria-label="Previous" onClick={run.prev}>‹</Button>
            <span className="text-xs text-ink-subtle">{phase.index + 1} / {count}</span>
            <Button size="sm" variant="subtle" aria-label="Next" onClick={run.next}>›</Button>
          </>
        )}
        {outcome.kind === 'inserted' && outcome.undo?.live() && (
          <Button size="sm" onClick={run.undoAll}>Undo all</Button>
        )}
        <Button size="sm" variant="primary" onClick={run.dismiss}>Done</Button>
      </>
    );
  }

  return (
    <div
      data-print-hide
      role="status"
      className="fixed bottom-4 left-1/2 z-[60] flex w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 py-2 text-[13px] text-ink shadow-2xl"
    >
      {body}
    </div>
  );
}
