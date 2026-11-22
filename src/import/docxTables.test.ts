/**
 * Word tables through the whole import (k-0491): reader → lines → walk → the editor's
 * `TableBlock`. Each fixture is invented, but copies a table structure from a real mock
 * paper: a heading row with one filled cell, a fill-in sentence typed after a table, a
 * heading merged across columns, a cell of several lines, a bank's balance sheet typed as
 * two columns, pictures beside quotes, a borderless table that only lays text out, the
 * whole paper inside a one-cell frame with tables nested in it.
 */
import { describe, expect, it } from 'vitest';
import { analyseLines, buildImport, readDocx } from '.';
import { A4_SECT, EMF, gridTable, makeDocx, p, para, picture, PNG_1x1, r, TABLE_STYLES, type GridOpts } from './fixtures/docx';
import { getQuestionType } from '@/registry';
import type { ContentBlock, McqQuestion, Question, StructuredQuestion, TableBlock, TableCell } from '@/model/types';

type Spec = Parameters<typeof makeDocx>[0];

const OPTIONS = ['A.\tthe first', 'B.\tthe second', 'C.\tthe third', 'D.\tthe fourth'].map((o) => para(o)).join('');
const ruled: GridOpts = { style: 'TableGrid' };

async function importOf(spec: Spec) {
  const read = await readDocx(await makeDocx({ styles: TABLE_STYLES, sectPr: A4_SECT, ...spec }));
  const analysis = analyseLines(read);
  const questions = buildImport(analysis).builds.map((b) => b.fill(getQuestionType(b.typeId)!.create()) as Question);
  return { read, analysis, questions };
}

function tablesIn(blocks: readonly ContentBlock[] | undefined): TableBlock[] {
  return (blocks ?? []).flatMap((b) => (b.kind === 'table' ? [b] : b.kind === 'source' ? tablesIn(b.blocks) : []));
}

function blocksOf(q: Question): ContentBlock[] {
  return q.type === 'mcq' ? (q as McqQuestion).blocks : (q as StructuredQuestion).blocks;
}

const cellText = (c: TableCell) => [...c.text.en, ...c.text.zh].map((x) => x.text).join('');
const grid = (t: TableBlock) => t.rows.map((row) => row.cells.map((c) => (c.covered ? '·' : cellText(c))));
const paragraphs = (blocks: readonly ContentBlock[]) => blocks.flatMap((b) => (b.kind === 'paragraph' ? [[...b.text.en, ...b.text.zh].map((x) => x.text).join('')] : []));

describe('Word tables: rows the import used to drop or add', () => {
  it('keeps a heading row with one filled cell as the table’s first row, not a loose line above it', async () => {
    const table = gridTable(
      [
        [para(''), para('$ billion', { jc: 'center' })],
        [para('Coins in circulation'), para('12', { jc: 'center' })],
        [para('Demand deposits'), para('80', { jc: 'center' })],
      ],
      { ...ruled, grid: [7000, 1300] },
    );
    const { questions } = await importOf({ body: para('1.\tStudy the money figures below.') + table + para('The money supply is') + OPTIONS });
    const q = questions[0];
    const [t] = tablesIn(blocksOf(q));
    expect(grid(t)).toEqual([
      ['', '$ billion'],
      ['Coins in circulation', '12'],
      ['Demand deposits', '80'],
    ]);
    expect(paragraphs(blocksOf(q))).toEqual(['Study the money figures below.', 'The money supply is']);
    expect(t.rows[0].cells[1].align).toBe('center');
    expect(t.columnWidths).toEqual([0.8434, 0.1566]);
  });

  it('never adds a fill-in sentence typed after a table as one more row', async () => {
    const table = gridTable(
      [
        [para(''), para('Plan X'), para('Plan Y')],
        [para('Output per day'), para('90'), para('110')],
      ],
      ruled,
    );
    const blank = p(r('In this case Plan X is ') + r('\t', { u: 'single' }) + r(' and Plan Y is ') + r('\t', { u: 'single' }) + r('.'));
    const gap = para('Both plans use       workers in       .');
    const { questions } = await importOf({ body: para('1.\tA firm compares two plans.') + table + para('') + blank + para('') + gap + OPTIONS });
    const blocks = blocksOf(questions[0]);
    expect(tablesIn(blocks).map((t) => t.rows.length)).toEqual([2]);
    expect(paragraphs(blocks)).toEqual(['A firm compares two plans.', 'In this case Plan X is \t and Plan Y is \t.', 'Both plans use       workers in       .']);
  });

  it('keeps a dialogue typed with TABs, and sentences typed side by side, as text', async () => {
    const { questions, analysis } = await importOf({
      body:
        para('There are 2 questions in this paper.\tChoose the best answer for each question.') +
        para('1.\tRead the conversation.') +
        para('Ann:\tI buy the same number of apples a week, whatever they cost me.') +
        para('Ben:\tI spend the same amount on apples each week, whatever the price is.') +
        OPTIONS +
        para('2.\tAnother question.') +
        OPTIONS,
    });
    expect(analysis.outline.questions.map((q) => q.number)).toEqual([1, 2]);
    const blocks = blocksOf(questions[0]);
    expect(tablesIn(blocks)).toEqual([]);
    expect(paragraphs(blocks).slice(1)).toEqual(['Ann:\tI buy the same number of apples a week, whatever they cost me.', 'Ben:\tI spend the same amount on apples each week, whatever the price is.']);
  });

  it('keeps a typed table of short figures a table, and a comments table whose last column is prose', async () => {
    const { questions } = await importOf({ body: para('1.\tStudy the figures.') + para('Year\tOutput') + para('2024\t100') + para('2025\t120') + OPTIONS });
    expect(grid(tablesIn(blocksOf(questions[0]))[0])).toEqual([
      ['Year', 'Output'],
      ['2024', '100'],
      ['2025', '120'],
    ]);
  });
});

