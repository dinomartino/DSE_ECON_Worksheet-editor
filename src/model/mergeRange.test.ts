import { describe, expect, it } from 'vitest';
import { createTableBlock } from './factories';
import { cellsInRange, mergeDown, mergeRange, mergeRight, stackCellTexts, unmerge } from './table';
import { bi, plain } from './text';
import type { TableBlock } from './types';

/**
 * Merge Cells over a swept range, as Word does (Tables vs Word, phase 2).
 *
 * The old merge took one neighbour at a time and hid the absorbed cell's text: a 2×2
 * merge was impossible, and "2024" merged with "2025" printed "2024" alone.
 */

/** A table whose cells read "r,c", so where each text went is plain to see. */
function labelled(rows: number, columns: number): TableBlock {
  const block = createTableBlock(rows, columns);
  block.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      cell.text = bi(`${r},${c}`, `${r}、${c}`);
    }),
  );
  return block;
}

const sweep = (block: TableBlock, from: [number, number], to: [number, number]) =>
  cellsInRange(
    block.rows.map((row) => row.cells),
    block.rows[from[0]].cells[from[1]].id,
    block.rows[to[0]].cells[to[1]].id,
    (_, r, c) => block.rows[r]?.cells[c]?.id,
  );

describe('merging a swept range', () => {
  it('merges a 2×2 block into its top-left cell', () => {
    const block = labelled(3, 3);
    const merged = mergeRange(block, sweep(block, [0, 0], [1, 1]));
    const source = merged.rows[0].cells[0];
    expect(source.colSpan).toBe(2);
    expect(source.rowSpan).toBe(2);
    expect(merged.rows[0].cells[1].covered).toBe(true);
    expect(merged.rows[1].cells[0].covered).toBe(true);
    expect(merged.rows[1].cells[1].covered).toBe(true);
    // Outside the block nothing moves.
    expect(merged.rows[0].cells[2].covered).toBeUndefined();
    expect(merged.rows[2].cells[0].covered).toBeUndefined();
  });

  it('keeps every cell’s text, one under the other in reading order', () => {
    const block = labelled(2, 2);
    const merged = mergeRange(block, sweep(block, [1, 1], [0, 0]));
    expect(plain(merged.rows[0].cells[0].text.en)).toBe('0,0\n0,1\n1,0\n1,1');
    expect(plain(merged.rows[0].cells[0].text.zh)).toBe('0、0\n0、1\n1、0\n1、1');
  });

  it('empties the cells it covers, so a split cannot print a line twice', () => {
    const block = labelled(2, 2);
    const merged = mergeRange(block, sweep(block, [0, 0], [1, 1]));
    for (const [r, c] of [[0, 1], [1, 0], [1, 1]] as const) {
      expect(plain(merged.rows[r].cells[c].text.en)).toBe('');
    }
    const split = unmerge(merged, 0, 0);
    expect(split.rows.flatMap((row) => row.cells).every((cell) => !cell.covered)).toBe(true);
    expect(plain(split.rows[0].cells[0].text.en)).toBe('0,0\n0,1\n1,0\n1,1');
  });

  it('adds no blank line for an empty cell', () => {
    const block = labelled(1, 3);
    block.rows[0].cells[1].text = bi('', '');
    const merged = mergeRange(block, sweep(block, [0, 0], [0, 2]));
    expect(plain(merged.rows[0].cells[0].text.en)).toBe('0,0\n0,2');
  });

  it('merges three across in one step, left to right', () => {
    const block = labelled(2, 3);
    const merged = mergeRange(block, sweep(block, [0, 0], [0, 2]));
    expect(merged.rows[0].cells[0].colSpan).toBe(3);
    expect(merged.rows[0].cells[0].rowSpan).toBe(1);
  });

  it('takes in an earlier merge it overlaps', () => {
    const block = labelled(2, 3);
    const once = mergeRange(block, sweep(block, [0, 0], [0, 1]));
    const twice = mergeRange(once, sweep(once, [0, 0], [1, 2]));
    expect(twice.rows[0].cells[0].colSpan).toBe(3);
    expect(twice.rows[0].cells[0].rowSpan).toBe(2);
    expect(plain(twice.rows[0].cells[0].text.en)).toBe('0,0\n0,1\n0,2\n1,0\n1,1\n1,2');
  });

  it('keeps a picture from a cell it absorbs', () => {
    const block = labelled(1, 2);
    const image = { src: 'data:image/png;base64,AA==', widthPx: 10, heightPx: 10, altText: bi('', '') };
    block.rows[0].cells[1].image = image;
    const merged = mergeRange(block, sweep(block, [0, 0], [0, 1]));
    expect(merged.rows[0].cells[0].image).toBe(image);
    expect(merged.rows[0].cells[1].image).toBeUndefined();
  });

  it('hands back the same block for a single cell', () => {
    const block = labelled(2, 2);
    expect(mergeRange(block, sweep(block, [0, 0], [0, 0]))).toBe(block);
  });
});

