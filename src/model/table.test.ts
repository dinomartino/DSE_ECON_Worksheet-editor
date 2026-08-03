import { describe, expect, it } from 'vitest';
import { createTableBlock } from './factories';
import { QUESTION_LIST_INDENTS } from './numbering';
import {
  columnCountOf,
  DEFAULT_CELL_PADDING,
  defaultTableIndent,
  insertColumn,
  insertRow,
  isDegenerate,
  isMerged,
  locateCell,
  mergeDown,
  mergeRight,
  MIN_COLUMN_FRACTION,
  MIN_ROW_HEIGHT_TWIPS,
  MIN_TABLE_FRACTION,
  nextCell,
  patchCell,
  removeColumn,
  removeRow,
  resizeColumn,
  resizeTableEdge,
  resolveCellPadding,
  resolveColumnWidths,
  resolveTableAlign,
  resolveTableBox,
  restoreColumn,
  setPadding,
  setRowHeight,
  setTableAlign,
  spannedColumnCount,
  unmerge,
} from './table';
import type { TableBlock } from './types';
import { cellsInRange, patchCells } from './table';
import { renderContentBlocks, type RenderNode } from '@/render/ir';

/** `renderContentBlocks` appends into the caller's stream; these tests start one fresh. */
const renderBlocks = (blocks: TableBlock[]): RenderNode[] => {
  const nodes: RenderNode[] = [];
  renderContentBlocks(nodes, blocks, 'Question Stem');
  return nodes;
};

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

/*
 * A table with rows but no cells in them.
 *
 * Found in a real saved document: the old panel's column ✕ had no floor, so clicking it
 * once per column emptied the table completely. It then printed nothing while the panel
 * still claimed it had a column — and every recovery route was built on that claim.
 */
describe('a table that lost all its columns', () => {
  const broken = (): TableBlock => ({
    kind: 'table',
    id: 't',
    rows: [
      { id: 'r1', cells: [] },
      { id: 'r2', cells: [] },
      { id: 'r3', cells: [] },
    ],
  });

  it('reports zero columns rather than flooring the count at one', () => {
    // The floor belongs in the mutators. A *measurement* that cannot return zero cannot
    // describe a table that needs repairing, and the panel printed "3 rows × 1 column"
    // over a table that rendered as nothing.
    expect(columnCountOf(broken())).toBe(0);
    expect(spannedColumnCount(broken())).toBe(0);
    expect(isDegenerate(broken())).toBe(true);
  });

  it('is not confused with an ordinary table', () => {
    expect(isDegenerate(createTableBlock(2, 2))).toBe(false);
    // No rows at all is a different thing, and not something the editor can produce.
    expect(isDegenerate({ kind: 'table', id: 't', rows: [] })).toBe(false);
  });

  it('restores one cell per row, uniformly', () => {
    expect(shape(restoreColumn(broken()))).toEqual([1, 1, 1]);
  });

  it('leaves a healthy table alone', () => {
    const healthy = createTableBlock(2, 3);
    expect(restoreColumn(healthy)).toBe(healthy);
  });

  it('recovers through "add column" without inventing a second one', () => {
    // The old count of 1 made `insertColumn` pad to the imaginary column and then insert,
    // so the first click produced *two* columns.
    expect(shape(insertColumn(broken(), 0))).toEqual([1, 1, 1]);
  });

  it('recovers through "add row" without leaving the table ragged', () => {
    // Previously the new row got one cell and the existing three kept none: [1,0,0,0].
    expect(shape(insertRow(broken(), 0))).toEqual([1, 1, 1, 1]);
  });

  it('emits no node at all from the render IR', () => {
    // The IR is where this must hold, not the preview: one node stream feeds the
    // paginator's off-screen probe, the real sheet, the .docx and the clipboard. An empty
    // <table> measured zero in the probe but spent a line on the sheet, so the two passes
    // disagreed about the document's height forever — the sheet count oscillated 1 ↔ 2
    // and React reported "Maximum update depth exceeded" from the item measurement.
    expect(renderBlocks([broken()])).toEqual([]);
    // A healthy table still renders; the guard must not widen into "any short table".
    expect(renderBlocks([createTableBlock(2, 2)]).map((n) => n.kind)).toEqual(['table']);
  });

  it('takes one blank line before it, carried inside the keep-together chain', () => {
    // The reference papers' shape: the stem's sentence, air, then the table it
    // introduces. The gap rides the caller's keepNext, or it is exactly where Word
    // breaks the chain the stem's own flag was set to hold.
    const nodes: RenderNode[] = [
      { kind: 'text', style: 'Question Stem', text: { en: [{ text: 'The table below.' }], zh: [] }, keepNext: true },
    ];
    renderContentBlocks(nodes, [createTableBlock(2, 2)], 'Question Stem', { keepNext: true });
    expect(nodes.map((n) => n.kind)).toEqual(['text', 'spacer', 'table']);
    expect(nodes[1]).toMatchObject({ kind: 'spacer', keepNext: true });
  });

  it('does not double the gap when the text above already ends in a blank line', () => {
    // A trailing hard break spends the line itself (§ pushGap); the table must count it.
    const nodes: RenderNode[] = [
      { kind: 'text', style: 'Question Stem', text: { en: [{ text: 'See below:\n' }], zh: [] } },
    ];
    renderContentBlocks(nodes, [createTableBlock(2, 2)], 'Question Stem');
    expect(nodes.map((n) => n.kind)).toEqual(['text', 'table']);
  });

  it('cannot be produced by removeColumn any more', () => {
    let block = createTableBlock(2, 3);
    for (let i = 0; i < 5; i += 1) block = removeColumn(block, 0);
    expect(columnCountOf(block)).toBe(1);
    expect(isDegenerate(block)).toBe(false);
  });
});

