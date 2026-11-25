import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderWorksheet } from '@/render/worksheet';
import { exportDocxBuffer } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { createFigureGridBlock, createMcqQuestion, createTableBlock, createWorksheet } from '@/model/factories';
import { contentWidth, DEFAULT_PAGE_SETUP } from '@/model/page';
import { bi } from '@/model/text';
import type { DiagramBlock, McqQuestion, TableBlock, Worksheet } from '@/model/types';
import { figureLabelIndent, isFigureNumberLabel } from './figureLabel';
import type { RenderNode, TableNode } from './ir';

/**
 * Diagrams numbered (1) to (4) put each number at the upper-left corner of its diagram, as on
 * the HKDSE papers (k-0555, u-g93j): a studio figure grid and the past paper bank's borderless
 * 2 x 2 table, whose cells arrive centred. The figures themselves do not move.
 */

const MODE = { language: 'en', version: 'student' } as const;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const diagram = (id: string, widthPx = 240): DiagramBlock => ({
  kind: 'diagram',
  id,
  diagram: { x: { title: bi('Income', '收入') }, y: { title: bi('Tax', '稅款') }, curves: [], points: [], labels: [], arrows: [] },
  widthPx,
  heightPx: Math.round(widthPx * 0.8),
  altText: bi('graph', '圖'),
});

function paperWith(blocks: McqQuestion['blocks']): Worksheet {
  const question = createMcqQuestion() as McqQuestion;
  question.blocks = [{ kind: 'paragraph', id: 'stem', text: bi('Which of the following?', '以下哪些？') }, ...blocks];
  return { ...createWorksheet(), questions: [question], flow: [{ type: 'question', id: question.id }] };
}

/** The bank's numbered diagrams (docs/design/pastpaper-bank.md § 5): a borderless 2 x 2 table, centred cells. */
function bankTable(texts = ['(1)', '(2)', '(3)', '(4)']): TableBlock {
  const table = createTableBlock(2, 2);
  table.id = 'grid';
  table.borders = 'none';
  table.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      cell.text = bi(texts[r * 2 + c], texts[r * 2 + c]);
      cell.align = 'center';
      cell.vAlign = 'top';
      cell.image = { src: PNG, widthPx: 200, heightPx: 160, altText: bi('graph', '圖') };
    }),
  );
  return table;
}

const nodesOf = (worksheet: Worksheet): RenderNode[] => renderWorksheet(worksheet, MODE).questions[0].nodes;
const tableOf = (worksheet: Worksheet) => nodesOf(worksheet).find((n): n is TableNode => n.kind === 'table')!;
const documentXml = async (worksheet: Worksheet, images = new Map<string, string>()) =>
  (await JSZip.loadAsync(await exportDocxBuffer(worksheet, MODE, images))).file('word/document.xml')!.async('string');

describe('a diagram number label', () => {
  it('is "(1)", "（2）", "(iii)" or "(b)" in every language that has text', () => {
    for (const text of ['(1)', '( 4 )', '（2）', '(iii)', '(b)']) expect(isFigureNumberLabel(bi(text, ''))).toBe(true);
    expect(isFigureNumberLabel(bi('(1)', '(1)'))).toBe(true);
    for (const text of ['', 'Price', '(1) Price', 'Figure 1', '(12a)']) expect(isFigureNumberLabel(bi(text, ''))).toBe(false);
    expect(isFigureNumberLabel(bi('(1)', '價格'))).toBe(false);
  });

  it('starts where its figure starts: centred, left, right, or wider than the cell', () => {
    expect(figureLabelIndent(6000, 200)).toBe(1500);
    expect(figureLabelIndent(6000, 200, 'left')).toBe(0);
    expect(figureLabelIndent(6000, 200, 'right')).toBe(3000);
    expect(figureLabelIndent(2000, 200)).toBe(0);
  });
});

describe('a studio figure grid (k-0545)', () => {
  const grid = () => {
    const block = createFigureGridBlock([0, 1, 2, 3].map((i) => diagram(`g${i}`)));
    block.id = 'grid';
    return paperWith([block]);
  };

  it('marks its rows so every backend puts each label at its figure', () => {
    const rows = nodesOf(grid()).filter((n) => n.kind === 'optionRow');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.kind === 'optionRow' && row.figureLabels).toBe(true);
  });

  it('indents each label in the .docx to its centred figure, the figure unchanged', async () => {
    const images = new Map(['g0', 'g1', 'g2', 'g3'].map((id) => [id, PNG]));
    const xml = await documentXml(grid(), images);
    const cell = Math.floor(contentWidth(DEFAULT_PAGE_SETUP) / 2);
    const indent = figureLabelIndent(cell, 240);
    expect(indent).toBeGreaterThan(0);
    const first = /<w:p>(?:(?!<\/w:p>).)*?\(1\)/.exec(xml)?.[0] ?? '';
    expect(first).toContain(`<w:ind w:left="${indent}"/>`);
    expect(xml.match(/<w:drawing>/g)).toHaveLength(4);
  });

  it('indents each label on the clipboard too', () => {
    const html = worksheetClipboardHtml(grid(), MODE, new Map());
    const indent = figureLabelIndent(contentWidth(DEFAULT_PAGE_SETUP) / 2, 240);
    expect(html).toContain(`margin-left:${indent / 20}pt`);
  });
});

describe("the past paper bank's numbered diagrams (k-0444 table)", () => {
  it('marks a "(n)" over its picture, whatever the stored centring', () => {
    const table = tableOf(paperWith([bankTable()]));
    expect(table.rows.flat().map((cell) => cell.labelAtImage)).toEqual([true, true, true, true]);
  });

  it('leaves any other cell as it was: words over a picture, a number without one, a right-aligned number', () => {
    const words = bankTable(['Price', '(2)', '(3)', '(4)']);
    words.rows[0].cells[1].image = undefined;
    words.rows[1].cells[0].align = 'right';
    const cells = tableOf(paperWith([words])).rows.flat();
    expect(cells.map((cell) => cell.labelAtImage)).toEqual([undefined, undefined, undefined, true]);
    expect(cells.map((cell) => 'labelAtImage' in cell)).toEqual([false, false, false, true]);
  });

  it('starts each number at its centred picture in the .docx, left-aligned', async () => {
    const xml = await documentXml(paperWith([bankTable()]));
    const labels = xml.match(/<w:p><w:pPr>(?:(?!<\/w:p>).)*?\(\d\)/g) ?? [];
    expect(labels).toHaveLength(4);
    for (const label of labels) {
      expect(label).toMatch(/<w:ind w:left="[1-9]\d*"\/><w:jc w:val="left"\/>/);
    }
    // The pictures stay centred in their cells.
    expect(xml.match(/<w:jc w:val="center"\/>(?:(?!<\/w:p>).)*?<w:drawing>/g)).toHaveLength(4);
  });

  it('starts each number at its picture on the clipboard', () => {
    const html = worksheetClipboardHtml(paperWith([bankTable()]), MODE, new Map());
    expect(html.match(/<p style="text-align:left;margin:0 0 0 [\d.]+pt">\(\d\)/g)).toHaveLength(4);
  });
});
