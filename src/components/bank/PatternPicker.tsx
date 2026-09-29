'use client';

import { useMemo, useState } from 'react';
import { IconButton } from '@/components/ui';
import { CloseIcon } from '@/components/ui/icons';
import { cleanPatternName, samePatternName } from '@/model/patterns';

/**
 * One sub-topic's 題型 (Pattern) for a question: the chosen name, or "+ 題型". Opening it
 * lists the 題型 defined for this sub-topic and question type; typing a name that is not
 * there offers to create it. Never printed. Used by the editor's Topic row and the bank's
 * topic dialog, so both pick the same way.
 */
export function PatternPicker({
  topic,
  kind,
  names,
  value,
  onChange,
}: {
  /** The sub-topic code, for labels. */
  topic: string;
  /** "MCQ" or "LQ": whose list this is. */
  kind: string;
  /** The 題型 offered (`patternNames`). */
  names: readonly string[];
  value: string | undefined;
  /** `created`: the name is new to the list, so the caller registers it. */
  onChange: (name: string | undefined, created: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const typed = cleanPatternName(query);
  const shown = useMemo(() => {
    const needle = typed.toLocaleLowerCase();
    return needle ? names.filter((name) => name.toLocaleLowerCase().includes(needle)) : [...names];
  }, [names, typed]);
  const exact = names.find((name) => samePatternName(name, typed));

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const pick = (name: string, created: boolean) => {
    close();
    onChange(name, created);
  };
  const commitTyped = () => {
    if (!typed) return;
    if (exact) pick(exact, false);
    else pick(typed, true);
  };

  if (!open) {
    return (
      <div className="flex min-w-0 items-center gap-1 text-[11px]" data-pattern-picker={topic}>
        <span className="shrink-0 text-ink-subtle">題型</span>
        {value ? (
          <>
            <button
              type="button"
              onClick={() => setOpen(true)}
              title={`${value} · change the ${kind} 題型`}
              className="min-w-0 cursor-pointer truncate rounded px-1 text-left text-ink transition-colors duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {value}
            </button>
            <IconButton label={`Remove 題型 ${value}`} onClick={() => onChange(undefined, false)}>
              <CloseIcon size={11} />
            </IconButton>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="cursor-pointer rounded px-1 text-accent-ink underline-offset-2 transition-colors duration-150 ease-out-soft hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            + Add 題型
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-lg border border-line bg-surface p-1.5" data-pattern-picker={topic}>
      <input
        autoFocus
        value={query}
        aria-label={`${kind} 題型 for ${topic}`}
        placeholder={`Pick a ${kind} 題型 or type a new one`}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            commitTyped();
          } else if (event.key === 'Escape') {
            // React's handler runs before the window listeners (a dialog's Esc): stop here.
            event.stopPropagation();
            close();
          }
        }}
        className="h-7 w-full rounded-md border border-line bg-surface px-2 text-[11.5px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      <ul className="scroll-slim max-h-40 overflow-y-auto">
        {shown.map((name) => (
          <li key={name}>
            <button
              type="button"
              onClick={() => pick(name, false)}
              className={`block w-full cursor-pointer truncate rounded px-1.5 py-1 text-left text-[11.5px] transition-colors duration-150 ease-out-soft hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                value && samePatternName(name, value) ? 'font-medium text-ink' : 'text-ink'
              }`}
            >
              {name}
            </button>
          </li>
        ))}
        {typed && !exact && (
          <li>
            <button
              type="button"
              onClick={commitTyped}
              className="block w-full cursor-pointer truncate rounded px-1.5 py-1 text-left text-[11.5px] text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              New 題型 “{typed}”
            </button>
          </li>
        )}
        {!typed && names.length === 0 && (
          <li className="px-1.5 py-1 text-[11px] text-ink-subtle">No {kind} 題型 here yet. Type a name to create one.</li>
        )}
      </ul>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={close}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
