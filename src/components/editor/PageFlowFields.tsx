'use client';

import { CheckField } from '@/components/ui';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { documentShape } from '@/model/documentShape';
import type { Question } from '@/model/types';
import { startsPageStatus, type StartsPageStatus } from '@/render/pageFlow';
import { requireQuestionType } from '@/registry';
import { useWorksheetStore } from '@/store/worksheetStore';
import { PAGE_FLOW_MESSAGES } from './PageFlowFields.messages';

/** What a tick writes into the question. */
export interface PageFlowPatch {
  startOnNewPage?: true | undefined;
  keepOnOnePage?: true | undefined;
}

/**
 * What ticking writes: `true`, and *absence* (never `false`) when cleared, so a question put
 * back to how it was is the question it was — same JSON, same `contentKey`.
 */
export function pageFlowPatch(field: keyof PageFlowPatch, on: boolean): PageFlowPatch {
  return { [field]: on ? true : undefined };
}

/**
 * What a question asks of the page it prints on (§ `render/pageFlow.ts`): to start a new one,
 * and, for a kind that is not already kept whole, to stay on one.
 *
 * An MC is always kept whole, and so is every question of a Paper 1, so the second choice is
 * not offered there (the Paper 1 says why; an MC says nothing, as nothing was ever optional).
 * When a tick cannot change the page (the first question, or a New page break straight above)
 * a line under it says why.
 */
export function PageFlowFields({
  question,
  onChange,
}: {
  question: Question;
  onChange: (patch: PageFlowPatch) => void;
}) {
  const m = useMessages(PAGE_FLOW_MESSAGES);
  const shape = useWorksheetStore((s) => documentShape(s.worksheet));
  const status = useWorksheetStore((s) => startsPageStatus(s.worksheet, question.id));
  const typeKeepsWhole = requireQuestionType(question).keepWhole === true;

  const note = question.startOnNewPage === true ? startNote(status, m) : undefined;
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <CheckField
          label={m.startOnNewPage}
          checked={question.startOnNewPage === true}
          onChange={(on) => onChange(pageFlowPatch('startOnNewPage', on))}
        />
        {note && (
          <p className="text-[11px] leading-relaxed text-ink-subtle" data-testid="start-on-new-page-note">
            {note}
          </p>
        )}
      </div>
      {!typeKeepsWhole &&
        (shape === 'paper1' ? (
          <p className="text-[11px] leading-relaxed text-ink-subtle" data-testid="kept-on-paper1">
            {m.keptOnPaper1}
          </p>
        ) : (
          <div className="space-y-1">
            <CheckField
              label={m.keepOnOnePage}
              checked={question.keepOnOnePage === true}
              onChange={(on) => onChange(pageFlowPatch('keepOnOnePage', on))}
            />
            <p className="text-[11px] leading-relaxed text-ink-subtle">{m.keepHint}</p>
          </div>
        ))}
    </div>
  );
}

function startNote(status: StartsPageStatus, m: Messages<typeof PAGE_FLOW_MESSAGES>): string | undefined {
  switch (status) {
    case 'first':
      return m.startFirst;
    case 'afterBreak':
      return m.startAfterBreak;
    case 'applies':
      return undefined;
  }
}
