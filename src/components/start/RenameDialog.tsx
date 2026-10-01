'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/Dialog';
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage, useMessages } from '@/i18n/language';
import { RENAME_MESSAGES } from './screen.messages';
import { NewerDocumentError, type WorksheetStore, type WorksheetSummary } from '@/storage';

export const RENAME_NEWER_MESSAGE = RENAME_MESSAGES.newer.en;

/**
 * Rename a saved document, returning what to tell the teacher if it was refused.
 * A newer build's document is never rewritten (§ NewerDocumentError), so its rename fails.
 */
export async function renameWorksheet(
  store: Pick<WorksheetStore, 'rename'>,
  id: string,
  name: string,
): Promise<string | undefined> {
  try {
    await store.rename(id, name);
    return undefined;
  } catch (error) {
    const m = resolveMessages(RENAME_MESSAGES, uiLanguage());
    return error instanceof NewerDocumentError ? m.newer : m.failed;
  }
}

export function RenameDialog({
  summary,
  error,
  onClose,
  onDone,
}: {
  summary: WorksheetSummary;
  /** Why the last attempt was refused; the dialog stays open so it can be read. */
  error?: string;
  onClose: () => void;
  onDone: (title: string) => void;
}) {
  const m = useMessages(RENAME_MESSAGES);
  const [title, setTitle] = useState(summary.title === 'Untitled' ? '' : summary.title);
  const trimmed = title.trim();
  const formId = 'rename-worksheet-form';

  return (
    <Dialog
      title={m.title}
      description={m.description}
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button variant="subtle" onClick={onClose}>
            {m.cancel}
          </Button>
          {/* Disabled on empty rather than falling back to "Untitled": an empty box here
              is a slip, and silently renaming a document to nothing is not what it asks
              for. */}
          <Button variant="primary" type="submit" form={formId} disabled={!trimmed}>
            {m.rename}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="px-5 py-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onDone(trimmed);
        }}
      >
        <input
          type="text"
          value={title}
          autoFocus
          placeholder={m.placeholder}
          aria-invalid={!!error}
          onChange={(event) => setTitle(event.target.value)}
          className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        {error && (
          <p role="alert" className="mt-2 animate-fade-in text-xs text-danger-ink">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
