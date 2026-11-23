'use client';

import { Button } from '@/components/ui';
import { SparkleIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import type { Question } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { AI_MADE_MESSAGES } from './AiMade.messages';

/**
 * What pressing Checked writes: absence, never `false` (`Question.aiMade`), so a question the
 * teacher has read is the question it would have been without the label, JSON and `contentKey`.
 */
export const CHECKED_PATCH: Pick<Question, 'aiMade'> = { aiMade: undefined };

/**
 * The Edit panel's note on a question the Question studio wrote and nobody has read yet
 * (decision 5, k-0499), with the one button that clears it. Nothing for any other question.
 * One undo step: Undo puts the label back.
 */
export function AiMadeNote({ question, onChange }: { question: Question; onChange: (patch: Partial<Question>) => void }) {
  const m = useMessages(AI_MADE_MESSAGES);
  const readOnly = useWorksheetStore((s) => s.readOnly);
  if (question.aiMade !== true) return null;
  return (
    <div data-testid="ai-made-note" className="mb-4 rounded-lg bg-accent-soft p-3">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-accent-ink">
        <SparkleIcon size={14} />
        {m.title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{m.body}</p>
      {!readOnly && (
        <div className="mt-2">
          <Button size="sm" title={m.checkedHint} onClick={() => onChange(CHECKED_PATCH)}>
            {m.checked}
          </Button>
        </div>
      )}
    </div>
  );
}
