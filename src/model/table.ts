import { createTableCell, createTableRow } from './factories';
import { QUESTION_LIST_INDENTS } from './numbering';
import type { CellPadding, TableAlign, TableBlock, TableCell } from './types';

/**
 * Table structure verbs, as pure functions — two surfaces (sidebar panel, on-page
 * controls) perform the same edits. No "header row" concept (no HKDSE table has one;
 * emphasis is per-cell formatting). **Ragged rows are real**: merges leave rows with
 * different cell counts, so nothing may assume `rows[0].cells.length` is the width —
 * functions that add cells pad to the widest row.
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
  const grown: TableBlock = {
    ...block,
    rows: block.rows.map((row) => {
      const cells = [...row.cells];
      while (cells.length < width) cells.push(createTableCell());
      cells.splice(at, 0, createTableCell());
      return { ...row, cells };
    }),
    // Per-column padding is addressed by index, so it has to shift with the insert or
    // every column past the new one would inherit its neighbour's padding.
    columnPadding: block.columnPadding
      ? (() => {
          const next = [...block.columnPadding];
          next.splice(at, 0, undefined);
          return next;
        })()
      : undefined,
  };
  return syncColumnWidths(grown, block.columnWidths, width, at, 'insert');
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
  const width = columnCountOf(block);
  if (width <= 1) return block;
  const shrunk: TableBlock = {
    ...block,
    rows: block.rows.map((row) => ({
      ...row,
      cells: row.cells.filter((_, i) => i !== index),
    })),
    columnPadding: block.columnPadding
      ? block.columnPadding.filter((_, i) => i !== index)
      : undefined,
  };
  return syncColumnWidths(shrunk, block.columnWidths, width, index, 'remove');
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

/* ------------------------------------------------------- multi-cell ranges */

/**
 * The structural shape a range needs — shared by `TableCell` (the model) and the IR's
 * `TableNodeCell`, so the page can highlight the identical range the panel acts on
 * without either importing the other's full type.
 */
export interface RangeCellShape {
  covered?: boolean;
  colSpan?: number;
  rowSpan?: number;
}

