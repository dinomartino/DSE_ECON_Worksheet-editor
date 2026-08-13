'use client';

import { useState } from 'react';
import { IconButton } from './index';
import { MinusIcon, PlusIcon } from './icons';

/**
 * The size of an answer-lines block or a spacer, editable in place.
 *
 * Shared by the outline row (where the size *is* the row's description) and the
 * element's Edit panel, so the two surfaces cannot disagree about how the number is
 * entered. It replaced a menu of five fixed presets (2, 4, 6, 8, 12 lines), which is
 * the shape of a control that cannot express what was asked for: an exam question
 * needing nine lines had no way to say so.
 *
 * The field holds a **local draft string while focused** and commits on blur or Enter,
 * for the reason the margin fields in `page.ts` do: re-deriving the text from the stored
 * number on every keystroke deletes a half-typed value, and one commit per keystroke
 * would make one edit cost several undo presses. Escape abandons the draft.
 */
export function SizeStepper({
  value,
  min,
  step,
  unit,
  label,
  onCommit,
}: {
  value: number;
  min: number;
  step: number;
  /** Printed after the number, e.g. "lines" or "pt". */
  unit: string;
  /** Accessible name — the row's icon is the only other clue to what this sizes. */
  label: string;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>();

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    setDraft(undefined);
    if (Number.isNaN(parsed)) return;
    if (parsed !== value) onCommit(Math.max(min, parsed));
  };

  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <IconButton
        label={`Fewer (${label})`}
        disabled={value <= min}
        onClick={() => onCommit(Math.max(min, value - step))}
      >
        <MinusIcon size={13} />
      </IconButton>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(undefined);
            event.currentTarget.blur();
          }
          // The outline row is `draggable`, and a drag started from inside a text
          // field would steal the pointer from selecting a word.
          event.stopPropagation();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="w-9 rounded border border-line bg-surface px-1 py-0.5 text-center text-xs tabular-nums text-ink focus:border-accent focus:outline-none"
      />
      <IconButton label={`More (${label})`} onClick={() => onCommit(value + step)}>
        <PlusIcon size={13} />
      </IconButton>
      <span className="truncate text-[11px] text-ink-subtle">{unit}</span>
    </span>
  );
}
