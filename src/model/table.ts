import { createTableCell, createTableRow } from './factories';
import type { TableBlock, TableCell } from './types';

/**
 * Table structure: the shape of a table, separate from what is typed into it.
 *
 * These are pure functions over a `TableBlock` because **two surfaces perform the same
 * edits** — the sidebar's structure panel and the page's own row/column controls — and a
 * verb implemented twice is a verb that will eventually mean two things. They also make
 * the awkward cases (merges, ragged rows) testable without a DOM.
 *
 * There is no notion of a "header" row here, and deliberately so. A `headerRowCount`
 * used to drive `w:tblHeader`, grey shading and bold text, and no HKDSE table has any of
 * them; worse, it could not describe a distribution table, whose headings run across the
 * top *and* down the left with an empty corner. Emphasis is per-cell formatting.
 *
 * **Ragged rows are real.** Merging with `colSpan` leaves rows holding different numbers
 * of cell objects, so nothing here may assume `rows[0].cells.length` is the width. Every
 * function that adds cells pads to the widest row instead, or a column inserted into a
 * merged table lands in a different visual place on each row.
 */

/**
 * The widest row's cell count — the number of columns a new row must supply.
 *
 * **Reports zero for a table that has none**, rather than flooring at 1. An earlier
 * version claimed 1, and a saved document proved why that is wrong: a table whose columns
 * had all been deleted (the old panel's column ✕ had no floor) read as "3 rows × 1 column"
 * while rendering as nothing, and every recovery route was built on the lie — "Add column"
 * padded to the imaginary column and produced *two*, and "Add row" gave the new row one
 * cell while the existing rows kept none, leaving `[1,0,0,0]`.
 *
 * A floor belongs in the mutators, which is where it now is; a *measurement* that cannot
 * return zero cannot describe a table that needs repairing.
 */
export function columnCountOf(block: TableBlock): number {
  return block.rows.reduce((widest, row) => Math.max(widest, row.cells.length), 0);
}

/** The visual column count, counting a merged cell once per column it spans. */
export function spannedColumnCount(block: TableBlock): number {
  return block.rows.reduce(
    (widest, row) =>
      Math.max(
        widest,
        row.cells.reduce((sum, cell) => sum + (cell.covered ? 0 : cell.colSpan ?? 1), 0),
      ),
    0,
  );
}

/**
 * A table with rows but no cells in them, which renders as nothing at all.
 *
 * Reachable only from documents saved before `removeColumn` had a floor, but they exist —
 * so the repair has to live somewhere. It is *not* a migration: a document is not corrupt,
 * it is a table the teacher can no longer see or fix, and silently rewriting saved content
 * on load is a heavier act than offering the fix where the problem is visible.
 */
export function isDegenerate(block: TableBlock): boolean {
  return block.rows.length > 0 && columnCountOf(block) === 0;
}

/** Give every row one empty cell, restoring a table that lost all its columns. */
export function restoreColumn(block: TableBlock): TableBlock {
  if (!isDegenerate(block)) return block;
  return { ...block, rows: block.rows.map((row) => ({ ...row, cells: [createTableCell()] })) };
}

/**
 * Where a cell sits, as row and column indices.
 *
 * Returns undefined for an id the table does not hold — a stale active cell after the
 * row containing it was deleted, which is exactly when the panel must fall back to
 * whole-table controls rather than acting on a position that no longer exists.
 */
export function locateCell(
  block: TableBlock,
  cellId: string,
): { rowIndex: number; cellIndex: number } | undefined {
  for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex += 1) {
    const cellIndex = block.rows[rowIndex].cells.findIndex((cell) => cell.id === cellId);
    if (cellIndex >= 0) return { rowIndex, cellIndex };
  }
  return undefined;
}

/**
 * Insert a blank row at `index` (clamped), pushing the rest down.
 *
 * A table that has lost all its columns is **repaired first**, so the insert widens every
 * row rather than adding a one-cell row above three empty ones — which would be ragged and
 * still invisible. Adding a row is a reasonable way to try to revive such a table, so it
 * had better work.
 */
export function insertRow(block: TableBlock, index: number): TableBlock {
  const base = restoreColumn(block);
  const at = Math.max(0, Math.min(index, base.rows.length));
  const rows = [...base.rows];
  rows.splice(at, 0, createTableRow(columnCountOf(base)));
  return { ...base, rows };
}

/**
 * Insert a blank column at `index`, padding short rows first.
 *
 * A row shorter than the insertion point would otherwise take the new cell at its own
 * end, which is a *different* column — so a merged table would grow a column that
 * zig-zags. Padding makes every row long enough for the index to mean the same thing.
 */
export function insertColumn(block: TableBlock, index: number): TableBlock {
  const width = columnCountOf(block);
  const at = Math.max(0, Math.min(index, width));
  return {
    ...block,
    rows: block.rows.map((row) => {
      const cells = [...row.cells];
      while (cells.length < width) cells.push(createTableCell());
      cells.splice(at, 0, createTableCell());
      return { ...row, cells };
    }),
  };
}

/**
 * Remove a row, keeping at least one.
 *
 * A table with no rows renders as nothing at all: still in the document, still in the
 * outline, invisible on the page — so the teacher's next move is to add another table
 * and the document accumulates ones nobody can see. The same floor `MIN_ANSWER_LINES`
 * exists for.
 */
