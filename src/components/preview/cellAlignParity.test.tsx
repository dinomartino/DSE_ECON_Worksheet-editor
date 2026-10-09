import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderToStaticMarkup } from 'react-dom/server';
import { exportDocxBuffer } from '@/export/docx';
import { clipboardNodeHtml } from '@/export/clipboard';
import { createMcqQuestion, createTableBlock, createWorksheet } from '@/model/factories';
import { renderContentBlocks, type RenderNode } from '@/render/ir';
import type { CellAlign, McqQuestion, TableBlock, TextFormat, Worksheet } from '@/model/types';
import { NodeView } from './Preview';

/**
 * `CellAlign` wins over `TextFormat.align` in a table cell (§ A cell formats like any
 * other text). Older documents can carry a `format.align` on a cell, written by the
 * format bar's align buttons before they were hidden for cells. Word never sees it
 * (`cellParagraph` strips it), so the page and the clipboard must ignore it too, or a
 * cell reads centred on screen and prints flush left.
 */

/** A 1×2 table: cell 0 carries only an old `format.align`, cell 1 also its `CellAlign`. */
function table(cellAlign?: CellAlign): TableBlock {
  const block = createTableBlock(1, 2);
  const format: TextFormat = { align: 'center', bold: true };
  block.rows[0].cells[0] = { ...block.rows[0].cells[0], text: { en: [{ text: 'Old' }], zh: [] }, format };
  block.rows[0].cells[1] = {
    ...block.rows[0].cells[1],
    text: { en: [{ text: 'Set' }], zh: [] },
    format,
    ...(cellAlign ? { align: cellAlign } : {}),
  };
  return block;
}

function tableNode(block: TableBlock): RenderNode {
  const nodes: RenderNode[] = [];
  renderContentBlocks(nodes, [block], 'Body');
  return nodes.find((node) => node.kind === 'table')!;
}

/** Every `<td>`'s text-align declarations, in cell order. */
function tdAligns(html: string): string[][] {
  return [...html.matchAll(/<td[^>]*style="([^"]*)"/g)].map((match) =>
    [...match[1].matchAll(/text-align:\s*([a-z]+)/g)].map((align) => align[1]),
  );
}

async function documentXml(block: TableBlock): Promise<string> {
  const question = createMcqQuestion() as McqQuestion;
  question.blocks = [block];
  const worksheet: Worksheet = {
    ...createWorksheet(),
    questions: [question],
    flow: [{ type: 'question', id: question.id }],
  };
  const buffer = await exportDocxBuffer(worksheet, { language: 'en', version: 'student' }, new Map());
  return (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');
}

describe('a cell aligns by CellAlign, never by its format', () => {
  const node = tableNode(table('right'));

  it('Word: an old format.align is dropped, CellAlign is the w:jc', async () => {
    const xml = await documentXml(table('right'));
    const jc = (word: string) => xml.match(new RegExp(`<w:jc w:val="(\\w+)"/>(?:(?!</w:p>)[\\s\\S])*?${word}`))?.[1];
    expect(jc('Old')).toBe('left');
    expect(jc('Set')).toBe('right');
  });

  it('the page agrees with Word', () => {
    const html = renderToStaticMarkup(<NodeView node={node} language="en" />);
    expect(tdAligns(html)).toEqual([['left'], ['right']]);
    // The rest of the format still applies.
    expect(html).toContain('font-weight:700');
  });

  it('the clipboard agrees with Word', () => {
    const html = clipboardNodeHtml(node, 'en', '');
    expect(tdAligns(html)).toEqual([['left'], ['right']]);
    expect(html).toContain('font-weight:bold');
  });

  it('a columns row aligns by its tab stop on the page, as Word does', () => {
    const row: RenderNode = {
      kind: 'columns',
      style: 'Body',
      cells: [
        { text: { en: [{ text: 'A' }], zh: [] }, at: 0, format: { align: 'center' } },
        { text: { en: [{ text: 'B' }], zh: [] }, at: 0.5, align: 'right', format: { align: 'center' } },
      ],
    };
    const html = renderToStaticMarkup(<NodeView node={row} language="en" />);
    expect(html).not.toContain('text-align:center');
    expect(html).toContain('text-align:right');
  });
});
