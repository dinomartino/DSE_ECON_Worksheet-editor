import { describe, expect, it } from 'vitest';
import type { OcrResult } from '@/platform/ocr';
import { keyCells, readAnswerSheet } from './answerSheet';
import { DPI, KEY, mcPaperPages, schemePages, zhStructuredPages } from './fixtures/ocrPages';
import { GRAPH, SCAN_SCALE, ScanPage, answerLinesPage, barcodePage, darkBorderPage, graphPage, keyGridPage } from './fixtures/scanRaster';
import { analyseLines } from './index';
import {
  OCR_TOLERANCE,
  findScanFigures,
  imageScale,
  inkCell,
  inkMap,
  ocrPage,
  readOcrPages,
  scaleAt,
  scanFigures,
  splitGluedLabel,
  type ScanFigures,
} from './ocrLayout';
import { pasteKind } from './scan';
import type { InlineRun } from '@/model/types';

const scale = scaleAt(DPI);
const box = (x: number, y: number, w: number, h: number): Array<[number, number]> => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const page = (lines: OcrResult['lines'], width = 1654, height = 2339): OcrResult => ({ width, height, lines, ms: 1 });
const text = (runs: readonly InlineRun[] | undefined) => (runs ?? []).map((r) => r.text).join('');
const read = (pages: OcrResult[]) => readOcrPages(pages, pages.map(() => scale));

describe('splitGluedLabel', () => {
  it.each([
    ['3.一位畫家在網上分享作品。', '3. 一位畫家在網上分享作品。'],
    ['12.Which of the following', '12. Which of the following'],
    ['1.A', '1. A'],
    ['1：', '1.'],
    ['A.(1) and (2) only', 'A. (1) and (2) only'],
    ['B.$45', 'B. $45'],
    ['(a)Explain why', '(a) Explain why'],
    ['（b）解釋', '（b） 解釋'],
    ['la. no → 0', '1a. no → 0'],
    ['Ib) yes', '1b) yes'],
  ])('%s → %s', (raw, want) => expect(splitGluedLabel(raw)).toBe(want));

  it.each(['1.5 million', '10:30 am', '2021-2022 S6 Mock', 'Answers:', 'land used by a farm', 'Ink is dry.'])('leaves %s alone', (raw) =>
    expect(splitGluedLabel(raw)).toBe(raw),
  );
});

describe('ocrPage', () => {
  it('turns pixels into points, takes the unclip margin off, and sets the baseline a fifth up', () => {
    const [item] = ocrPage(page([{ text: 'Supply rises.', score: 0.99, box: box(200, 300, 400, 40) }]), scale).items;
    const k = 72 / DPI;
    const pad = Math.min(40 * 0.15, 400 * 0.1);
    expect(item.x).toBeCloseTo((200 + pad) * k, 5);
    expect(item.w).toBeCloseTo((400 - pad * 2) * k, 5);
    expect(item.size).toBeCloseTo(40 * 0.85 * k, 5);
    // Centre 320 px, baseline 0.3 of the height below it: 332 px from the top.
    expect(item.y).toBeCloseTo((2339 - 332) * k, 5);
  });

  it('drops empty and unsure lines, and marks text set sideways', () => {
    const items = ocrPage(
      page([
        { text: '', score: 0, box: box(10, 10, 30, 30) },
        { text: 'smudge', score: 0.1, box: box(100, 100, 80, 30) },
        { text: 'Do not write here', score: 0.9, box: box(1560, 600, 30, 500) },
        { text: 'Sideways', score: 0.9, box: [[100, 900], [100, 700], [130, 700], [130, 900]] },
        { text: 'Kept', score: 0.9, box: box(200, 400, 80, 30) },
      ]),
      scale,
    ).items;
    expect(Object.fromEntries(items.map((it) => [it.str, !!it.rotated]))).toEqual({ Kept: false, Sideways: true, 'Do not write here': true });
  });

  it('levels a skewed page, so one row keeps one baseline', () => {
    const [result] = mcPaperPages().slice(1);
    const items = ocrPage(result, scale).items;
    const a = items.find((it) => it.str.startsWith('A. (1)'))!;
    const header = items.filter((it) => it.str === 'S5 Economics Uniform Test' || it.str === '2');
    expect(Math.abs(header[0].y - header[1].y)).toBeLessThan(a.size * 0.3);
  });

  it('keeps a space between a label in its own box and the text it touches', () => {
    const items = ocrPage(
      page([
        { text: '6.', score: 1, box: box(145, 209, 64, 44) },
        { text: '下表顯示某銀行的資產負債表。', score: 1, box: box(200, 206, 600, 40) },
      ]),
      scale,
    ).items;
    const [label, body] = items.sort((a, b) => a.x - b.x);
    expect(body.x - (label.x + label.w)).toBeGreaterThanOrEqual(label.size * 0.3 - 1e-6);
  });

  it('reads a picture as an A4 page', () => {
    expect(imageScale(1190)).toBeCloseTo(2, 5);
  });
});

