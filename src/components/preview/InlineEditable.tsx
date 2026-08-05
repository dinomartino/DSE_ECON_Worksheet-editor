'use client';

import { useEffect, useRef, useState } from 'react';
import { plain } from '@/model/text';
import type { BiText, RichText } from '@/model/types';
import { RichTextEditable } from './RichTextEditable';

/**
 * One directly-editable run of text on the page: the field takes the exact place of
 * the rendered span (no layout shift). Two levels of engagement — click selects (and
 * makes Delete safe), click again edits. One language at a time; patch, never
 * replace. The field renders the runs as themselves, never the marker string —
 * offsets are plain-text offsets, attributes read back losslessly, no second copy to
 * drift.
 */

/**
 * A live text selection inside one editable field, in **model** offsets.
 *
 * Reported so the format toolbar can act on the selected characters rather than on the
 * whole element (§ per-run formatting). The offsets index the plain text, which is also
 * what the editing surface counts in — so no translation stands between the two.
 */
export interface TextSelection {
  side: 'en' | 'zh';
  start: number;
  end: number;
}

interface Props {
  /** The whole bilingual value; only `side` is written. */
  value: BiText;
  side: 'en' | 'zh';
  onCommit: (next: BiText) => void;
  /**
   * Commit the current text but stay open and stay selected.
   *
   * Used before reporting a range to the toolbar: the toolbar formats the runs in the
   * store, so uncommitted typing has to reach the store first or the format lands on
   * the previous text and is then overwritten when the field closes.
   */
  onFlush?: (next: BiText) => void;
  /** Rendered (non-editing) content, so formatting shows when idle. */
  children: React.ReactNode;
  placeholder?: string;
  className?: string;
  /** True when this element is the page's current selection. */
  selected?: boolean;
  onSelect?: () => void;
  onDeselect?: () => void;
  /**
   * Reports the characters currently selected inside this field, or `undefined` when
   * the selection is empty or editing ended. The toolbar formats exactly this range.
   */
  onSelectionChange?: (selection: TextSelection | undefined) => void;
  /**
   * True while the toolbar is acting on this field's selection. Editing must not end
   * on blur then, because clicking a toolbar control blurs the field — committing
   * there would close the editor and discard the range the click meant to format.
   */
  keepEditing?: boolean;
  /**
   * Drop this field from the printed page entirely while it is empty.
   *
   * Stronger than `data-empty-placeholder`, which hides the prompt but *keeps the box*
   * so a stem does not reflow between preview and print. That is wrong for a field which
   * is only one part of a phrase: an empty side of "Full marks: 45 marks" would reserve
   * width in the middle of the line. Used for the empty prefix/suffix of a computed band
   * field, whose `+` is an invitation to add wording rather than wording itself.
   */
  printHidden?: boolean;
  /**
   * Handle Tab while editing — how a table walks from cell to cell.
   *
   * Word's behaviour, and the single biggest reason filling a 13-row table there feels
   * quick: type, Tab, type, Tab, without reaching for the mouse. The field commits first
   * and then hands over, so the text is in the store before focus leaves. Returning
   * `true` means the move was handled; `false` lets Tab do its normal thing, which is
   * what should happen at the end of a table rather than trapping focus in it.
   *
   * Only tables pass this. Everywhere else Tab stays the browser's own focus move.
   */
  onTab?: (backwards: boolean) => boolean;
  /**
   * While **empty**, stretch to the width of the container instead of shrinking to the
   * prompt.
   *
   * For a field whose prompt had to be shortened to fit its box — a table cell, whose
   * column is as narrow as "5 000" (§`compactPlaceholder`). The short prompt solved the
   * row height and created a second problem: a one-character `·` is a few pixels of hit
   * target, and the hover tint that signals "this is editable" was too small to notice,
   * so an empty cell read as blank paper rather than as a field.
   *
   * Filling the cell makes the *whole cell* the target and the whole cell light up on
   * hover, which is what a teacher is already aiming at. Deliberately width only: it
   * stays `inline-block` at one line's height, so the row measures exactly as it prints
   * — reserving height is the bug this whole path exists to avoid.
   *
   * Only while empty. A cell with text in it is an ordinary inline field, and stretching
   * it would put the hover box somewhere other than the words.
   */
  fillWidth?: boolean;
}

