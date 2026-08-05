'use client';

import { useEffect, useRef, useState } from 'react';
import { useWorksheetStore } from '@/store/worksheetStore';
import { worksheetTitle } from '@/storage';

/**
 * What a typed name does to the stored name — the whole decision, as a pure function.
 *
 * `undefined` means "store nothing", and it is the answer in two cases that are easy to
 * get wrong in a component and invisible once they are:
 *
 * - **Blank keeps the current name.** Emptying the box and clicking away is a slip far
 *   more often than a request for a document with no name, and the result would be a
 *   worksheet reading "Untitled" in a list of them. The start screen's dialog answers
 *   the same question by disabling its button; there is no button here, so declining to
 *   commit is what says no.
 * - **Unchanged text spends no undo entry**, so tabbing through the bar cannot push a
 *   rename that renamed nothing onto the history stack.
 */
export function renamedName(current: string, typed: string): string | undefined {
  const trimmed = typed.trim();
  if (!trimmed || trimmed === current) return undefined;
  return trimmed;
}

/**
 * The open document's name, renamed in place.
 *
 * The bar used to print the *app's* name where this sits. That is the one thing on
 * screen a teacher never needs told — they know which app they opened — while the
 * document's own name, which they do need (several worksheets differ only by title, and
 * the `.docx` downloads under it), appeared nowhere in the editor at all. Renaming
 * meant knowing to open Setup and find the Title field, or leaving for the file list.
 *
 * It renames **in place** rather than opening the start screen's dialog: a dialog for
 * one short string is a modal to dismiss, and the name is already the label being
 * pointed at. Click reveals a field over the same box, so the text does not move.
 *
 * It writes `worksheet.name`, **not** `worksheet.title`: what a document is called and
 * what heading it prints are different questions, and renaming a file for filing must
 * not stamp that name across the top of the paper. `name` is a plain string because a
 * file name is one — the bilingual pair belongs to `title`, which is the thing that
 * actually prints.
 */
export function DocumentName() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);

  const name = worksheetTitle(worksheet);
  // The box opens on the stored name only. `worksheetTitle` may be showing a fallback —
  // the printed title, or "Untitled" — and neither is text the teacher typed *here*, so
  // neither should arrive pre-filled for them to edit.
  const authored = worksheet.name ?? '';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const open = () => {
    setDraft(authored);
    setEditing(true);
  };

  /** Commit on blur and on Enter, discard on Escape — a text field's own conventions. */
  const commit = () => {
    const next = renamedName(authored, draft);
    if (next !== undefined) updateWorksheet({ name: next });
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        autoFocus
        aria-label="Document name"
        placeholder="Document name"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setEditing(false);
          }
          // The page's own shortcuts (Delete, ⌘Z) listen on `window` and all fire, so a
          // keystroke meant for this field must not also reach them.
          event.stopPropagation();
        }}
        className="h-7 w-[22ch] rounded-md border border-accent bg-surface px-1.5 text-[13px] font-semibold text-ink outline-none ring-2 ring-accent/25 placeholder:font-normal placeholder:text-ink-subtle"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      title={`${name} — click to rename`}
      /* `max-w` with a truncate so a long title cannot push the export buttons off the
         bar; the full name stays available as the tooltip. */
      className="max-w-[22ch] truncate rounded-md px-1.5 py-1 text-[13px] font-semibold leading-tight text-ink transition-colors hover:bg-surface-hover"
    >
      {name}
    </button>
  );
}