describe('readOcrPages', () => {
  it('is OCR, never a scan, however damaged the text looks', () => {
    const r = read(mcPaperPages());
    expect(r.source).toBe('ocr');
    expect(r.pages).toBe(2);
    expect(pasteKind(r.lines, 'ocr')).toBe('ok');
    expect(analyseLines(r).kind).toBe('ok');
  });

  it('splits glued MC labels into questions, options and statements', () => {
    const a = analyseLines(read(mcPaperPages()));
    expect(a.outline.questions.map((q) => [q.kind, q.options.length, q.statements.length])).toEqual([
      ['mc', 4, 0],
      ['mc', 4, 0],
      ['mc', 4, 3],
    ]);
  });

  it('drops the margin strip and finds the running header although it drifts between pages', () => {
    const r = read(mcPaperPages());
    expect(r.lines.some((l) => /margins/.test(l.raw))).toBe(false);
    expect(r.lines.some((l) => /Uniform Test/.test(l.raw))).toBe(false);
    expect(r.chrome?.header?.rows.length).toBeGreaterThan(0);
    expect(OCR_TOLERANCE).toBeGreaterThan(9 * (72 / DPI));
  });

  it('reads a Chinese structured page with glued labels and marks', () => {
    const a = analyseLines(read(zhStructuredPages()));
    expect(a.outline.questions.map((q) => [q.label, q.parts.map((p) => p.marks)])).toEqual([
      ['3.', []],
      ['4.', [4, 2]],
    ]);
    expect(a.outline.questions[0].marks).toBe(3);
  });
});

describe('keyCells', () => {
  it('reads a key row cell by cell: one misread cell loses only itself', () => {
    expect(keyCells(['3D', '803', '13C', '18D', '23C', '28C', '33A', '38A', '43D'])?.map((p) => p.question)).toEqual([3, 13, 18, 23, 28, 33, 38, 43]);
    expect(keyCells(['3D 803 13C 18D', '23C'])?.map((p) => p.question)).toEqual([3, 13, 18, 23]);
  });

  it('is not a key when words are on the line, or too much is misread', () => {
    expect(keyCells(['1a. Yes, the opportunity cost remains unchanged.'])).toBeNull();
    expect(keyCells(['1C', '2B', 'x9', 'q7'])).toBeNull();
    expect(keyCells(['1C 2B'])).toBeNull();
  });
});

describe('a scanned marking scheme', () => {
  const sheet = readAnswerSheet(read(schemePages()));

  it('keeps 44 of 45 answers when one key cell is misread', () => {
    const keys = new Map(sheet.entries.filter((e) => e.letter !== undefined && !e.part).map((e) => [e.question, 'ABCDE'[e.letter!]]));
    expect(keys.has(8)).toBe(false);
    expect([...keys].filter(([q, l]) => KEY[q - 1] === l)).toHaveLength(44);
  });

  it('reads each answer | notes table column by column under the grid', () => {
    expect(sheet.lines.filter((l) => /→/.test(l.raw) && /\(1\)/.test(l.raw)).map((l) => l.raw)).toEqual([]);
    const parts = sheet.entries.filter((e) => e.part).map((e) => `${e.question}${e.part}`);
    expect(parts.slice(0, 4)).toEqual(['1a', '1b', '2a', '2b']);
    const one = sheet.entries.find((e) => e.question === 1 && e.part === 'a')!;
    expect(one.points?.map((p) => [text(p.runs), p.marks])).toEqual([
      ['Yes, the cost stays the same', 1],
      ['as the tax only lowers the return on shares', 1],
    ]);
    expect(one.notes?.map((n) => text(n.runs))).toContain('1a. no → 0');
  });
});

describe('a scan’s title', () => {
  // OCR's type size is a box's height, so a key-grid row or a part's line can stand taller
  // than the body and pass for a heading: only text that reads as a title names the paper.
  const line = (text: string, x: number, y: number, h = 30): OcrResult['lines'][number] => ({
    text,
    score: 0.99,
    box: box(x, y, Math.max(h, text.length * h * 0.45), h),
  });
  const body = Array.from({ length: 12 }, (_, k) => line(`The price of a good rises when demand rises and supply stays the same ${k}.`, 200, 700 + k * 60));
  const titleOf = (top: OcrResult['lines']) => read([page([...top, ...body])]).title;

  it('is never a key-grid row', () => {
    expect(titleOf(['2B', '7A', '12B', '17B', '22A', '27D'].map((t, k) => line(t, 200 + k * 220, 300, 42)))).toBeUndefined();
  });

  it('is never a question, part or option line', () => {
    expect(titleOf([line('(a) Explain whether Statement A is positive. (2 marks)', 200, 300, 42)])).toBeUndefined();
    expect(titleOf([line('3. Which of the following is a free good?', 200, 300, 42)])).toBeUndefined();
  });

  it('is kept when it reads as one', () => {
    expect(titleOf([line('S6 Mock Examination Economics', 500, 300, 42)])).toBe('S6 Mock Examination Economics');
    expect(titleOf([line('經濟', 700, 300, 42)])).toBe('經濟');
  });
});

