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
 * A contenteditable that edits a `RichText` **as what it looks like**.
 *
 * Bold reads as bold, a 14pt red phrase reads as a 14pt red phrase. The model's
 * `**bold**` marker string is a plain-text *storage* form, not something a teacher
 * should be asked to type or decode — the sidebar and the page both used to show it
 * mid-sentence (`her **opportunity cost** of choosing…`), which is markup leaking into
 * the document.
 *
 * Shared by the page's `InlineEditable` and the sidebar's `BiTextField`, so the two
 * surfaces cannot disagree about what an edit does to a run.
 *
 * ## The rule that keeps the caret alive
 *
 * A contenteditable is an **uncontrolled** input: the browser writes into it directly.
 * React therefore owns only *whether* this element exists, never its children — the
 * runs are painted imperatively below. Rendering them as JSX children makes React
 * reconcile the same nodes the browser is mutating; the visible symptom was every
 * keystroke re-inserting the whole accumulated string.
 *
 * `paintedRef` is what separates a genuine outside change (the toolbar applying bold)
 * from the field's own echo (its text going to the store and coming back).
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
    const at = selectionOffsets(host);
    onSelectionChange(at && at.start !== at.end ? at : undefined);
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
      className={className}
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
