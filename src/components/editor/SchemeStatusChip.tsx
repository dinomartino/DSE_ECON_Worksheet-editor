'use client';

import { schemeMax } from '@/model/markScheme';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { useMessages } from '@/i18n/language';
import { MARK_SCHEME_MESSAGES } from './MarkSchemeEditor.messages';

/**
 * A part row's marking-scheme state at a glance (k-0475): "Scheme" waiting for one, a
 * tick and the total when the scheme's total matches the printed marks, the two totals in
 * warning when they differ (the shape counts, before any words are typed). A click opens the part with its scheme in view (`data-scheme-owner`), so
 * the scheme is reached from the row, not hunted for below the part's text.
 */
export function SchemeStatusChip({
  ownerId,
  scheme,
  printedMarks,
  onOpen,
}: {
  ownerId: string;
  scheme: MarkScheme | undefined;
  printedMarks: number | undefined;
  /** Opens the row; the chip then scrolls the scheme into view. */
  onOpen: () => void;
}) {
  const m = useMessages(MARK_SCHEME_MESSAGES);
  // A scheme just started from a pattern has no words yet, but it has its shape and
  // total: only a part with no scheme at all is waiting for one.
  const empty = !scheme;
  const total = scheme ? schemeMax(scheme) : 0;
  const mismatch =
    scheme && printedMarks !== undefined && total !== printedMarks ? { scheme: total, printed: printedMarks } : undefined;
  const tone = empty
    ? 'border border-dashed border-line text-ink-subtle'
    : mismatch
      ? 'bg-warn-soft text-warn-ink'
      : 'bg-ok-soft text-ok';
  const text = empty
    ? m.chipNone
    : mismatch
      ? `${mismatch.scheme}/${mismatch.printed}`
      : `✓ ${total}`;
  const title = empty
    ? m.chipNoneHint
    : mismatch
      ? m.mismatch(mismatch.scheme, mismatch.printed)
      : m.chipDoneHint;
  return (
    <button
      type="button"
      data-print-hide=""
      title={title}
      aria-label={`${m.markingScheme}: ${title}`}
      onClick={() => {
        onOpen();
        // After the row has opened and drawn its scheme.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const target = document.querySelector(`[data-scheme-owner="${CSS.escape(ownerId)}"]`);
            target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }),
        );
      }}
      className={`h-6 shrink-0 cursor-pointer rounded-md px-1.5 text-[10px] font-semibold tabular-nums transition-colors duration-150 ease-out-soft hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${tone}`}
    >
      {text}
    </button>
  );
}
