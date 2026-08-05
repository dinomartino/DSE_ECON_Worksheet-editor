'use client';

import { useEffect, useMemo, useRef } from 'react';
import { replaceRichTextRange, richTextLength } from '@/model/text';
import type { RichText, RunFormat } from '@/model/types';
import {
  readRuns,
  runToNode,
  sameRuns,
  selectionOffsets,
  setSelectionOffsets,
} from './richTextDom';

/**
 * A contenteditable that edits `RichText` **as what it looks like**, never the marker
 * string. Shared by the page's `InlineEditable` and the sidebar's `BiTextField`.
 * A contenteditable is uncontrolled: React owns only whether it exists; runs are
 * painted imperatively (JSX children make React fight the browser's mutations).
 * `paintedRef` separates a genuine outside change from the field's own store echo.
 */

interface Props {
  value: RichText;
  onChange: (next: RichText) => void;
  /** DOM id, so an external `<label htmlFor>` can point at the field. */
  id?: string;
  /** Formatting for the next typed character when nothing is selected. */
  pendingFormat?: RunFormat;
  /** Cleared by the surface once a pending format has been consumed. */
  onPendingConsumed?: () => void;
  className?: string;
  style?: React.CSSProperties;
  lang?: string;
  ariaLabel?: string;
  /** Focus and place the caret at the end on mount. */
  autoFocus?: boolean;
  onSelectionChange?: (range: { start: number; end: number } | undefined) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLSpanElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLSpanElement>) => void;
}

/**
 * Do these two describe the same selection?
 *
 * Compared by value because `selectionOffsets` builds a fresh object every call: an
 * identity check would report every caret as new, and since publishing one causes a
 * render that republishes it, the pair loops until React bails out with "Maximum update
 * depth exceeded". Exported so the rule is tested where it is used, rather than restated
 * in a test that could drift from it.
 */
export function sameSelection(
  next: { start: number; end: number } | undefined,
  previous: { start: number; end: number } | undefined,
): boolean {
  if (next === previous) return true;
  if (!next || !previous) return false;
  return next.start === previous.start && next.end === previous.end;
}

export function RichTextEditable({
  value,
  onChange,
  id,
  pendingFormat,
  onPendingConsumed,
  className = '',
  style,
  lang,
  ariaLabel,
  autoFocus = false,
  onSelectionChange,
  onKeyDown,
  onBlur,
}: Props) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const paintedRef = useRef<RichText | undefined>(undefined);
  /** The last selection handed upward, so an unchanged one is not republished. */
  const publishedRef = useRef<{ start: number; end: number } | undefined>(undefined);

  // Stable reference, so the paint effect does not fire on every render — which would
  // move the caret on every keystroke.
  const runs = useMemo(() => value ?? [], [value]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const painted = paintedRef.current;
    const entering = painted === undefined;
    if (!entering && sameRuns(runs, painted)) return; // our own echo — leave the DOM alone

    const caret = entering ? undefined : selectionOffsets(host);
    host.replaceChildren(...runs.map(runToNode));
    paintedRef.current = runs;

    if (entering) {
      if (autoFocus) {
        host.focus({ preventScroll: true });
        setSelectionOffsets(host, richTextLength(runs));
      }
    } else if (caret) {
      setSelectionOffsets(host, caret.start, caret.end);
    }
    // `autoFocus` is read only on entry; re-running for it would steal focus mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);

  /** Publish the selection, in plain-text offsets — the model's own coordinate space. */
  const publish = () => {
    if (!onSelectionChange) return;
    const host = hostRef.current;
    if (!host) return;
    /*
     * Only a *changed* selection is published.
     *
     * `selectionOffsets` builds a fresh object every call, so an unconditional publish
     * sets state to a value that is equal but never identical — and with the caret now
     * published as well, the resulting render re-runs this and the pair loops until
     * React gives up ("Maximum update depth exceeded"). While only non-empty ranges were
     * reported the loop was rarer and went unnoticed; comparing by value is what
     * actually makes it correct.
     */
    const next = selectionOffsets(host);
    if (sameSelection(next, publishedRef.current)) return;
    publishedRef.current = next;
    /*
     * A collapsed caret is published too, not discarded.
     *
     * It used to be dropped here because the only consumer was the format toolbar, and
     * formatting an empty range is meaningless. But a caret is a real position, and
     * *inserting* at one is the ordinary case — a fill-in blank goes between two words,
     * so requiring a selection would mean selecting the characters you do not want to
     * lose. Consumers that need a genuine range check `start < end` themselves
     * (`runRange` in `Preview.tsx`), which is where that rule belongs.
     */
    onSelectionChange(next);
  };

  /** Read the browser's edit back into runs. */
  const sync = () => {
    const host = hostRef.current;
    if (!host) return;
    const next = readRuns(host);
    if (sameRuns(next, runs)) return;
    // The DOM already is this, so mark it painted or the value returning as a prop
    // would repaint under the caret.
    paintedRef.current = next;
    onChange(next);
  };

  /**
   * Write a range edit the browser must not perform itself, and restore the caret.
   *
   * For insertions whose formatting the surrounding DOM does not imply: a pending
   * format, or a paste that must arrive as plain text. `paintedRef` is deliberately
   * left stale so the new runs are painted.
   */
  const writeRange = (start: number, end: number, insert: string) => {
    onChange(replaceRichTextRange(runs, start, end, insert, pendingFormat));
    onPendingConsumed?.();
    const at = start + insert.length;
    queueMicrotask(() => {
      const host = hostRef.current;
      if (host) setSelectionOffsets(host, at);
    });
  };

  return (
    <span
      ref={hostRef}
      id={id}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      spellCheck={false}
      lang={lang}
      aria-label={ariaLabel}
      // `rich-text-editable` carries the `:empty::after` filler (globals.css): an empty
      // inline contenteditable generates no line box, so an emptied option collapsed to
      // zero height and the next option drew over it until the first character arrived.
      className={`rich-text-editable ${className}`}
      // `pre-wrap` so a hard break and any run of spaces survive as typed; the model
      // stores both verbatim.
      style={{ whiteSpace: 'pre-wrap', ...style }}
      onInput={() => {
        sync();
        publish();
      }}
      onBeforeInput={(event) => {
        /*
         * Normal typing is left entirely to the browser — `onInput` reads the result
         * back — which keeps IME composition, autocorrect and native undo working.
         *
         * A pending format is the one case the DOM cannot express on its own: "bold was
         * switched on with nothing selected" has no run for the browser to continue, so
         * that insertion is performed against the model instead.
         */
        if (!pendingFormat) return;
        const data = (event.nativeEvent as InputEvent).data;
        if (!data) return;
        const host = hostRef.current;
        const at = host ? selectionOffsets(host) : undefined;
        if (!at) return;
        event.preventDefault();
        writeRange(at.start, at.end, data);
      }}
      onPaste={(event) => {
        // Plain text only. Foreign HTML carries a web page's fonts and colours onto the
        // sheet, and arrives as tags with no run attributes to read back; the text takes
        // the formatting at the caret instead.
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        if (!text) return;
        const host = hostRef.current;
        const at = host ? selectionOffsets(host) : undefined;
        if (!at) return;
        writeRange(at.start, at.end, text);
      }}
      onKeyUp={publish}
      onMouseUp={publish}
      onBlur={(event) => {
        sync();
        onBlur?.(event);
      }}
      onKeyDown={onKeyDown}
    />
  );
}