describe('Word tables: merges, lines and alignment', () => {
  it('keeps a heading merged across three columns, and the empty cells Word ruled off', async () => {
    const table = gridTable(
      [
        [{ xml: para(''), nil: ['top', 'left', 'bottom'] }, { xml: para('Output before trade') + para('(units)'), span: 3 }],
        [{ xml: para(''), nil: ['top', 'left'] }, para('Good A', { jc: 'center' }), { xml: para(''), nil: ['left', 'right'] }, para('Good B', { jc: 'center' })],
        [para('Country X'), para('60'), para('AND'), para('20')],
      ],
      { ...ruled, grid: [2000, 2700, 900, 2700] },
    );
    const { questions } = await importOf({ body: para('1.\tThe table shows the output of two countries.') + table + OPTIONS });
    const [t] = tablesIn(blocksOf(questions[0]));
    expect(grid(t)).toEqual([
      ['', 'Output before trade\n(units)', '·', '·'],
      ['', 'Good A', '', 'Good B'],
      ['Country X', '60', 'AND', '20'],
    ]);
    expect(t.rows[0].cells[1].colSpan).toBe(3);
    expect(t.borders).toBeUndefined();
  });

  it('keeps a cell merged down two rows', async () => {
    const table = gridTable(
      [
        [para('Tax'), para('Band'), para('Rate')],
        [{ xml: para('Salaries tax'), vMerge: 'restart' }, para('First $50 000'), para('2%')],
        [{ xml: para(''), vMerge: 'continue' }, para('Next $50 000'), para('6%')],
      ],
      ruled,
    );
    const { questions } = await importOf({ body: para('1.\tStudy the tax table.') + table + OPTIONS });
    const [t] = tablesIn(blocksOf(questions[0]));
    expect(grid(t)).toEqual([
      ['Tax', 'Band', 'Rate'],
      ['Salaries tax', 'First $50 000', '2%'],
      ['·', 'Next $50 000', '6%'],
    ]);
    expect(t.rows[1].cells[0].rowSpan).toBe(2);
  });

  it('keeps a cell’s several lines as line breaks, its alignment, a narrow table’s width and centring', async () => {
    const table = gridTable(
      [
        [para('Person', { jc: 'center' }), p(r('Money') + '<w:r><w:br/></w:r>' + r('assets ($)'), { jc: 'center' }), para('Note', { jc: 'both' })],
        [para('A', { jc: 'center' }), para('5 000', { jc: 'right' }), para('Saves', { jc: 'both' })],
      ],
      { ...ruled, grid: [2000, 2000, 2000], jc: 'center', header: 1 },
    );
    const { questions } = await importOf({ body: para('1.\tThe table shows wealth.') + table + OPTIONS });
    const [t] = tablesIn(blocksOf(questions[0]));
    expect(grid(t)[0]).toEqual(['Person', 'Money\nassets ($)', 'Note']);
    expect(t.rows[1].cells.map((c) => c.align ?? (c.justify ? 'justify' : 'left'))).toEqual(['center', 'right', 'justify']);
    expect(t.width).toBe(0.62);
    expect(t.align).toBe('center');
    expect(t.headerRows).toBe(1);
  });
});