export function InlineEditable({
  value,
  side,
  onCommit,
  onFlush,
  children,
  placeholder,
  className = '',
  selected = false,
  onSelect,
  onDeselect,
  onSelectionChange,
  keepEditing = false,
  printHidden = false,
  fillWidth = false,
  onTab,
}: Props) {
  const [editing, setEditing] = useState(false);
  const spanRef = useRef<HTMLSpanElement>(null);

  const runs = (value[side] ?? []) as RichText;

  // Deleting is driven from the page's key handler, which needs this element to
  // hold focus — otherwise Delete would apply to whatever was focused before.
  useEffect(() => {
    if (selected && !editing) spanRef.current?.focus({ preventScroll: true });
  }, [selected, editing]);

  const beginEditing = () => setEditing(true);

  /** End editing and return the element to a neutral state. */
  const stopEditing = () => {
    setEditing(false);
    onSelectionChange?.(undefined);
    onDeselect?.();
  };

  if (editing) {
    return (
      <RichTextEditable
        value={runs}
        /*
         * Every edit commits immediately, rather than being held as a draft until close.
         *
         * That is what keeps the field and the store in step: the toolbar formats what
         * the *store* holds, so text typed but not yet committed would be formatted in
         * its previous shape and then overwritten on close. It routes through `onFlush`,
         * which keeps the page selection alive, so one editing session does not push an
         * undo entry per keystroke.
         */
        onChange={(next) => (onFlush ?? onCommit)({ ...value, [side]: next })}
        autoFocus
        lang={side === 'zh' ? 'zh-HK' : 'en'}
        ariaLabel={side === 'zh' ? 'Edit 中文 text' : 'Edit English text'}
        /*
         * A plain `inline` box, so the text keeps the *paragraph's* line boxes.
         *
         * This is what makes editing shift nothing. An `inline-block` establishes its
         * own formatting context: its inner lines cannot inherit the paragraph's hanging
         * indent, and `w-full` then pushed it out to the full column width — so clicking
         * into a numbered stem moved every line ~29px left, out of the gutter the `1.`
         * marker sits in, and moved them back on commit. The text visibly jumped on
         * entry and again on exit.
         *
         * `text-indent` is deliberately *not* reset here either. The paragraph's
         * `-24px` applies to its own first line, which is the line the marker shares;
         * cancelling it inside the field re-indented that line on its own.
         *
         * Literal colours, not theme tokens: this sits *on the paper*, which never
         * themes, so a token that flips in dark mode would paint a dark box on a white
         * page. The violet matches the app accent by value.
         */
        className={`m-0 rounded-sm bg-[#f0ecff] p-0 shadow-[0_0_0_2px_#7c5cff] outline-none ${className}`}
        // Offsets arrive already in the model's coordinate space, so the toolbar formats
        // exactly the characters that look selected — no marker string to discount.
        onSelectionChange={(range) =>
          onSelectionChange?.(range ? { side, ...range } : undefined)
        }
        /*
         * Blur normally commits — clicking away from a field is how editing ends.
         *
         * The exception is the format toolbar: clicking one of its controls blurs this
         * field, and ending here would drop the selection the click was meant to format,
         * so the bar could never act on a range. While `keepEditing` is set the field
         * stays open and keeps its selection.
         */
        onBlur={(event) => {
          if (keepEditing) return;
          /*
           * Focus moving *into the format toolbar* is not leaving the field.
           *
           * The bar cancels mousedown to keep focus on the page, but it deliberately
           * exempts form controls so the native `<select>` popup can open at all — so
           * clicking the font-size dropdown really does blur this field. Ending editing
           * there clears the selection, and the range the click was about is gone before
           * the change event fires. That is why choosing a size behaved differently from
           * clicking Bold, which never blurs.
           *
           * Tested on the *related target* rather than on a flag, because the blur
           * arrives before any state a click handler could set.
           */
          const next = event.relatedTarget as HTMLElement | null;
          if (next?.closest('[role="toolbar"]')) return;
          stopEditing();
        }}
        onKeyDown={(event) => {
          // Enter commits — a worksheet field is a line, not a document. Shift+Enter
          // falls through to the browser, which inserts the `<br>` that `readRuns` turns
          // back into the `\n` the model stores for a hard break.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            stopEditing();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            stopEditing();
          }
          /*
           * Tab walks to the next cell, in a table.
           *
           * The order matters: `stopEditing` first, so this field's text is committed and
           * the field is closed *before* the next one opens. Moving first would leave two
           * editors mounted, and the outgoing one's blur would then commit over whatever
           * the incoming one had already been given.
           *
           * `onTab` returning false means there is nowhere to go, and Tab falls through
           * to the browser rather than trapping focus inside the table.
           */
          if (event.key === 'Tab' && onTab) {
            stopEditing();
            if (onTab(event.shiftKey)) event.preventDefault();
          }
          // Let the page's own shortcuts through rather than swallowing them, but
          // never let Delete/Backspace reach the page handler while typing.
          event.stopPropagation();
        }}
      />
    );
  }

  const isEmpty = plain(runs).trim().length === 0;

  return (
    <span
      ref={spanRef}
      role="textbox"
      tabIndex={0}
      aria-label={side === 'zh' ? 'Edit 中文 text' : 'Edit English text'}
      data-selected={selected ? 'true' : undefined}
      // Marks the prompt shown in place of an empty field. It is authoring guidance,
      // not content, so the print stylesheet hides it — otherwise "Double-click to add
      // English" would appear on the printed worksheet as if it were the question.
      data-empty-placeholder={isEmpty ? 'true' : undefined}
      // Chrome, not content: removed from the printed sheet rather than merely made
      // invisible, so it reserves no width inside the phrase it sits in.
      data-print-hide={printHidden && isEmpty ? 'true' : undefined}
      className={`cursor-text rounded-sm transition-colors duration-150 focus:outline-none ${
        selected
          ? 'bg-[#e7e0ff] shadow-[0_0_0_2px_#7c5cff]'
          : 'hover:bg-[#f0ecff] hover:shadow-[0_1px_0_0_#b9a6ff]'
      } ${
        isEmpty
          ? 'italic text-[#9a8ad6] underline decoration-[#c4b5fd] decoration-dashed underline-offset-4'
          : ''
      } ${
        /*
         * An empty cell claims its whole column, so the target is what the teacher is
         * already aiming at (§`fillWidth`). `inline-block` + `w-full` takes width only —
         * the box stays one line tall, which is what keeps the row measuring as it
         * prints. `text-left` because the cell's own `text-align` may be `right` for a
         * figure column, and a prompt hugging the right edge reads as content.
         *
         * Full width is also what turns the empty style's dashed underline into the
         * affordance: ruled across the cell it reads as a form field waiting to be
         * filled, where under a one-character prompt it was a few invisible pixels. A
         * faint tint carries it the rest of the way — hover alone cannot advertise a
         * field you have not yet thought to point at.
         */
        fillWidth && isEmpty ? 'inline-block w-full text-left bg-[#faf8ff]' : ''
      } ${className}`}
      onClick={(event) => {
        // Selecting the question is the parent's job; selection/editing is ours.
        event.stopPropagation();
        // First click selects, second begins editing — so Delete has an unambiguous
        // target, and a stray click never opens a field over the text.
        if (selected) beginEditing();
        else onSelect?.();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        beginEditing();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          beginEditing();
        }
        // Delete/Backspace deliberately bubble to the page handler, which owns
        // removal so that it can pick the right unit for the target.
      }}
    >
      {isEmpty ? (placeholder ?? 'Double-click to add text') : children}
    </span>
  );
}