export function removeRow(block: TableBlock, index: number): TableBlock {
  if (block.rows.length <= 1) return block;
  return { ...block, rows: block.rows.filter((_, i) => i !== index) };
}

/** Remove a column, keeping at least one. */
export function removeColumn(block: TableBlock, index: number): TableBlock {
  if (columnCountOf(block) <= 1) return block;
  return {
    ...block,
    rows: block.rows.map((row) => ({
      ...row,
      cells: row.cells.filter((_, i) => i !== index),
    })),
  };
}

/** Patch one cell, addressed by position. */
export function patchCell(
  block: TableBlock,
  rowIndex: number,
  cellIndex: number,
  patch: Partial<TableCell>,
): TableBlock {
  return {
    ...block,
    rows: block.rows.map((row, r) =>
      r !== rowIndex
        ? row
        : {
            ...row,
            cells: row.cells.map((cell, c) => (c === cellIndex ? { ...cell, ...patch } : cell)),
          },
    ),
  };
}

/**
 * Merge a cell with its right-hand neighbour by growing `colSpan`.
 *
 * The absorbed neighbour is flagged `covered` rather than deleted, which is what the
 * exporter's `gridSpan`/`vMerge` logic expects: Word needs the grid to stay rectangular,
 * so a covered cell still occupies a slot even when it emits nothing.
 */
export function mergeRight(block: TableBlock, rowIndex: number, cellIndex: number): TableBlock {
  const source = block.rows[rowIndex]?.cells[cellIndex];
  const neighbour = block.rows[rowIndex]?.cells[cellIndex + 1];
  // A covered cell is not a merge *source* either: it prints nothing, so growing its
  // span would silently consume the cell beyond it into something invisible.
  if (!source || source.covered || !neighbour || neighbour.covered) return block;
  return {
    ...block,
    rows: block.rows.map((row, r) =>
      r !== rowIndex
        ? row
        : {
            ...row,
            cells: row.cells.map((cell, c) => {
              if (c === cellIndex) {
                return { ...cell, colSpan: (cell.colSpan ?? 1) + (neighbour.colSpan ?? 1) };
              }
              if (c === cellIndex + 1) return { ...cell, covered: true };
              return cell;
            }),
          },
    ),
  };
}

/** Merge a cell with the one below it by growing `rowSpan`. */
export function mergeDown(block: TableBlock, rowIndex: number, cellIndex: number): TableBlock {
  const source = block.rows[rowIndex]?.cells[cellIndex];
  const below = block.rows[rowIndex + 1]?.cells[cellIndex];
  if (!source || source.covered || !below || below.covered) return block;
  return {
    ...block,
    rows: block.rows.map((row, r) => {
      if (r === rowIndex) {
        return {
          ...row,
          cells: row.cells.map((cell, c) =>
            c === cellIndex
              ? { ...cell, rowSpan: (cell.rowSpan ?? 1) + (below.rowSpan ?? 1) }
              : cell,
          ),
        };
      }
      if (r === rowIndex + 1) {
        return {
          ...row,
          cells: row.cells.map((cell, c) => (c === cellIndex ? { ...cell, covered: true } : cell)),
        };
      }
      return row;
    }),
  };
}

/** Undo a merge: reset the spans and reveal whatever the cell was covering. */
export function unmerge(block: TableBlock, rowIndex: number, cellIndex: number): TableBlock {
  const cell = block.rows[rowIndex]?.cells[cellIndex];
  if (!cell) return block;
  const colSpan = cell.colSpan ?? 1;
  const rowSpan = cell.rowSpan ?? 1;
  return {
    ...block,
    rows: block.rows.map((row, r) => ({
      ...row,
      cells: row.cells.map((c, ci) => {
        if (r === rowIndex && ci === cellIndex) return { ...c, colSpan: 1, rowSpan: 1 };
        const withinCols = r === rowIndex && ci > cellIndex && ci < cellIndex + colSpan;
        const withinRows = ci === cellIndex && r > rowIndex && r < rowIndex + rowSpan;
        if (withinCols || withinRows) return { ...c, covered: false };
        return c;
      }),
    })),
  };
}

/** Is this cell merged across either axis? */
export function isMerged(cell: TableCell): boolean {
  return (cell.colSpan ?? 1) > 1 || (cell.rowSpan ?? 1) > 1;
}

/**
 * The cell a Tab from `cellId` should land on, or undefined at the very end.
 *
 * Word's rule, because a teacher filling a 13-row table types across and down without
 * reaching for the mouse: Tab moves to the next cell in the row, then wraps to the start
 * of the next row. Covered cells are skipped — they are not editable positions, and
 * landing in one would silently write into a cell that prints nothing.
 *
 * Returning undefined at the end is the signal to **add a row**, which is also Word's
 * behaviour and the reason a table never needs sizing up front.
 */
export function nextCell(
  block: TableBlock,
  cellId: string,
  direction: 1 | -1 = 1,
): string | undefined {
  const flat = block.rows.flatMap((row) => row.cells.filter((cell) => !cell.covered));
  const at = flat.findIndex((cell) => cell.id === cellId);
  if (at < 0) return undefined;
  return flat[at + direction]?.id;
}
