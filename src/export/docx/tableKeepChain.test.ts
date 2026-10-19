import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { exportDocxBuffer } from './index';
import { renderNodeXml, CONTENT_WIDTH_TWIPS, type BodyContext } from './body';
import { createWorksheet, createMcqQuestion, createTableBlock } from '@/model/factories';
import { renderContentBlocks, type RenderNode, type TableNode } from '@/render/ir';
import { tablePieces } from '@/components/preview/pageNodes';
import type { OutputMode, Question, Worksheet } from '@/model/types';

/**
 * A table inside a keep chain (a classroom MC is kept whole). The preview keeps its rows
 * together (`tablePieces`) and moves the item whole; the `.docx` follows with a page break
 * before the item (§ `joinWithPageBreaks`), never with `w:keepNext` on the rows, which Word
 * marks with a black square beside every paragraph.
 */

const MODE: OutputMode = { language: 'en', version: 'student' };

function withTable(question: Question): Worksheet {
  question.blocks = [createTableBlock(4, 2)];
  const base = createWorksheet();
  return { ...base, questions: [question], flow: [{ type: 'question', id: question.id }] };
}

async function tableXml(worksheet: Worksheet): Promise<string> {
  const buffer = await exportDocxBuffer(worksheet, MODE, new Map());
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)![0];
}

function rowsKept(table: string): boolean[] {
  return table.match(/<w:tr>[\s\S]*?<\/w:tr>/g)!.map((row) => {
    const paragraphs = row.match(/<w:pPr>[\s\S]*?<\/w:pPr>/g)!;
    return paragraphs.every((pPr) => pPr.includes('<w:keepNext/>'));
  });
}

function tableNode(keepNext: boolean): TableNode {
  const nodes: RenderNode[] = [];
  renderContentBlocks(nodes, [createTableBlock(3, 2)], 'Body', { keepNext });
  return nodes.find((node): node is TableNode => node.kind === 'table')!;
}

function testContext(): BodyContext {
  let drawing = 0;
  return {
    fonts: { latin: 'Times New Roman', eastAsia: 'PMingLiU' } as BodyContext['fonts'],
    language: 'en',
    contentWidth: CONTENT_WIDTH_TWIPS,
    numIds: new Map(),
    imageRelId: () => undefined,
    nextDrawingId: () => ++drawing,
  };
}

describe('a table in a keep chain', () => {
  it('keeps its pieces together in the preview, and writes no keep flag on the rows', () => {
    const node = tableNode(true);
    const xml = renderNodeXml(node, testContext());
    const table = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/)![0];
    expect(rowsKept(table)).toEqual([false, false, false]);
    expect(xml).not.toContain('<w:keepNext/>');
    // Every row still may not split across a page: a row property, no black square.
    expect(table.match(/<w:cantSplit\/>/g)).toHaveLength(3);
    // The preview keeps every piece with what follows.
    expect(tablePieces(node).every((piece) => piece.keepNext)).toBe(true);
  });

  it('leaves a table outside a chain free to break between rows', () => {
    const node = tableNode(false);
    const table = renderNodeXml(node, testContext()).match(/<w:tbl>[\s\S]*?<\/w:tbl>/)![0];
    expect(rowsKept(table)).toEqual([false, false, false]);
    expect(tablePieces(node).some((piece) => !piece.keepNext)).toBe(true);
  });

  it('writes an MC stem table with no keep flags in the exported file', async () => {
    const table = await tableXml(withTable(createMcqQuestion()));
    expect(rowsKept(table).some(Boolean)).toBe(false);
  });
});
