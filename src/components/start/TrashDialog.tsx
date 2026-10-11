'use client';

import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { useMessages } from '@/i18n/language';
import { keepInBank, oneBank } from '@/library/bankDocs';
import type { Question } from '@/model/types';
import type { WorksheetStore, WorksheetSummary } from '@/storage/types';
import { START_SCREEN_MESSAGES } from './screen.messages';

/** What happens to questions the 題庫 would lose: kept (the default) or trashed with the worksheet. */
export type KeepChoice = 'keep' | 'trash';

/** Thrown when the questions could not be kept; the worksheet was not moved. */
export class KeepFailedError extends Error {
  constructor(cause: unknown) {
    super('Could not keep the questions in the bank.', { cause });
    this.name = 'KeepFailedError';
  }
}

/**
 * Move a worksheet to Trash, keeping `keep` in the one bank first (`oneBank`,
 * `keepInBank`; none: exactly the plain move). A failed keep throws `KeepFailedError` and
 * the worksheet stays live. Resolves to how many questions the 題庫 keeps.
 */
export async function trashKeeping(
  store: Pick<WorksheetStore, 'list' | 'load' | 'save' | 'trash'>,
  id: string,
  keep: readonly Question[] = [],
): Promise<number> {
  if (keep.length > 0) {
    // The start screen has no open document: no bank is off limits.
    const io = { store: store as WorksheetStore, openDocId: '' };
    try {
      await keepInBank([...keep], id, await oneBank(io), io);
    } catch (cause) {
      throw new KeepFailedError(cause);
    }
  }
  await store.trash(id);
  return keep.length;
}

/**
 * Move to Trash?, and when the worksheet holds questions saved nowhere else (`leaving`,
 * `questionsLeavingBank`), a choice to keep them in the 題庫. `leaving` undefined: still
 * being worked out, so the move waits for it.
 */
export function TrashDialog({
  summary,
  days,
  leaving,
  choice,
  onChoice,
  onClose,
  onConfirm,
}: {
  summary: WorksheetSummary;
  days: number;
  leaving: number | undefined;
  choice: KeepChoice;
  onChoice: (choice: KeepChoice) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useMessages(START_SCREEN_MESSAGES);
  const asks = leaving !== undefined && leaving > 0;
  return (
    <Dialog
      title={t.trashTitle(summary.title)}
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button variant="primary" disabled={leaving === undefined} onClick={onConfirm}>
            {t.moveToTrash}
          </Button>
        </>
      }
    >
      <div className="space-y-3 px-5 py-5 text-[13px] leading-relaxed">
        <p className="text-ink-subtle">{t.trashBody(days)}</p>
        {asks && (
          <div className="animate-fade-in">
            <p className="text-ink">{t.onlyHere(leaving)}</p>
            <div role="radiogroup" aria-label={t.keepChoice} className="mt-1.5 -mx-2">
              <ChoiceRow name="trash-keep" checked={choice === 'keep'} label={t.keepInBank(leaving)} onPick={() => onChoice('keep')} />
              <ChoiceRow name="trash-keep" checked={choice === 'trash'} label={leaving === 1 ? t.trashWithIt : t.trashWithThem} onPick={() => onChoice('trash')} />
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** One option, as the Copy to bank picker draws its banks (`BankActions.tsx:BankOption`). */
function ChoiceRow({ name, checked, label, onPick }: { name: string; checked: boolean; label: string; onPick: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-ink hover:bg-surface-hover">
      <input type="radio" name={name} checked={checked} onChange={onPick} />
      <span className="min-w-0 flex-1">{label}</span>
    </label>
  );
}
