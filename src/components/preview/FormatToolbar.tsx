'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { TextAlign, TextFormat } from '@/model/types';
import { useMessages } from '@/i18n/language';
import type { TextKey } from '@/i18n/catalogue';
import { FORMAT_TOOLBAR_MESSAGES } from './messages';

/**
 * Contextual formatting toolbar, docked along the top of the page column (floating
 * covered the lines above the selection). `fixed` in viewport coordinates, clear of
 * the preview's `scale()`. A label names the element being formatted; every button
 * reports current state, and toggling an active one clears back to the named style.
 */

const SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40];

const COLORS: Array<{ value: string | undefined; label: TextKey<typeof FORMAT_TOOLBAR_MESSAGES>; swatch: string }> = [
  { value: undefined, label: 'colourDefault', swatch: '#0f172a' }, // i18n-ignore: catalogue key
  { value: 'C00000', label: 'red', swatch: '#c00000' }, // i18n-ignore: catalogue key
  { value: '1F4E79', label: 'blue', swatch: '#1f4e79' }, // i18n-ignore: catalogue key
  { value: '2E7D32', label: 'green', swatch: '#2e7d32' }, // i18n-ignore: catalogue key
  { value: '6A1B9A', label: 'purple', swatch: '#6a1b9a' }, // i18n-ignore: catalogue key
  { value: '777777', label: 'grey', swatch: '#777777' }, // i18n-ignore: catalogue key
];

const ALIGNMENTS: Array<{ value: TextAlign; label: TextKey<typeof FORMAT_TOOLBAR_MESSAGES>; glyph: string }> = [
  { value: 'left', label: 'alignLeft', glyph: '⇤' }, // i18n-ignore: catalogue key
  { value: 'center', label: 'alignCentre', glyph: '↔' }, // i18n-ignore: catalogue key
  { value: 'right', label: 'alignRight', glyph: '⇥' }, // i18n-ignore: catalogue key
  { value: 'justify', label: 'justify', glyph: '≡' }, // i18n-ignore: catalogue key
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
  /**
   * False when something else owns the target's alignment: a table cell's is its
   * `CellAlign`, set by the context bar's T⇤ T↔ T⇥ right below, and it wins over
   * `TextFormat.align` in the .docx. Hiding the group leaves any stored align alone.
   */
  alignable?: boolean;
  /** Dismiss the bar, clearing the page selection. */
  onClose?: () => void;
  /** Structural actions offered alongside formatting. */
  onDelete?: () => void;
  onMove?: (direction: -1 | 1) => void;
  onDuplicate?: () => void;
}

// Shared with `ContextBar`, the structural second row — one button language for
// everything docked over the page. Toggles crossfade (colours ease) and press with a
// slight scale; `scale` is listed because Tailwind v4 presses with the `scale` property,
// not `transform`. The focus ring is never transitioned.
export const TOOLBAR_BTN =
  'flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-xs font-medium ' +
  'transition-[background-color,border-color,color,opacity,transform,scale] duration-150 ease-out-soft active:scale-[0.97] ' +
  'hover:bg-[#3d3a35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5ba8dd]';

/** How far below the page column's top edge the docked bars sit. */
export const DOCK_INSET_PX = 8;

/** The seam between the format bar and the context bar docked under it. */
export const DOCK_GAP_PX = 2;

/** The format bar's height as one row: `h-7` buttons, `py-1`, a 1 px border. */
const FORMAT_BAR_ROW_PX = 38;

/** The ✕'s reserved lane: its `right-1.5` inset, its `min-w-7` box, the bar's `gap-0.5`. */
const CLOSE_LANE_PX = 6 + 28 + 2;

/*
 * The docked format bar's rendered height, published for the context bar under it: a
 * narrow page column wraps the format bar onto a second row, and a fixed one-row step
 * would lay the context bar over it. Layout height (`offsetHeight`), so the entrance
 * animation's scale never reads as a shorter bar.
 */
let formatBarHeight: number | undefined;
const formatBarListeners = new Set<() => void>();
function publishFormatBarHeight(height: number | undefined) {
  if (height === formatBarHeight) return;
  formatBarHeight = height;
  for (const listener of formatBarListeners) listener();
}
function subscribeFormatBarHeight(listener: () => void) {
  formatBarListeners.add(listener);
  return () => {
    formatBarListeners.delete(listener);
  };
}

