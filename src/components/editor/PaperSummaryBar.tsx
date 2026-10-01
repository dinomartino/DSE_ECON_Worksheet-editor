'use client';

import { useMemo } from 'react';
import {
  summarizePaper,
  summaryParts,
  targetMisses,
  type SummaryPart,
  type SummaryPartKind,
  type TargetStatus,
} from '@/model/paperSummary';
import type { LanguageMode, Worksheet } from '@/model/types';
import { useMessages } from '@/i18n/language';
import { PAPER_CHECK_MESSAGES } from './shell.messages';

/** Over a target takes the warning tone; met, the ok tone; under stays quiet. */
const TONE: Record<TargetStatus, string> = {
  over: 'text-warn-ink',
  met: 'text-ok',
  under: '',
};

/**
 * From what window width each phrase shows. The chip stays compact so the document name
 * keeps the width: question counts live in the tooltip, unless one is over its target.
 */
const VISIBLE: Record<SummaryPartKind, string> = {
  count: 'hidden',
  marks: '',
  minutes: 'hidden min-[1440px]:inline',
  pages: 'hidden xl:inline',
};

const visibility = (part: SummaryPart) => (part.status === 'over' ? '' : VISIBLE[part.kind]);

/**
 * The toolbar's one-line paper summary: "38/45 MCQ · 52/50 marks · ~61/60 min · 3 pages".
 * Every number is derived (`model/paperSummary.ts`); `pages` is the preview's measured
 * sheet count. Chrome only. Clicking opens Setup, where the target is edited.
 */
export function PaperSummaryBar({
  worksheet,
  language,
  pages,
  onOpen,
}: {
  worksheet: Worksheet;
  language: LanguageMode;
  pages?: number;
  /** Absent (read-only): a plain label, not a button. */
  onOpen?: () => void;
}) {
  const m = useMessages(PAPER_CHECK_MESSAGES);
  const summary = useMemo(() => summarizePaper(worksheet), [worksheet]);
  const parts = summaryParts(summary, language, pages);
  const misses = targetMisses(summary);
  const title = [
    parts.map((part) => part.text).join(' · '),
    misses.over.length > 0 ? m.overTarget(misses.over.join(', ')) : '',
    misses.under.length > 0 ? m.underTarget(misses.under.join(', ')) : '',
    onOpen ? m.setTarget : '',
  ]
    .filter(Boolean)
    .join('\n');

  // Marks always show; narrower windows drop the rest first, so the toolbar keeps one
  // row. The full line is in the tooltip. Counts precede marks, so their separator
  // trails them; minutes and pages follow marks, so theirs leads.
  const body = parts.map((part, index) => {
    const dot = <span aria-hidden className="text-ink-subtle"> · </span>;
    const leads = part.kind === 'minutes' || part.kind === 'pages';
    return (
      <span key={part.kind + index} className={visibility(part) || undefined}>
        {leads && index > 0 && dot}
        <span data-status={part.status} className={(part.status && TONE[part.status]) || undefined}>
          {part.text}
        </span>
        {!leads && part.kind !== 'marks' && dot}
      </span>
    );
  });

  // Below `xl` the whole chip steps aside for the document name, unless a measure is over
  // its target: that warning is worth the width.
  const narrow = misses.over.length > 0 ? '' : 'hidden xl:inline-block ';
  const className =
    narrow +
    'shrink-0 whitespace-nowrap rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-muted';

  return onOpen ? (
    <button
      type="button"
      data-print-hide
      aria-label={m.summaryAria(parts.map((part) => part.text).join(', '))}
      title={title}
      onClick={onOpen}
      className={`${className} cursor-pointer transition-[background-color,color,transform,scale] duration-150 ease-out-soft hover:bg-line hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97]`}
    >
      {body}
    </button>
  ) : (
    <span data-print-hide title={title || undefined} className={className}>
      {body}
    </span>
  );
}