describe('cell padding', () => {
  const at = (rowIndex: number, cellIndex: number) => ({ rowIndex, cellIndex });

  it('falls back to the built-in default, which is what the .docx already wrote', () => {
    // These are the numbers `w:tblCellMar` carried before padding was settable. A table
    // nobody has touched must export byte-identically, the rule TextFormat follows.
    expect(resolveCellPadding(createTableBlock(2, 2), 0, 0)).toEqual(DEFAULT_CELL_PADDING);
  });

  it('resolves cell over column over row over table', () => {
    let block = createTableBlock(2, 2);
    block = setPadding(block, 'table', at(0, 0), { top: 10 });
    expect(resolveCellPadding(block, 1, 1).top).toBe(10);

    block = setPadding(block, 'row', at(1, 1), { top: 20 });
    expect(resolveCellPadding(block, 1, 1).top).toBe(20);
    // The other row still sees the table's value: a row speaks for itself alone.
    expect(resolveCellPadding(block, 0, 1).top).toBe(10);

    block = setPadding(block, 'column', at(1, 1), { top: 30 });
    expect(resolveCellPadding(block, 1, 1).top).toBe(30);

    block = setPadding(block, 'cell', at(1, 1), { top: 40 });
    expect(resolveCellPadding(block, 1, 1).top).toBe(40);
  });

  it('resolves each edge on its own, so two levels compose', () => {
    // An all-or-nothing object pick would let the column's left silently discard the
    // row's top, and the second setting a teacher made would appear to do nothing.
    let block = createTableBlock(2, 2);
    block = setPadding(block, 'row', at(0, 0), { top: 200 });
    block = setPadding(block, 'column', at(0, 0), { left: 300 });
    expect(resolveCellPadding(block, 0, 0)).toEqual({
      top: 200,
      left: 300,
      right: DEFAULT_CELL_PADDING.right,
      bottom: DEFAULT_CELL_PADDING.bottom,
    });
  });

  it('treats zero as a real value, not as absent', () => {
    // "Tighten this cell to the border" must not fall through to the table's roomier
    // setting, which is what a truthiness test would do.
    let block = createTableBlock(2, 2);
    block = setPadding(block, 'table', at(0, 0), { left: 400 });
    block = setPadding(block, 'cell', at(0, 0), { left: 0 });
    expect(resolveCellPadding(block, 0, 0).left).toBe(0);
  });

  it('clears back to inheritance and leaves no husk behind', () => {
    let block = createTableBlock(2, 2);
    block = setPadding(block, 'cell', at(0, 0), { top: 500 });
    block = setPadding(block, 'cell', at(0, 0), { top: undefined });
    expect(block.rows[0].cells[0].padding).toBeUndefined();
    expect(resolveCellPadding(block, 0, 0).top).toBe(DEFAULT_CELL_PADDING.top);
  });

  it('keeps per-column padding on its own column across an insert', () => {
    // Addressed by index, so without a shift every column past the new one would take
    // its neighbour's padding.
    let block = createTableBlock(2, 3);
    block = setPadding(block, 'column', at(0, 2), { left: 600 });
    block = insertColumn(block, 0);
    expect(resolveCellPadding(block, 0, 3).left).toBe(600);
    expect(resolveCellPadding(block, 0, 2).left).toBe(DEFAULT_CELL_PADDING.left);
  });
});

