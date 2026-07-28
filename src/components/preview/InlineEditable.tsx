'use client';

import { useEffect, useRef, useState } from 'react';
import { parseRuns, serializeRuns } from '@/model/text';
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

interface Props {
  /** The whole bilingual value; only `side` is written. */
  value: BiText;
  side: 'en' | 'zh';
  onCommit: (next: BiText) => void;
  /** Rendered (non-editing) content, so formatting shows when idle. */
  children: React.ReactNode;
  placeholder?: string;
  className?: string;
  /** True when this element is the page's current selection. */
  selected?: boolean;
  onSelect?: () => void;
  onDeselect?: () => void;
}

export function InlineEditable({
  value,
  side,
  onCommit,
  children,
  placeholder,
  className = '',
  selected = false,
  onSelect,
  onDeselect,
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

  // Deleting is driven from the page's key handler, which needs this element to
  // hold focus — otherwise Delete would apply to whatever was focused before.
  useEffect(() => {
    if (selected && !editing) spanRef.current?.focus({ preventScroll: true });
  }, [selected, editing]);

  const beginEditing = () => {
    setDraft(source);
    setEditing(true);
  };

  const commit = (next: string) => {
    setEditing(false);
    onDeselect?.();
    if (next === source) return;
    onCommit({ ...value, [side]: parseRuns(next) });
  };

  if (editing) {
    return (
      <textarea
        ref={areaRef}
        value={draft}
        rows={1}
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
        onBlur={(event) => commit(event.target.value)}
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
