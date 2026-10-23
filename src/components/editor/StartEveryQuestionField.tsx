'use client';

import { CheckField } from '@/components/ui';
import { useMessages } from '@/i18n/language';
import { withStartEveryQuestionOnNewPage } from '@/render/pageFlow';
import { useWorksheetStore } from '@/store/worksheetStore';
import { DOCUMENT_SETTINGS_MESSAGES } from './DocumentSettings.messages';

/**
 * Setup → Page → Start every question on a new page: `Worksheet.startEveryQuestionOnNewPage`,
 * one undo step. Every question asks what its own "Start on a new page" asks (§
 * `render/pageFlow.ts`), and its own boxes still work beside it. Not offered on a Paper 1.
 */
export function StartEveryQuestionField() {
  const m = useMessages(DOCUMENT_SETTINGS_MESSAGES);
  const on = useWorksheetStore((s) => s.worksheet.startEveryQuestionOnNewPage === true);
  const commit = useWorksheetStore((s) => s.commit);
  return (
    <div className="space-y-0.5" data-testid="start-every-question">
      <CheckField
        label={m.startEveryQuestion}
        checked={on}
        onChange={(next) => commit((draft) => withStartEveryQuestionOnNewPage(draft, next))}
      />
      <p className="pl-6 text-[11px] text-ink-muted">{m.startEveryQuestionHint}</p>
    </div>
  );
}
