import { describe, expect, it } from 'vitest';
import { analyseLines } from './index';
import { toSourceLines } from './lines';
import { findFigures, layoutPdf, type PdfItem, type PdfPage } from './pdfLayout';

/** An item whose width is estimated from its text: Latin ~0.5 em, CJK 1 em. */
const at = (str: string, x: number, y: number, extra: Partial<PdfItem> = {}): PdfItem => {
  const size = extra.size ?? 11;
  const w = [...str].reduce((sum, ch) => sum + (/[㐀-鿿＀-￯]/.test(ch) ? size : size * 0.5), 0);
  return { str, x, y, w, size, ...extra };
};
const page = (items: PdfItem[], extra: Partial<PdfPage> = {}): PdfPage => ({ width: 595, height: 842, items, ...extra });
const raws = (pages: PdfPage[]) => layoutPdf(pages).lines.map((l) => l.runs.map((r) => r.text).join(''));
const read = (pages: PdfPage[]) => ({ lines: toSourceLines(layoutPdf(pages).lines), source: 'pdf' as const });

describe('layoutPdf', () => {
  it('re-attaches a hanging number and option letters set well apart from their text', () => {
    expect(raws([page([at('Explain the term.', 90, 700), at('1.', 42, 700), at('Scarcity', 120, 676), at('A.', 90, 676)])])).toEqual([
      '1. Explain the term.',
      'A. Scarcity',
    ]);
  });

  it('splits four options set on one row, each keeping the row’s indent', () => {
    const lines = layoutPdf([
      page([
        at('1.', 42, 700),
        at('Which of the above are correct?', 66, 700),
        ...['A.', 'B.', 'C.', 'D.'].flatMap((l, k) => [at(l, 62 + k * 120, 676), at(`(${k + 1}) only`, 86 + k * 120, 676)]),
      ]),
    ]).lines;
    expect(lines.map((l) => l.runs.map((r) => r.text).join(''))).toEqual(['1. Which of the above are correct?', 'A. (1) only', 'B. (2) only', 'C. (3) only', 'D. (4) only']);
    expect(new Set(lines.slice(1).map((l) => l.marginDepth)).size).toBe(1);
  });

  it('joins wrapped lines into paragraphs, a hyphenated break closed up', () => {
    const wide = 'The government of a small open economy has decided to raise the tax on environ-';
    expect(
      raws([
        page([
          at('1.', 42, 700),
          at(wide, 66, 700, { w: 470 }),
          at('mental damage. Explain.', 66, 688),
          at('A short line.', 66, 664),
          at('Another paragraph.', 66, 652),
        ]),
      ]),
    ).toEqual(['1. The government of a small open economy has decided to raise the tax on environmental damage. Explain.', 'A short line.', 'Another paragraph.']);
  });

  it('gives marks on a row of their own to the line above', () => {
    const lines = read([page([at('(a)', 66, 700), at('Explain ONE reason.', 92, 700), at('(3 marks)', 510, 688)])]).lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ label: '(a)', text: 'Explain ONE reason.', trailingMarks: 3 });
  });

  it('writes a drawn answer blank into the gap it fills', () => {
    const items = [at('Most probably the old system is', 66, 450), at('and the new one is', 250, 450), at('.', 380, 450)];
    const rules = [
      { kind: 'rule' as const, box: { x: 220, y: 448, w: 26, h: 0.5 } },
      { kind: 'rule' as const, box: { x: 345, y: 448, w: 30, h: 0.5 } },
    ];
    expect(raws([page(items, { graphics: rules })])).toEqual(['Most probably the old system is ______ and the new one is ______ .']);
  });

  it('reads a Chinese paper: tight joins, full-width labels and marks', () => {
    const a = analyseLines(
      read([
        page([
          at('1.', 42, 700),
          at('香港政府決定向進口汽車徵收更高的稅項，令汽車價格上升。下列哪項有關汽車市場的', 66, 700, { w: 470 }),
          at('描述是正確的？', 66, 688),
          at('A.', 92, 664),
          at('需求下降', 116, 664),
          at('B.', 92, 652),
          at('供應上升', 116, 652),
          at('C.', 92, 640),
          at('兩者皆下降', 116, 640),
          at('D.', 92, 628),
          at('兩者皆不變', 116, 628),
          at('2.', 42, 600),
          at('解釋機會成本的意思。', 66, 600),
          at('（3分）', 520, 600),
        ]),
      ]),
    );
    expect(a.outline.questions).toHaveLength(2);
    const [q1, q2] = a.outline.questions;
    expect(q1.stem[0].kind === 'paragraph' && q1.stem[0].runs.map((r) => r.text).join('')).toBe(
      '香港政府決定向進口汽車徵收更高的稅項，令汽車價格上升。下列哪項有關汽車市場的描述是正確的？',
    );
    expect(q1.options.map((o) => o.runs.map((r) => r.text).join(''))).toEqual(['需求下降', '供應上升', '兩者皆下降', '兩者皆不變']);
    expect(q1.side).toBe('zh');
    expect(q2.marks).toBe(3);
  });

  it('does not take a table for two columns, but reads real columns in order', () => {
    const table = page([
      at('Study the table.', 66, 760),
      ...[700, 682, 664, 646, 628, 610].flatMap((y, k) => [at(`Row ${k + 1}`, 80, y), at(`${k * 10}`, 330, y), at(`${k * 20}`, 430, y)]),
      at('Which row is largest?', 66, 590),
    ]);
    expect(raws([table])[1]).toBe('Row 1\t0\t0');

    const prose = (x: number, top: number, n: number) =>
      Array.from({ length: n }, (_, k) => at(`column ${x < 300 ? 'left' : 'right'} line ${k + 1} with some words`, x, top - k * 12, { w: 230 }));
    const lines = raws([page([...prose(40, 760, 6), ...prose(310, 760, 6)])]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^column left line 1 .* column left line 6/);
    expect(lines[1]).toMatch(/^column right line 1 .* column right line 6/);
  });

  it('splits a narrow gap when the rows around it start a column at the same x', () => {
    const rows = [
      ['First option:', 'to study at HKU', 652],
      ['Second option:', 'to study at CUHK', 640], // the label ends 14 pt before the column
      ['Third option:', 'to study abroad', 628],
    ] as const;
    const items = rows.flatMap(([a, b, y]) => [at(a, 82, y, { w: a.length * 4.8 }), at(b, 163, y)]);
    expect(layoutPdf([page(items)]).lines.map((l) => l.cells?.map((c) => c.map((r) => r.text).join('')))).toEqual([
      ['First option:', 'to study at HKU'],
      ['Second option:', 'to study at CUHK'],
      ['Third option:', 'to study abroad'],
    ]);
  });

  it('drops headers repeated in place across pages and lone page numbers', () => {
    const p = (n: number) => page([at('Economics Test', 42, 800), at(`${n}`, 295, 40), at(`${n}.`, 42, 700), at(`Question ${n} text.`, 66, 700)]);
    expect(raws([p(1), p(2)])).toEqual(['1. Question 1 text.', '2. Question 2 text.']);
    // One page: nothing repeats, so only the page number goes.
    expect(raws([p(1)])).toEqual(['Economics Test', '1. Question 1 text.']);
  });

  it('keeps a superscript on its line', () => {
    expect(raws([page([at('The price rises by 10', 66, 700), at('2', 177, 704, { size: 7 }), at('percent.', 182, 700)])])).toEqual([
      'The price rises by 102 percent.',
    ]);
  });

  it('makes every page of a text-less file one picture (a scan)', () => {
    const scan = page([], { graphics: [{ kind: 'image', box: { x: 0, y: 0, w: 595, h: 842 } }] });
    const layout = layoutPdf([scan, scan]);
    expect(layout.lines.map((l) => [l.page, l.image?.src, !!l.figure])).toEqual([
      [1, '', true],
      [2, '', true],
    ]);
    expect(analyseLines(read([scan, scan])).kind).toBe('scan');
  });
});

