import { describe, expect, it } from 'vitest';
import { createTableBlock } from './factories';
import {
  columnCountOf,
  insertColumn,
  insertRow,
  isMerged,
  locateCell,
  mergeDown,
  mergeRight,
  nextCell,
  patchCell,
  removeColumn,
  removeRow,
  spannedColumnCount,
  unmerge,
} from './table';

/**
 * Table structure, the shape a real paper needs.
 *
 * The sizes here are the reference papers': the GDP table is 13×2, the cost-output table
 * 8×2, and the distribution table 4×3 with an empty top-left corner. They are the cases
 * the old fixed 3×3 insert and the `headerRowCount` row model both failed.
 */

const shape = (block: ReturnType<typeof createTableBlock>) =>
  block.rows.map((row) => row.cells.length);

describe('rows and columns', () => {
  it('creates the sizes the reference papers use', () => {
    expect(shape(createTableBlock(13, 2))).toEqual(Array(13).fill(2));
    expect(shape(createTableBlock(8, 2))).toEqual(Array(8).fill(2));
    expect(shape(createTableBlock(4, 3))).toEqual(Array(4).fill(3));
  });

  it('inserts a row above and below a position', () => {
    const block = createTableBlock(2, 2);
    const firstRowId = block.rows[0].id;

    expect(insertRow(block, 0).rows[1].id).toBe(firstRowId);
    expect(insertRow(block, 1).rows[0].id).toBe(firstRowId);
    expect(insertRow(block, 0).rows).toHaveLength(3);
  });

  it('gives a new row as many cells as the widest existing row', () => {
    // A row short of the others would leave the table ragged and shift every cell in it.
    const block = insertColumn(createTableBlock(2, 2), 2);
    expect(shape(insertRow(block, 0))).toEqual([3, 3, 3]);
  });

  it('inserts a column at a position on every row', () => {
    const block = insertColumn(createTableBlock(3, 2), 1);
    expect(shape(block)).toEqual([3, 3, 3]);
  });

  it('pads short rows before inserting a column, so the column stays straight', () => {
    // A ragged table is real: merging leaves rows holding different cell counts. Without
    // padding, the new cell lands at a short row's own end — a different column.
    const ragged = createTableBlock(2, 3);
    ragged.rows[1].cells = ragged.rows[1].cells.slice(0, 1);

    const grown = insertColumn(ragged, 2);
    expect(shape(grown)).toEqual([4, 4]);
  });

  it('keeps a floor of one row and one column', () => {
    // A table with no rows renders as absence: still in the document, invisible on the
    // page, so the teacher adds another and the document accumulates ones nobody sees.
    const single = createTableBlock(1, 1);
    expect(removeRow(single, 0).rows).toHaveLength(1);
    expect(columnCountOf(removeColumn(single, 0))).toBe(1);
  });

  it('removes an interior row and column', () => {
    const block = createTableBlock(3, 3);
    const keep = block.rows[2].id;
    expect(removeRow(block, 1).rows.map((row) => row.id)).toContain(keep);
    expect(shape(removeColumn(block, 1))).toEqual([2, 2, 2]);
  });
});

describe('locating a cell', () => {
  it('finds a cell by id', () => {
    const block = createTableBlock(3, 3);
    const target = block.rows[2].cells[1];
    expect(locateCell(block, target.id)).toEqual({ rowIndex: 2, cellIndex: 1 });
  });

  it('returns undefined for a cell the table no longer holds', () => {
    // This is the stale-active-cell case: the sidebar must fall back to whole-table
    // controls rather than acting on a position that has been deleted.
    const block = createTableBlock(2, 2);
    const removed = block.rows[0].cells[0].id;
    expect(locateCell(removeRow(block, 0), removed)).toBeUndefined();
  });
});

