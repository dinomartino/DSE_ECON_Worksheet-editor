'use client';

import { useEffect, useRef, useState } from 'react';
import type { TextAlign, TextFormat } from '@/model/types';

/**
 * Contextual formatting toolbar, docked along the top of the page column (floating
 * covered the lines above the selection). `fixed` in viewport coordinates, clear of
 * the preview's `scale()`. A label names the element being formatted; every button
 * reports current state, and toggling an active one clears back to the named style.
 */

const SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40];

const COLORS: Array<{ value: string | undefined; label: string; swatch: string }> = [
  { value: undefined, label: 'Default colour', swatch: '#0f172a' },
  { value: 'C00000', label: 'Red', swatch: '#c00000' },
  { value: '1F4E79', label: 'Blue', swatch: '#1f4e79' },
  { value: '2E7D32', label: 'Green', swatch: '#2e7d32' },
  { value: '6A1B9A', label: 'Purple', swatch: '#6a1b9a' },
  { value: '777777', label: 'Grey', swatch: '#777777' },
];

const ALIGNMENTS: Array<{ value: TextAlign; label: string; glyph: string }> = [
  { value: 'left', label: 'Align left', glyph: '⇤' },
  { value: 'center', label: 'Align centre', glyph: '↔' },
  { value: 'right', label: 'Align right', glyph: '⇥' },
  { value: 'justify', label: 'Justify', glyph: '≡' },
];

interface Props {
  /**
   * Where to dock, in viewport coordinates: `left`/`width` span the page, `top` is the
   * top of the scrolling column.
   *
   * The page rather than the selection: the bar spans the area the document occupies,
   * so it has one resting place instead of jumping to wherever the last click landed.
   * Re-measured on scroll and resize by the host.
   */
  dock: { left: number; width: number; top: number };
  /** What is selected, e.g. "Heading" — the bar is no longer next to its subject. */
  subject?: string;
  /**
   * The size in points the selection renders at with no override — the named style's
   * default, measured off the page. Lets the size control show the real current value
   * instead of an empty placeholder.
   */
  inheritedPt?: number;
  format: TextFormat | undefined;
  onChange: (patch: TextFormat) => void;
  /**
   * Raise or lower the selected characters — "S₁", "P₁+t", the naming convention of
   * every DSE diagram and half its prose.
   *
   * A separate channel from `onChange` because `vertAlign` is **run-only** and must stay
   * that way: `TextFormat` is what an *element* overrides, and a paragraph set entirely
   * in subscript is not a thing anyone wants. Passing it through the element patch would
   * make that the easiest mistake to make.
   *
   * Absent when the selection is not a character range — the bar then hides the control
   * rather than offering one that would have nothing to act on.
   */
  onVertAlign?: (value: 'superscript' | 'subscript' | undefined) => void;
  /** The vertical alignment the selected characters already carry, if uniform. */
  vertAlign?: 'superscript' | 'subscript';
  /**
   * Insert a fill-in blank at the caret, replacing any selected characters.
   *
   * A text edit rather than a format, so it travels on its own channel like
   * `onVertAlign` — and absent for the same reason: with no character caret there is
   * nowhere to put it, and the bar hides the control rather than offering a dead one.
   */
  onInsertBlank?: () => void;
  onReset: () => void;
  /** Dismiss the bar, clearing the page selection. */
  onClose?: () => void;
  /** Structural actions offered alongside formatting. */
  onDelete?: () => void;
  onMove?: (direction: -1 | 1) => void;
  onDuplicate?: () => void;
}

const BTN =
  'flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs font-medium transition-colors ' +
  'hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]';
const ACTIVE = 'bg-[#7c5cff] text-white hover:bg-[#8f75ff]';
const IDLE = 'text-slate-200';

