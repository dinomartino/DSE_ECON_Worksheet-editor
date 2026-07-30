'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  MIN_COLUMN_FRACTION,
  MIN_ROW_HEIGHT_TWIPS,
  MIN_TABLE_FRACTION,
} from '@/model/table';
import { ptToTwips } from '@/model/page';

/**
 * Drag a table's geometry on the page: column boundaries, outer edges and row heights.
 *
 * The reference papers settle why all three are needed. Neither table has equal columns —
 * the cost-output table's label column is about three times a data column. The
 * distribution table does not span the text column at all, being inset from both sides.
 * And both have rows visibly taller than the 12pt line their text sits on.
 *
 * The point of doing it here rather than in the sidebar is that a table is only legible at
 * full width, on the paper: sizing it by typing numbers into a 380px column means looking
 * away from the thing being sized. The panel keeps the exact values, the way the diagram
 * editor's panel keeps coordinates while the canvas drags.
 *
 * Every gesture follows the page's existing two (`ResizableBlock`, `ResizableRows`):
 *
 * - **The in-flight value is local state**, committed once on pointer-up. A drag that
 *   wrote every move would put dozens of entries on the undo stack for one gesture.
 * - **The delta divides by the preview scale**, so the edge tracks the cursor at any zoom.
 * - **Escape abandons it**, matching every other cancellable interaction here.
 * - **Geometry is captured at pointer-down**, never re-read mid-drag: the table redraws
 *   under the pointer, so a box measured every move would shift beneath the gesture
 *   causing it. (It is also the ref-during-render React warns about.)
 *
 * What none of them share is the selection dance. A boundary is not a selectable object —
 * there is nothing to delete or format — so handles are revealed on hover and need no
 * click-to-arm step.
 *
 * The three differ in one respect worth stating, because it is the source of the only
 * subtlety here: **columns and edges are fractions, rows are absolute.** A column's share
 * is meaningless without a table to be a share *of*, and a table's share is meaningless
 * without a page; a row's height is just a height. So the first two divide by a measured
 * width and the third does not.
 */

/** Half a grip's width, in screen pixels — the reach of every boundary handle. */
const GRIP = 5;

/** What the pointer is holding. */
type Grip =
  | { kind: 'column'; index: number }
  | { kind: 'edge'; side: 'left' | 'right' }
  | { kind: 'row'; index: number };

interface Props {
  /** Fractions of the table's width, one per column, summing to 1. */
  widths: number[];
  /** The table's own box, as fractions of the content width. */
  box: { width: number; indent: number };
  /** A floor on each row's height in twips, in row order. */
  rowHeights: (number | undefined)[];
  /** Preview zoom, so a pointer delta converts back to page pixels. */
  scale: number;
  /**
   * The table being resized, measured at pointer-down.
   *
   * A ref rather than a number because its size must be read when the gesture *starts*,
   * not during render — see the note above on capturing geometry.
   */
  tableRef: React.RefObject<HTMLTableElement | null>;

  /** Commit: the boundary after `index` moved by `delta` fractions of the table. */
  onResizeColumn: (index: number, delta: number) => void;
  /** Commit: an outer edge moved by `delta` fractions of the content width. */
  onResizeEdge: (side: 'left' | 'right', delta: number) => void;
  /** Commit: row `index` given a height floor, in twips. */
  onResizeRow: (index: number, twips: number) => void;

  /** Live values while dragging, so the table redraws under the pointer. */
  onPreviewWidths: (widths: number[] | undefined) => void;
  onPreviewBox: (box: { width: number; indent: number } | undefined) => void;
  onPreviewRow: (row: { index: number; twips: number } | undefined) => void;
}

