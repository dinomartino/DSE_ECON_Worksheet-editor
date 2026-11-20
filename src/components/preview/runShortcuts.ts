import { applyRunFormat, commonRunFormat } from '@/model/text';
import type { RichText, RunFormat, RunFormatPatch } from '@/model/types';

/**
 * The character formats a key toggles in a text field (GitHub #8, k-0479): Word's keys.
 * ⌘B / Ctrl+B bold, ⌘I italic, ⌘U underline, ⌘= subscript, ⌘⇧= superscript.
 */
export type RunShortcut = 'bold' | 'italic' | 'underline' | 'subscript' | 'superscript';

/** What a format switched at a caret gives the next typed characters, and where. */
export interface TypingFormat {
  /** The caret offset it belongs to; any other caret forgets it. */
  at: number;
  /** Laid over the typed characters: `true`/a value turns on, `null` turns off. */
  patch: RunFormatPatch;
}

interface KeyLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * The format a key press asks for, if any. The = key by its `code` as well as its `key`,
 * since Shift turns it into "+" on most layouts; the keypad's + is the browser's zoom and
 * is left alone.
 */
export function runShortcut(event: KeyLike): RunShortcut | undefined {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return undefined;
  const isEquals = event.code === 'Equal' || ((event.key === '=' || event.key === '+') && event.code !== 'NumpadAdd');
  if (isEquals) return event.shiftKey || event.key === '+' ? 'superscript' : 'subscript';
  if (event.shiftKey) return undefined;
  switch (event.key.toLowerCase()) {
    case 'b':
      return 'bold';
    case 'i':
      return 'italic';
    case 'u':
      return 'underline';
    default:
      return undefined;
  }
}

/** Whether `format` already has what `shortcut` toggles. */
function has(format: RunFormat, shortcut: RunShortcut): boolean {
  if (shortcut === 'subscript' || shortcut === 'superscript') return format.vertAlign === shortcut;
  return format[shortcut] === true;
}

/** The patch that turns `shortcut` on or off. Off clears to inherited (`null`). */
function patchFor(shortcut: RunShortcut, on: boolean): RunFormatPatch {
  if (shortcut === 'subscript' || shortcut === 'superscript') return { vertAlign: on ? shortcut : null };
  return { [shortcut]: on ? true : null };
}

/**
 * Toggle `shortcut` over `[start, end)`: on for all of it unless every character already
 * has it, then off, as the toolbar does. Off *removes* the run's own mark, so bold that
 * arrived with a paste comes off like bold typed here.
 */
export function toggledRange(runs: RichText, start: number, end: number, shortcut: RunShortcut): RichText {
  const on = !has(commonRunFormat(runs, start, end), shortcut);
  return applyRunFormat(runs, start, end, patchFor(shortcut, on));
}

/** The format a character typed at `at` would inherit (the run to its left, else right). */
function formatAtCaret(runs: RichText, at: number): RunFormat {
  let seen = 0;
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    const end = seen + run.text.length;
    if (at > seen && at <= end) return run;
    seen = end;
  }
  return runs[0] && at === 0 ? runs[0] : {};
}

/**
 * Toggle `shortcut` for what is typed next at a caret. Pressing it twice undoes it;
 * subscript and superscript replace each other.
 */
export function toggledAtCaret(
  runs: RichText,
  at: number,
  shortcut: RunShortcut,
  current: TypingFormat | undefined,
): TypingFormat {
  const base = formatAtCaret(runs, at);
  const patch: RunFormatPatch = { ...(current?.patch ?? {}) };
  const effective: RunFormat = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete (effective as Record<string, unknown>)[key];
    else (effective as Record<string, unknown>)[key] = value;
  }
  Object.assign(patch, patchFor(shortcut, !has(effective, shortcut)));
  return { at, patch };
}
