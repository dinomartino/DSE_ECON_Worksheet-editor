import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { exportDocxBuffer } from './index';
import { createWorksheet, createMcqQuestion } from '@/model/factories';
import { buildTableFromTemplate, TABLE_TEMPLATES } from '@/model/tableTemplates';
import { resolveCellEdges } from '@/model/table';
import { bi, plain } from '@/model/text';
import { renderWorksheet } from '@/render/worksheet';
import { worksheetClipboardHtml } from '@/export/clipboard';
import type { McqQuestion, TableBlock, Worksheet } from '@/model/types';

/**
 * The T-account: a frame, one rule under the head, one down the middle.
 *
 * DSE 2019 P2 Q6/Q7 print a bank's balance sheet this way, and it is the shape neither
 * `all` (which rules everything) nor `box` (which rules nothing inside) can express. The
 * geometry asserted here is read off that paper's own `document.xml`.
 */

function withTable(table: TableBlock): Worksheet {
  const question = createMcqQuestion() as McqQuestion;
  question.blocks = [table];
  const base = createWorksheet();
  return { ...base, questions: [question], flow: [{ type: 'question', id: question.id }] };
}

const MODE = { language: 'en', version: 'student' } as const;

async function documentXml(worksheet: Worksheet): Promise<string> {
  const buffer = await exportDocxBuffer(worksheet, MODE, new Map());
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml')!.async('string');
}

/** The IR's table node for a worksheet holding exactly one table. */
function tableNode(worksheet: Worksheet) {
  const nodes = renderWorksheet(worksheet, MODE).questions[0].nodes;
  const table = nodes.find((node) => node.kind === 'table');
  if (!table || table.kind !== 'table') throw new Error('no table node');
  return table;
}

describe('the T-account border shape', () => {
  it('rules the frame, the head and the middle — and nothing else', () => {
    const table = tableNode(withTable(buildTableFromTemplate('balanceSheet')));

    // Row 0: two spanning header cells. Each carries the frame's top, its own outer
    // side, and the rule under the head. The one edge that must NOT be ruled on the
    // left header is its right — that is the middle, and the *left* of the right header
    // draws it, once.
    // The covered cells are still in the row — they hold the place their span consumes
    // — so the second header is at index 2, not 1.
    const [assets, , liabilities] = table.rows[0];
    expect(table.rows[0][1].covered).toBe(true);
    expect(assets.edges).toEqual({ top: true, left: true, bottom: true, right: true });
    expect(liabilities.edges).toEqual({ top: true, left: true, bottom: true, right: true });

    // Row 1 (an entry row, not the last): a label and its figure with NO rule between
    // them — that is what makes the pair read as one entry.
    const [label, figure, label2, figure2] = table.rows[1];
    expect(label.edges).toEqual({ top: false, left: true, bottom: false, right: false });
    expect(figure.edges).toEqual({ top: false, left: false, bottom: false, right: true });
    // The second side's label draws the middle divider on its left.
    expect(label2.edges).toEqual({ top: false, left: true, bottom: false, right: false });
    expect(figure2.edges).toEqual({ top: false, left: false, bottom: false, right: true });

    // The last row closes the frame, and still carries no rule between the entries.
    const last = table.rows[table.rows.length - 1];
    expect(last[0].edges).toEqual({ top: false, left: true, bottom: true, right: false });
    expect(last[1].edges).toEqual({ top: false, left: false, bottom: true, right: true });
  });

  it('resolves the divider from grid position, not cell index', () => {
    // The header cells span two grid columns each, so "is this against the middle" is
    // unanswerable by counting cells: the left header is cell 0 of 4 and its right edge
    // reaches grid column 2 — the midpoint.
    const block = buildTableFromTemplate('balanceSheet');
    const spanning = resolveCellEdges(block, 0, 0, 4);
    expect(spanning.right).toBe(true);

    // The same physical boundary from the other side, in an un-spanned row.
    expect(resolveCellEdges(block, 1, 1, 4).right).toBe(true);
    expect(resolveCellEdges(block, 1, 2, 4).left).toBe(true);
    // And the boundary inside a side is not ruled from either side.
    expect(resolveCellEdges(block, 1, 0, 4).right).toBe(false);
    expect(resolveCellEdges(block, 1, 1, 4).left).toBe(false);
  });

  it('omits the divider when there is no midpoint to put it on', () => {
    // An odd column count has no two equal halves, so the shape is meaningless. It
    // degrades to a framed block with a header rule rather than drawing a rule
    // off-centre.
    const odd: TableBlock = {
      kind: 'table',
      id: 't',
      borders: 'headerRule',
      rows: [1, 2].map((r) => ({
        id: `r${r}`,
        cells: [1, 2, 3].map((c) => ({ id: `c${r}${c}`, text: bi('x', '') })),
      })),
    };
    // The interior boundaries are all unruled; only the outer edges survive.
    expect(resolveCellEdges(odd, 1, 0, 3).right).toBe(false);
    expect(resolveCellEdges(odd, 1, 1, 3).left).toBe(false);
    expect(resolveCellEdges(odd, 1, 1, 3).right).toBe(false);
    expect(resolveCellEdges(odd, 1, 2, 3).right).toBe(true);
  });

  it('draws nothing on the table itself, so no cell inherits a rule', async () => {
    const xml = await documentXml(withTable(buildTableFromTemplate('balanceSheet')));
    const borders = xml.match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/)![0];

    // Every one of the six is explicitly `none`. Omitting them would let the table style
    // put the grid back underneath the cells' own edges — the trap `box` documents.
    for (const side of ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']) {
      expect(borders).toContain(`<w:${side} w:val="none"`);
    }
    expect(borders).not.toContain('w:val="single"');
  });

  it('writes w:tcBorders before w:tcMar and w:vAlign', async () => {
    const xml = await documentXml(withTable(buildTableFromTemplate('balanceSheet')));
    const cell = xml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)![0];

    // `CT_TcPr` is a sequence: out of order, Word reports a repair error on the whole
    // file rather than one wrong table.
    expect(cell).toContain('<w:tcBorders>');
    expect(cell.indexOf('<w:tcBorders>')).toBeLessThan(cell.indexOf('<w:tcMar>'));
    expect(cell.indexOf('<w:tcBorders>')).toBeLessThan(cell.indexOf('<w:vAlign'));
    /*
     * Both spellings reach the file, `none` included — an unstated edge inherits.
     *
     * Checked across the whole document rather than in the first cell: that one is a
     * header, whose four edges are all genuinely ruled, so a `none` there would mean the
     * shape was wrong.
     */
    const allCellBorders = xml.match(/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/g)!;
    expect(allCellBorders.some((b) => b.includes('w:val="none"'))).toBe(true);
    expect(allCellBorders.some((b) => b.includes('w:val="single"'))).toBe(true);
  });

  it('leaves the other two modes untouched', async () => {
    const ordinary: TableBlock = {
      kind: 'table',
      id: 't',
      rows: [
        { id: 'r1', cells: [{ id: 'a', text: bi('x', '') }, { id: 'b', text: bi('y', '') }] },
      ],
    };
    const xml = await documentXml(withTable(ordinary));
    // A table nobody has re-ruled emits no per-cell borders at all, so every existing
    // document exports byte-identically to what it did before this mode existed.
    expect(xml).not.toContain('<w:tcBorders>');
    expect(xml).toContain('<w:insideH w:val="single"');
  });

  it('paints the same edges into the clipboard, none included', () => {
    const html = worksheetClipboardHtml(
      withTable(buildTableFromTemplate('balanceSheet')),
      MODE,
    );

    // Every side is stated: pasted HTML lands in a document with its own table styling,
    // and an unstated edge inherits it.
    expect(html).toContain('border-bottom:1px solid #000');
    expect(html).toContain('border-top:none');
    // And the table itself carries no frame — the cells own every rule.
    expect(html).not.toMatch(/<table style="[^"]*border:1px solid/);
  });
});

