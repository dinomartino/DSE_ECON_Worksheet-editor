import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportDocxBuffer } from '@/export/docx/index';
import { createMcqQuestion, createTableBlock, createWorksheet } from './factories';
import { insertRow, mergeDown, removeRow, styleCells, withHeaderRows } from './table';
import type { McqQuestion, OutputMode, TableBlock, Worksheet } from './types';

/**
 * The optional table settings of Tables vs Word, phase 3: vertical alignment in a cell,
 * heading rows that repeat on each page, and grey cell shading. Each is unstored until
 * set, so a table that uses none exports exactly as before.
 */

const MODE: OutputMode = { language: 'en', version: 'student' };

function worksheetWith(table: TableBlock): Worksheet {
  const question = createMcqQuestion() as McqQuestion;
  question.blocks = [table];
  const base = createWorksheet();
  return { ...base, questions: [question], flow: [{ type: 'question', id: question.id }] };
}

async function tableXml(table: TableBlock): Promise<string> {
  const buffer = await exportDocxBuffer(worksheetWith(table), MODE, new Map());
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)![0];
}

const rowsOf = (xml: string) => xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g)!;
const cellsOf = (row: string) => row.match(/<w:tc>[\s\S]*?<\/w:tc>/g)!;

describe('vertical alignment and shading', () => {
  it('stores only what differs from the default, and clears back to nothing', () => {
    const block = createTableBlock(2, 2);
    const at = [{ rowIndex: 0, cellIndex: 1 }];
    const set = styleCells(block, at, { vAlign: 'bottom', shading: 'D9D9D9' });
    expect(set.rows[0].cells[1]).toMatchObject({ vAlign: 'bottom', shading: 'D9D9D9' });
    const cleared = styleCells(set, at, { vAlign: undefined, shading: undefined });
    expect(cleared.rows[0].cells[1]).toEqual(block.rows[0].cells[1]);
    expect('vAlign' in cleared.rows[0].cells[1]).toBe(false);
  });

  it('hands the same block back when nothing changes, so no empty undo step', () => {
    const block = createTableBlock(2, 2);
    expect(styleCells(block, [{ rowIndex: 0, cellIndex: 0 }], { vAlign: undefined })).toBe(block);
  });

  it('writes w:vAlign and w:shd in the order CT_TcPr requires', async () => {
    const block = styleCells(createTableBlock(1, 2), [{ rowIndex: 0, cellIndex: 0 }], {
      vAlign: 'top',
      shading: 'F2F2F2',
    });
    const [first, second] = cellsOf(rowsOf(await tableXml(block))[0]);
    expect(first).toMatch(
      /<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"\/><w:tcMar>[\s\S]*<\/w:tcMar><w:vAlign w:val="top"\/>/,
    );
    // An untouched cell is centred and unfilled, as every table was before.
    expect(second).not.toContain('<w:shd');
    expect(second).toContain('<w:vAlign w:val="center"/>');
  });

  it('fills a vertical merge’s continuation too, or Word paints its lower half white', async () => {
    const shaded = styleCells(createTableBlock(2, 1), [{ rowIndex: 0, cellIndex: 0 }], {
      shading: 'BFBFBF',
    });
    const rows = rowsOf(await tableXml(mergeDown(shaded, 0, 0)));
    expect(rows[1]).toContain('<w:vMerge/>');
    expect(rows[1]).toContain('w:fill="BFBFBF"');
  });
});

describe('heading rows', () => {
  it('marks the heading rows w:tblHeader, which Word repeats on each page', async () => {
    const rows = rowsOf(await tableXml(withHeaderRows(createTableBlock(4, 2), 2)));
    expect(rows.map((row) => row.includes('<w:tblHeader/>'))).toEqual([true, true, false, false]);
  });

  it('writes nothing for a table without one', async () => {
    expect(await tableXml(createTableBlock(3, 2))).not.toContain('w:tblHeader');
  });

  it('is clamped to the table, and zero removes the field', () => {
    const block = createTableBlock(3, 2);
    expect(withHeaderRows(block, 9).headerRows).toBe(3);
    const off = withHeaderRows(withHeaderRows(block, 1), 0);
    expect('headerRows' in off).toBe(false);
  });

  it('grows when a row is added inside it and shrinks when one is deleted from it', () => {
    const block = withHeaderRows(createTableBlock(4, 2), 2);
    expect(insertRow(block, 1).headerRows).toBe(3);
    expect(insertRow(block, 2).headerRows).toBe(2);
    expect(removeRow(block, 0).headerRows).toBe(1);
    expect(removeRow(block, 3).headerRows).toBe(2);
    expect('headerRows' in removeRow(withHeaderRows(block, 1), 0)).toBe(false);
  });
});
