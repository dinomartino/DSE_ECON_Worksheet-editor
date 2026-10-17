import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportDocxBuffer } from './index';
import { createMcqQuestion, createTableBlock, createWorksheet } from '@/model/factories';
import { cellsInRange, mergeRange } from '@/model/table';
import type { McqQuestion, OutputMode, TableBlock, Worksheet } from '@/model/types';

/**
 * A merge over several rows *and* columns (Tables vs Word, phase 2).
 *
 * Word spells a 2×2 merge as a `vMerge="restart"` cell with `gridSpan="2"` and, on the
 * next row, a `vMerge` continuation that also spans two grid columns. A continuation
 * spanning one column leaves the row a column short and Word shifts the rest of it left.
 */

const MODE: OutputMode = { language: 'en', version: 'student' };

function worksheetWith(table: TableBlock): Worksheet {
  const question = createMcqQuestion() as McqQuestion;
  question.blocks = [table];
  const base = createWorksheet();
  return { ...base, questions: [question], flow: [{ type: 'question', id: question.id }] };
}

async function rowsOf(table: TableBlock): Promise<string[]> {
  const buffer = await exportDocxBuffer(worksheetWith(table), MODE, new Map());
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  const tbl = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)![0];
  return tbl.match(/<w:tr>[\s\S]*?<\/w:tr>/g)!;
}

const gridColumns = (row: string) =>
  (row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).reduce((sum, cell) => {
    const span = cell.match(/<w:gridSpan w:val="(\d+)"\/>/);
    return sum + (span ? Number(span[1]) : 1);
  }, 0);

describe('a 2×2 merge in the .docx', () => {
  it('continues on the next row as one cell spanning both columns', async () => {
    const block = createTableBlock(3, 3);
    const range = cellsInRange(
      block.rows.map((row) => row.cells),
      block.rows[0].cells[0].id,
      block.rows[1].cells[1].id,
      (_, r, c) => block.rows[r]?.cells[c]?.id,
    );
    const rows = await rowsOf(mergeRange(block, range));
    expect(rows[0]).toContain('<w:gridSpan w:val="2"/><w:vMerge w:val="restart"/>');
    expect(rows[1]).toContain('<w:gridSpan w:val="2"/><w:vMerge/>');
    // Every row fills the table's three grid columns exactly.
    expect(rows.map(gridColumns)).toEqual([3, 3, 3]);
  });
});
