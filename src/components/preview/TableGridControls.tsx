'use client';

import { useLayoutEffect, useState } from 'react';

/**
 * Word's table affordances: insert a row or column where you point, delete the one you
 * are in.
 *
 * These live on the paper rather than only in the sidebar for the reason the drags do: a
 * table is legible at full width and illegible in a 380px column, so the position a
 * teacher means ("a column *here*") is one they can only point at on the page. The panel
 * keeps the same verbs — it is still the route with a name for every action — but it
 * should not be the only one.
 *
 * **Only the pointed-at row and column get controls**, which is the rule that makes this
 * usable rather than a rash of chips. Showing every boundary at once put twelve buttons
 * around a four-row table: they collided with each other in the margin and, being
 * positioned above the table, landed on the heading *above* it. Word shows one insert
 * mark at the boundary you are near, and that is both quieter and less ambiguous — a
 * button next to eleven identical buttons does not say which row it means.
 *
 * Three rules hold everything else:
 *
 * - **Chrome reserves no space and never prints.** Absolutely positioned,
 *   `data-print-hide`. The page must break where Word breaks it.
 * - **A control outside its group's box needs a hit path** (§hover chrome). These sit in
 *   the margins, so the hover pad in `TableNodeView` extends the group to reach them, and
 *   the layer is revealed with `opacity`, never `display` — a zero-size box cannot be
 *   hovered at all.
 * - **Positions come from the DOM.** Rows are content-sized, so only layout knows where a
 *   boundary falls.
 */

interface Props {
  /** Column boundaries as fractions of the table, cumulative — one per interior edge. */
  columnOffsets: number[];
  columnCount: number;
  rowCount: number;
  scale: number;
  tableRef: React.RefObject<HTMLTableElement | null>;
  onInsertRow: (index: number) => void;
  onRemoveRow: (index: number) => void;
  onInsertColumn: (index: number) => void;
  onRemoveColumn: (index: number) => void;
}

