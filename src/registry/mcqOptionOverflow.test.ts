import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportDocxBuffer } from '@/export/docx';
import { questionClipboardHtml } from '@/export/clipboard';
import { createMcqQuestion, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { DiagramBlock, McqOptionLayout, McqQuestion, OutputMode, Worksheet } from '@/model/types';
import { DEFAULT_PAGE_METRICS, endsInBlankLine, type ColumnsNode, type OptionRowNode, type RenderNode } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import { withFlow } from '@/test/fixtures';
import { printedOptionLayout, resolveOptionLayout } from './mcq';

/**
 * GitHub #2: an option too long for its tab-stop slot broke the row in Word ("B." pushed
 * right, a letter stranded at a line end). Such a question now prints as the next layout
 * that holds it, decided once in the IR from the page: inline → 2 columns → grid.
 */

const EN: OutputMode = { language: 'en', version: 'student' };
const BI: OutputMode = { language: 'bilingual', version: 'student' };

const LONG = 'The price of the good rises and the quantity transacted falls sharply';

function mcq(layout: McqOptionLayout, options: Array<[string, string]>): McqQuestion {
  return {
    ...createMcqQuestion(),
    id: 'q',
    blocks: [{ kind: 'paragraph', id: 'stem', text: bi('Which is correct?', '下列哪項正確？') }],
    optionLayout: layout,
    options: options.map(([en, zh], index) => ({ id: `o${index}`, text: bi(en, zh) })),
  };
}

const enOnly = (...texts: string[]): Array<[string, string]> => texts.map((text) => [text, '']);

function paper(question: McqQuestion, baseFontSize?: number): Worksheet {
  const worksheet = withFlow(createWorksheet(), [question], { replaceLayout: true });
  if (baseFontSize !== undefined) worksheet.baseFontSize = baseFontSize;
  return worksheet;
}

function optionNodes(worksheet: Worksheet, mode: OutputMode = EN): RenderNode[] {
  const nodes = renderWorksheet(worksheet, mode).questions[0].nodes;
  return nodes.filter(
    (node) => node.kind === 'optionRow' || (node.kind === 'columns' && node.style === 'MCQ Option'),
  );
}

async function documentXml(worksheet: Worksheet, mode: OutputMode = EN): Promise<string> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode));
  return zip.file('word/document.xml')!.async('string');
}

describe('options that fit keep their row', () => {
  it('prints a fitting 2-column question as the same two tab-stop rows as before', () => {
    const question = mcq('columns2', enOnly('(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'));
    expect(printedOptionLayout(question, 'en')).toBe('columns2');
    const rows = optionNodes(paper(question));
    // The row's exact shape, so a fitting document exports as it always has.
    expect(rows).toEqual(
      [0, 2].map((start) => ({
        kind: 'columns',
        style: 'MCQ Option',
        keepNext: start === 0,
        // An MC keeps whole (`keepQuestionWhole`).
        keepLines: true,
        cells: [0, 1].map((offset) => ({
          text: question.options[start + offset].text,
          at: offset / 2,
          marker: `${'ABCD'[start + offset]}.`,
          edit: { kind: 'mcqOption', questionId: 'q', optionId: `o${start + offset}` },
        })),
        indent: 480,
      })),
    );
  });

  it('keeps short inline options on one line', () => {
    const question = mcq('inline', enOnly('$10', '$20', '$30', '$40'));
    expect(printedOptionLayout(question, 'en')).toBe('inline');
    expect(optionNodes(paper(question))).toHaveLength(1);
  });

  it('never rewrites the stored layout', () => {
    const question = mcq('columns2', enOnly(LONG, 'B', 'C', 'D'));
    const worksheet = paper(question);
    renderWorksheet(worksheet, EN);
    expect(worksheet.questions[0]).toBe(question);
    expect(resolveOptionLayout(question)).toBe('columns2');
  });
});