describe('the neighbour merges', () => {
  it('Merge → keeps the neighbour’s text', () => {
    const merged = mergeRight(labelled(1, 2), 0, 0);
    expect(plain(merged.rows[0].cells[0].text.en)).toBe('0,0\n0,1');
  });

  it('Merge → on a merged cell takes the next column too, not a covered slot', () => {
    const once = mergeRight(labelled(1, 3), 0, 0);
    const twice = mergeRight(once, 0, 0);
    expect(twice.rows[0].cells[0].colSpan).toBe(3);
  });

  it('Merge ↓ under a cell spanning two columns takes both cells below', () => {
    const wide = mergeRight(labelled(2, 2), 0, 0);
    const merged = mergeDown(wide, 0, 0);
    expect(merged.rows[0].cells[0].rowSpan).toBe(2);
    expect(merged.rows[1].cells.every((cell) => cell.covered)).toBe(true);
  });
});

describe('stacking texts', () => {
  it('joins with a hard break and drops empty sides', () => {
    const stacked = stackCellTexts([bi('A', ''), bi('', '乙'), bi('C', '丙')]);
    expect(plain(stacked.en)).toBe('A\nC');
    expect(plain(stacked.zh)).toBe('乙\n丙');
  });
});

describe('formatting a range of cells', () => {
  it('bolds every caught cell and un-bolds back to no override', async () => {
    const { formatCells } = await import('./table');
    const block = labelled(2, 2);
    const row = [{ rowIndex: 0, cellIndex: 0 }, { rowIndex: 0, cellIndex: 1 }];
    const bold = formatCells(block, row, { bold: true });
    expect(bold.rows[0].cells.map((cell) => cell.format?.bold)).toEqual([true, true]);
    expect(bold.rows[1].cells[0].format).toBeUndefined();
    const plainAgain = formatCells(bold, row, { bold: undefined });
    expect(plainAgain.rows[0].cells.every((cell) => !('format' in cell))).toBe(true);
  });

  it('reports only what every cell shares', async () => {
    const { commonCellFormat } = await import('./table');
    const block = labelled(1, 2);
    block.rows[0].cells[0].format = { bold: true, fontSize: 14 };
    block.rows[0].cells[1].format = { bold: true };
    expect(commonCellFormat(block.rows[0].cells)).toEqual({ bold: true });
  });
});

describe('an exact column width', () => {
  it('sets the column and keeps the others, the table growing or shrinking', async () => {
    const { columnWidthsTwips, setColumnWidthTwips } = await import('./table');
    const content = 9000;
    const block = { ...createTableBlock(1, 3), width: 0.6 };
    const before = columnWidthsTwips(block, content);
    expect(before.map(Math.round)).toEqual([1800, 1800, 1800]);
    const next = setColumnWidthTwips(block, [1], 2700, content);
    expect(columnWidthsTwips(next, content).map(Math.round)).toEqual([1800, 2700, 1800]);
  });

  it('cuts a width that will not fit to the room left on the page', async () => {
    const { columnWidthsTwips, setColumnWidthTwips } = await import('./table');
    const content = 9000;
    const block = { ...createTableBlock(1, 2), width: 0.5 };
    const next = setColumnWidthTwips(block, [0], 20000, content);
    expect(columnWidthsTwips(next, content).map(Math.round)).toEqual([6750, 2250]);
    // Full width again: nothing stored, as for a table nobody resized.
    expect(next.width).toBeUndefined();
  });
});
