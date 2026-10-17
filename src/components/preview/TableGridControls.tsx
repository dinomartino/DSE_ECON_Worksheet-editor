'use client';

import { useLayoutEffect, useState } from 'react';
import { useMessages } from '@/i18n/language';
import { TABLE_CONTROLS_MESSAGES } from './messages';

/**
 * Word's table affordances on the paper: insert a row/column where you point, delete
 * the one you are in. **Only the pointed-at row and column get controls** (all at
 * once = twelve colliding chips). Chrome reserves no space and never prints
 * (`data-print-hide`); margin controls get a hit path via the hover pad, revealed
 * with `opacity`, never `display`; positions come from the DOM.
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

/** The column ✕'s top, in page px from the table's top edge: straddling it. */
export const COLUMN_DELETE_TOP = -10;
/** The row ✕'s lane, in page px left of the table. */
const ROW_LANE_PX = 33;

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
  const m = useMessages(TABLE_CONTROLS_MESSAGES);
  const [rows, setRows] = useState<{ top: number; bottom: number }[]>([]);
  /** Which row and column the pointer is in, or -1. */
  const [at, setAt] = useState<{ row: number; column: number }>({ row: -1, column: -1 });
  /*
   * Whether the pointer is on the table itself (its chip lanes included), not merely
   * near it. The insert chips may show from the margins; **the delete chips only from
   * here**. The hover zone reaches 40px above the table, over the end of the question
   * text, and a column ✕ shown from there sat on the stem's last line: double-clicking
   * a word in it deleted a column (docs/Tables vs Word.md, item 3).
   */
  const [onTable, setOnTable] = useState(false);

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
        setOnTable(false);
        return;
      }
      // The column ✕ straddles the top edge (`COLUMN_DELETE_TOP`), the row ✕ sits in
      // the left lane: both are reachable without leaving this box.
      setOnTable(
        event.clientX >= rect.left - ROW_LANE_PX * (scale || 1) &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top + COLUMN_DELETE_TOP * (scale || 1) &&
          event.clientY <= rect.bottom,
      );

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
    const onLeave = () => {
      setAt({ row: -1, column: -1 });
      setOnTable(false);
    };

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
    // Hover and press ease; position never does — the chips follow the pointed-at row.
    'transition-[filter,scale] duration-150 ease-out-soft active:scale-[0.97] ' +
    (danger ? 'bg-[#b4241f]' : 'bg-[#0d77c9]');

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
            aria-label={m.insertColumnBefore(column + 1)}
            title={m.insertColumnLeft}
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
            aria-label={m.insertColumnAfter(column + 1)}
            title={m.insertColumnRight}
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
          {columnCount > 1 && onTable && (
            <button
              type="button"
              data-print-hide
              aria-label={m.deleteColumnN(column + 1)}
              title={m.deleteColumn}
              className={chip(true)}
              style={{
                ...chipStyle(14),
                left: `${((columnStart + columnEnd) / 2) * 100}%`,
                /*
                 * On the table's top edge, in the inserts' lane, between them — inside
                 * the blank line every table takes before it, never on the stem.
                 *
                 * Twice moved. Inside row 1 (`top: 9`) it sat dead centre of a cell,
                 * and the second click of the double-click that opened the cell hit it.
                 * A lane 25px above the table then put it on the question text's last
                 * line. Chrome may never occupy a spot a content gesture has to reach:
                 * here it covers only the cell's top padding edge, and it shows only
                 * while the pointer is on the table (`onTable`).
                 */
                top: px(COLUMN_DELETE_TOP),
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
            aria-label={m.insertRowAboveN(row + 1)}
            title={m.insertRowAbove}
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
            aria-label={m.insertRowBelowN(row + 1)}
            title={m.insertRowBelow}
            className={chip()}
            style={{ ...chipStyle(16), top: here.bottom, left: px(-16), marginTop: px(-8) }}
            onClick={(event) => {
              event.stopPropagation();
              onInsertRow(row + 1);
            }}
          >
            <span aria-hidden>+</span>
          </button>
          {rowCount > 1 && onTable && (
            <button
              type="button"
              data-print-hide
              aria-label={m.deleteRowN(row + 1)}
              title={m.deleteRow}
              className={chip(true)}
              style={{
                ...chipStyle(14),
                top: (here.top + here.bottom) / 2,
                left: px(-ROW_LANE_PX),
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