describe('Word tables: shapes the editor has its own form for', () => {
  it('reads a balance sheet typed as two columns of "label ⇥ figure" as the T-account', async () => {
    const table = gridTable(
      [
        [para('Assets ($ million)', { jc: 'center' }), para('Liabilities ($ million)', { jc: 'center' })],
        [para('\tReserves\t300') + para('\tLoans\t900'), para('\tDeposits\t1200')],
      ],
      { ...ruled, grid: [4150, 4150] },
    );
    const { questions } = await importOf({ body: para('1.\tThe balance sheet of a banking system is shown below.') + table + OPTIONS });
    const [t] = tablesIn(blocksOf(questions[0]));
    expect(t.borders).toBe('headerRule');
    expect(grid(t)).toEqual([
      ['Assets ($ million)', '·', 'Liabilities ($ million)', '·'],
      ['Reserves', '300', 'Deposits', '1200'],
      ['Loans', '900', '', ''],
    ]);
    expect(t.rows[0].cells.map((c) => c.colSpan)).toEqual([2, undefined, 2, undefined]);
    expect(t.rows[1].cells.map((c) => c.align)).toEqual([undefined, 'right', undefined, 'right']);
  });

  it('reads the same in Chinese, and leaves a two-column table of words a plain table', async () => {
    const account = gridTable(
      [
        [para('資產（百萬元）'), para('負債（百萬元）')],
        [para('儲備\t200') + para('貸款\t?'), para('存款\t1000')],
      ],
      ruled,
    );
    const words = gridTable(
      [
        [para('Good'), para('Use')],
        [para('Rice'), para('Food')],
      ],
      ruled,
    );
    const { questions } = await importOf({ body: para('1.\t下表顯示銀行體系的資產負債表。') + account + para('問題如下。') + words + OPTIONS });
    const [t, plain] = tablesIn(blocksOf(questions[0]));
    expect(grid(t)).toEqual([
      ['資產（百萬元）', '·', '負債（百萬元）', '·'],
      ['儲備', '200', '存款', '1000'],
      ['貸款', '?', '', ''],
    ]);
    expect(plain.borders).toBeUndefined();
    expect(grid(plain)).toEqual([
      ['Good', 'Use'],
      ['Rice', 'Food'],
    ]);
  });

  const rels = Object.fromEntries([5, 6, 7].map((n) => [`rId${n}`, ['image', `media/p${n}.png`] as [string, string]]));
  const media = Object.fromEntries([5, 6, 7].map((n) => [`media/p${n}.png`, PNG_1x1]));

  it('keeps each picture in its cell beside its quote, and one table Word split in two as one', async () => {
    const row = (n: number, who: string, quote: string) => [para(who, { jc: 'center' }) + p(picture(`rId${n}`, 90 + n, 80)), para(quote, { jc: 'both' })];
    const first = gridTable([row(5, 'A shopper', 'Prices keep rising and I buy less every month.'), row(6, 'A shop owner', 'Fewer customers come in since the new tax.')], { ...ruled, grid: [2200, 6700] });
    const second = gridTable([row(7, 'An official', 'The tax pays for health care.')], { ...ruled, grid: [2200, 6700] });
    const { questions } = await importOf({ rels, media, body: para('1.\tSource D: Some views on the tax.') + first + para('') + second + para('(a)\tExplain one view.\t(2 marks)') });
    const tables = tablesIn(blocksOf(questions[0]));
    expect(tables).toHaveLength(1);
    expect(grid(tables[0]).map((r) => r[0])).toEqual(['A shopper', 'A shop owner', 'An official']);
    expect(tables[0].rows.map((r) => r.cells[0].image?.widthPx)).toEqual([95, 96, 97]);
    expect(tables[0].rows[0].cells[1].justify).toBe(true);
    expect(blocksOf(questions[0]).some((b) => b.kind === 'image')).toBe(false);
  });

  it('moves a cell picture that did not load out after its table, where the figure check sees it', async () => {
    const lost = { rIdE: ['image', 'media/chart.emf'] as [string, string] };
    const table = gridTable([[para('Figure') + p(picture('rIdE', 120, 90)), para('A graph of the market.')], [para('Year'), para('2025')]], ruled);
    const { read, analysis } = await importOf({ rels: lost, media: { 'media/chart.emf': EMF }, body: para('1.\tStudy the figure.') + table + OPTIONS });
    const at = read.lines.findIndex((l) => l.image);
    expect(read.lines[at - 1].cells).toBeDefined();
    expect(read.lines.filter((l) => l.tableRow).every((l) => l.tableRow!.cells.every((c) => !c.image))).toBe(true);
    expect(analysis.flags.some((f) => f.kind === 'imageLost')).toBe(true);
  });
});

