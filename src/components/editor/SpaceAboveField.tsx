'use client';

import { SelectField } from '@/components/ui';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { documentShape } from '@/model/documentShape';
import type { Question } from '@/model/types';
import { defaultGapLines, gapAboveStatus, type GapAboveStatus } from '@/render/questionGap';
import { useWorksheetStore } from '@/store/worksheetStore';
import { SPACE_ABOVE_MESSAGES } from './SpaceAboveField.messages';

/** The most blank lines a question can ask for; the on-page drag stops at the same number. */
export const MAX_GAP_LINES = 9;

/**
 * What choosing `lines` writes: nothing for "Paper default" (the field goes absent, so the
 * question keeps tracking Setup's number — a stored 0 would read as one line and stop), else
 * the number.
 */
export function spaceAbovePatch(lines: number): { gapBefore: number | undefined } {
  return { gapBefore: lines === 0 ? undefined : lines };
}

/**
 * A question's own gap above it (`gapBefore`), in blank lines, for any kind of question on
 * any paper shape (§ `boundaryGapLines`). "Paper default" is stored as absence, so it keeps
 * tracking Setup → Between questions and the shape's own number.
 *
 * The number counts only straight under a question of the same kind, so when one is set
 * that the page cannot use (the first item, a heading above, a different kind above) a
 * line under the select says why, rather than leaving a choice that quietly does nothing.
 */
export function SpaceAboveField({
  question,
  onChange,
}: {
  question: Question;
  onChange: (patch: { gapBefore: number | undefined }) => void;
}) {
  const m = useMessages(SPACE_ABOVE_MESSAGES);
  const shape = useWorksheetStore((s) => documentShape(s.worksheet));
  const paperGap = useWorksheetStore((s) => s.worksheet.examGapLines);
  const status = useWorksheetStore((s) => gapAboveStatus(s.worksheet, question.id));

  const note = question.gapBefore === undefined ? undefined : noteFor(status, m);
  return (
    <div className="space-y-1">
      <SelectField<number>
        label={m.label}
        value={question.gapBefore ?? 0}
        options={[
          { value: 0, label: m.paperDefault(paperGap ?? defaultGapLines(shape, question)) },
          ...Array.from({ length: MAX_GAP_LINES }, (_, i) => ({ value: i + 1, label: m.lines(i + 1) })),
        ]}
        onChange={(lines) => onChange(spaceAbovePatch(lines))}
      />
      {note && (
        <p className="text-[11px] leading-relaxed text-ink-subtle" data-testid="space-above-note">
          {note}
        </p>
      )}
    </div>
  );
}

function noteFor(status: GapAboveStatus, m: Messages<typeof SPACE_ABOVE_MESSAGES>): string | undefined {
  switch (status) {
    case 'first':
      return m.noteFirst;
    case 'afterElement':
      return m.noteAfterElement;
    case 'unlikeAbove':
      return m.noteUnlikeAbove;
    case 'applies':
      return undefined;
  }
}
