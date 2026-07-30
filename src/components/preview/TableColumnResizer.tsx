'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_COLUMN_FRACTION } from '@/model/table';

/**
 * Drag the boundary between two table columns, on the page.
 *
 * The reference papers settle this feature: neither of them has equal columns. The
 * cost-output table's label column is about three times a data column, and the
 * distribution table's row-heading column is wider than either year. Equal thirds cannot
 * express that, so the preview would paginate on geometry Word does not reproduce.
 *
 * The gesture follows the page's other two (`ResizableBlock`, `ResizableRows`):
 *
 * - **The in-flight value is local state**, committed once on pointer-up. A drag that
 *   wrote every move would put dozens of entries on the undo stack for one gesture.
 * - **The delta divides by the preview scale**, so the edge tracks the cursor at any zoom.
 * - **Escape abandons it**, matching every other cancellable interaction here.
 *
 * What it does *not* share is the selection dance. A column boundary is not a selectable
 * object — there is nothing to delete or format — so the handle is revealed on hover over
 * the table and needs no click-to-arm step.
 */

interface Props {
  /** Fractions of the table width, one per column, summing to 1. */
  widths: number[];
  /** Preview zoom, so a pointer delta converts back to page pixels. */
  scale: number;
  /**
   * The table being resized, measured at pointer-down.
   *
   * A ref rather than a number because its width must be read when the gesture *starts*,
   * not during render: the table redraws under the drag, so a width captured every render
   * would change beneath the pointer, and reading a ref while rendering is exactly the
   * staleness React warns about.
   */
  tableRef: React.RefObject<HTMLTableElement | null>;
  /** Commit: the boundary after `index` moved by `delta` fractions. */
  onResize: (index: number, delta: number) => void;
  /** Live widths while dragging, so the table can redraw under the pointer. */
  onPreview: (widths: number[] | undefined) => void;
}

export function TableColumnResizer({
  widths,
  scale,
  tableRef,
  onResize,
  onPreview,
}: Props) {
  const gesture = useRef<{
    index: number;
    startX: number;
    pointerId: number;
    /** Captured once, so the pair being resized cannot shift under its own gesture. */
    base: number[];
    /** The table's page-pixel width when the drag began. */
    widthPx: number;
  } | null>(null);

  // Mirrors what the parent is previewing, so release can commit without a state
  // updater — React runs those during render, and committing there would call the store
  // mid-render.
  const latest = useRef<number | undefined>(undefined);
  const [dragging, setDragging] = useState<number | undefined>();

  const cancel = useCallback(() => {
    gesture.current = null;
    latest.current = undefined;
    setDragging(undefined);
    onPreview(undefined);
  }, [onPreview]);

  const finish = useCallback(() => {
    const active = gesture.current;
    const delta = latest.current;
    cancel();
    // An unchanged value would still cost an undo press, so a click that merely brushed
    // the boundary commits nothing.
    if (active && delta !== undefined && delta !== 0) onResize(active.index, delta);
  }, [cancel, onResize]);

  useEffect(() => {
    if (dragging === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [dragging, cancel]);

  const beginDrag = (index: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    // The page's own drag-to-reorder and select handlers must not see this: once the
    // boundary is grabbed the gesture is entirely ours.
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      index,
      startX: event.clientX,
      pointerId: event.pointerId,
      base: widths,
      // Divided by the scale so a fraction converts against the *page* width, not the
      // on-screen one: `getBoundingClientRect` reports the latter, because the sheet
      // sits inside a `scale()` transform.
      widthPx: (tableRef.current?.getBoundingClientRect().width ?? 0) / (scale || 1),
    };
    latest.current = 0;
    setDragging(index);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId || active.widthPx <= 0) return;

    const moved = (event.clientX - active.startX) / (scale || 1);
    const asked = moved / active.widthPx;

    // Clamped against the captured pair, so the readout stops exactly where the model
    // will: `resizeColumn` floors both sides, and a preview that kept sliding past the
    // floor would snap back on release.
    const pair = active.base[active.index] + active.base[active.index + 1];
    const left = Math.min(
      Math.max(active.base[active.index] + asked, MIN_COLUMN_FRACTION),
      pair - MIN_COLUMN_FRACTION,
    );
    const delta = left - active.base[active.index];

    latest.current = delta;
    const next = [...active.base];
    next[active.index] = left;
    next[active.index + 1] = pair - left;
    onPreview(next);
  };

  /*
   * One handle per interior boundary, positioned by the cumulative width to its left.
   *
   * Absolutely positioned and `data-print-hide`, so they reserve no space: the page must
   * break where Word breaks it, and chrome that pushed a row down would make the preview
   * lie about the document.
   */
  const offsets: number[] = [];
  let running = 0;
  for (let i = 0; i < widths.length - 1; i += 1) {
    running += widths[i];
    offsets.push(running);
  }

  return (
    <>
      {offsets.map((offset, index) => (
        <button
          key={index}
          type="button"
          aria-label={`Drag to resize column ${index + 1}`}
          data-print-hide
          style={{
            left: `${offset * 100}%`,
            // Inverse-scaled so the grip keeps a constant on-screen size at any zoom,
            // the same trick the diagram canvas and the other two resizers use.
            width: 9 / (scale || 1),
            marginLeft: -4.5 / (scale || 1),
            cursor: 'col-resize',
            touchAction: 'none',
          }}
          className={`absolute top-0 bottom-0 z-10 cursor-col-resize transition-colors ${
            dragging === index
              ? 'bg-[#7c5cff]/35'
              : 'bg-transparent hover:bg-[#7c5cff]/25'
          }`}
          onPointerDown={beginDrag(index)}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
          // A boundary is not a selectable thing, so a click on it must not reach the
          // wrapper and change what the sidebar is pointing at.
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        />
      ))}
    </>
  );
}
