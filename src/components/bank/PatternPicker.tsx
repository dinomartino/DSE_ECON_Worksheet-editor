'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { IconButton } from '@/components/ui';
import { CloseIcon } from '@/components/ui/icons';
import { registerPatterns } from '@/library/usePatterns';
import { samePatternName } from '@/model/patterns';
import { topicDisplay } from '@/model/topics';
import { patternOptions, stepActive, type PatternOption } from './patternOptions';

/**
 * One sub-topic's 題型 (Pattern) for a question: the chosen name, or "+ Add 題型". Opening
 * it lists the 題型 defined for this sub-topic and question type; typing narrows the list,
 * ↑/↓ move the highlight and Enter takes it (§ patternOptions.ts: an existing match is
 * highlighted before "New 題型"). Never printed. Used by the editor's Topic row and the
 * bank's topic dialog, so both pick the same way.
 *
 * Creating a 題型 is an explicit act, so a new name is registered at once, even when the
 * dialog around the picker is then cancelled.
 *
 * `value`: a name, `undefined` (none, or in bulk: leave as it is) or `null` (bulk only:
 * clear it, offered when `clearable`). With `canSet` false (questions of two types) the
 * picker can only clear.
 */
/**
 * What picking an option means: its name (`null` for "No 題型") and whether it is new. A
 * new one is registered now, not when the surrounding dialog saves.
 */
export function commitPatternOption(
  option: PatternOption,
  topic: string,
  typeId: string | undefined,
  register: typeof registerPatterns = registerPatterns,
): [name: string | null, created: boolean] {
  if (option.kind === 'clear') return [null, false];
  if (option.kind === 'name') return [option.name, false];
  if (typeId) void register([{ topic, typeId, name: option.name }]);
  return [option.name, true];
}

export function PatternPicker({
  topic,
  kind,
  typeId,
  names,
  value,
  clearable = false,
  canSet = true,
  onChange,
}: {
  /** The sub-topic code, for labels. */
  topic: string;
  /** "MCQ" or "LQ": whose list this is. */
  kind: string;
  /** The question type a new name is registered for; absent when `canSet` is false. */
  typeId?: string;
  /** The 題型 offered (`patternNames`). */
  names: readonly string[];
  value: string | null | undefined;
  /** Offer "No 題型": clear it on every question in hand. */
  clearable?: boolean;
  canSet?: boolean;
  /** `created`: the name is new to the list (already registered here). */
  onChange: (name: string | null | undefined, created: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // The highlight the teacher moved to; undefined follows the list's default.
  const [moved, setMoved] = useState<number>();
  const listId = useId();
  const { options, active: initial } = useMemo(
    () => patternOptions(names, query, { value, clearable }),
    [names, query, value, clearable],
  );
  const active = moved !== undefined && moved < options.length ? moved : initial;
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, listId]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setMoved(undefined);
  };
  const choose = (option: PatternOption) => {
    close();
    const [name, created] = commitPatternOption(option, topic, typeId);
    onChange(name, created);
  };

  const label = 'shrink-0 text-ink-subtle';
  const linkButton =
    'cursor-pointer rounded px-1 text-accent-ink underline-offset-2 transition-colors duration-150 ease-out-soft hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  if (!open) {
    return (
      <div className="flex min-w-0 items-center gap-1 text-[11px]" data-pattern-picker={topic}>
        <span className={label}>題型</span>
        {value === null ? (
          <>
            <span className="min-w-0 truncate px-1 text-ink">No 題型</span>
            <span className="shrink-0 text-ink-subtle">· cleared on save</span>
            <IconButton label={`Keep the ${kind} 題型 under ${topicDisplay(topic)}`} onClick={() => onChange(undefined, false)}>
              <CloseIcon size={11} />
            </IconButton>
          </>
        ) : !canSet ? (
          <button type="button" onClick={() => onChange(null, false)} className={linkButton}>
            Clear 題型
          </button>
        ) : value ? (
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
          <button type="button" onClick={() => setOpen(true)} className={linkButton}>
            + Add 題型
          </button>
        )}
      </div>
    );
  }

  const row = (index: number, option: PatternOption) =>
    `block w-full cursor-pointer rounded px-1.5 py-1 text-left text-[11.5px] transition-colors duration-150 ease-out-soft ${
      option.kind === 'new' ? '' : 'truncate'
    } ${index === active ? 'bg-accent-soft' : ''}`;

  return (
    <div className="space-y-1 rounded-lg border border-line bg-surface p-1.5" data-pattern-picker={topic}>
      <input
        autoFocus
        value={query}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        aria-label={`${kind} 題型 for ${topicDisplay(topic)}`}
        placeholder={`Pick an ${kind} 題型 or type a new one`}
        onChange={(event) => {
          setQuery(event.target.value);
          setMoved(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopPropagation();
            setMoved(stepActive(active, event.key === 'ArrowDown' ? 1 : -1, options.length));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            if (active >= 0) choose(options[active]);
          } else if (event.key === 'Escape') {
            // React's handler runs before the window listeners (a dialog's Esc): stop here.
            event.stopPropagation();
            close();
          }
        }}
        className="h-7 w-full rounded-md border border-line bg-surface px-2 text-[11.5px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
      />
      <ul id={listId} role="listbox" aria-label={`${kind} 題型 under ${topicDisplay(topic)}`} className="scroll-slim max-h-40 overflow-y-auto">
        {options.map((option, index) => (
          <li
            key={option.kind === 'name' ? `n:${option.name}` : option.kind}
            id={optionId(index)}
            role="option"
            aria-selected={index === active}
            // Keep the typing field focused: the click picks.
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => index !== active && setMoved(index)}
            onClick={() => choose(option)}
            className={row(index, option)}
          >
            {option.kind === 'clear' && <span className="text-ink-muted">No 題型</span>}
            {option.kind === 'name' && (
              <span className={value && samePatternName(option.name, value) ? 'font-medium text-ink' : 'text-ink'}>
                {option.name}
                {option.match === 'close' && <span className="ml-1.5 text-ink-subtle">similar</span>}
              </span>
            )}
            {option.kind === 'new' && (
              <>
                <span className="text-accent-ink">New 題型 “{option.name}”</span>
                {option.close.length > 0 && (
                  <span className="block text-[10.5px] text-warn-ink">
                    Close to “{option.close[0]}”. Pick it above if it is the same 題型.
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {options.length === 0 && <p className="px-1.5 py-1 text-[11px] text-ink-subtle">No {kind} 題型 here yet. Type a name to create one.</p>}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-ink-subtle">↑↓ to move · Enter to pick</span>
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