describe('a 2-column question too long for its slots prints as a grid', () => {
  const question = mcq('columns2', enOnly(LONG, 'The price falls', 'The quantity transacted rises', 'Both rise'));

  it('emits one text grid, two to a row, each option in its own hung cell', () => {
    expect(printedOptionLayout(question, 'en')).toBe('grid');
    const [grid] = optionNodes(paper(question)) as OptionRowNode[];
    expect(grid.kind).toBe('optionRow');
    expect(grid.textGrid).toEqual({ perRow: 2, indent: 480, gap: 240 });
    expect(grid.cells).toHaveLength(4);
    grid.cells.forEach((cell, index) => {
      const line = cell[0] as ColumnsNode;
      // The letter in the stacked option's gutter, the text from it: a wrap hangs.
      expect(line.indent).toBe(360);
      expect(line.hanging).toBe(360);
      expect(line.cells[0].marker).toBe(`${'ABCD'[index]}.`);
      expect(line.cells[1].text).toEqual(question.options[index].text);
      expect(line.cells[1].edit).toEqual({ kind: 'mcqOption', questionId: 'q', optionId: `o${index}` });
    });
    // Its trailing blank line is the boundary gap's, not one more on top of it.
    expect(endsInBlankLine([grid])).toBe(true);
  });

  it('exports one indented table whose cells each hold one option, wrapping under its text', async () => {
    const xml = await documentXml(paper(question));
    const tables = xml.match(/<w:tbl>.*?<\/w:tbl>/g) ?? [];
    expect(tables).toHaveLength(1);
    const table = tables[0]!;
    expect(table).toContain('<w:tblInd w:w="480" w:type="dxa"/>');
    expect(table.match(/<w:tr>/g)).toHaveLength(2);
    const cells = table.match(/<w:tc>.*?<\/w:tc>/g) ?? [];
    expect(cells).toHaveLength(4);
    cells.forEach((cell, index) => {
      expect(cell).toContain(`<w:t xml:space="preserve">${'ABCD'[index]}. </w:t>`);
      expect(cell).toContain(question.options[index].text.en[0].text);
      // Hung at the gutter, so a wrapped line returns under the option's text.
      expect(cell).toContain('<w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs>');
      expect(cell).toContain('<w:ind w:left="360" w:hanging="360"/>');
      // The left column keeps its gap clear of the right column's letter.
      expect(cell.includes('<w:tcMar><w:right w:w="240" w:type="dxa"/></w:tcMar>')).toBe(index % 2 === 0);
    });
  });

  it('squares off an odd last row', () => {
    const three = mcq('columns2', enOnly(LONG, 'B', 'C'));
    const [grid] = optionNodes(paper(three)) as OptionRowNode[];
    expect(grid.cells).toHaveLength(4);
    expect(grid.cells[3]).toEqual([]);
  });

  it('copies as the same grid', () => {
    const html = questionClipboardHtml(paper(question), 'q', EN);
    expect(html.match(/<tr>/g)).toHaveLength(2);
    expect(html).toContain('margin-left:24pt');
  });
});

describe('an inline question too long for one line', () => {
  it('prints as 2 columns when the options fit in half the line', () => {
    const question = mcq('inline', enOnly('The price rises', 'The price falls', 'The price is unchanged', 'It cannot be determined'));
    expect(printedOptionLayout(question, 'en')).toBe('columns2');
    const rows = optionNodes(paper(question)) as ColumnsNode[];
    expect(rows.map((row) => row.cells.map((cell) => cell.at))).toEqual([[0, 0.5], [0, 0.5]]);
  });

  it('prints as a grid when even half the line is too short', () => {
    const question = mcq('inline', enOnly(LONG, 'B', 'C', 'D'));
    expect(printedOptionLayout(question, 'en')).toBe('grid');
    expect(optionNodes(paper(question))[0].kind).toBe('optionRow');
  });
});