describe('column widths', () => {
  it('defaults to equal columns, as every table did before widths existed', () => {
    expect(resolveColumnWidths(createTableBlock(2, 4), 4)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });

  it('falls back rather than throwing when stored widths do not match the count', () => {
    // A saved document can disagree with itself: a column added by an older build, or a
    // hand-edited file. A table is a thing a teacher is looking at, so it must render.
    const block = { ...createTableBlock(2, 3), columnWidths: [0.5, 0.5] };
    expect(resolveColumnWidths(block, 3)).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it('normalises drifted widths back to the content width', () => {
    const block = { ...createTableBlock(2, 2), columnWidths: [0.3, 0.3] };
    expect(resolveColumnWidths(block, 2)).toEqual([0.5, 0.5]);
  });

  it('moves one boundary and leaves every other column alone', () => {
    const block = resizeColumn(createTableBlock(2, 4), 0, 0.1);
    const widths = resolveColumnWidths(block, 4);
    expect(widths[0]).toBeCloseTo(0.35);
    expect(widths[1]).toBeCloseTo(0.15);
    // The columns the drag did not touch keep their size, so the pointer stays on the
    // edge it grabbed instead of reflowing the whole table.
    expect(widths[2]).toBeCloseTo(0.25);
    expect(widths[3]).toBeCloseTo(0.25);
  });

  it('floors both sides so a column cannot be dragged out of existence', () => {
    const block = resizeColumn(createTableBlock(2, 2), 0, 5);
    const widths = resolveColumnWidths(block, 2);
    expect(widths[1]).toBeCloseTo(MIN_COLUMN_FRACTION);
    expect(widths[0] + widths[1]).toBeCloseTo(1);
  });

  it('reproduces the reference cost-output table: one wide label column', () => {
    // table1.png: the label column is roughly three times a data column, which equal
    // columns cannot express — the reason widths exist at all.
    let block = createTableBlock(2, 8);
    block = { ...block, columnWidths: [0.3, ...Array(7).fill(0.1)] };
    const widths = resolveColumnWidths(block, 8);
    expect(widths[0]).toBeCloseTo(0.3);
    expect(widths[1]).toBeCloseTo(0.1);
  });

  it('keeps the remaining columns proportional when one is removed', () => {
    // Dropping the whole array would be simpler and would throw away every other width
    // because one column was deleted.
    let block = createTableBlock(2, 3);
    block = { ...block, columnWidths: [0.5, 0.25, 0.25] };
    const widths = resolveColumnWidths(removeColumn(block, 2), 2);
    expect(widths[0]).toBeCloseTo(2 / 3);
    expect(widths[1]).toBeCloseTo(1 / 3);
  });

  it('gives an inserted column an equal share without redistributing the rest', () => {
    let block = createTableBlock(2, 2);
    block = { ...block, columnWidths: [0.8, 0.2] };
    const widths = resolveColumnWidths(insertColumn(block, 2), 3);
    expect(widths[2]).toBeCloseTo(1 / 3);
    // 0.8 : 0.2 preserved in what is left over.
    expect(widths[0] / widths[1]).toBeCloseTo(4);
  });
});

describe('the table’s own box', () => {
  it('spans the whole content width until an edge is dragged', () => {
    expect(resolveTableBox(createTableBlock(2, 3))).toEqual({
      width: 1,
      indent: 0,
      align: 'left',
    });
  });

  it('narrows from the right without moving the left edge', () => {
    const block = resizeTableEdge(createTableBlock(2, 3), 'right', -0.3);
    expect(resolveTableBox(block)).toEqual({ width: 0.7, indent: 0, align: 'left' });
  });

  it('starts a new table at the stem’s own text column', () => {
    /*
     * A table belongs to a question, and a question's text starts at the stem column with
     * only the "1." out in the margin. Flush at 0 put a table a step left of the sentence
     * introducing it — every indented table in the reference paper carries a `w:tblInd`.
     */
    const contentWidth = 9026;
    const fraction = defaultTableIndent(contentWidth);
    expect(fraction * contentWidth).toBeCloseTo(QUESTION_LIST_INDENTS[0].left);
    // A fraction of the column, so it holds its proportion when the paper changes.
    expect(defaultTableIndent(contentWidth / 2)).toBeCloseTo(fraction * 2);
  });

  it('spans the room left of an indent, rather than losing it', () => {
    /*
     * The width has to resolve *from* the indent, not before it. The pair is clamped with
     * `min(indent, 1 - width)`, so a default width of 1 annihilated the indent of any
     * table nobody had dragged: the model stored 360tw and the render placed it at 0, so
     * a defaulted table printed flush in the question number's gutter while the stored
     * file looked entirely correct.
     */
    const indent = defaultTableIndent(9026);
    const box = resolveTableBox({ ...createTableBlock(2, 4), indent });

    expect(box.indent).toBeCloseTo(indent);
    expect(box.width).toBeCloseTo(1 - indent);
    // Still reaching the right margin: an indent moves the left edge, not the whole table.
    expect(box.indent + box.width).toBeCloseTo(1);
  });

  it('honours an explicit width against an indent, since that one was dragged', () => {
    const box = resolveTableBox({ ...createTableBlock(2, 3), indent: 0.25, width: 0.5 });
    expect(box.width).toBeCloseTo(0.5);
    expect(box.indent).toBeCloseTo(0.25);
  });

  it('places a centred table by alignment rather than by indent', () => {
    /*
     * Word models these as alternatives and honours only `w:jc` once it is set, which is
     * exactly what Q19 of the reference paper does: `<w:jc w:val="center"/>` and no
     * `w:tblInd` at all. Reporting both would leave two answers to "where is the left
     * edge" and let the page and the .docx pick different ones.
     */
    const indented = { ...createTableBlock(2, 3), indent: 0.2, width: 0.5 };
    const centred = setTableAlign(indented, 'center');

    expect(centred.indent).toBeUndefined();
    expect(resolveTableBox(centred)).toEqual({ width: 0.5, indent: 0, align: 'center' });
  });

  it('takes a table off centre when its left edge is dragged', () => {
    // Dragging the left edge *is* choosing an indent. Left aligned, the table would sit
    // still under the pointer while the stored value moved, then jump on release.
    const centred = setTableAlign({ ...createTableBlock(2, 3), width: 0.5 }, 'center');
    const dragged = resizeTableEdge(centred, 'left', 0.2);

    expect(resolveTableAlign(dragged)).toBe('left');
    expect(resolveTableBox(dragged).indent).toBeCloseTo(0.2);
  });

  it('drops alignment entirely when set back to left', () => {
    // `left` is Word's own default, so it must store nothing — a table nobody has aligned
    // has to export byte-identically to what it did before alignment existed.
    const block = setTableAlign(setTableAlign(createTableBlock(2, 3), 'right'), 'left');
    expect(block.align).toBeUndefined();
  });

  it('indents from the left while the right edge stays put', () => {
    // Otherwise dragging the left edge would slide the table sideways rather than
    // resize it, which is not what grabbing an edge means.
    const block = resizeTableEdge(createTableBlock(2, 3), 'left', 0.25);
    const box = resolveTableBox(block);
    expect(box.indent).toBeCloseTo(0.25);
    expect(box.indent + box.width).toBeCloseTo(1);
  });

  it('reproduces the reference distribution table, inset from both sides', () => {
    // table2.png: the table does not fill the text column. Word models that with a
    // narrower w:tblW plus a w:tblInd, not by padding the outer cells.
    let block = createTableBlock(5, 3);
    block = resizeTableEdge(block, 'left', 0.2);
    block = resizeTableEdge(block, 'right', -0.1);
    const box = resolveTableBox(block);
    expect(box.indent).toBeCloseTo(0.2);
    expect(box.width).toBeCloseTo(0.7);
  });

  it('keeps column proportions when the table is resized as a whole', () => {
    // `columnWidths` are fractions of the *table*, so resizing the box and resizing one
    // column stay independent gestures.
    let block = createTableBlock(2, 3);
    block = { ...block, columnWidths: [0.5, 0.25, 0.25] };
    const before = resolveColumnWidths(block, 3);
    const after = resolveColumnWidths(resizeTableEdge(block, 'right', -0.4), 3);
    expect(after).toEqual(before);
  });

  it('cannot be dragged off the page or into nothing', () => {
    expect(resolveTableBox(resizeTableEdge(createTableBlock(2, 2), 'right', -5)).width).toBeCloseTo(
      MIN_TABLE_FRACTION,
    );
    const pushed = resolveTableBox(resizeTableEdge(createTableBlock(2, 2), 'left', 5));
    expect(pushed.width).toBeCloseTo(MIN_TABLE_FRACTION);
    expect(pushed.indent + pushed.width).toBeCloseTo(1);
  });

  it('stores nothing once dragged back to full width', () => {
    // An untouched table must carry no record, so it exports exactly as it did before
    // edges could be dragged.
    const block = resizeTableEdge(resizeTableEdge(createTableBlock(2, 2), 'right', -0.3), 'right', 0.3);
    expect(block.width).toBeUndefined();
    expect(block.indent).toBeUndefined();
  });
});

describe('row heights', () => {
  it('stores a floor, clamped to something clickable', () => {
    const block = setRowHeight(createTableBlock(2, 2), 0, 800);
    expect(block.rows[0].minHeight).toBe(800);
    expect(setRowHeight(block, 0, 10).rows[0].minHeight).toBe(MIN_ROW_HEIGHT_TWIPS);
  });

  it('clears back to being sized by content', () => {
    let block = setRowHeight(createTableBlock(2, 2), 0, 800);
    block = setRowHeight(block, 0, undefined);
    expect(block.rows[0].minHeight).toBeUndefined();
    expect('minHeight' in block.rows[0]).toBe(false);
  });

  it('touches only the row it names', () => {
    const block = setRowHeight(createTableBlock(3, 2), 1, 600);
    expect(block.rows.map((row) => row.minHeight)).toEqual([undefined, 600, undefined]);
  });
});

describe('a swept range of cells', () => {
  /** The id at a position, as both the page and the panel address cells. */
  const idAt = (block: TableBlock, rowIndex: number, cellIndex: number) =>
    block.rows[rowIndex].cells[cellIndex].id;
  const range = (block: TableBlock, anchorId: string, focusId: string) =>
    cellsInRange(
      block.rows.map((row) => row.cells),
      anchorId,
      focusId,
      (_, rowIndex, cellIndex) => block.rows[rowIndex]?.cells[cellIndex]?.id,
    );

  it('catches the rectangle between its two corners, in either drag direction', () => {
    const block = createTableBlock(3, 3);
    const forward = range(block, idAt(block, 0, 1), idAt(block, 1, 2));
    expect(forward.map((p) => [p.rowIndex, p.cellIndex])).toEqual([
      [0, 1],
      [0, 2],
      [1, 1],
      [1, 2],
    ]);
    // A drag travelling up-left is the same rectangle.
    const backward = range(block, idAt(block, 1, 2), idAt(block, 0, 1));
    expect(backward).toEqual(forward);
  });

  it('expands over a horizontally merged cell it cuts through, as Excel does', () => {
    // Row 0's first cell spans grid columns 0-1. A sweep from (1,1) to the plain cell
    // at (0,2) bounds columns 1-2 — which slices the header — so the rectangle must
    // widen to column 0 and catch everything, or the highlight would show a
    // non-rectangular region the bulk verb then acts outside of.
    let block = createTableBlock(2, 3);
    block = mergeRight(block, 0, 0);
    const caught = range(block, idAt(block, 1, 1), idAt(block, 0, 2));
    expect(caught.map((p) => [p.rowIndex, p.cellIndex])).toEqual([
      [0, 0],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
  });

  it('expands over a vertically merged cell, using the grid the browser lays out', () => {
    // Column 0 of rows 0-1 is one tall cell. A sweep anchored beside its lower half
    // must still catch it, which only works when the covered placeholder is given no
    // grid column of its own — the rowSpan from above already occupies it.
    let block = createTableBlock(2, 2);
    block = mergeDown(block, 0, 0);
    const caught = range(block, idAt(block, 1, 1), idAt(block, 0, 0));
    expect(caught.map((p) => [p.rowIndex, p.cellIndex])).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
  });

  it('returns nothing for a stale id, rather than a guess', () => {
    const block = createTableBlock(2, 2);
    expect(range(block, idAt(block, 0, 0), 'gone')).toEqual([]);
  });

  it('patches every caught cell in one pass', () => {
    const block = createTableBlock(2, 2);
    const caught = range(block, idAt(block, 0, 0), idAt(block, 1, 1));
    const aligned = patchCells(block, caught, { align: 'center' });
    expect(
      aligned.rows.flatMap((row) => row.cells.map((cell) => cell.align)),
    ).toEqual(['center', 'center', 'center', 'center']);
    // The source block is untouched — the verbs stay pure.
    expect(block.rows[0].cells[0].align).toBeUndefined();
  });
});
