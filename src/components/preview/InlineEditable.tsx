'use client';

import { useEffect, useRef, useState } from 'react';
import { parseRuns, plain, serializeRuns, sourceOffsetToText } from '@/model/text';
import type { BiText, RichText } from '@/model/types';

/**
 * One directly-editable run of text on the page.
 *
 * Editing happens where the text is: click it and a textarea takes the exact place
 * of the rendered span, inheriting font, size, weight and alignment so the line does
 * not reflow when it becomes editable. That "no layout shift" property is what makes
 * this feel like editing the document rather than opening a form on top of it.
 *
 * Two levels of engagement, which is what makes keyboard delete safe:
 *  - **click once** selects the element (outlined), and Delete/Backspace removes it;
 *  - **click again**, or press Enter, starts editing the text.
 *
 * One language at a time. In bilingual mode the English and Chinese halves are
 * rendered as two of these, so clicking the Chinese line edits `zh` and leaves `en`
 * untouched — the same patch-don't-replace rule the sidebar follows (§5.2).
 *
 * The source string carries the inline markers the model uses (`**bold**` etc.), so
 * formatting survives a round-trip through the page exactly as it does through the
 * sidebar textareas.
 */

/**
 * A live text selection inside one editable field, in **model** offsets.
 *
 * Reported so the format toolbar can act on the selected characters rather than on the
 * whole element (§ per-run formatting). The offsets are into the plain text, already
 * translated out of the textarea's marker-string coordinates.
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
   * on blur then, because clicking a toolbar control blurs the textarea — committing
   * there would close the editor and discard the range the click meant to format.
   */
  keepEditing?: boolean;
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
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);

  const source = serializeRuns(value[side] as RichText);

  // Size the textarea to its content so a long stem does not scroll inside a
  // one-line box while being edited.
  useEffect(() => {
    const element = areaRef.current;
    if (!editing || !element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [editing, draft]);

  useEffect(() => {
    if (!editing) return;
    const element = areaRef.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [editing]);

  /*
   * Keep the draft in step when formatting rewrites the value underneath an open editor.
   *
   * Size and colour are invisible to `serializeRuns`, but **bold, italic and underline
   * are not** — applying them to a range adds `**…**` to the serialized form while the
   * textarea still holds the string it was opened with. Left alone, closing the field
   * would commit that stale string and undo the emphasis.
   *
   * Guarded on the *plain text* so it only ever re-syncs markup, never fights the caret:
   * while the user is typing, the characters differ and this leaves the draft alone.
   */
  const [syncedSource, setSyncedSource] = useState(source);
  if (editing && source !== syncedSource) {
    // Adjusting state during render — React's supported alternative to an effect for
    // "derive from a prop change". It re-renders this component immediately, before
    // anything can commit the stale draft, and starts no effect cascade.
    setSyncedSource(source);
    if (draft !== source && plain(parseRuns(draft)) === plain(value[side])) {
      setDraft(source);
    }
  }

  // Deleting is driven from the page's key handler, which needs this element to
  // hold focus — otherwise Delete would apply to whatever was focused before.
  useEffect(() => {
    if (selected && !editing) spanRef.current?.focus({ preventScroll: true });
  }, [selected, editing]);

  const beginEditing = () => {
    setDraft(source);
    setEditing(true);
  };

  /*
   * Commit the typed text.
   *
   * The equality check is load-bearing beyond skipping a redundant undo entry.
   * `serializeRuns` spells only bold/italic/underline/sup/sub — a run's **size, colour
   * and font live on the run, not in the marker string** — so `parseRuns(next)` rebuilds
   * runs that have lost them. Re-parsing an unchanged string would therefore silently
   * erase every per-run format the toolbar had just applied, which is exactly what
   * happened when a field was formatted and then closed: the page showed the emphasis
   * until the click that ended editing, and then dropped it.
   *
   * So an untouched string commits nothing, and a genuinely edited one re-parses and
   * accepts the loss of per-run attributes — the text those attributes described no
   * longer exists in the same shape, and reconciling offsets across an arbitrary edit is
   * not something a marker string can express.
   */
  const commit = (next: string) => {
    setEditing(false);
    onSelectionChange?.(undefined);
    onDeselect?.();
    if (next === source) return;
    onCommit({ ...value, [side]: parseRuns(next) });
  };

  /*
   * Publish the caret/selection in model offsets.
   *
   * The textarea holds the serialized marker string, so its own offsets count `**` and
   * `^{}` characters the model has no idea about. `sourceOffsetToText` discounts them,
   * which is what makes "format the selected words" land on the right characters rather
   * than a few to the left of them.
   *
   * An empty selection publishes `undefined`: a caret is not a range, and a toolbar
   * click with only a caret must be a no-op rather than reformatting the element.
   */
  const publishSelection = (element: HTMLTextAreaElement) => {
    if (!onSelectionChange) return;
    const { selectionStart, selectionEnd } = element;
    if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd) {
      onSelectionChange(undefined);
      return;
    }
    const text = element.value;

    /*
     * Flush genuinely-unsaved **typing** before reporting a range to format.
     *
     * The toolbar formats the runs held in the *store*, while the textarea holds an
     * uncommitted draft. Selecting inside text that was typed but never committed would
     * format the previous runs, and the draft would then overwrite the result on close.
     *
     * The comparison is on the **plain text**, not the marker string, and that is the
     * load-bearing part. Applying bold to a range rewrites the stored runs, so
     * `serializeRuns` starts emitting `**price ceiling**` while the textarea still shows
     * the unmarked string it was opened with. Comparing marker strings therefore read
     * that as "the user typed something", flushed `parseRuns(text)` over the freshly
     * formatted runs, and destroyed them — the bolded words vanished from the page
     * entirely. Only a change in the *characters* means unsaved typing.
     */
    if (plain(parseRuns(text)) !== plain(value[side])) {
      onFlush?.({ ...value, [side]: parseRuns(text) });
    }

    onSelectionChange({
      side,
      start: sourceOffsetToText(text, Math.min(selectionStart, selectionEnd)),
      end: sourceOffsetToText(text, Math.max(selectionStart, selectionEnd)),
    });
  };

  if (editing) {
    return (
      <textarea
        ref={areaRef}
        value={draft}
        rows={1}
        onSelect={(event) => publishSelection(event.currentTarget)}
        onKeyUp={(event) => publishSelection(event.currentTarget)}
        onMouseUp={(event) => publishSelection(event.currentTarget)}
        lang={side === 'zh' ? 'zh-HK' : 'en'}
        aria-label={side === 'zh' ? 'Edit 中文 text' : 'Edit English text'}
        // `inline-block` + an auto-grown height keeps the field in the text's own
        // flow, so the list marker stays on its line and nothing below shifts. A
        // block-level field would claim the full paragraph width and push the
        // marker onto a line of its own.
        // Literal colours, not theme tokens: this field sits *on the paper*, which
        // never themes, so a token that flips in dark mode would paint a dark box on
        // a white page. The violet matches the app accent by value.
        className={`m-0 inline-block w-full max-w-full resize-none overflow-hidden rounded-sm border-0 bg-[#f0ecff] p-0 align-top font-[inherit] text-[length:inherit] leading-[inherit] text-inherit shadow-[0_0_0_2px_#7c5cff] outline-none ${className}`}
        style={{ textIndent: 0 }}
        onChange={(event) => setDraft(event.target.value)}
        /*
         * Blur normally commits — clicking away from a field is how editing ends.
         *
         * The exception is the format toolbar: clicking one of its controls blurs this
         * textarea, and committing there would close the editor and drop the selection
         * the click was meant to format, so the bar could never act on a range. While
         * `keepEditing` is set the field stays open and keeps its selection; the toolbar
         * restores focus after applying, so the teacher can format several ranges in a
         * row without re-entering the field.
         */
        onBlur={(event) => {
          if (keepEditing) return;
          /*
           * Focus moving *into the format toolbar* is not leaving the field.
           *
           * The bar cancels mousedown to keep focus on the page, but it deliberately
           * exempts form controls so the native `<select>` popup can open at all — so
           * clicking the font-size dropdown really does blur this textarea. Committing
           * there ends editing and clears the selection, and the range the click was
           * about is gone before the change event fires. That is why choosing a size
           * behaved differently from clicking Bold, which never blurs.
           *
           * Tested on the *related target* rather than on a flag, because the blur
           * arrives before any state a click handler could set.
           */
          const next = event.relatedTarget as HTMLElement | null;
          if (next?.closest('[role="toolbar"]')) return;
          commit(event.target.value);
        }}
        onKeyDown={(event) => {
          // Enter commits — a worksheet field is a line, not a document. Shift+Enter
          // still inserts a newline for the rare multi-line stem.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            commit(draft);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setEditing(false);
            // Also drop the selection, so the element returns to a neutral state.
            // Leaving it selected would make the next click read as a *second*
            // click and reopen the editor instead of re-arming Delete.
            onDeselect?.();
          }
          // Let the page's own shortcuts through rather than swallowing them, but
          // never let Delete/Backspace reach the page handler while typing.
          event.stopPropagation();
        }}
      />
    );
  }

  const isEmpty = source.trim().length === 0;

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
      className={`cursor-text rounded-sm transition-colors duration-150 focus:outline-none ${
        selected
          ? 'bg-[#e7e0ff] shadow-[0_0_0_2px_#7c5cff]'
          : 'hover:bg-[#f0ecff] hover:shadow-[0_1px_0_0_#b9a6ff]'
      } ${
        isEmpty
          ? 'italic text-[#9a8ad6] underline decoration-[#c4b5fd] decoration-dashed underline-offset-4'
          : ''
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
