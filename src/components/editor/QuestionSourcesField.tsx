'use client';

import { CheckField } from '@/components/ui';
import { useMessages } from '@/i18n/language';
import { hasQuestionSources, printsQuestionSources, withQuestionSources } from '@/render/questionSource';
import { useWorksheetStore } from '@/store/worksheetStore';
import { DOCUMENT_SETTINGS_MESSAGES } from './DocumentSettings.messages';

/**
 * Setup → Page → Show each question's source: `Worksheet.showQuestionSources`, one undo step
 * (user u-w7gs). Offered once the paper has a question with a source note (every past paper
 * bank question has one), or while the switch is on, so it can always be turned off.
 */
export function QuestionSourcesField() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const on = useWorksheetStore((s) => printsQuestionSources(s.worksheet));
  const offered = useWorksheetStore((s) => hasQuestionSources(s.worksheet));
  const commit = useWorksheetStore((s) => s.commit);
  if (!on && !offered) return null;
  return (
    <div className="space-y-0.5" data-testid="question-sources">
      <CheckField
        label={m.questionSources}
        checked={on}
        onChange={(next) => commit((draft) => withQuestionSources(draft, next))}
      />
      <p className="pl-6 text-[11px] text-ink-muted">{m.questionSourcesHint}</p>
    </div>
  );
}
