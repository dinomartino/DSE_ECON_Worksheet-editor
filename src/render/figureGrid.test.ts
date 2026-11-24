import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderWorksheet } from '@/render/worksheet';
import { exportDocxBuffer } from '@/export/docx';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { collectDiagramNodes } from '@/export/diagramImage';
import { createFigureGridBlock, createMcqQuestion, createWorksheet } from '@/model/factories';
import { applyDeleteTarget, applyResizeBlock, flattenBlocks, questionOwnsBlock, replaceBlockById } from '@/model/edits';
import { bi } from '@/model/text';
import { collectTexts } from '@/model/textWalk';
import type { Diagram } from '@/model/diagram';
import type { DiagramBlock, McqQuestion, Worksheet } from '@/model/types';

/**
 * A stem's figure grid (k-0545): HKDSE 2023 Paper 1 Q36's "(1) (2) (3) (4)", each an editable
 * diagram. It prints through the MC options' figure-grid frame (`OptionRowNode`), so these pin
 * the path end to end: the IR, the .docx, the clipboard, the export pre-pass, and the editing
 * verbs that reach a figure by its id.
 */

function plot(label: string): Diagram {
  return {
    x: { title: bi('Income', '收入') },
    y: { title: bi('Tax', '稅款') },
    curves: [{ id: `${label}-c`, points: [{ x: 0, y: 0 }, { x: 0.9, y: 0.7 }], shape: 'straight', label: bi(label, label) }],
    points: [],
    labels: [],
    arrows: [],
  };
}

const figure = (id: string, label: string, widthPx = 240): DiagramBlock => ({
  kind: 'diagram',
  id,
  diagram: plot(label),
  widthPx,
  heightPx: Math.round(widthPx * 0.8),
  altText: bi(`${label} graph`, ''),
});

function q36(columns?: number, count = 4): { worksheet: Worksheet; question: McqQuestion } {
  const question = createMcqQuestion() as McqQuestion;
  const grid = createFigureGridBlock(
    Array.from({ length: count }, (_, i) => figure(`g${i}`, `T${i + 1}`)),
    columns,
  );
  grid.id = 'grid';
  question.blocks = [{ kind: 'paragraph', id: 'stem', text: bi('Which of the following diagrams show a progressive tax?', '以下哪些圖表顯示累進稅？') }, grid];
  const worksheet: Worksheet = { ...createWorksheet(), questions: [question], flow: [{ type: 'question', id: question.id }] };
  return { worksheet, question };
}

const MODE = { language: 'en', version: 'student' } as const;

describe('a stem figure grid', () => {
  it('prints two to a row by default, each label above its own figure', () => {
    const nodes = renderWorksheet(q36().worksheet, MODE).questions[0].nodes;
    const rows = nodes.filter((n) => n.kind === 'optionRow');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      if (row.kind !== 'optionRow') continue;
      expect(row.cells).toHaveLength(2);
      for (const cell of row.cells) expect(cell.map((n) => n.kind)).toEqual(['columns', 'diagram']);
    }
    const labels = rows.flatMap((r) => (r.kind === 'optionRow' ? r.cells.map((c) => (c[0].kind === 'columns' ? c[0].cells[0].text.en[0].text : '')) : []));
    expect(labels).toEqual(['(1)', '(2)', '(3)', '(4)']);
    // The rows keep together; a blank line parts the grid from the stem.
    expect(rows[0].kind === 'optionRow' && rows[0].keepNext).toBe(true);
  });

  it('honours its column count and squares off a short last row', () => {
    const one = renderWorksheet(q36(4).worksheet, MODE).questions[0].nodes.filter((n) => n.kind === 'optionRow');
    expect(one).toHaveLength(1);
    const three = renderWorksheet(q36(3, 4).worksheet, MODE).questions[0].nodes.filter((n) => n.kind === 'optionRow');
    expect(three.map((r) => (r.kind === 'optionRow' ? r.cells.length : 0))).toEqual([3, 3]);
    expect(three[1].kind === 'optionRow' && three[1].cells[1]).toEqual([]);
  });

  it('fits a figure wider than its cell as printed, the stored size untouched', () => {
    const { worksheet, question } = q36(4);
    const grid = question.blocks[1];
    if (grid.kind !== 'figureGrid') throw new Error('no grid');
    grid.cells[0] = { ...grid.cells[0], figure: figure('g0', 'T1', 500) };
    const diagrams = collectDiagramNodes(worksheet, MODE);
    expect(diagrams).toHaveLength(4);
    expect(diagrams[0].widthPx).toBeLessThan(200);
    expect((grid.cells[0].figure as DiagramBlock).widthPx).toBe(500);
  });

  it('exports every figure into borderless layout tables, with resolving relationships', async () => {
    const { worksheet } = q36();
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const images = new Map(['g0', 'g1', 'g2', 'g3'].map((id) => [id, png]));
    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, MODE, images));
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document.match(/<w:cantSplit\/>/g)).toHaveLength(2);
    expect(document.match(/<w:drawing>/g)).toHaveLength(4);
    expect(document).toContain('(3)');
    expect(document).not.toContain('<w:top w:val="single"');
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
    for (const id of document.match(/r:embed="(rId\d+)"/g) ?? []) expect(rels).toContain(`Id="${id.replace(/r:embed="|"/g, '')}"`);
  });

  it('copies to the clipboard with its labels', () => {
    const { worksheet } = q36();
    const html = worksheetClipboardHtml(worksheet, MODE, new Map());
    for (const label of ['(1)', '(2)', '(3)', '(4)']) expect(html).toContain(label);
  });

  it('reaches each figure by its id: found, resized, redrawn, deleted (the last one takes the grid)', () => {
    const { worksheet, question } = q36(2, 2);
    expect(questionOwnsBlock(question, 'g1')).toBe(true);
    expect(flattenBlocks(question.blocks).map((b) => b.id)).toEqual(['stem', 'grid', 'g0', 'g1']);
    const resized = applyResizeBlock(worksheet, 'g1', 200);
    const grid = (resized.questions[0] as McqQuestion).blocks[1];
    expect(grid.kind === 'figureGrid' && grid.cells[1].figure.widthPx).toBe(200);
    const redrawn = replaceBlockById(worksheet, 'g0', figure('g0', 'NEW'));
    const g = (redrawn.questions[0] as McqQuestion).blocks[1];
    expect(g.kind === 'figureGrid' && (g.cells[0].figure as DiagramBlock).diagram.curves[0].label?.en[0].text).toBe('NEW');
    const less = applyDeleteTarget(worksheet, { kind: 'blockText', blockId: 'g0' });
    const left = (less.questions[0] as McqQuestion).blocks[1];
    expect(left.kind === 'figureGrid' && left.cells.map((c) => c.figure.id)).toEqual(['g1']);
    const none = applyDeleteTarget(less, { kind: 'blockText', blockId: 'g1' });
    expect((none.questions[0] as McqQuestion).blocks.map((b) => b.kind)).toEqual(['paragraph']);
  });

  it('walks its labels and the figures\' words for translation and checks', () => {
    const { worksheet } = q36(2, 2);
    const seen = collectTexts(worksheet).map((slot) => slot.text.en.map((r) => r.text).join(''));
    expect(seen).toEqual(expect.arrayContaining(['(1)', '(2)', 'T1', 'T2']));
  });
});