describe('findFigures', () => {
  it('finds a graph and leaves table borders, shaded cells and a page frame alone', () => {
    const items = [at('Firm X', 300, 700), at('Price', 100, 520, { size: 9 }), at('Quantity', 220, 396, { size: 9 })];
    const { figures } = findFigures(
      page(items, {
        graphics: [
          { kind: 'rule', box: { x: 60, y: 690, w: 450, h: 0.5 } },
          { kind: 'shape', box: { x: 290, y: 694, w: 60, h: 18 } }, // shaded cell behind "Firm X"
          { kind: 'shape', box: { x: 20, y: 20, w: 555, h: 802 } }, // page frame
          { kind: 'rule', box: { x: 100, y: 410, w: 0, h: 120 } }, // y-axis
          { kind: 'rule', box: { x: 100, y: 410, w: 200, h: 0 } }, // x-axis
          { kind: 'shape', box: { x: 120, y: 420, w: 160, h: 100 }, curved: true },
        ],
      }),
    );
    expect(figures).toHaveLength(1);
    expect(figures[0].x).toBe(100);
    expect(figures[0].y).toBeLessThan(400); // grown down to the "Quantity" label
  });

  it('ignores a bordered table: rules and the dots where they meet', () => {
    const graphics = [0, 18, 36].flatMap((y) => [
      { kind: 'rule' as const, box: { x: 64, y: 660 + y, w: 450, h: 0.5 } },
      { kind: 'rule' as const, box: { x: 64, y: 660 + y, w: 0.5, h: 0.5 } },
      { kind: 'rule' as const, box: { x: 312, y: 660 + y, w: 0.5, h: 0.5 } },
    ]);
    expect(findFigures(page([at('Number of owners', 76, 680), at('3', 320, 680)], { graphics })).figures).toEqual([]);
  });

  it('ignores a page-sized image under a text layer (an OCR’d scan)', () => {
    const { figures } = findFigures(page([at('1. Text', 42, 700)], { graphics: [{ kind: 'image', box: { x: 0, y: 0, w: 595, h: 842 } }] }));
    expect(figures).toEqual([]);
  });
});