export function TableColumnResizer({
  widths,
  box,
  rowHeights,
  scale,
  tableRef,
  onResizeColumn,
  onResizeEdge,
  onResizeRow,
  onPreviewWidths,
  onPreviewBox,
  onPreviewRow,
}: Props) {
  const gesture = useRef<{
    grip: Grip;
    startX: number;
    startY: number;
    pointerId: number;
    /** Column fractions when the drag began. */
    baseWidths: number[];
    /** The table's box when the drag began. */
    baseBox: { width: number; indent: number };
    /** The row's height in twips when the drag began — its *rendered* height if unset. */
    baseRow: number;
    /** The table's page-pixel width, and the content width it is a fraction of. */
    tableWidthPx: number;
    contentWidthPx: number;
  } | null>(null);

  // Mirrors what is being previewed so release can commit without a state updater —
  // React runs those during render, and committing there would call the store mid-render.
  const latest = useRef<number | undefined>(undefined);
  const [dragging, setDragging] = useState<Grip | undefined>();

  const clearPreviews = useCallback(() => {
    onPreviewWidths(undefined);
    onPreviewBox(undefined);
    onPreviewRow(undefined);
  }, [onPreviewWidths, onPreviewBox, onPreviewRow]);

  const cancel = useCallback(() => {
    gesture.current = null;
    latest.current = undefined;
    setDragging(undefined);
    clearPreviews();
  }, [clearPreviews]);

  const finish = useCallback(() => {
    const active = gesture.current;
    const value = latest.current;
    cancel();
    if (!active || value === undefined) return;

    // An unchanged value would still cost an undo press, so a click that merely brushed
    // a handle commits nothing.
    if (active.grip.kind === 'row') {
      if (value !== active.baseRow) onResizeRow(active.grip.index, value);
      return;
    }
    if (value === 0) return;
    if (active.grip.kind === 'column') onResizeColumn(active.grip.index, value);
    else onResizeEdge(active.grip.side, value);
  }, [cancel, onResizeColumn, onResizeEdge, onResizeRow]);

  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [dragging, cancel]);

  const beginDrag =
    (grip: Grip) => (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      // The page's own drag-to-reorder and select handlers must not see this: once a
      // handle is grabbed the gesture is entirely ours.
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      const table = tableRef.current;
      // Divided by the scale so a pixel delta converts against the *page*, not the
      // screen: `getBoundingClientRect` reports the latter, the sheet sitting inside a
      // `scale()` transform.
      const tableWidthPx = (table?.getBoundingClientRect().width ?? 0) / (scale || 1);
      // The table is `box.width` of the content width, so the content width follows from
      // its measured size — no separate measurement to keep in step.
      const contentWidthPx = box.width > 0 ? tableWidthPx / box.width : tableWidthPx;

      const rowPx =
        grip.kind === 'row'
          ? (table?.rows[grip.index]?.getBoundingClientRect().height ?? 0) / (scale || 1)
          : 0;

      gesture.current = {
        grip,
        startX: event.clientX,
        startY: event.clientY,
        pointerId: event.pointerId,
        baseWidths: widths,
        baseBox: box,
        // A row with no stored floor starts from what it currently *renders* at, so the
        // drag begins where the pointer is rather than jumping to a default.
        baseRow:
          rowHeights[grip.kind === 'row' ? grip.index : 0] ??
          ptToTwips((rowPx * 72) / 96),
        tableWidthPx,
        contentWidthPx,
      };
      latest.current = grip.kind === 'row' ? gesture.current.baseRow : 0;
      setDragging(grip);
    };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId) return;

    if (active.grip.kind === 'row') {
      const movedPx = (event.clientY - active.startY) / (scale || 1);
      const next = Math.max(
        MIN_ROW_HEIGHT_TWIPS,
        active.baseRow + ptToTwips((movedPx * 72) / 96),
      );
      latest.current = next;
      onPreviewRow({ index: active.grip.index, twips: next });
      return;
    }

    const movedPx = (event.clientX - active.startX) / (scale || 1);

    if (active.grip.kind === 'edge') {
      if (active.contentWidthPx <= 0) return;
      const asked = movedPx / active.contentWidthPx;
      const { width, indent } = active.baseBox;

      // Clamped exactly as `resizeTableEdge` will, so the preview stops where the model
      // stops rather than sliding past and snapping back on release.
      let delta: number;
      if (active.grip.side === 'right') {
        const next = Math.min(Math.max(width + asked, MIN_TABLE_FRACTION), 1 - indent);
        delta = next - width;
        onPreviewBox({ width: next, indent });
      } else {
        const right = indent + width;
        const nextIndent = Math.min(
          Math.max(indent + asked, 0),
          right - MIN_TABLE_FRACTION,
        );
        delta = nextIndent - indent;
        onPreviewBox({ width: right - nextIndent, indent: nextIndent });
      }
      latest.current = delta;
      return;
    }

    if (active.tableWidthPx <= 0) return;
    const asked = movedPx / active.tableWidthPx;
    const index = active.grip.index;
    const pair = active.baseWidths[index] + active.baseWidths[index + 1];
    const left = Math.min(
      Math.max(active.baseWidths[index] + asked, MIN_COLUMN_FRACTION),
      pair - MIN_COLUMN_FRACTION,
    );
    latest.current = left - active.baseWidths[index];
    const next = [...active.baseWidths];
    next[index] = left;
    next[index + 1] = pair - left;
    onPreviewWidths(next);
  };

  /**
   * Everything a handle shares: pointer wiring, and staying out of the page's way.
   *
   * `pointer-events` is the load-bearing part. A row grip is a 9px band across the whole
   * table, so a handle that always accepted the pointer would sit permanently on top of
   * the cells: clicking a line of text near a row boundary would grab the boundary
   * instead, and the cell underneath could not be selected or edited at all. They
   * therefore take the pointer **only while the table is hovered** — and stay live for
   * the duration of a drag, since a gesture that left the table would otherwise drop.
   */
  const handleProps = (grip: Grip) => ({
    type: 'button' as const,
    'data-print-hide': true,
    onPointerDown: beginDrag(grip),
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    // A boundary is not a selectable thing, so a click on it must not reach the wrapper
    // and change what the sidebar is pointing at.
    onClick: (event: React.MouseEvent) => event.stopPropagation(),
    onDoubleClick: (event: React.MouseEvent) => event.stopPropagation(),
  });

  /*
   * The grips are always live, and that is deliberate.
   *
   * Gating them on `group-hover` is circular and does not work: `pointer-events: none`
   * stops the browser routing *any* event to the element, so the pointer-down that would
   * begin a drag never arrives — and approaching the left edge from outside the table
   * means the group is not hovered at the moment the press lands. The edge grips
   * straddle the table's border precisely where that bites.
   *
   * What made an always-live grip a problem was **size**, not liveness: a row grip spans
   * the table, so a 9px band lay over every cell's text. The answer is to keep each grip
   * on the boundary it names and let the cursor advertise it, which is what Word does —
   * so `MARGIN` below is the grip's whole footprint and it is centred on a border, never
   * over a line of text.
   */
  const live = 'pointer-events-auto';

  /** Each row's bottom edge in page pixels, measured from the DOM. */
  const [rowBottoms, setRowBottoms] = useState<number[]>([]);
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const top = table.getBoundingClientRect().top;
    setRowBottoms(
      [...table.rows].map(
        (row) => (row.getBoundingClientRect().bottom - top) / (scale || 1),
      ),
    );
    // `rowHeights` and `box` are what move the boundaries; `widths` can too, by changing
    // how text wraps and therefore how tall a row is.
  }, [tableRef, scale, rowHeights, box.width, box.indent, widths]);

  const held = (grip: Grip) =>
    dragging !== undefined &&
    dragging.kind === grip.kind &&
    (grip.kind === 'edge'
      ? dragging.kind === 'edge' && dragging.side === grip.side
      : dragging.kind !== 'edge' && dragging.index === grip.index);

  const tint = (grip: Grip) =>
    held(grip) ? 'bg-[#7c5cff]/35' : 'bg-transparent hover:bg-[#7c5cff]/25';

  /*
   * Interior column boundaries, positioned by the cumulative width to their left.
   *
   * Absolutely positioned and `data-print-hide`, so they reserve no space: the page must
   * break where Word breaks it, and chrome that pushed a row down would make the preview
   * lie about the document.
   */
  const columnOffsets: number[] = [];
  let running = 0;
  for (let i = 0; i < widths.length - 1; i += 1) {
    running += widths[i];
    columnOffsets.push(running);
  }

  /*
   * Row boundaries, measured from the real rows.
   *
   * Rows are content-sized — that is the whole point of `hRule="atLeast"` — so only the
   * DOM knows where a boundary actually falls; there is no fraction to compute one from.
   * Measured in a layout effect after each render, and re-measured when the row heights
   * or the box change, since both move the boundaries.
   */
  const rowCount = rowHeights.length;

  return (
    <>
      {columnOffsets.map((offset, index) => (
        <button
          key={`col-${index}`}
          {...handleProps({ kind: 'column', index })}
          aria-label={`Drag to resize column ${index + 1}`}
          style={{
            left: `${offset * 100}%`,
            // Inverse-scaled so the grip keeps a constant on-screen size at any zoom, the
            // same trick the diagram canvas and the other two resizers use.
            width: 9 / (scale || 1),
            marginLeft: -4.5 / (scale || 1),
            cursor: 'col-resize',
            touchAction: 'none',
          }}
          className={`absolute top-0 bottom-0 z-10 cursor-col-resize transition-colors ${live} ${tint(
            { kind: 'column', index },
          )}`}
        />
      ))}

      {(['left', 'right'] as const).map((side) => (
        <button
          key={`edge-${side}`}
          {...handleProps({ kind: 'edge', side })}
          aria-label={`Drag to resize the table's ${side} edge`}
          style={{
            [side]: 0,
            width: 9 / (scale || 1),
            [side === 'left' ? 'marginLeft' : 'marginRight']: -4.5 / (scale || 1),
            cursor: 'col-resize',
            touchAction: 'none',
          }}
          className={`absolute top-0 bottom-0 z-10 cursor-col-resize transition-colors ${live} ${tint(
            { kind: 'edge', side },
          )}`}
        />
      ))}

      {Array.from({ length: rowCount }, (_, index) => index)
        // Only boundaries that have been measured; before first layout there is nowhere
        // to put a handle, and one at `top: 0` would sit across the first row's text.
        .filter((index) => rowBottoms[index] !== undefined)
        .map((index) => (
          <button
            key={`row-${index}`}
            {...handleProps({ kind: 'row', index })}
            aria-label={`Drag to resize row ${index + 1}`}
            style={{
              // Inset from both ends, so a horizontal grip never crosses the vertical
              // ones at the table's edges. They overlap otherwise, and the row grip —
              // rendered last — wins the z-order tie and swallows every press meant for
              // an outer edge, which is exactly the drag that then appears to do nothing.
              left: GRIP / (scale || 1),
              right: GRIP / (scale || 1),
              top: rowBottoms[index],
              // Narrower than the column grips: a row grip spans the whole table, so
              // every pixel of it lies over a cell. 7px still comfortably exceeds the
              // 4px Fitts target a border needs, while leaving the text clear.
              height: 7 / (scale || 1),
              marginTop: -3.5 / (scale || 1),
              cursor: 'row-resize',
              touchAction: 'none',
            }}
            className={`absolute z-10 cursor-row-resize transition-colors ${live} ${tint(
              { kind: 'row', index },
            )}`}
          />
        ))}
    </>
  );
}
