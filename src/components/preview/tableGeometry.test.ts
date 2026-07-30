import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTableBlock } from '@/model/factories';
import { renderContentBlocks } from '@/render/ir';
import { DEFAULT_CELL_PADDING, setPadding } from '@/model/table';

/**
 * The preview must lay a table out the way Word will, because **the paginator measures
 * these boxes**. A sheet that packs a table differently from the exported file breaks the
 * page somewhere Word does not, and the fault shows up as content on the wrong page — a
 * symptom several components away from its cause.
 *
 * Three properties, each of which was wrong before column widths existed and each of
 * which fails silently:
 *
 *  - Fixed layout with an explicit `colgroup`. Browser auto-layout sizes columns from
 *    their *content*; Word sizes them from `w:gridCol`. Nothing reconciles the two.
 *  - No horizontal scroller. `overflow-x-auto` is a scrollbar on a sheet of paper: it
 *    hides an over-wide table rather than showing it, and the sheet then measures the
 *    scroller instead of the content.
 *  - Padding read from the IR's resolved value, not respelled as a Tailwind class.
 */

const PREVIEW = readFileSync('src/components/preview/Preview.tsx', 'utf8');

/** The table branch of the preview, where all three properties have to hold. */
const tableView = (() => {
  const start = PREVIEW.indexOf('function TableNodeView');
  expect(start, 'TableNodeView has been renamed').toBeGreaterThan(0);
  return PREVIEW.slice(start, PREVIEW.indexOf('\nfunction NodeView', start));
})();

describe('the previewed table matches the geometry Word is given', () => {
  it('lays out fixed, from an explicit colgroup', () => {
    expect(tableView).toContain('table-fixed');
    expect(tableView).toContain('<colgroup>');
    // Widths come from the IR, which resolved them once for every backend.
    expect(tableView).toContain('widths.map');
  });

  it('never puts a table in a horizontal scroller', () => {
    // A scrollbar cannot exist on paper, and it decouples the measured height from the
    // content, so an over-wide table became invisible to pagination.
    expect(tableView).not.toContain('overflow-x-auto');
    expect(tableView).not.toContain('overflow-auto');
  });

  it('takes padding from the resolved IR value rather than a class', () => {
    expect(tableView).toContain('cell.padding.top');
    expect(tableView).toContain('cell.padding.left');
    // The old hardcoded pair, which no longer describes anything.
    expect(tableView).not.toContain('px-1.5 py-1');
  });

  it('wraps a long word instead of pushing the column wider', () => {
    // `table-fixed` holds the column, so an unbroken string overflows the border unless
    // this is set. Word breaks it.
    expect(tableView).toContain('overflowWrap');
  });
});

describe('the IR hands every backend the same numbers', () => {
  it('resolves widths to one fraction per column, summing to one', () => {
    const [node] = renderContentBlocks([createTableBlock(2, 3)], 'Question Stem');
    expect(node.kind).toBe('table');
    if (node.kind !== 'table') return;

    expect(node.columnWidths).toHaveLength(node.columnCount);
    expect(node.columnWidths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1);
  });

  it('resolves padding onto every cell, so no backend re-derives it', () => {
    // Word has no row- or column-level cell margin: the .docx can only write the winner
    // onto each w:tcMar, so a backend that resolved for itself could show the page a
    // padding the exported file does not have.
    let block = createTableBlock(2, 2);
    block = setPadding(block, 'row', { rowIndex: 1, cellIndex: 0 }, { top: 300 });

    const [node] = renderContentBlocks([block], 'Question Stem');
    if (node.kind !== 'table') throw new Error('expected a table node');

    expect(node.rows[0][0].padding).toEqual(DEFAULT_CELL_PADDING);
    expect(node.rows[1][0].padding.top).toBe(300);
    // The row's setting reaches every cell in that row, and no others.
    expect(node.rows[1][1].padding.top).toBe(300);
    expect(node.rows[0][1].padding.top).toBe(DEFAULT_CELL_PADDING.top);
  });

  it('carries a table block id, so the page can address its columns', () => {
    const block = createTableBlock(2, 2);
    const [node] = renderContentBlocks([block], 'Question Stem');
    if (node.kind !== 'table') throw new Error('expected a table node');
    expect(node.blockId).toBe(block.id);
  });
});