/** How far below the format bar's top the next docked bar starts. */
export function useFormatBarStep(): number {
  const height = useSyncExternalStore(
    subscribeFormatBarHeight,
    () => formatBarHeight,
    () => undefined,
  );
  return (height ?? FORMAT_BAR_ROW_PX) + DOCK_GAP_PX;
}

/**
 * Claims the gap above a docked bar, so the page scrolled under it cannot be reached
 * there: a page hint's tooltip ("Edit the footer (double-click)") would open over the
 * bar, and a double-click would wake the region behind it.
 */
export function DockShield({ gapPx }: { gapPx: number }) {
  // `bottom-full` meets the padding box, so one more pixel covers the border.
  return (
    <span
      aria-hidden
      data-print-hide
      className="absolute -inset-x-px bottom-full"
      style={{ height: gapPx + 1 }}
    />
  );
}

/** The docked bars' entrance: dropping in from the top edge they dock to. */
export const TOOLBAR_ENTER = 'animate-pop-in origin-top';
export const TOOLBAR_ACTIVE = 'bg-[#0d77c9] text-white hover:bg-[#2b8ad3]';
export const TOOLBAR_IDLE = 'text-[#e6e2db]';
const BTN = TOOLBAR_BTN;
const ACTIVE = TOOLBAR_ACTIVE;
const IDLE = TOOLBAR_IDLE;

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
  alignable = true,
  onClose,
  onDelete,
  onMove,
  onDuplicate,
}: Props) {
  const m = useMessages(FORMAT_TOOLBAR_MESSAGES);
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

  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    publishFormatBarHeight(bar.offsetHeight);
    const observer = new ResizeObserver(() => publishFormatBarHeight(bar.offsetHeight));
    observer.observe(bar);
    return () => {
      observer.disconnect();
      publishFormatBarHeight(undefined);
    };
  }, []);

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
      aria-label={m.toolbar}
      // Docked across the top of the page column. `flex-wrap` matters: the column is
      // narrow at small window widths, and a single non-wrapping row would push the
      // delete button out of reach rather than folding onto a second line.
      className={`fixed z-50 flex flex-wrap items-center gap-0.5 rounded-xl border border-[#454138] bg-[#211f1d]/95 px-1.5 py-1 shadow-xl backdrop-blur ${TOOLBAR_ENTER}`}
      style={{
        left: dock.left,
        width: dock.width,
        top: dock.top,
        // The ✕'s lane: it is pinned top-right rather than wrapping, so the controls
        // fold onto a second row before they reach it and it never sits alone on one.
        ...(onClose ? { paddingRight: CLOSE_LANE_PX } : {}),
      }}
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
      <DockShield gapPx={DOCK_INSET_PX} />
      {subject && (
        // Names the target, since the bar no longer sits beside it. `mr-auto` pushes
        // every control to the right edge, keeping them in one place as the label's
        // width changes with the selection.
        <span className="mr-1 max-w-[30%] truncate pl-1 text-[11px] font-medium text-[#a39d94]">
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
        aria-label={m.fontSize}
        title={m.fontSize}
        className="h-7 cursor-pointer rounded bg-[#33302c] min-w-9 px-1 [field-sizing:content] text-xs text-[#f1eee9] outline-none transition-[background-color] duration-150 ease-out-soft hover:bg-[#3d3a35] focus-visible:ring-2 focus-visible:ring-[#5ba8dd]"
        value={format?.fontSize ?? inheritedPt ?? ''}
        onChange={(event) =>
          onChange({ fontSize: event.target.value ? Number(event.target.value) : undefined })
        }
      >
        <option value="">
          {format?.fontSize === undefined && inheritedPt === undefined ? m.size : m.sizeDefault}
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

      <span className="mx-0.5 h-5 w-px bg-[#3d3a35]" aria-hidden />

      <button
        type="button"
        aria-label={m.bold}
        aria-pressed={Boolean(format?.bold)}
        title={m.bold}
        className={`${BTN} ${format?.bold ? ACTIVE : IDLE} font-bold`}
        onClick={() => toggle('bold')}
      >
        B
      </button>
      <button
        type="button"
        aria-label={m.italic}
        aria-pressed={Boolean(format?.italic)}
        title={m.italic}
        className={`${BTN} ${format?.italic ? ACTIVE : IDLE} italic`}
        onClick={() => toggle('italic')}
      >
        I
      </button>
      <button
        type="button"
        aria-label={m.underline}
        aria-pressed={Boolean(format?.underline)}
        title={m.underline}
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
            aria-label={m.subscript}
            aria-pressed={vertAlign === 'subscript'}
            title={m.subscriptTitle}
            className={`${BTN} ${vertAlign === 'subscript' ? ACTIVE : IDLE}`}
            onClick={() => onVertAlign(vertAlign === 'subscript' ? undefined : 'subscript')}
          >
            <span aria-hidden>
              X<sub className="text-[9px]">2</sub>
            </span>
          </button>
          <button
            type="button"
            aria-label={m.superscript}
            aria-pressed={vertAlign === 'superscript'}
            title={m.superscriptTitle}
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
          aria-label={m.insertBlank}
          title={m.insertBlankTitle}
          className={`${BTN} ${IDLE}`}
          onClick={onInsertBlank}
        >
          <span aria-hidden className="underline">&nbsp;&nbsp;&nbsp;</span>
        </button>
      )}

      {alignable && (
        <>
          <span className="mx-0.5 h-5 w-px bg-[#3d3a35]" aria-hidden />
          {ALIGNMENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={m[option.label]}
              aria-pressed={format?.align === option.value}
              title={m[option.label]}
              className={`${BTN} ${format?.align === option.value ? ACTIVE : IDLE}`}
              onClick={() =>
                onChange({ align: format?.align === option.value ? undefined : option.value })
              }
            >
              {option.glyph}
            </button>
          ))}
        </>
      )}

      <span className="mx-0.5 h-5 w-px bg-[#3d3a35]" aria-hidden />

      <div className="relative">
        <button
          type="button"
          aria-label={m.textColour}
          aria-expanded={colorOpen}
          title={m.textColour}
          className={`${BTN} ${IDLE}`}
          onClick={() => setColorOpen((open) => !open)}
        >
          <span
            className="h-3.5 w-3.5 rounded-sm border border-[#6b665c]"
            style={{ background: format?.color ? `#${format.color}` : '#e2e8f0' }}
          />
        </button>
        {colorOpen && (
          <div className="absolute left-0 top-8 flex origin-top-left animate-pop-in gap-1 rounded-md border border-[#454138] bg-[#211f1d] p-1.5 shadow-xl">
            {COLORS.map((option) => (
              <button
                key={option.label}
                type="button"
                aria-label={m[option.label]}
                title={m[option.label]}
                className="h-5 w-5 rounded-sm border border-[#57534a] transition-[transform,scale] duration-150 ease-out-soft hover:scale-110 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5ba8dd]"
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
        <span className="mx-0.5 h-5 w-px bg-[#3d3a35]" aria-hidden />
      )}

      {onMove && (
        <>
          <button
            type="button"
            aria-label={m.moveUp}
            title={m.moveUp}
            className={`${BTN} ${IDLE}`}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={m.moveDown}
            title={m.moveDown}
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
          aria-label={m.duplicate}
          title={m.duplicate}
          className={`${BTN} ${IDLE}`}
          onClick={onDuplicate}
        >
          ⧉
        </button>
      )}

      {hasOverrides && (
        <button
          type="button"
          aria-label={m.clearFormatting}
          title={m.clearFormatting}
          className={`${BTN} ${IDLE}`}
          onClick={onReset}
        >
          ⌫
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          aria-label={m.deleteElement}
          title={m.deleteElement}
          className={`${BTN} text-[#d6d1c9] hover:bg-[#b4241f] hover:text-white`}
          onClick={onDelete}
        >
          🗑
        </button>
      )}

      {onClose && (
        // Its own dismiss, because a docked bar no longer disappears just by looking
        // away from the selection — and with delete now a bin glyph, an ✕ here cannot
        // be mistaken for "delete this element". Out of the flow, in the lane the bar's
        // right padding reserves: on the first row's line whether or not the bar wraps.
        <button
          type="button"
          aria-label={m.doneFormatting}
          title={m.done}
          className={`${BTN} absolute right-1.5 top-1 ${IDLE}`}
          onClick={onClose}
        >
          ✕
        </button>
      )}
    </div>
  );
}