/** A cell's rectangle in grid coordinates, inclusive on both ends. */
export interface CellRect {
  rowIndex: number;
  cellIndex: number;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/**
 * Where every printing cell sits on the grid.
 *
 * This is the **browser's own placement algorithm** (which is also Word's, via
 * `w:gridSpan`/`vMerge`): a `rowSpan` from above occupies its columns in the rows it
 * spans, pushing later cells right, and a covered placeholder occupies nothing — the
 * preview renders it as `null`, so a range computed any other way would highlight cells
 * the eye places elsewhere. `resolveCellEdges` keeps its simpler per-row accumulation
 * because the T-account it serves never merges vertically; this one must handle both
 * axes, since a range is dragged over whatever the table holds.
 */
export function cellRects(rows: RangeCellShape[][]): CellRect[] {
  const rects: CellRect[] = [];
  // Per grid column, how many further rows a rowSpan from above still occupies.
  const occupied: number[] = [];
  rows.forEach((row, rowIndex) => {
    let column = 0;
    row.forEach((cell, cellIndex) => {
      if (cell.covered) return;
      while ((occupied[column] ?? 0) > 0) column += 1;
      const colSpan = cell.colSpan ?? 1;
      const rowSpan = cell.rowSpan ?? 1;
      rects.push({
        rowIndex,
        cellIndex,
        r0: rowIndex,
        c0: column,
        r1: rowIndex + rowSpan - 1,
        c1: column + colSpan - 1,
      });
      for (let i = column; i < column + colSpan; i += 1) {
        occupied[i] = Math.max(occupied[i] ?? 0, rowSpan);
      }
      column += colSpan;
    });
    for (let i = 0; i < occupied.length; i += 1) {
      if (occupied[i] > 0) occupied[i] -= 1;
    }
  });
  return rects;
}

/**
 * The cells inside the rectangle spanned by two cells — Excel's drag selection.
 *
 * The rectangle **expands until it contains every merged cell it touches**, iterating
 * to a fixed point exactly as Excel does: a range that sliced a merged cell in half
 * would highlight a non-rectangular region and act on cells the highlight does not
 * show. Order of anchor and focus is immaterial (a drag can travel up-left), and either
 * id missing — a stale selection after the row it named was deleted — returns nothing
 * rather than a guess.
 */
export function cellsInRange(
  rows: RangeCellShape[][],
  anchorId: string,
  focusId: string,
  idOf: (cell: RangeCellShape, rowIndex: number, cellIndex: number) => string | undefined,
): CellRect[] {
  const rects = cellRects(rows);
  const withIds = rects.map((rect) => ({
    rect,
    id: idOf(rows[rect.rowIndex][rect.cellIndex], rect.rowIndex, rect.cellIndex),
  }));
  const anchor = withIds.find((entry) => entry.id === anchorId)?.rect;
  const focus = withIds.find((entry) => entry.id === focusId)?.rect;
  if (!anchor || !focus) return [];

  let r0 = Math.min(anchor.r0, focus.r0);
  let c0 = Math.min(anchor.c0, focus.c0);
  let r1 = Math.max(anchor.r1, focus.r1);
  let c1 = Math.max(anchor.c1, focus.c1);

  // Grow over any merged cell the rectangle cuts through, until nothing sticks out.
  let grew = true;
  while (grew) {
    grew = false;
    for (const { rect } of withIds) {
      const touches = rect.r1 >= r0 && rect.r0 <= r1 && rect.c1 >= c0 && rect.c0 <= c1;
      if (!touches) continue;
      if (rect.r0 < r0 || rect.c0 < c0 || rect.r1 > r1 || rect.c1 > c1) {
        r0 = Math.min(r0, rect.r0);
        c0 = Math.min(c0, rect.c0);
        r1 = Math.max(r1, rect.r1);
        c1 = Math.max(c1, rect.c1);
        grew = true;
      }
    }
  }

  return rects.filter(
    (rect) => rect.r1 >= r0 && rect.r0 <= r1 && rect.c1 >= c0 && rect.c0 <= c1,
  );
}

/** Patch every cell in a list of positions — the range's bulk edit, one commit. */
export function patchCells(
  block: TableBlock,
  positions: ReadonlyArray<{ rowIndex: number; cellIndex: number }>,
  patch: Partial<TableCell>,
): TableBlock {
  return positions.reduce(
    (current, position) => patchCell(current, position.rowIndex, position.cellIndex, patch),
    block,
  );
}

/* ------------------------------------------------------------------ padding */

/**
 * What a cell is padded by when nothing overrides it.
 *
 * These are the exact numbers `w:tblCellMar` carried in `styles.ts` before padding was
 * settable, so a table nobody has touched exports byte-identically — the same rule
 * `TextFormat` follows for named styles. The left/right pair is wider than the top/bottom
 * because that is Word's own default proportion, and it is what the reference papers show:
 * text sits well clear of the vertical rules while the rows stay compact.
 */
export const DEFAULT_CELL_PADDING: Required<CellPadding> = {
  top: 60,
  right: 108,
  bottom: 60,
  left: 108,
};

/** The widest padding a teacher can dial in, per edge — about 1.3 cm. */
export const MAX_CELL_PADDING_TWIPS = 720;

export type PaddingScope = 'cell' | 'row' | 'column' | 'table';

/**
 * The padding in effect on one cell, resolved **per edge**, precedence cell → column
 * → row → table → default (the narrower statement wins). Resolved here because Word
 * has no row/column margin — every backend must read the same winner.
 */
export function resolveCellPadding(
  block: TableBlock,
  rowIndex: number,
  cellIndex: number,
): Required<CellPadding> {
  const levels = [
    block.rows[rowIndex]?.cells[cellIndex]?.padding,
    block.columnPadding?.[cellIndex],
    block.rows[rowIndex]?.cellPadding,
    block.cellPadding,
  ];

  const edge = (side: keyof CellPadding): number => {
    // `?? undefined` per level, not a truthiness test: 0 is a padding a teacher can
    // choose, and treating it as absent would make "tighten to the border" fall through
    // to whatever the level above says.
    for (const level of levels) {
      const value = level?.[side];
      if (value !== undefined) return value;
    }
    return DEFAULT_CELL_PADDING[side];
  };

  return { top: edge('top'), right: edge('right'), bottom: edge('bottom'), left: edge('left') };
}

/** The padding stored at one level, before resolution — what the panel shows as set. */
export function paddingAt(
  block: TableBlock,
  scope: PaddingScope,
  at: { rowIndex: number; cellIndex: number },
): CellPadding | undefined {
  if (scope === 'cell') return block.rows[at.rowIndex]?.cells[at.cellIndex]?.padding;
  if (scope === 'row') return block.rows[at.rowIndex]?.cellPadding;
  if (scope === 'column') return block.columnPadding?.[at.cellIndex];
  return block.cellPadding;
}

/**
 * Write padding at one level, dropping the record once it says nothing.
 *
 * An edge set to `undefined` in the patch **clears** it back to inheritance, mirroring
 * `applyFormatTarget`: without that, the only way back from a padding you regret would be
 * to retype the default, which pins the value and stops it tracking a later table-level
 * change. An empty object is deleted entirely so a reset leaves no husk in the saved file.
 */
export function setPadding(
  block: TableBlock,
  scope: PaddingScope,
  at: { rowIndex: number; cellIndex: number },
  patch: CellPadding,
): TableBlock {
  const merge = (current: CellPadding | undefined): CellPadding | undefined => {
    const next: CellPadding = { ...current, ...patch };
    for (const key of Object.keys(next) as Array<keyof CellPadding>) {
      if (next[key] === undefined) delete next[key];
    }
    return Object.keys(next).length > 0 ? next : undefined;
  };

  if (scope === 'table') return { ...block, cellPadding: merge(block.cellPadding) };

  if (scope === 'row') {
    return {
      ...block,
      rows: block.rows.map((row, r) =>
        r === at.rowIndex ? { ...row, cellPadding: merge(row.cellPadding) } : row,
      ),
    };
  }

  if (scope === 'column') {
    // Padded out to the column being written, so index `n` stays column `n`; the holes
    // are genuinely "says nothing" and resolve through to the row.
    const width = Math.max(columnCountOf(block), at.cellIndex + 1);
    const columnPadding = Array.from({ length: width }, (_, i) =>
      i === at.cellIndex ? merge(block.columnPadding?.[i]) : block.columnPadding?.[i],
    );
    return {
      ...block,
      columnPadding: columnPadding.some((entry) => entry !== undefined)
        ? columnPadding
        : undefined,
    };
  }

  return patchCell(block, at.rowIndex, at.cellIndex, {
    padding: merge(block.rows[at.rowIndex]?.cells[at.cellIndex]?.padding),
  });
}

/* ------------------------------------------------------------ column widths */

/** No column may be dragged narrower than this fraction of the content width. */
export const MIN_COLUMN_FRACTION = 0.04;

/**
 * Column widths as fractions summing to 1, for a table of `count` columns.
 *
 * Undefined, short, long or malformed stored widths all resolve to something usable
 * rather than throwing: a table is a thing a teacher is looking at, and a saved document
 * whose widths disagree with its column count (a column added by an older build, a hand-
 * edited file) must still render. Equal columns are the fallback, which is what every
 * table did before widths existed.
 */
export function resolveColumnWidths(block: TableBlock, count: number): number[] {
  const equal = () => Array.from({ length: count }, () => 1 / Math.max(1, count));
  const stored = block.columnWidths;
  if (!stored || stored.length !== count) return equal();

  const clean = stored.map((value) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0,
  );
  const total = clean.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return equal();

  // Normalised rather than trusted: widths are stored as fractions of the content width,
  // and a rounding drift across a dozen drags would otherwise leave the table narrower
  // than the column or spilling past it.
  return clean.map((value) => value / total);
}

/**
 * Which edges each cell of a `headerRule` table draws — the T-account: frame, one
 * rule under the top row, one down the middle, everything else explicitly off.
 * Resolved from **grid** position (spans occupy multiple columns), not cell index.
 * An odd column count has no midpoint, so the divider is omitted.
 */
export function resolveCellEdges(
  block: TableBlock,
  rowIndex: number,
  cellIndex: number,
  columnCount = spannedColumnCount(block),
): { top: boolean; left: boolean; bottom: boolean; right: boolean } {
  const rows = block.rows;
  const row = rows[rowIndex]?.cells ?? [];

  /*
   * A covered cell occupies **no** grid column of its own: the span that covers it has
   * already counted the column, so adding 1 for it counts the same column twice and
   * every cell after it in the row resolves one place too far right. On the balance
   * sheet that put the "Liabilities" header at grid columns 3–5 of a 4-column table, so
   * neither the divider nor the frame's right edge was drawn on it — the header row
   * simply lost its outer rules while every un-spanned row looked correct.
   *
   * This is `spannedColumnCount`'s own rule, applied per cell.
   */
  let start = 0;
  for (let i = 0; i < cellIndex; i += 1) {
    const previous = rows[rowIndex]?.cells[i];
    if (!previous || previous.covered) continue;
    start += previous.colSpan ?? 1;
  }
  const span = row[cellIndex]?.colSpan ?? 1;
  const end = start + span;

  const middle = columnCount % 2 === 0 ? columnCount / 2 : -1;

  return {
    // The frame's top edge, and the header rule is drawn as the *bottom* of row 0 (as
    // the reference draws it) rather than the top of row 1 — one rule, one owner.
    top: rowIndex === 0,
    left: start === 0 || start === middle,
    bottom: rowIndex === 0 || rowIndex === rows.length - 1,
    right: end === columnCount || end === middle,
  };
}

/**
 * Move the boundary between column `index` and the one after it by `delta` (a fraction).
 *
 * Only the two columns either side change, so dragging one border never reflows the whole
 * table — the pointer stays on the edge it grabbed. Both are floored at
 * `MIN_COLUMN_FRACTION`, since a zero-width column is unclickable and cannot be dragged
 * back out.
 */
export function resizeColumn(
  block: TableBlock,
  index: number,
  delta: number,
  count = spannedColumnCount(block),
): TableBlock {
  const widths = resolveColumnWidths(block, count);
  if (index < 0 || index + 1 >= widths.length) return block;

  const pair = widths[index] + widths[index + 1];
  const left = Math.min(
    Math.max(widths[index] + delta, MIN_COLUMN_FRACTION),
    pair - MIN_COLUMN_FRACTION,
  );

  const next = [...widths];
  next[index] = left;
  next[index + 1] = pair - left;
  return { ...block, columnWidths: next };
}

/* ------------------------------------------------- the table's own box */

/** A table may not be dragged narrower than this fraction of the content width. */
export const MIN_TABLE_FRACTION = 0.15;

/**
 * Where a table's left edge sits when nobody has moved it.
 *
 * A table belongs to a question, and a question's text starts at
 * `QUESTION_LIST_INDENTS[0].left` — the stem column, with only the `1.` out in the
 * margin. A table flush at 0 therefore started a step *left* of the sentence introducing
 * it, hanging in the number's gutter, which is not what any reference table does: all six
 * indented tables in `DBS_Assessment1.docx` carry a `w:tblInd`.
 *
 * Derived from the list geometry rather than typed as its own number, so a table follows
 * the stem if that staircase ever moves. Expressed as a fraction of the content width
 * because that is the unit `indent` stores (§columns are fractions).
 */
export const DEFAULT_TABLE_INDENT_TWIPS = QUESTION_LIST_INDENTS[0].left;

/** The default indent as a fraction of the content width the table is placed in. */
export const defaultTableIndent = (contentWidthTwips: number) =>
  contentWidthTwips > 0 ? DEFAULT_TABLE_INDENT_TWIPS / contentWidthTwips : 0;

/** How the table sits in the column; `left` means "placed by `indent`". */
export function resolveTableAlign(block: TableBlock): TableAlign {
  return block.align === 'center' || block.align === 'right' ? block.align : 'left';
}

/**
 * How much of the content width the table spans, and where its left edge sits.
 *
 * `indent` is only meaningful under `align: 'left'`. Word places a centred or right
 * aligned table from the column's edges and ignores `w:tblInd` entirely, so reporting a
 * non-zero indent for one would let the preview offset a table the `.docx` does not.
 */
export function resolveTableBox(block: TableBlock): {
  width: number;
  indent: number;
  align: TableAlign;
} {
  const align = resolveTableAlign(block);
  const indent =
    align === 'left' &&
    typeof block.indent === 'number' &&
    Number.isFinite(block.indent) &&
    block.indent > 0
      ? Math.max(0, Math.min(block.indent, 1 - MIN_TABLE_FRACTION))
      : 0;

  /*
   * No stored width means "as wide as there is room for", which is `1 - indent` — not 1.
   *
   * This is the order the two have to resolve in, and getting it the other way round is
   * silent: the clamp below is `min(indent, 1 - width)`, so a width of 1 annihilated the
   * indent of any table nobody had dragged. A default-indented table therefore stored
   * 360tw, resolved to 0, and printed flush in the question number's gutter — the model
   * was right and only the render disagreed, so nothing about the stored file looked wrong.
   *
   * An explicit width is still honoured as-is: that one was dragged, and `resizeTableEdge`
   * already keeps the pair inside the page.
   */
  const width =
    typeof block.width === 'number' && Number.isFinite(block.width) && block.width > 0
      ? Math.min(1, block.width)
      : 1 - indent;

  // Clamped as a pair: a stored indent that would push a table off the page is a file that
  // has to render anyway, and the right edge is the one that must hold.
  return { width, indent: Math.max(0, Math.min(indent, 1 - width)), align };
}

/**
 * Choose how the table sits in the column.
 *
 * Centring drops `indent`, because the two are alternative answers to "where is the left
 * edge" and Word honours only `w:jc` once it is set — a kept indent would be a stored
 * value with no effect, which reappears the moment the table is dragged back to `left`
 * and reads as the drag having remembered something it should not have.
 */
export function setTableAlign(block: TableBlock, align: TableAlign): TableBlock {
  if (align === 'left') return { ...block, align: undefined };
  return { ...block, align, indent: undefined };
}

/**
 * Drag one of the table's **outer** edges, resizing it as a whole.
 *
 * Word's behaviour, and the one that reproduces the reference distribution table: the
 * table narrows or widens as a unit and every column keeps its share, because
 * `columnWidths` are fractions of the *table*, not of the page. Nothing about the columns
 * is touched here at all.
 *
 * The two edges differ in what they mean. Pulling the **right** edge moves only the width;
 * pulling the **left** edge moves the width and the indent together, since the right edge
 * has to stay where it is — otherwise dragging the left edge would slide the whole table
 * sideways rather than resize it.
 */
export function resizeTableEdge(
  block: TableBlock,
  edge: 'left' | 'right',
  delta: number,
): TableBlock {
  const { width, indent } = resolveTableBox(block);

  if (edge === 'right') {
    // Floored at the minimum and capped at what is left of the page beyond the indent.
    const next = Math.min(Math.max(width + delta, MIN_TABLE_FRACTION), 1 - indent);
    return { ...block, width: next >= 1 ? undefined : next, indent: indent || undefined };
  }

  const right = indent + width;
  const nextIndent = Math.min(Math.max(indent + delta, 0), right - MIN_TABLE_FRACTION);
  const nextWidth = right - nextIndent;
  return {
    ...block,
    // Dropped rather than stored when they mean "full width, flush left", so an untouched
    // table carries no record and exports exactly as it did before edges could be dragged.
    width: nextWidth >= 1 ? undefined : nextWidth,
    indent: nextIndent > 0 ? nextIndent : undefined,
    // Placing the left edge by hand *is* choosing an indent, so it takes the table off
    // centre rather than storing an indent Word would then ignore. Without this the drag
    // appeared to do nothing on a centred table: the value changed and nothing moved.
    align: undefined,
  };
}

/* --------------------------------------------------------- row heights */

/** Rows have a floor of one 12pt line; below that a row cannot be clicked back open. */
export const MIN_ROW_HEIGHT_TWIPS = 240;
export const MAX_ROW_HEIGHT_TWIPS = 5000;

/**
 * Set a floor on one row's height, or clear it.
 *
 * A *floor*, not a fixed size (`hRule="atLeast"`): a row whose content needs more space
 * still grows, so dragging a row taller can never hide text typed into it later. Passing
 * `undefined` clears the override, which is what returns the row to being sized purely by
 * its content.
 */
export function setRowHeight(
  block: TableBlock,
  rowIndex: number,
  twips: number | undefined,
): TableBlock {
  return {
    ...block,
    rows: block.rows.map((row, r) => {
      if (r !== rowIndex) return row;
      if (twips === undefined) {
        const { minHeight: _drop, ...rest } = row;
        return rest;
      }
      return {
        ...row,
        minHeight: Math.min(MAX_ROW_HEIGHT_TWIPS, Math.max(MIN_ROW_HEIGHT_TWIPS, Math.round(twips))),
      };
    }),
  };
}

/**
 * Keep stored widths in step with a column count that just changed.
 *
 * Called after `insertColumn`/`removeColumn`, which know nothing about widths. Dropping
 * the array whenever the count changes would be simpler and wrong: deleting the last
 * column of a carefully sized table would throw away every other width with it.
 */
export function syncColumnWidths(
  block: TableBlock,
  previous: number[] | undefined,
  previousCount: number,
  index: number,
  change: 'insert' | 'remove',
): TableBlock {
  if (!previous || previous.length !== previousCount) return block;

  if (change === 'insert') {
    // The new column takes an equal share and the rest keep their proportions, so an
    // insert widens the table's grid without redistributing what was already set.
    const share = 1 / (previousCount + 1);
    const next = previous.map((value) => value * (1 - share));
    next.splice(Math.max(0, Math.min(index, previousCount)), 0, share);
    return { ...block, columnWidths: next };
  }

  const next = previous.filter((_, i) => i !== index);
  if (next.length === 0) return { ...block, columnWidths: undefined };
  const total = next.reduce((sum, value) => sum + value, 0);
  // The removed column's width is shared out proportionally, which is what keeps the
  // remaining columns' relative sizes intact.
  return { ...block, columnWidths: total > 0 ? next.map((value) => value / total) : undefined };
}