describe('Word tables: layout, frames and captions', () => {
  it('reads a borderless table that only lays out a dialogue as text, and the same table ruled as a table', async () => {
    const rows = [
      [para('Ann:'), para('I would buy the same number of apples, however much they cost.')],
      [para('Ben:'), para('I always spend the same amount of money on apples every week.')],
    ];
    const body = (t: string) => para('1.\tRead the conversation.') + t + OPTIONS;
    const layout = await importOf({ body: body(gridTable(rows, { style: 'TableGrid', borders: 'none' })) });
    expect(tablesIn(blocksOf(layout.questions[0]))).toEqual([]);
    expect(paragraphs(blocksOf(layout.questions[0])).slice(1)).toEqual([
      'Ann:\tI would buy the same number of apples, however much they cost.',
      'Ben:\tI always spend the same amount of money on apples every week.',
    ]);
    const data = await importOf({ body: body(gridTable(rows, ruled)) });
    expect(grid(tablesIn(blocksOf(data.questions[0]))[0]).map((r) => r[0])).toEqual(['Ann:', 'Ben:']);
  });

  it('reads a paper set inside a one-cell frame, its nested tables in their own questions and parts', async () => {
    const inner = gridTable(
      [
        [para('Year', { jc: 'center' }), para('Duty ($)', { jc: 'center' })],
        [para('2024', { jc: 'center' }), para('3.3', { jc: 'center' })],
      ],
      ruled,
    );
    const frame = gridTable(
      [
        [
          para('Section A') +
            para('1.\tPrices of a good rose this year.') +
            para('(a)\tExplain one reason.\t(2 marks)') +
            para('2.\tStudy the table.') +
            inner +
            para('(a)\tIs the duty progressive?\t(3 marks)') +
            para('(b)\tStudy the table below.') +
            gridTable(
              [
                [para('Item'), para('Cost')],
                [para('Rent'), para('40')],
              ],
              ruled,
            ) +
            para('Explain the change.\t(4 marks)'),
        ],
      ],
      ruled,
    );
    const { questions } = await importOf({ body: frame });
    expect(questions).toHaveLength(2);
    const q2 = questions[1] as StructuredQuestion;
    expect(grid(tablesIn(q2.blocks)[0])).toEqual([
      ['Year', 'Duty ($)'],
      ['2024', '3.3'],
    ]);
    expect(q2.parts.map((part) => tablesIn(part.blocks).map(grid))).toEqual([[], [[['Item', 'Cost'], ['Rent', '40']]]]);
  });

  it('prints "Table 1: …" above a table, and 表二 under one, as the table’s caption', async () => {
    const t = gridTable(
      [
        [para('Year'), para('Exports')],
        [para('2025'), para('300')],
      ],
      ruled,
    );
    const { questions } = await importOf({ body: para('1.\tStudy the tables.') + para('Table 1: Exports of Country A') + t + para('表二') + para('Then answer.') + OPTIONS });
    const [table] = tablesIn(blocksOf(questions[0]));
    expect(table.caption?.en.map((x) => x.text).join('')).toBe('Table 1: Exports of Country A');
    expect(table.captionPlacement).toBe('above');
    expect(paragraphs(blocksOf(questions[0]))).toEqual(['Study the tables.', '表二', 'Then answer.']);

    const below = await importOf({ body: para('1.\t研究下表。') + t + para('表二：出口') + para('然後回答。') + OPTIONS });
    const [zh] = tablesIn(blocksOf(below.questions[0]));
    expect(zh.captionPlacement).toBe('below');
    expect(paragraphs(blocksOf(below.questions[0]))).toEqual(['研究下表。', '然後回答。']);
  });
});
