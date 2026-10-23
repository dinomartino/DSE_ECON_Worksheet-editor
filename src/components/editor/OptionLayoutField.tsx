'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui';
import { Field } from '@/components/ui/Dialog';
import { useNotices } from '@/components/ui/NoticeLayer';
import { useMessages } from '@/i18n/language';
import { OPTION_LAYOUT_CHOICES, optionLayoutTally, type OptionLayoutChoice } from '@/registry/mcqLayouts';
import { useWorksheetStore } from '@/store/worksheetStore';
import { DOCUMENT_SETTINGS_MESSAGES } from './DocumentSettings.messages';
import { applyOptionLayout } from './optionLayoutAction';

/**
 * Setup → Option layout for all MC questions: set every MC question's options at once.
 *
 * Four actions rather than a setting: each question keeps its own layout (the one its panel
 * sets), so nothing here can show as selected, and the line above the buttons says how the
 * paper stands now. Each action is one undo step and says how many questions it changed
 * (`applyOptionLayout`). Absent on a paper with no MC question.
 */
export function OptionLayoutField() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const notices = useNotices();
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  const tally = useMemo(() => optionLayoutTally(worksheet), [worksheet]);
  if (tally.total === 0) return null;

  const labels: Record<OptionLayoutChoice, { label: string; title: string }> = {
    fit: { label: m.optionLayoutFit, title: m.optionLayoutFitTitle },
    stacked: { label: m.optionLayoutStacked, title: m.optionLayoutStackedTitle },
    inline: { label: m.optionLayoutInline, title: m.optionLayoutInlineTitle },
    columns2: { label: m.optionLayoutColumns2, title: m.optionLayoutColumns2Title },
  };
  return (
    <Field label={m.optionLayoutAll} hint={m.optionLayoutAllHint}>
      <p className="text-[12px] text-ink-muted" aria-live="polite">
        {m.optionLayoutNow(tally.stacked, tally.inline, tally.columns2)}
      </p>
      <div role="group" aria-label={m.optionLayoutAll} className="flex flex-wrap gap-1.5">
        {OPTION_LAYOUT_CHOICES.map((choice) => (
          <Button
            key={choice}
            size="sm"
            disabled={readOnly}
            title={labels[choice].title}
            onClick={() => applyOptionLayout(choice, m, notices.notify)}
          >
            {labels[choice].label}
          </Button>
        ))}
      </div>
    </Field>
  );
}
