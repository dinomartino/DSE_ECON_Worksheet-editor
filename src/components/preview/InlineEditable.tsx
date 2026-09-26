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

  /*
   * Where the selection rectangle's left edge sits, in px from the paragraph's
   * padding edge.
   *
   * The box is `absolute inset-0` inside the paragraph, and `inset-0` resolves to the
   * *padding* box — but a numbered paragraph carries the list indent as `paddingLeft`
   * and hangs its `4.` marker back inside that gutter. So a box at `left: 0` starts
   * under the number rather than at the text, and its left edge lines up with nothing.
   *
   * The text's own start is the paragraph's `paddingLeft` (§ a numbered paragraph
   * indents as a block: the preview expresses `w:ind` as padding, never `text-indent`,
   * so every line including the first begins there). Measured from the live element
   * rather than recomputed from `listIndent`, which lives in `Preview.tsx` and is not
   * this component's to know — one stale copy of that geometry is exactly the bug the
   * indent constants warn about.
   */
  const boxRef = useRef<HTMLSpanElement>(null);
  const [boxLeft, setBoxLeft] = useState(0);
  useEffect(() => {
    // The box itself is the probe: it is the one node present in *both* engaged
    // branches (`spanRef` belongs to the idle span and is null while editing).
    const box = boxRef.current;
    const paragraph = box?.closest('p');
    if (paragraph) {
      const pad = parseFloat(getComputedStyle(paragraph).paddingLeft);
      setBoxLeft(Number.isFinite(pad) ? pad : 0);
    }
    /*
     * The box's positioned anchor becomes its own stacking context while the box
     * exists, so the box can sit at `z-index: -1` — *below the caret*.
     *
     * The caret is not painted by the editable span: Chromium paints it in the layer
     * of the caret's containing **block** (the paragraph), and a positioned sibling at
     * `z-index: 0` covers that layer — so the open editor had focus, a collapsed
     * selection and the right `caret-color`, and still showed no blinking caret
     * (`z-10` rescues only the text, which is the span's own). At `-1` without
     * isolation the box instead fell behind the sheet's opaque background; isolating
     * the anchor confines it between the two, above the paper, below everything in
     * the paragraph — caret included.
     *
     * `offsetParent` rather than `closest('p')` because `inset-0` resolves against
     * the nearest *positioned* ancestor, and a band field's is not a paragraph.
     * Imperative, like the padding probe above: the anchor is rendered elsewhere and
     * is not this component's to restyle in JSX.
     */
    const anchor = box?.offsetParent instanceof HTMLElement ? box.offsetParent : null;
    if (!anchor) return;
    const previous = anchor.style.isolation;
    anchor.style.isolation = 'isolate';
    return () => {
      anchor.style.isolation = previous;
    };
  }, [selected, editing]);

  // Deleting is driven from the page's key handler, which needs this element to
  // hold focus — otherwise Delete would apply to whatever was focused before.
  useEffect(() => {
    if (selected && !editing) spanRef.current?.focus({ preventScroll: true });
  }, [selected, editing]);

  /*
   * Where the click that opened the editor landed, so the caret starts between the
   * characters it was aimed at rather than at the end of the text (§ `caretPoint`).
   * Undefined for the keyboard route, which has no point to honour.
   */
  const caretPointRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const beginEditing = (point?: { x: number; y: number }) => {
    caretPointRef.current = point;
    setEditing(true);
  };

  /** End editing and return the element to a neutral state. */
  const stopEditing = () => {
    setEditing(false);
    onSelectionChange?.(undefined);
    onDeselect?.();
  };

  if (editing) {
    return (
      <>
        {/*
          The open editor gets the same single rectangle the selected state does, and
          for the same reason: the editable is `inline` (it must be — see below), so its
          own background and ring are painted per line box and a wrapped paragraph
          fragments into one ragged box per line. Drawing the box as a positioned
          sibling of the editable keeps the shape steady across both states — the
          rectangle a teacher clicked is the rectangle they type inside.

          It is a *sibling*, never a child: the editable is an uncontrolled
          contenteditable, and injecting a node inside it would put React in charge of
          nodes the browser mutates (§ the editing surface renders runs, not markers).
        */}
        {!fillWidth && (
          <span
            ref={boxRef}
            aria-hidden
            data-print-hide="true"
            className="pointer-events-none absolute inset-0 rounded-[3px] bg-[#eef6fc] shadow-[0_0_0_2px_#0d77c9]"
            // Below the caret, which the paragraph paints, not the span (§ `boxLeft`
            // effect — the anchor is isolated so `-1` cannot fall behind the sheet).
            style={{ left: boxLeft, zIndex: -1 }}
          />
        )}
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
        // The caret opens where the click landed, which is what the I-beam promised.
        caretPoint={caretPointRef.current}
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
         * page. The blue matches the app accent by value.
         *
         * The tint and ring live on the rectangle above, not here — painted on this
         * inline box they slice into one box per wrapped line. `relative z-10` lifts
         * the text above that rectangle (a positioned sibling otherwise covers
         * non-positioned in-flow text); a table cell keeps the inline paint, its box
         * being a single line already.
         */
        /*
         * `caret-color` and `::selection` are stated, not left to the browser.
         *
         * They are the "you are in this text, here" signal a word processor gives, and
         * the defaults do not carry it here: the caret is drawn in the text colour at
         * whatever contrast it happens to have against the field's blue tint, and the
         * default selection highlight is a blue close enough to that tint to be hard to
         * read. The accent for the caret (it must be findable in a wrapped paragraph),
         * and a deeper, opaque wash for the range so selected words stay legible.
         *
         * Literal colours for the reason the box's are literal: this is *on the paper*,
         * which never themes.
         */
        /*
         * A cell's open editor takes the cell's width, matching the locked state it
         * grew out of, so entering the field shifts nothing. The `inline-block` warning
         * above is the *paragraph* path's: an own formatting context breaks a numbered
         * stem's hanging indent, and a cell has none. Width only — reserving height
         * would make the row measure taller than it prints.
         */
        className={`m-0 cursor-text rounded-sm p-0 caret-[#0d77c9] outline-none selection:bg-[#9fcdee] selection:text-[#101010] ${
          fillWidth
            ? 'inline-block w-full bg-[#eef6fc] shadow-[0_0_0_2px_#0d77c9]'
            : 'relative z-10'
        } ${className}`}
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
      </>
    );
  }

  const isEmpty = plain(runs).trim().length === 0;

  return (
    <>
      {/*
        The selected field's box is drawn as one rectangle, not as the span's own
        background.

        The span must stay `inline` (an `inline-block` loses the paragraph's hanging
        indent — see the editing branch above), and CSS paints an inline box's
        background and ring *per line box*. A wrapped stem therefore drew one ragged,
        separately-closed box per line: three stacked rectangles where the teacher had
        selected one field. `box-decoration-break: clone` only tidies the fragments —
        it still draws N boxes.

        So the rectangle is a sibling absolutely positioned in the paragraph (which is
        `relative` for the list marker and the marks trail). `inset-0` makes it span the
        full text column and the paragraph's whole height — first line's top to last
        line's bottom — which is the one shape that reads as "this component is
        selected" regardless of where the last line happens to end.

        It reserves no space and takes no pointer events, so it cannot shift the page
        or intercept the click that opens the editor. `data-print-hide` because a
        selection ring is chrome; the print rules strip it like every other affordance.
      */}
      {selected && !fillWidth && (
        <span
          ref={boxRef}
          aria-hidden
          data-print-hide="true"
          className="pointer-events-none absolute inset-0 animate-fade-in rounded-[3px] bg-[#d9ebf8] shadow-[0_0_0_2px_#0d77c9]"
          style={{
            /* Aligned to where the text starts, not the padding edge (§ `boxLeft`). */
            left: boxLeft,
            /*
             * `-1`, under an anchor made `isolation: isolate` by the `boxLeft` effect.
             * Below everything the paragraph paints — the text, and in the editing
             * branch the caret, which belongs to the paragraph's layer and which a
             * `z-index: 0` box was observed to cover. The isolation is what keeps
             * `-1` from dropping behind the sheet's own opaque background, which is
             * where an un-isolated `-1` box was observed to disappear.
             */
            zIndex: -1,
          }}
        />
      )}
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
      /*
       * The cursor states what the next click does. Unselected, that is "engage this
       * field" — a pointer. **Once locked it is the I-beam**: the next click opens the
       * editor and lands the caret where it was aimed, so the field really is about to
       * take a text cursor, and saying so is what tells a teacher they may now click
       * between the letters rather than merely at the box.
       *
       * `relative z-10` lifts the words above the selection rectangle, which is a
       * positioned sibling and would otherwise paint over them. Positioning only — the
       * box stays `inline`, so the paragraph's hanging indent still applies.
       */
      className={`relative z-10 rounded-sm transition-[color,background-color,box-shadow] duration-150 ease-out-soft focus:outline-none ${
        selected ? 'cursor-text' : 'cursor-pointer'
      } ${
        /*
         * Selected paints nothing here — the rectangle above owns that (an inline box
         * would slice it into one ragged box per wrapped line). A table cell keeps the
         * inline paint: `fillWidth` makes it `inline-block`, so its box is already the
         * single rectangle the cell wants.
         */
        selected
          ? fillWidth
            ? 'bg-[#d9ebf8] shadow-[0_0_0_2px_#0d77c9]'
            : ''
          : 'hover:bg-[#eef6fc] hover:shadow-[0_1px_0_0_#8fc2e9]'
      } ${
        isEmpty
          ? 'text-[#8fc2e9] underline decoration-[#8fc2e9] decoration-dashed underline-offset-4'
          : ''
      } ${
        /*
         * A cell's field claims its whole column, so the target is what the teacher is
         * already aiming at (§`fillWidth`). `inline-block` + `w-full` takes width only —
         * no height is reserved, which is what keeps the row measuring as it prints.
         *
         * Empty, full width is what turns the dashed underline into the affordance:
         * ruled across the cell it reads as a form field waiting to be filled, where
         * under a one-character prompt it was a few invisible pixels.
         *
         * Selected, the same width makes the state read as *the cell* — the unit the
         * sidebar names and that align and merge act on. Hugging the words drew a box
         * floating inside a much larger cell (92px of highlight in a 190px cell),
         * which reads as a selected phrase and leaves most of what was clicked
         * unpainted.
         *
         * **`text-left` belongs to the empty prompt alone**: a `·` hugging a figure
         * column's right edge reads as content, but a cell that has text keeps the
         * alignment it prints with. Ranging the selected state left too made a centred
         * cell jump left on the first click and back on the second, when the editing
         * branch (which never carried the class) took over.
         */
        fillWidth && (isEmpty || selected)
          ? `inline-block w-full${isEmpty ? ' text-left' : ''}`
          : ''
      } ${
        /* The empty field's own resting tint — a selected cell paints its own. */
        fillWidth && isEmpty && !selected ? 'bg-[#f7faff]' : ''
      } ${className}`}
      onClick={(event) => {
        // Selecting the question is the parent's job; selection/editing is ours.
        event.stopPropagation();
        // First click selects, second begins editing — so Delete has an unambiguous
        // target, and a stray click never opens a field over the text.
        if (selected) beginEditing({ x: event.clientX, y: event.clientY });
        else onSelect?.();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        beginEditing({ x: event.clientX, y: event.clientY });
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
    </>
  );
}