export function FormatToolbar({
  dock,
  subject,
  inheritedPt,
  format,
  onChange,
  onVertAlign,
  vertAlign,
  onInsertBlank,
  onReset,
  onClose,
  onDelete,
  onMove,
  onDuplicate,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [colorOpen, setColorOpen] = useState(false);

  useEffect(() => {
    if (!colorOpen) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setColorOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [colorOpen]);

  const toggle = (key: 'bold' | 'italic' | 'underline') =>
    onChange({ [key]: format?.[key] ? undefined : true });

  const hasOverrides = Boolean(format && Object.keys(format).length > 0);

  // The offered steps with the current inherited size folded in, in order.
  const sizeOptions =
    inheritedPt !== undefined && !SIZES.includes(inheritedPt)
      ? [...SIZES, inheritedPt].sort((a, b) => a - b)
      : SIZES;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Format selected element"
      // Docked across the top of the page column. `flex-wrap` matters: the column is
      // narrow at small window widths, and a single non-wrapping row would push the
      // delete button out of reach rather than folding onto a second line.
      className="fixed z-50 flex flex-wrap items-center gap-0.5 rounded-xl border border-slate-700 bg-slate-900/95 px-1.5 py-1 shadow-xl backdrop-blur"
      style={{ left: dock.left, width: dock.width, top: dock.top }}
      /*
       * Keep focus on the page so the bar never steals the selection it is acting on —
       * but *not* by cancelling mousedown outright.
       *
       * A blanket `preventDefault()` here also suppressed the one gesture that opens a
       * native `<select>` popup, so the font-size dropdown could not be opened by
       * clicking it at all. It was reachable programmatically, which is why a test that
       * called `selectOption` passed while the control was dead in the hand.
       *
       * Form controls therefore keep their default behaviour and manage their own
       * focus; everything else (the bar's padding, its dividers, its label) still
       * refuses focus, which is all that was ever needed.
       */
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("select, input, option")) return;
        event.preventDefault();
      }}
    >
      {subject && (
        // Names the target, since the bar no longer sits beside it. `mr-auto` pushes
        // every control to the right edge, keeping them in one place as the label's
        // width changes with the selection.
        <span className="mr-1 max-w-[30%] truncate pl-1 text-[11px] font-medium text-slate-400">
          {subject}
        </span>
      )}
      {/* Font size.

          It reports the size the paragraph is *actually* rendering at, not a blank
          placeholder: with no override the value shown is the named style's own
          default, measured from the element on the page. Previously the control read
          "Size" forever, which said nothing about the current state and made the whole
          bar look inert — every other control here reports what it is showing.

          `Default` is offered as a distinct choice rather than as the resting label, so
          clearing an override back to the style is something the teacher can actually
          ask for. */}
      <select
        aria-label="Font size"
        title="Font size"
        className="h-7 cursor-pointer rounded bg-slate-800 px-1 text-xs text-slate-100 outline-none hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-[#a78bfa]"
        value={format?.fontSize ?? inheritedPt ?? ''}
        onChange={(event) =>
          onChange({ fontSize: event.target.value ? Number(event.target.value) : undefined })
        }
      >
        <option value="">
          {format?.fontSize === undefined && inheritedPt === undefined ? 'Size' : 'Default'}
        </option>
        {/* The steps, plus the inherited size merged in when it is not already one of
            them — a style at 15pt has to be selectable to be *displayed* as selected,
            and inserting it in order keeps the list scannable rather than leading with
            an odd value. */}
        {sizeOptions.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>

      <span className="mx-0.5 h-5 w-px bg-slate-700" aria-hidden />

      <button
        type="button"
        aria-label="Bold"
        aria-pressed={Boolean(format?.bold)}
        title="Bold"
        className={`${BTN} ${format?.bold ? ACTIVE : IDLE} font-bold`}
        onClick={() => toggle('bold')}
      >
        B
      </button>
      <button
        type="button"
        aria-label="Italic"
        aria-pressed={Boolean(format?.italic)}
        title="Italic"
        className={`${BTN} ${format?.italic ? ACTIVE : IDLE} italic`}
        onClick={() => toggle('italic')}
      >
        I
      </button>
      <button
        type="button"
        aria-label="Underline"
        aria-pressed={Boolean(format?.underline)}
        title="Underline"
        className={`${BTN} ${format?.underline ? ACTIVE : IDLE} underline`}
        onClick={() => toggle('underline')}
      >
        U
      </button>

      {/* Subscript and superscript, offered only for a character selection — "S₁" and
          "P₁+t" are the naming convention of the whole subject, and typing the storage
          marker `_{1}` is not something anyone should have to know. Toggling the active
          one clears it, like every other control here. */}
      {onVertAlign && (
        <>
          <button
            type="button"
            aria-label="Subscript"
            aria-pressed={vertAlign === 'subscript'}
            title="Subscript — S₁"
            className={`${BTN} ${vertAlign === 'subscript' ? ACTIVE : IDLE}`}
            onClick={() => onVertAlign(vertAlign === 'subscript' ? undefined : 'subscript')}
          >
            <span aria-hidden>
              X<sub className="text-[9px]">2</sub>
            </span>
          </button>
          <button
            type="button"
            aria-label="Superscript"
            aria-pressed={vertAlign === 'superscript'}
            title="Superscript — m²"
            className={`${BTN} ${vertAlign === 'superscript' ? ACTIVE : IDLE}`}
            onClick={() => onVertAlign(vertAlign === 'superscript' ? undefined : 'superscript')}
          >
            <span aria-hidden>
              X<sup className="text-[9px]">2</sup>
            </span>
          </button>
        </>
      )}

      {/* A fill-in blank. Its own action rather than a format, because it inserts
          characters: the paper runs "…is an example of using ______ to solve…" through a
          third of its questions, and the alternative is holding the space bar and
          underlining the result by hand. */}
      {onInsertBlank && (
        <button
          type="button"
          aria-label="Insert blank"
          title="Insert a fill-in blank"
          className={`${BTN} ${IDLE}`}
          onClick={onInsertBlank}
        >
          <span aria-hidden className="underline">&nbsp;&nbsp;&nbsp;</span>
        </button>
      )}

      <span className="mx-0.5 h-5 w-px bg-slate-700" aria-hidden />

      {ALIGNMENTS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          aria-pressed={format?.align === option.value}
          title={option.label}
          className={`${BTN} ${format?.align === option.value ? ACTIVE : IDLE}`}
          onClick={() =>
            onChange({ align: format?.align === option.value ? undefined : option.value })
          }
        >
          {option.glyph}
        </button>
      ))}

      <span className="mx-0.5 h-5 w-px bg-slate-700" aria-hidden />

      <div className="relative">
        <button
          type="button"
          aria-label="Text colour"
          aria-expanded={colorOpen}
          title="Text colour"
          className={`${BTN} ${IDLE}`}
          onClick={() => setColorOpen((open) => !open)}
        >
          <span
            className="h-3.5 w-3.5 rounded-sm border border-slate-500"
            style={{ background: format?.color ? `#${format.color}` : '#e2e8f0' }}
          />
        </button>
        {colorOpen && (
          <div className="absolute left-0 top-8 flex gap-1 rounded-md border border-slate-700 bg-slate-900 p-1.5 shadow-xl">
            {COLORS.map((option) => (
              <button
                key={option.label}
                type="button"
                aria-label={option.label}
                title={option.label}
                className="h-5 w-5 rounded-sm border border-slate-600 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]"
                style={{ background: option.swatch }}
                onClick={() => {
                  onChange({ color: option.value });
                  setColorOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {(onMove || onDuplicate || onDelete) && (
        <span className="mx-0.5 h-5 w-px bg-slate-700" aria-hidden />
      )}

      {onMove && (
        <>
          <button
            type="button"
            aria-label="Move up"
            title="Move up"
            className={`${BTN} ${IDLE}`}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move down"
            title="Move down"
            className={`${BTN} ${IDLE}`}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
        </>
      )}
      {onDuplicate && (
        <button
          type="button"
          aria-label="Duplicate"
          title="Duplicate"
          className={`${BTN} ${IDLE}`}
          onClick={onDuplicate}
        >
          ⧉
        </button>
      )}

      {hasOverrides && (
        <button
          type="button"
          aria-label="Clear formatting"
          title="Clear formatting"
          className={`${BTN} ${IDLE}`}
          onClick={onReset}
        >
          ⌫
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          aria-label="Delete element"
          title="Delete element"
          className={`${BTN} text-slate-300 hover:bg-red-600 hover:text-white`}
          onClick={onDelete}
        >
          🗑
        </button>
      )}

      {onClose && (
        // Its own dismiss, because a docked bar no longer disappears just by looking
        // away from the selection — and with delete now a bin glyph, an ✕ here cannot
        // be mistaken for "delete this element".
        <button
          type="button"
          aria-label="Done formatting"
          title="Done"
          className={`${BTN} ml-auto ${IDLE}`}
          onClick={onClose}
        >
          ✕
        </button>
      )}
    </div>
  );
}