describe('merging', () => {
  it('merges right by spanning and covering the neighbour', () => {
    // `covered` rather than deleted: Word needs the grid to stay rectangular, so the
    // absorbed cell keeps its slot while emitting nothing.
    const merged = mergeRight(createTableBlock(2, 3), 0, 0);
    expect(merged.rows[0].cells[0].colSpan).toBe(2);
    expect(merged.rows[0].cells[1].covered).toBe(true);
    expect(merged.rows[0].cells).toHaveLength(3);
  });

  it('merges down by spanning and covering the cell below', () => {
    const merged = mergeDown(createTableBlock(3, 2), 0, 0);
    expect(merged.rows[0].cells[0].rowSpan).toBe(2);
    expect(merged.rows[1].cells[0].covered).toBe(true);
  });

  it('refuses to merge into a cell already covered', () => {
    const once = mergeRight(createTableBlock(2, 3), 0, 0);
    // Cell 1 is covered, so merging cell 1 rightward must not consume cell 2.
    expect(mergeRight(once, 0, 1)).toBe(once);
  });

  it('does nothing at the edge, rather than growing a span off the table', () => {
    const block = createTableBlock(2, 2);
    expect(mergeRight(block, 0, 1)).toBe(block);
    expect(mergeDown(block, 1, 0)).toBe(block);
  });

  it('unmerges, revealing what was covered', () => {
    const merged = mergeRight(createTableBlock(2, 3), 0, 0);
    const split = unmerge(merged, 0, 0);
    expect(split.rows[0].cells[0].colSpan).toBe(1);
    expect(split.rows[0].cells[1].covered).toBe(false);
  });

  it('reports whether a cell is merged, on either axis', () => {
    const block = createTableBlock(2, 2);
    expect(isMerged(block.rows[0].cells[0])).toBe(false);
    expect(isMerged(mergeRight(block, 0, 0).rows[0].cells[0])).toBe(true);
    expect(isMerged(mergeDown(block, 0, 0).rows[0].cells[0])).toBe(true);
  });

  it('counts spanned columns, so a merge does not look like a narrower table', () => {
    const merged = mergeRight(createTableBlock(2, 3), 0, 0);
    // Three cell objects on the row, three visual columns — the merge spans two of them.
    expect(spannedColumnCount(merged)).toBe(3);
  });
});

describe('patching a cell', () => {
  it('writes one cell and leaves its neighbours alone', () => {
    const block = createTableBlock(2, 2);
    const patched = patchCell(block, 1, 1, { align: 'right' });
    expect(patched.rows[1].cells[1].align).toBe('right');
    expect(patched.rows[1].cells[0].align).toBeUndefined();
    expect(patched.rows[0]).toBe(block.rows[0]);
  });
});

describe('Tab order', () => {
  it('walks across the row, then wraps to the next', () => {
    const block = createTableBlock(2, 2);
    const [a, b] = block.rows[0].cells;
    const [c] = block.rows[1].cells;

    expect(nextCell(block, a.id)).toBe(b.id);
    // Wrapping is what makes a 13-row table fillable without the mouse.
    expect(nextCell(block, b.id)).toBe(c.id);
  });

  it('walks backwards for Shift+Tab', () => {
    const block = createTableBlock(2, 2);
    const [a, b] = block.rows[0].cells;
    expect(nextCell(block, b.id, -1)).toBe(a.id);
  });

  it('skips covered cells, which print nothing', () => {
    // Landing in a covered cell would write text that never appears on the page.
    const merged = mergeRight(createTableBlock(1, 3), 0, 0);
    const [first, , third] = merged.rows[0].cells;
    expect(nextCell(merged, first.id)).toBe(third.id);
  });

  it('reports no next cell at the end, which is the signal to add a row', () => {
    const block = createTableBlock(2, 2);
    const last = block.rows[1].cells[1];
    expect(nextCell(block, last.id)).toBeUndefined();
    expect(nextCell(block, block.rows[0].cells[0].id, -1)).toBeUndefined();
  });
});
