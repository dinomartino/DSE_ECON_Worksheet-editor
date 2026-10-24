'use client';

import { SelectField } from '@/components/ui';
import { Field } from '@/components/ui/Dialog';
import { useMessages } from '@/i18n/language';
import { documentShape } from '@/model/documentShape';
import { startsEveryQuestion } from '@/render/pageFlow';
import { DEFAULT_GAP_LINES, defaultGapLines } from '@/render/questionGap';
import { useWorksheetStore } from '@/store/worksheetStore';
import { DOCUMENT_SETTINGS_MESSAGES } from './DocumentSettings.messages';

/** The MCQ paper's measured gap, for the label of "Default" while the paper has no question to ask. */
const PAPER1_EMPTY_GAP_LINES = 3;

/** The most blank lines the paper-wide choice offers; a single question can ask for more. */
const PAPER_GAP_CHOICES = [1, 2, 3, 4, 5, 6];

/**
 * Setup → Page → Between questions: the blank lines (on the fixed 12pt grid) that separate
 * two questions, on every paper shape.
 *
 * "Default" is stored as absence and keeps tracking the shape's own number — the MCQ paper's
 * measured three, a single line anywhere else, so a saved paper does not move — and a chosen
 * number is the document's own (`Worksheet.examGapLines`). It counts straight under a question
 * of the same kind (§ `boundaryGapLines`), which the hint says. While "Start every question on
 * a new page" is on, every such question opens a sheet and gets no gap, so a line says the
 * number is idle rather than leaving a choice that quietly does nothing.
 */
export function BetweenQuestionsField() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const setExamGapLines = useWorksheetStore((s) => s.setExamGapLines);
  const shape = documentShape(worksheet);
  const idle = startsEveryQuestion(worksheet);

  // What "Default" means for this paper: read off its first question (a Paper 1 holds one
  // kind), or the MCQ paper's measured three while it is still empty; a single line elsewhere.
  const firstQuestion = worksheet.questions[0];
  const defaultLines = firstQuestion
    ? defaultGapLines(shape, firstQuestion)
    : shape === 'paper1'
      ? PAPER1_EMPTY_GAP_LINES
      : DEFAULT_GAP_LINES;

  return (
    <Field label={m.betweenQuestions} hint={m.betweenQuestionsHint}>
      <SelectField<number>
        value={worksheet.examGapLines ?? 0}
        options={[
          {
            value: 0,
            label: shape === 'paper1' ? m.gapDefault(defaultLines) : m.gapDefaultOrdinary(defaultLines),
          },
          ...PAPER_GAP_CHOICES.map((lines) => ({ value: lines, label: m.gapLines(lines) })),
        ]}
        onChange={(lines) => setExamGapLines(lines === 0 ? undefined : lines)}
      />
      {idle && (
        <p className="text-[11px] leading-relaxed text-ink-subtle" data-testid="between-questions-idle">
          {m.betweenQuestionsIdle}
        </p>
      )}
    </Field>
  );
}
