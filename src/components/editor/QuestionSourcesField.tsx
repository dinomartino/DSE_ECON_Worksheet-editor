'use client';

import { CheckField } from '@/components/ui';
import { useMessages } from '@/i18n/language';
import { hasQuestionSources, printsQuestionSources, questionSourceFormat, withQuestionSourceFormat, withQuestionSources } from '@/render/questionSource';
import { SourceFormatSelect } from '@/components/pastpapers/SourceFormatSelect';
import { useWorksheetStore } from '@/store/worksheetStore';
import { DOCUMENT_SETTINGS_MESSAGES } from './DocumentSettings.messages';

/**
 * Setup → Page → Show each question's source: `Worksheet.showQuestionSources`, one undo step
 * (user u-w7gs). Offered once the paper has a question with a source note (every past paper
 * bank question has one), or while the switch is on, so it can always be turned off. While on,
 * its format picker (`Worksheet.questionSourceFormat`, u-z6ft) sits under it.
 */
export function QuestionSourcesField() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const on = useWorksheetStore((s) => printsQuestionSources(s.worksheet));
  const offered = useWorksheetStore((s) => hasQuestionSources(s.worksheet));
  const format = useWorksheetStore((s) => questionSourceFormat(s.worksheet));
  const commit = useWorksheetStore((s) => s.commit);
  if (!on && !offered) return null;
  return (
    <div className="space-y-0.5" data-testid="question-sources">
      <CheckField
        label={m.questionSources}
        checked={on}
        onChange={(next) => commit((draft) => withQuestionSources(draft, next))}
      />
      {on && (
        <SourceFormatSelect value={format} onChange={(next) => commit((draft) => withQuestionSourceFormat(draft, next))} className="pl-6 pt-0.5" />
      )}
      <p className="pl-6 text-[11px] text-ink-muted">{m.questionSourcesHint}</p>
    </div>
  );
}