describe('drawings on a scanned page', () => {
  const ink = (p: ScanPage) => inkMap(p.rgba, p.width, p.height, inkCell(SCAN_SCALE));
  const drawings = (p: ScanPage) => findScanFigures(p.result, ink(p), SCAN_SCALE);

  it('finds a graph with its axis names and curve labels, not its caption or the prose round it', () => {
    const [graph, ...rest] = drawings(graphPage());
    expect(rest).toEqual([]);
    expect(graph.x).toBeLessThanOrEqual(GRAPH.x0);
    expect(graph.y).toBeLessThanOrEqual(GRAPH.y0);
    expect(graph.x + graph.w).toBeGreaterThanOrEqual(GRAPH.x1);
    expect(graph.y + graph.h).toBeGreaterThanOrEqual(GRAPH.y1);
    // "Figure 1" (250–280 px) stays above it, "(a) Explain…" (990 px) below it.
    expect(graph.y).toBeGreaterThan(285);
    expect(graph.y + graph.h).toBeLessThan(990);
  });

  it('places the crop in its question and takes the labels out of the text', () => {
    const p = graphPage();
    const { found, figures } = scanFigures(p.result, ink(p), SCAN_SCALE);
    expect(figures).toHaveLength(1);
    const pictures: ScanFigures = { found, crops: figures.map((f) => ({ box: f.box, image: { src: 'data:image/png;base64,graph' } })) };
    const r = readOcrPages([p.result], [SCAN_SCALE], [pictures]);
    const texts = r.lines.map((l) => l.text.trim());
    expect(texts).not.toContain('S');
    expect(texts).not.toContain('Quantity');
    expect(texts.some((t) => t.includes('Price ($)'))).toBe(false);
    expect(texts).toContain('Figure 1');
    const [q] = analyseLines(r).outline.questions;
    expect(JSON.stringify(q)).toContain('data:image/png;base64,graph');
    expect(q.parts).toHaveLength(2);
    // The crop: the figure's region with a small margin, inside the page.
    const { crop } = figures[0];
    expect(crop.x).toBeLessThan(GRAPH.x0);
    expect(crop.x + crop.w).toBeGreaterThan(GRAPH.x1);
    expect(crop.x + crop.w).toBeLessThanOrEqual(p.width);
  });

  it('without a crop the drawing is a slot to fill, and its labels still leave the text', () => {
    const p = graphPage();
    const r = readOcrPages([p.result], [SCAN_SCALE], [{ found: findScanFigures(p.result, ink(p), SCAN_SCALE), crops: [] }]);
    expect(r.lines.some((l) => l.image)).toBe(true);
    expect(r.lines.map((l) => l.text.trim())).not.toContain('D');
    // Read with no drawings found (the web, a test), the labels are text as before.
    expect(readOcrPages([p.result], [SCAN_SCALE]).lines.map((l) => l.text.trim())).toContain('D');
  });

  it('never takes a key grid, even with a correction scribbled in a cell', () => {
    expect(drawings(keyGridPage())).toEqual([]);
  });

  it('never takes dotted answer lines or the page frame', () => {
    expect(drawings(answerLinesPage())).toEqual([]);
  });

  it('never takes a scan’s dark border', () => {
    expect(drawings(darkBorderPage())).toEqual([]);
  });

  it('never takes a barcode', () => {
    expect(drawings(barcodePage())).toEqual([]);
  });

  it('takes a photo standing in a ruled box of text, not the box', () => {
    const page = new ScanPage()
      .frame(200, 300, 1200, 700)
      .text('In 2018, a restaurant chain sold a bucket priced in bitcoins on its website.', 230, 330)
      .text('The bucket could only be bought online and was delivered to the home.', 230, 380)
      .rect(600, 450, 380, 520, 30)
      .rect(680, 520, 220, 200, 230)
      .text('0.00112', 700, 800, 0.9)
      .text('In the above case, bitcoin performed as a ______.', 200, 1100);
    const [photo, ...rest] = drawings(page);
    expect(rest).toEqual([]);
    expect(photo.x).toBeGreaterThan(560);
    expect(photo.x + photo.w).toBeLessThan(1020);
  });
});
