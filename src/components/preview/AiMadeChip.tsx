'use client';

import { AI_MADE_MESSAGES } from '@/components/editor/AiMade.messages';
import { SparkleIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';

/**
 * The label on a question the Question studio wrote and nobody has checked (`Question.aiMade`,
 * decision 5, k-0499), at the top corner of its box on the page. Screen only: `data-print-hide`,
 * absolute so it takes no room (nothing moves, no page re-breaks), and drawn only on a page
 * being typed on (never print preview, a measuring copy or a read-only file). It lets clicks
 * through, so a click on it selects the question, whose Edit panel holds the Checked button.
 */
export function AiMadeChip() {
  const m = useMessages(AI_MADE_MESSAGES);
  return (
    <span
      data-print-hide=""
      data-testid="ai-made-chip"
      title={m.chipTitle}
      className="pointer-events-none absolute -top-3 right-1 z-10 inline-flex select-none items-center gap-1 rounded-[3px] bg-accent-soft px-1.5 py-px font-sans text-[9px] font-semibold leading-tight text-accent-ink ring-1 ring-accent/30"
    >
      <SparkleIcon size={9} />
      {m.chip}
    </span>
  );
}
