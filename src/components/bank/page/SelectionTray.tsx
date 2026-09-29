'use client';

import { Button } from '@/components/ui';
import { mixLabel, type TraySummary } from './bankPage';

/**
 * The "build a paper" path: what is picked (marks, estimated minutes, topic mix), and what
 * to do with it. One filled button — New worksheet from these — in the neutral ink.
 */
export function SelectionTray({
  summary,
  targetTitle,
  busy,
  onClear,
  onSetTopic,
  onAddTo,
  onNewWorksheet,
}: {
  summary: TraySummary;
  /** The worksheet "Add to" puts them in; absent hides the action. */
  targetTitle?: string;
  busy: boolean;
  onClear: () => void;
  onSetTopic: () => void;
  onAddTo: () => void;
  onNewWorksheet: () => void;
}) {
  const mix = mixLabel(summary.mix);
  return (
    <div
      role="region"
      aria-label="Selected questions"
      className="flex animate-slide-up-in flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-strong bg-surface px-4 py-2.5"
    >
      <p className="min-w-0 flex-1 truncate text-[12.5px] tabular-nums text-ink" title={mix || undefined}>
        <b className="font-semibold">{summary.count} selected</b>
        <span className="text-ink-muted">
          {' · '}
          {summary.marks} {summary.marks === 1 ? 'mark' : 'marks'} · ≈ {summary.minutes} min
          {mix && ` · ${mix}`}
        </span>
      </p>
      <Button variant="subtle" size="sm" onClick={onClear} disabled={busy}>
        Clear
      </Button>
      <Button size="sm" onClick={onSetTopic} disabled={busy}>
        Set topic…
      </Button>
      {targetTitle !== undefined && (
        <Button size="sm" onClick={onAddTo} disabled={busy} title={`Open “${targetTitle}” and add them at the end`} className="max-w-[220px]">
          <span className="truncate">Add to “{targetTitle}”</span>
        </Button>
      )}
      <Button variant="primary" size="sm" onClick={onNewWorksheet} disabled={busy}>
        New worksheet from these
      </Button>
    </div>
  );
}
