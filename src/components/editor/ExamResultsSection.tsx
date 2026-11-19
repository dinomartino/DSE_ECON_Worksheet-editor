'use client';

import { useState } from 'react';
import { withAnswerKeySetting, type ResolvedAnswerKeyLayout } from '@/model/answerKeyLayout';
import { hasExamResults, mcPercentOf } from '@/model/examResults';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, CheckField, GroupHeader } from '@/components/ui';
import { useMessages } from '@/i18n/language';
import { EXAM_RESULTS_MESSAGES } from './ExamResults.messages';
import { ExamResultsDialog, resultRows } from './ExamResultsDialog';

/**
 * The Layout tab's **Exam results 考試結果** (k-0471): what has been entered, the button
 * that opens the dialog, and, once anything is entered, the two switches that print it
 * (`showMcPercent`, `showPerformance`, saved with the key's layout like the others).
 */
export function ExamResultsSection({ layout }: { layout: ResolvedAnswerKeyLayout }) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  const updateResults = useWorksheetStore((s) => s.updateExamResults);
  const updateLayout = useWorksheetStore((s) => s.updateAnswerKeyLayout);
  const m = useMessages(EXAM_RESULTS_MESSAGES);
  const [open, setOpen] = useState(false);

  const results = worksheet.examResults;
  const entered = hasExamResults(results);
  const choices = resultRows(worksheet).groups.flatMap((group) => group.choices);
  const withPercent = choices.filter((choice) => mcPercentOf(results, choice.questionId) !== undefined).length;
  const commented = results?.mcComments !== undefined || results?.sqComments !== undefined;

  return (
    <section className="flex flex-col gap-2" data-exam-results-section>
      <GroupHeader title={m.section} />
      <p className="text-[11px] leading-snug text-ink-subtle">{m.sectionHint}</p>
      {entered && (
        <ul className="text-[12px] leading-snug text-ink-muted">
          {choices.length > 0 && <li>{m.summary(withPercent, choices.length)}</li>}
          {commented && <li>{m.commentsEntered}</li>}
        </ul>
      )}
      <div>
        <Button variant="default" size="sm" disabled={readOnly} onClick={() => setOpen(true)}>
          {entered ? m.edit : m.enter}
        </Button>
      </div>
      {entered && (
        <div className="mt-1 flex flex-col gap-2">
          <CheckField
            label={m.showPercent}
            checked={layout.showMcPercent}
            onChange={(on) => updateLayout((current) => withAnswerKeySetting(current, 'showMcPercent', on))}
          />
          <CheckField
            label={m.showPerformance}
            checked={layout.showPerformance}
            onChange={(on) => updateLayout((current) => withAnswerKeySetting(current, 'showPerformance', on))}
          />
        </div>
      )}
      {open && (
        <ExamResultsDialog
          worksheet={worksheet}
          onClose={() => setOpen(false)}
          onSave={(next) => {
            updateResults(next);
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}
