import { describe, expect, it } from 'vitest';
import { buildDocxParts } from '@/export/docx';
import { choiceQuestion } from '@/library/testKit';
import { createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { McqQuestion, TableBlock, TableRow } from '@/model/types';
import { withFittedTables } from '@/pastpapers/pack';
import { DEFAULT_PAGE_METRICS } from '@/render/ir';
import { fitTableToContent, refitTable, tableFitApplies, tableFitPlace } from './tableFit';

/** User u-zhww: a past-paper table printed across the whole page, hard to read. */

const row = (id: string, ...cells: [string, string?][]): TableRow => ({
  id,
  cells: cells.map(([en, zh], i) => ({ id: `${id}c${i}`, text: bi(en, zh ?? en) })),
});
const table = (...rows: TableRow[]): TableBlock => ({ kind: 'table', id: 't', rows });
const COLUMN = tableFitPlace([], 't', DEFAULT_PAGE_METRICS);

const gini = table(
  row('h', [''], ['Gini coefficient', '堅尼系數']),
  row('a', ['Accommodation and food services', '住宿及膳食服務'], ['0.34']),
  row('b', ['Finance and insurance', '金融及保險'], ['0.51']),
);

describe('a table sized to its words', () => {
  it('a short table takes only the room its words need, centred, columns by their text', () => {
    const fitted = fitTableToContent(gini, COLUMN);
    expect(fitted.width).toBeGreaterThan(0.4);
    expect(fitted.width).toBeLessThan(0.75);
    expect(fitted.align).toBe('center');
    expect(fitted.columnWidths![0]).toBeGreaterThan(fitted.columnWidths![1]);
    expect(fitted.columnWidths!.reduce((n, w) => n + w, 0)).toBeCloseTo(1, 6);
  });

  it('centres the figures and a short heading row, and leaves words and a cell’s own alignment alone', () => {
    const own = { ...gini, rows: [gini.rows[0], { ...gini.rows[1], cells: [gini.rows[1].cells[0], { ...gini.rows[1].cells[1], align: 'right' as const }] }, gini.rows[2]] };
    const fitted = fitTableToContent(own, COLUMN);
    expect(fitted.rows[0].cells.map((c) => c.align)).toEqual(['center', 'center']);
    expect(fitted.rows[1].cells.map((c) => c.align)).toEqual([undefined, 'right']);
    expect(fitted.rows[2].cells.map((c) => c.align)).toEqual([undefined, 'center']);
  });

  it('a wide table still takes the whole column, narrow columns kept, the rest shared out', () => {
    const long = 'The government imposes a per-unit tax on the good and the price rises by the full amount of the tax';
    const wide = table(row('h', ['Case'], ['Description']), row('a', ['1'], [long]), row('b', ['2'], [long]));
    const fitted = fitTableToContent(wide, COLUMN);
    expect(fitted.width).toBeUndefined();
    expect(fitted.align).toBeUndefined();
    expect(fitted.columnWidths![0]).toBeLessThan(0.25);
  });

  it('counts a typed tab to the next 0.5 in stop, as the cell prints it', () => {
    const tabbed = fitTableToContent(table(row('a', ['Reserves\t300'])), COLUMN);
    const spaced = fitTableToContent(table(row('a', ['Reserves 300'])), COLUMN);
    expect(tabbed.width!).toBeGreaterThan(spaced.width!);
  });

  it('measures both languages, so one width suits either paper', () => {
    const zhLonger = table(row('a', ['Tax', '從量稅令價格上升的幅度']));
    expect(fitTableToContent(zhLonger, COLUMN).width!).toBeGreaterThan(fitTableToContent(table(row('a', ['Tax'])), COLUMN).width!);
  });

  it('never touches a table with a width of its own, or a grid of pictures', () => {
    expect(fitTableToContent({ ...gini, width: 0.8 }, COLUMN)).toEqual({ ...gini, width: 0.8 });
    expect(tableFitApplies({ ...gini, columnWidths: [0.5, 0.5] })).toBe(false);
    const pictures = table(row('a', ['(1)'], ['(2)']));
    pictures.rows[0].cells[0] = { ...pictures.rows[0].cells[0], image: { src: 'data:image/png;base64,AA', widthPx: 10, heightPx: 10, altText: bi('', '') } };
    expect(fitTableToContent(pictures, COLUMN)).toBe(pictures);
  });

  it('is done once: a fitted table is not refitted, but Fit to content redoes a sized one', () => {
    const fitted = fitTableToContent(gini, COLUMN);
    expect(fitTableToContent(fitted, COLUMN)).toBe(fitted);
    const resized = { ...fitted, width: 0.95, columnWidths: [0.5, 0.5] };
    expect(refitTable(resized, COLUMN).width).toBe(fitted.width);
  });
});

describe('where the bank’s tables sit', () => {
  const tables = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `o${i}`, text: bi('', ''), blocks: [{ ...gini, id: `ot${i}` }] }));

  it('a stem table is centred in the column; an option’s, in a two-by-two grid, keeps to its half', () => {
    const q = choiceQuestion('Which?', '哪項？') as McqQuestion;
    const question = { ...q, blocks: [...q.blocks, gini], options: tables(4), optionLayout: 'columns2' as const };
    const fitted = withFittedTables(question, DEFAULT_PAGE_METRICS) as McqQuestion;
    const stem = fitted.blocks.find((b) => b.kind === 'table') as TableBlock;
    const option = fitted.options[0].blocks![0] as TableBlock;
    expect(stem.align).toBe('center');
    expect(option.align).toBeUndefined();
    expect(option.width).toBeLessThanOrEqual(0.9);
    expect(option.width).toBeGreaterThan(stem.width!);
    expect(tableFitPlace([question], 'ot1', DEFAULT_PAGE_METRICS).containerTwips).toBe(DEFAULT_PAGE_METRICS.textWidth / 2);
  });

  it('prints at that width in Word, centred', () => {
    const q = choiceQuestion('Which?', '哪項？');
    const fitted = withFittedTables({ ...q, blocks: [...q.blocks, gini] }, DEFAULT_PAGE_METRICS);
    const ws = { ...createWorksheet(), questions: [fitted], flow: [{ type: 'question' as const, id: q.id }] };
    const xml = buildDocxParts(ws, { language: 'en', version: 'student' } as never).documentXml;
    const tblPr = /<w:tblPr>.*?<\/w:tblPr>/.exec(xml)![0];
    const width = Number(/<w:tblW w:w="(\d+)"/.exec(tblPr)![1]);
    expect(width).toBeLessThan(DEFAULT_PAGE_METRICS.textWidth * 0.75);
    expect(tblPr).toContain('<w:jc w:val="center"/>');
  });
});

describe('a table that only just fits', () => {
  it('gives up its air before any column drops under its words (a tab keeps its room)', () => {
    // DSE2025 P1 Q34's option: "Reserves⇥300" needs its 1 in stop and the figure after it.
    const option = table(row('h', ['Assets ($)'], ['Liabilities ($)']), row('a', ['Reserves\t300\nLoans\t900'], ['Deposits\t1 200']));
    const place = tableFitPlace([{ type: 'mcq', optionLayout: 'columns2', options: [{ blocks: [{ id: 't' }] }] }], 't', DEFAULT_PAGE_METRICS);
    const fitted = fitTableToContent(option, place);
    const firstColumn = fitted.width! * place.containerTwips * fitted.columnWidths![0];
    // "Reserves" runs past the 0.5 in stop, so 300 starts at 1 in (1440 twips), plus 216 of padding.
    expect(firstColumn).toBeGreaterThan(1440 + 216 + 300);
  });
});
