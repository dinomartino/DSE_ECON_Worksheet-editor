import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { exportDocxBuffer } from './index';
import { createWorksheet, createMcqQuestion, createTableBlock } from '@/model/factories';
import { renderContentBlocks, type RenderNode } from '@/render/ir';
import type { McqQuestion, OutputMode, TableBlock, Worksheet } from '@/model/types';

/**
 * The "does not apply" slash (§`TableCell.diagonal`).
 *
 * 2025 Q11 Source A rules one cell of its housing table corner to corner, because the
 * income-limit figure exists for public housing and not for private. The papers' other
 * spelling of the same idea — omitting the cell entirely — is already expressible as a
 * ragged row; this is the bordered variant a uniform grid cannot reach.
 */

const MODE: OutputMode = { language: 'en', version: 'student' };

/** A table whose middle cell is slashed, in a document ready to export. */
function withDiagonal(diagonal: boolean): Worksheet {
  const table = createTableBlock(2, 2);
  if (diagonal) table.rows[1].cells[0].diagonal = true;
  const question = createMcqQuestion() as McqQuestion;
  question.blocks = [table];
  const base = createWorksheet();
  return { ...base, questions: [question], flow: [{ type: 'question', id: question.id }] };
}

async function documentXml(worksheet: Worksheet): Promise<string> {
  const buffer = await exportDocxBuffer(worksheet, MODE, new Map());
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml')!.async('string');
}

function tableNodeFor(block: TableBlock): RenderNode | undefined {
  const nodes: RenderNode[] = [];
  renderContentBlocks(nodes, [block], 'Body');
  return nodes.find((node) => node.kind === 'table');
}

describe('a diagonal cell', () => {
  it('rules bottom-left to top-right, which is tr2bl and not tl2br', async () => {
    const xml = await documentXml(withDiagonal(true));
    expect(xml).toContain('<w:tr2bl');
    // The obvious guess, and the wrong one — the same trap the cover's diagonal records.
    expect(xml).not.toContain('<w:tl2br');
  });

  it('emits the diagonal last inside w:tcBorders, and w:tcBorders before w:tcMar', async () => {
    const xml = await documentXml(withDiagonal(true));
    const borders = xml.match(/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/)![0];
    // `CT_TcBorders` is a sequence: the two diagonals follow the sides. A cell with a
    // diagonal and no resolved edges spells only the diagonal.
    expect(borders).toBe('<w:tcBorders><w:tr2bl w:val="single" w:sz="6" w:space="0" w:color="000000"/></w:tcBorders>');
    // `CT_TcPr` is a sequence too — out of order is a repair error on the whole file,
    // not one wrong table.
    const cell = xml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/g)!.find((chunk) => chunk.includes('tr2bl'))!;
    expect(cell.indexOf('<w:tcBorders>')).toBeLessThan(cell.indexOf('<w:tcMar>'));
    expect(cell.indexOf('<w:tcBorders>')).toBeLessThan(cell.indexOf('<w:vAlign'));
  });

  it('composes with a T-account\'s resolved edges rather than replacing them', async () => {
    const table = createTableBlock(2, 2);
    table.borders = 'headerRule';
    table.rows[1].cells[0].diagonal = true;
    const question = createMcqQuestion() as McqQuestion;
    question.blocks = [table];
    const base = createWorksheet();
    const xml = await documentXml({
      ...base,
      questions: [question],
      flow: [{ type: 'question', id: question.id }],
    });
    const borders = xml.match(/<w:tcBorders>[^]*?<\/w:tcBorders>/g)!.find((chunk) =>
      chunk.includes('tr2bl'),
    )!;
    // Both are present, and the diagonal is last.
    expect(borders).toMatch(/<w:top /);
    expect(borders.indexOf('tr2bl')).toBeGreaterThan(borders.indexOf('<w:right '));
  });

  it('is unstored when absent, so an untouched table exports byte-identically', async () => {
    const plain = await documentXml(withDiagonal(false));
    expect(plain).not.toContain('tr2bl');
    expect(plain).not.toContain('<w:tcBorders>');
    // The IR says the same: nothing is carried for a cell nobody slashed.
    const node = tableNodeFor(createTableBlock(2, 2));
    expect(node && node.kind === 'table' && 'diagonal' in node.rows[0][0]).toBe(false);
  });

  it('reaches the IR for the cell that carries it, and only that cell', () => {
    const table = createTableBlock(2, 2);
    table.rows[1].cells[0].diagonal = true;
    const node = tableNodeFor(table);
    expect(node && node.kind === 'table' && node.rows[1][0].diagonal).toBe(true);
    expect(node && node.kind === 'table' && node.rows[0][0].diagonal).toBeUndefined();
  });
});