describe('what decides', () => {
  it('measures the language being printed, the wider when bilingual', () => {
    const zhLong = '該物品的價格上升，而交易量大幅下降，市場出現短缺';
    const question = mcq('columns2', [['Rises', zhLong], ['Falls', ''], ['Same', ''], ['Both', '']]);
    expect(printedOptionLayout(question, 'en')).toBe('columns2');
    expect(printedOptionLayout(question, 'zh')).toBe('grid');
    // Bilingual, the one option printing Chinese only is measured on its Chinese.
    const zhOnly = mcq('columns2', [['', zhLong], ['Falls', ''], ['Same', ''], ['Both', '']]);
    expect(printedOptionLayout(zhOnly, 'bilingual')).toBe('grid');
    expect(printedOptionLayout(mcq('columns2', enOnly('Rises', 'Falls', 'Same', 'Both')), 'bilingual')).toBe('columns2');
  });

  it('gives a bilingual option its own cell: a row cannot hold its second line', () => {
    // Word starts the 中文 line back at the indent, ahead of the next option's tab.
    const question = mcq('columns2', [['Rises', '上升'], ['Falls', '下降'], ['Same', '不變'], ['Both', '兩者']]);
    expect(printedOptionLayout(question, 'en')).toBe('columns2');
    expect(printedOptionLayout(question, 'bilingual')).toBe('grid');
    expect(optionNodes(paper(question), BI)[0].kind).toBe('optionRow');
  });

  it('gives an option with a hard break its own cell', () => {
    const question = mcq('columns2', enOnly('Rises\nsharply', 'Falls', 'Same', 'Both'));
    expect(printedOptionLayout(question, 'en')).toBe('grid');
  });

  it('reads the document’s text size', () => {
    const text = 'The price rises and the output falls sharply';
    const question = mcq('columns2', enOnly(text, 'B', 'C', 'D'));
    const at = (fontSize: number) => printedOptionLayout(question, 'en', { ...DEFAULT_PAGE_METRICS, fontSize });
    expect(at(10)).toBe('columns2');
    expect(at(12)).toBe('grid');
    expect(optionNodes(paper(question, 10))[0].kind).toBe('columns');
    expect(optionNodes(paper(question, 12))[0].kind).toBe('optionRow');
  });

  it('reads the page’s text width', () => {
    const question = mcq('inline', enOnly('Price rises', 'Price falls', 'Quantity falls', 'No change'));
    expect(printedOptionLayout(question, 'en')).toBe('inline');
    expect(printedOptionLayout(question, 'en', { ...DEFAULT_PAGE_METRICS, textWidth: 6000 })).toBe('columns2');
  });

  it('measures Arial wider than Times', () => {
    const text = 'The price of the good rises and the quan';
    const question = mcq('columns2', enOnly(text, 'B', 'C', 'D'));
    expect(printedOptionLayout(question, 'en')).toBe('columns2');
    expect(printedOptionLayout(question, 'en', { ...DEFAULT_PAGE_METRICS, latinFont: 'Arial' })).toBe('grid');
  });
});

describe('figure options are left as they were', () => {
  const figure = (id: string): DiagramBlock => ({
    kind: 'diagram',
    id,
    diagram: { x: { title: bi('Q', '') }, y: { title: bi('P', '') }, curves: [], points: [], labels: [], arrows: [] },
    widthPx: 200,
    heightPx: 160,
    altText: bi('graph', ''),
  });

  it('keeps the figure grid, one row per pair, however long the letter line', () => {
    const question = mcq('columns2', enOnly(LONG, LONG, LONG, LONG));
    question.options.forEach((option, index) => (option.blocks = [figure(`f${index}`)]));
    expect(printedOptionLayout(question, 'en')).toBe('columns2');
    const rows = optionNodes(paper(question)) as OptionRowNode[];
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.textGrid).toBeUndefined());
    expect(endsInBlankLine([rows[1]])).toBe(false);
  });

  it('still stacks a figure question set to inline', () => {
    const question = mcq('inline', enOnly('A', 'B', 'C', 'D'));
    question.options[0].blocks = [figure('f0')];
    expect(printedOptionLayout(question, 'en')).toBe('stacked');
  });
});