export function TableGridControls({
  columnOffsets,
  columnCount,
  rowCount,
  scale,
  tableRef,
  onInsertRow,
  onRemoveRow,
  onInsertColumn,
  onRemoveColumn,
}: Props) {
  /** Each row's top and bottom edge in page pixels, measured from the DOM. */
  const [rows, setRows] = useState<{ top: number; bottom: number }[]>([]);
  /** Which row and column the pointer is in, or -1. */
  const [at, setAt] = useState<{ row: number; column: number }>({ row: -1, column: -1 });

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const top = table.getBoundingClientRect().top;
    setRows(
      [...table.rows].map((row) => {
        const rect = row.getBoundingClientRect();
        return {
          top: (rect.top - top) / (scale || 1),
          bottom: (rect.bottom - top) / (scale || 1),
        };
      }),
    );
  }, [tableRef, scale, rowCount, columnCount, columnOffsets]);

  /*
   * Track the pointer against the table itself.
   *
   * On the table rather than on per-cell handlers because the cells belong to the text
   * editor — adding mouse handlers there would put this component in the way of the
   * click that opens a field. A listener on the element is read-only by comparison.
   */
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;

    const onMove = (event: PointerEvent) => {
      const rect = table.getBoundingClientRect();
      const withinX = event.clientX >= rect.left - 40 && event.clientX <= rect.right + 12;
      const withinY = event.clientY >= rect.top - 40 && event.clientY <= rect.bottom + 12;
      if (!withinX || !withinY) {
        setAt({ row: -1, column: -1 });
        return;
      }

      const x = (event.clientX - rect.left) / (rect.width || 1);
      let column = 0;
      while (column < columnOffsets.length && x > columnOffsets[column]) column += 1;

      const y = event.clientY - rect.top;
      const scaled = y / (scale || 1);
      const row = rows.findIndex((r) => scaled >= r.top && scaled <= r.bottom);

      setAt({
        row: row < 0 ? (scaled < 0 ? 0 : rowCount - 1) : row,
        column: Math.min(column, columnCount - 1),
      });
    };
    const onLeave = () => setAt({ row: -1, column: -1 });

    // On the document, so the pointer is still tracked while it is out in the margin
    // reaching for a button — the same hit-path problem the hover pad solves for CSS.
    document.addEventListener('pointermove', onMove);
    table.addEventListener('pointerleave', onLeave);
    return () => {
      document.removeEventListener('pointermove', onMove);
      table.removeEventListener('pointerleave', onLeave);
    };
  }, [tableRef, scale, rows, columnOffsets, columnCount, rowCount]);

  const px = (value: number) => value / (scale || 1);

  const chip = (danger = false) =>
    'pointer-events-auto absolute z-20 flex cursor-pointer items-center justify-center ' +
    'rounded-full border border-white text-white shadow-sm hover:brightness-110 ' +
    (danger ? 'bg-[#b4241f]' : 'bg-[#7c5cff]');

  const chipStyle = (size: number) => ({
    width: px(size),
    height: px(size),
    fontSize: px(size === 18 ? 12 : 10),
    lineHeight: 1,
  });

  const column = at.column;
  const row = at.row;
  const columnStart = column <= 0 ? 0 : columnOffsets[column - 1];
  const columnEnd = column >= columnCount - 1 ? 1 : columnOffsets[column];
  const here = rows[row];

  return (
    <>
      {/* The pointed-at column: insert either side of it, or delete it. Sat just above
          the table, close enough that they read as belonging to it — far enough that
          they clear the top border and the text inside the first row. */}
      {column >= 0 && (
        <>
          <button
            type="button"
            data-print-hide
            aria-label={`Insert column before column ${column + 1}`}
            title="Insert column to the left"
            className={chip()}
            style={{
              ...chipStyle(16),
              left: `${columnStart * 100}%`,
              top: px(-9),
              marginLeft: px(-8),
            }}
            onClick={(event) => {
              event.stopPropagation();
              onInsertColumn(column);
            }}
          >
            <span aria-hidden>+</span>
          </button>
          <button
            type="button"
            data-print-hide
            aria-label={`Insert column after column ${column + 1}`}
            title="Insert column to the right"
            className={chip()}
            style={{
              ...chipStyle(16),
              left: `${columnEnd * 100}%`,
              top: px(-9),
              marginLeft: px(-8),
            }}
            onClick={(event) => {
              event.stopPropagation();
              onInsertColumn(column + 1);
            }}
          >
            <span aria-hidden>+</span>
          </button>
          {/* Hidden at one column: `removeColumn` keeps a floor, and a button that does
              nothing is worse than one that is absent. */}
          {columnCount > 1 && (
            <button
              type="button"
              data-print-hide
              aria-label={`Delete column ${column + 1}`}
              title="Delete this column"
              className={chip(true)}
              style={{
                ...chipStyle(14),
                left: `${((columnStart + columnEnd) / 2) * 100}%`,
                /*
                 * Inside the column's first row, not above the table.
                 *
                 * There is no second lane above a table: row 1's top edge *is* the
                 * table's, so anything stacked over the insert chips lands on whatever
                 * text precedes the block — the question stem, in every real case. Word
                 * puts the column's delete on the column, and inside is the only place
                 * that is unambiguously "this column" and nobody else's.
                 */
                top: px(9),
                marginLeft: px(-7),
              }}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveColumn(column);
              }}
            >
              <span aria-hidden>×</span>
            </button>
          )}
        </>
      )}

      {/* The pointed-at row, mirrored into the left margin. */}
      {here && (
        <>
          <button
            type="button"
            data-print-hide
            aria-label={`Insert row above row ${row + 1}`}
            title="Insert row above"
            className={chip()}
            style={{ ...chipStyle(16), top: here.top, left: px(-16), marginTop: px(-8) }}
            onClick={(event) => {
              event.stopPropagation();
              onInsertRow(row);
            }}
          >
            <span aria-hidden>+</span>
          </button>
          <button
            type="button"
            data-print-hide
            aria-label={`Insert row below row ${row + 1}`}
            title="Insert row below"
            className={chip()}
            style={{ ...chipStyle(16), top: here.bottom, left: px(-16), marginTop: px(-8) }}
            onClick={(event) => {
              event.stopPropagation();
              onInsertRow(row + 1);
            }}
          >
            <span aria-hidden>+</span>
          </button>
          {rowCount > 1 && (
            <button
              type="button"
              data-print-hide
              aria-label={`Delete row ${row + 1}`}
              title="Delete this row"
              className={chip(true)}
              style={{
                ...chipStyle(14),
                top: (here.top + here.bottom) / 2,
                left: px(-33),
                marginTop: px(-7),
              }}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveRow(row);
              }}
            >
              <span aria-hidden>×</span>
            </button>
          )}
        </>
      )}
    </>
  );
}
