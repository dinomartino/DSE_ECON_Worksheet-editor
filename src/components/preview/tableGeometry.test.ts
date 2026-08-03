import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTableBlock } from '@/model/factories';
import { renderContentBlocks, type NodeStyle, type RenderNode } from '@/render/ir';
import { DEFAULT_CELL_PADDING, defaultTableIndent, setPadding, setTableAlign } from '@/model/table';
import { renderNodeXml } from '@/export/docx/body';
import type { ContentBlock } from '@/model/types';

/** `renderContentBlocks` appends into the caller's stream; these tests start one fresh. */
const renderBlocks = (blocks: ContentBlock[], style: NodeStyle): RenderNode[] => {
  const nodes: RenderNode[] = [];
  renderContentBlocks(nodes, blocks, style);
  return nodes;
};

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

  it('spaces itself with document blank lines, not its own margins', () => {
    // The gap above a table is the IR's separating blank line; the gap below is the
    // structural empty paragraph Word requires, drawn as a real 12pt block. A CSS
    // margin is a third spelling neither the exporter nor the paginator can see —
    // `my-2` showed ~6pt where the paper printed 12, unequal above and below.
    expect(tableView).not.toContain('my-2');
    expect(tableView).toContain('BLANK_LINE_PT');
  });
});

describe('the IR hands every backend the same numbers', () => {
  it('resolves widths to one fraction per column, summing to one', () => {
    const [node] = renderBlocks([createTableBlock(2, 3)], 'Question Stem');
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

    const [node] = renderBlocks([block], 'Question Stem');
    if (node.kind !== 'table') throw new Error('expected a table node');

    expect(node.rows[0][0].padding).toEqual(DEFAULT_CELL_PADDING);
    expect(node.rows[1][0].padding.top).toBe(300);
    // The row's setting reaches every cell in that row, and no others.
    expect(node.rows[1][1].padding.top).toBe(300);
    expect(node.rows[0][1].padding.top).toBe(DEFAULT_CELL_PADDING.top);
  });

  it('carries a table block id, so the page can address its columns', () => {
    const block = createTableBlock(2, 2);
    const [node] = renderBlocks([block], 'Question Stem');
    if (node.kind !== 'table') throw new Error('expected a table node');
    expect(node.blockId).toBe(block.id);
  });

  it('resolves alignment and zeroes the indent it replaces', () => {
    // Both backends then place by `align` and offset by `indent` without either having to
    // know the two are alternatives — the same reason widths and padding arrive resolved.
    const block = setTableAlign({ ...createTableBlock(2, 2), indent: 0.3 }, 'center');
    const [node] = renderBlocks([block], 'Question Stem');
    if (node.kind !== 'table') throw new Error('expected a table node');

    expect(node.align).toBe('center');
    expect(node.indent).toBe(0);
  });
});

describe('a centred table exports the way the reference paper does', () => {
  /*
   * Q19 of `DBS_Assessment1.docx` is the shape being reproduced: `<w:jc w:val="center"/>`
   * on `w:tblPr` and no `w:tblInd` at all, while its six sibling tables carry a
   * `w:tblInd` and no `w:jc`. Word treats them as alternatives, so emitting both would
   * leave the file saying two different things about where the left edge is.
   */
  /** The real export path, so this cannot pass against a helper the exporter stopped using. */
  const tblPr = (block: ContentBlock) => {
    const [node] = renderBlocks([block], 'Question Stem');
    if (node.kind !== 'table') throw new Error('expected a table node');
    const xml = renderNodeXml(node, {
      fonts: { latin: 'Times New Roman', eastAsia: 'PMingLiU' },
      language: 'en',
      contentWidth: 9026,
      numIds: new Map(),
      imageRelId: () => undefined,
      nextDrawingId: () => 1,
    });
    return xml.slice(xml.indexOf('<w:tblPr>'), xml.indexOf('</w:tblPr>'));
  };

  it('writes w:jc and no w:tblInd for a centred table', () => {
    const props = tblPr(setTableAlign({ ...createTableBlock(2, 2), indent: 0.3 }, 'center'));
    expect(props).toContain('<w:jc w:val="center"/>');
    expect(props).not.toContain('w:tblInd');
  });

  it('writes w:tblInd and no w:jc for an indented one', () => {
    const props = tblPr({ ...createTableBlock(2, 2), indent: 0.25, width: 0.5 });
    expect(props).toContain('w:tblInd');
    expect(props).not.toContain('w:jc');
  });

  it('writes the default indent, and a width that fills the rest of the column', () => {
    /*
     * The end-to-end guard for the fault the unit test above describes: every layer
     * agreed the indent was stored, and only the resolved box dropped it, so a table
     * printed flush in the question number's gutter with nothing in the file to explain
     * why. `w:tblInd` is the stem column and `w:tblW` is what remains of the 9026.
     */
    const props = tblPr({ ...createTableBlock(2, 4), indent: defaultTableIndent(9026) });
    expect(props).toContain('<w:tblInd w:w="360" w:type="dxa"/>');
    expect(props).toContain(`<w:tblW w:w="${9026 - 360}" w:type="dxa"/>`);
  });

  it('writes neither for a table nobody has placed', () => {
    // `left` is Word's own default, so an untouched table's XML has to be unchanged from
    // before alignment existed.
    const props = tblPr(createTableBlock(2, 2));
    expect(props).not.toContain('w:jc');
    expect(props).not.toContain('w:tblInd');
  });
});
