'use client';

import { useMessages } from '@/i18n/language';
import type { WorksheetSummary } from '@/storage/types';
import { NEW_TARGET_TYPES, newTargetChoice, targetChoiceOf, type BankTarget, type NewTargetType } from './bankPage';
import { TARGET_PICKER_MESSAGES } from './TargetPicker.messages';

const NEW_LABEL = { classroom: 'newClassroom', paper1: 'newPaper1', lqMock: 'newPaper2' } as const satisfies Record<NewTargetType, string>;

/**
 * "Adding to ‹paper ▾›": where your list goes. Every saved worksheet but a bank, then a new
 * classroom worksheet, Paper 1 or Paper 2. A native select, so the keyboard and screen
 * readers get it for free and the screen's key listener leaves it alone.
 */
export function TargetPicker({
  target,
  papers,
  labels,
  onChoose,
}: {
  target: BankTarget;
  /** `paperTargets`, in list order (newest first). */
  papers: readonly WorksheetSummary[];
  /** Names that tell two of one title apart (`distinctDocLabels`). */
  labels?: ReadonlyMap<string, string>;
  onChoose: (choice: string) => void;
}) {
  const m = useMessages(TARGET_PICKER_MESSAGES);
  const name = (summary: WorksheetSummary) => labels?.get(summary.id) ?? summary.title;
  return (
    <label data-print-hide title={m.title} className="flex min-w-0 items-center gap-2 text-[12px] text-ink-muted">
      <span className="shrink-0">{m.addingTo}</span>
      <select
        data-bank-target
        value={targetChoiceOf(target)}
        onChange={(event) => onChoose(event.target.value)}
        className="h-7 min-w-0 flex-1 cursor-pointer truncate rounded-md border border-line bg-surface px-1.5 text-[12px] text-ink outline-none transition-colors duration-150 ease-out-soft hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/25"
      >
        {papers.length > 0 && (
          <optgroup label={m.saved}>
            {papers.map((summary) => (
              <option key={summary.id} value={summary.id}>
                {name(summary)}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={m.newGroup}>
          {NEW_TARGET_TYPES.map((type) => (
            <option key={type} value={newTargetChoice(type)}>
              {m[NEW_LABEL[type]]}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}