describe('table templates', () => {
  it('gives every build fresh ids', () => {
    const a = buildTableFromTemplate('balanceSheet');
    const b = buildTableFromTemplate('balanceSheet');
    expect(a.id).not.toBe(b.id);
    const idsA = a.rows.flatMap((row) => row.cells.map((cell) => cell.id));
    const idsB = b.rows.flatMap((row) => row.cells.map((cell) => cell.id));
    expect(idsA.some((id) => idsB.includes(id))).toBe(false);
    // Unique within the copy too, or an edit to one cell would rewrite another.
    expect(new Set(idsA).size).toBe(idsA.length);
  });

  it('fills both language sides of every heading it ships', () => {
    // A template that seeds English alone hands over a half-translated table in the one
    // app that exists for bilingual papers.
    for (const template of TABLE_TEMPLATES) {
      const block = template.build();
      for (const row of block.rows) {
        for (const cell of row.cells) {
          const hasEn = cell.text.en.length > 0;
          const hasZh = cell.text.zh.length > 0;
          expect(hasEn).toBe(hasZh);
        }
      }
      // The picker shows both sides of the name and hint.
      expect(template.name.zh.length).toBeGreaterThan(0);
      expect(template.hint.zh.length).toBeGreaterThan(0);
    }
  });

  it('labels the entries and leaves only the figures empty', () => {
    /*
     * A banking system's balance sheet is always Reserves and Loans against Deposits —
     * that is what the account is, not what one question asks. The numbers are the
     * question's data, and a seeded number is one a teacher can miss.
     */
    const block = buildTableFromTemplate('balanceSheet');
    const text = (r: number, c: number) => plain(block.rows[r].cells[c].text.en);

    expect(text(1, 0)).toBe('Reserves');
    expect(text(2, 0)).toBe('Loans');
    expect(text(1, 2)).toBe('Deposits');

    // Every figure cell (the odd columns) is blank, and so is the liabilities side's
    // second label — that side carries one entry.
    for (const row of [1, 2]) {
      expect(text(row, 1)).toBe('');
      expect(text(row, 3)).toBe('');
    }
    expect(text(2, 2)).toBe('');
  });

  it('spans its header cells the way the merge verbs do', () => {
    // A covered cell holds the place its span consumes, exactly as `mergeRight` leaves
    // it — otherwise the grid geometry and the column count disagree.
    const header = buildTableFromTemplate('balanceSheet').rows[0].cells;
    expect(header[0].colSpan).toBe(2);
    expect(header[1].covered).toBe(true);
    expect(header[2].colSpan).toBe(2);
    expect(header[3].covered).toBe(true);
  });

  it('resolves an unknown id to something usable', () => {
    // A template list changes between builds; a caller holding a stale id should get a
    // table rather than a broken document.
    expect(buildTableFromTemplate('no-such-template').kind).toBe('table');
  });
});
