import { describe, expect, it } from 'vitest';
import { readAnswerSheet } from './answerSheet';
import { analyseLines } from './index';
import { toSourceLines } from './lines';
import { rowText } from './pageChrome';
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

  it('splits an option row whose B lost its dot, and reads the bare letter as option B', () => {
    const row = (texts: string[]) => texts.map((t, k) => at(t, 62 + k * 130, 676));
    const stem = [at('42.', 42, 700), at('Which of the above are correct?', 66, 700)];
    const result = analyseLines(read([page([...stem, ...row(['A. (1) and (3) only', 'B (1) and (4) only', 'C. (2) and (3) only', 'D. (2) and (4) only'])])]));
    expect(result.outline.questions[0]).toMatchObject({ kind: 'mc' });
    expect(result.outline.questions[0].options.map((o) => o.runs.map((r) => r.text).join(''))).toEqual(['(1) and (3) only', '(1) and (4) only', '(2) and (3) only', '(2) and (4) only']);
    // A bare letter out of its place, or a row of prose, stays one line.
    expect(raws([page(row(['A. (1) only', 'C (2) only', 'D. (3) only']))])).toEqual(['A. (1) only C (2) only D. (3) only']);
    expect(raws([page(row(['A. rises', 'B falls']))])).toEqual(['A. rises B falls']);
  });

  it('splits options C and D set only a word space apart on a row that starts at A', () => {
    const items = [
      at('11.', 42, 700),
      at('A public good is a good', 66, 700),
      at('A.', 80, 676),
      at('(1) and (2) only', 98, 676),
      at('B. (2)', 200, 676),
      at('and (3) only', 236, 676),
      at('C. (1) and (3) only', 320, 676),
      at('D. (1), (2) and (3)', 427, 676),
    ];
    const [q] = analyseLines(read([page(items)])).outline.questions;
    expect(q.options.map((o) => o.runs.map((r) => r.text).join(''))).toEqual(['(1) and (2) only', '(2) and (3) only', '(1) and (3) only', '(1), (2) and (3)']);
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
    // One page: nothing repeats, so only the page number goes; the title is the masthead now.
    expect(raws([p(1)])).toEqual(['1. Question 1 text.']);
    expect(layoutPdf([p(1)]).chrome?.masthead?.map(rowText)).toEqual(['Economics Test']);
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

  it('never grows a picture whose region is already measured (a scan’s drawing)', () => {
    const box = { x: 100, y: 400, w: 200, h: 150 };
    const caption = [at('Figure 1', 170, 556)];
    expect(findFigures(page(caption, { graphics: [{ kind: 'image', box }] })).figures[0].h).toBeGreaterThan(150);
    expect(findFigures(page(caption, { graphics: [{ kind: 'image', box, placed: true }] })).figures).toEqual([box]);
  });
});

const image = (x: number, y: number, w = 200, h = 140) => ({ kind: 'image' as const, box: { x, y, w, h } });

describe('layoutPdf: pictures as options', () => {
  const stem = [at('36.', 42, 760), at('Which of the following diagrams can best describe the change?', 66, 760)];
  const optionPictures = (pages: PdfPage[]) => {
    const q = analyseLines(read(pages)).outline.questions[0];
    return { kind: q.kind, texts: q.options.map((o) => o.runs.map((r) => r.text).join('')), pictures: q.options.map((o) => (o.blocks ?? []).filter((b) => b.kind === 'image').length) };
  };

  it('pairs a 2 × 2 grid by place: each letter at its picture’s top-left corner', () => {
    // "A.      B." over the top pair, "C.      D." over the bottom pair, pictures listed out of order.
    const pages = [
      page([...stem, at('A.', 54, 708), at('B.', 294, 708), at('C.', 54, 518), at('D.', 294, 518)], {
        graphics: [image(306, 560), image(66, 560), image(306, 370), image(66, 370)],
      }),
    ];
    const lines = layoutPdf(pages).lines;
    expect(lines.map((l) => (l.figure ? `pic@${l.figure.x},${l.figure.y}` : l.runs.map((r) => r.text).join('')))).toEqual([
      '36. Which of the following diagrams can best describe the change?',
      'A.',
      'pic@66,560',
      'B.',
      'pic@306,560',
      'C.',
      'pic@66,370',
      'D.',
      'pic@306,370',
    ]);
    expect(optionPictures(pages)).toEqual({ kind: 'mc', texts: ['', '', '', ''], pictures: [1, 1, 1, 1] });
  });

  it('pairs a 1 × 4 row with its letters centred under the pictures', () => {
    const pages = [page([...stem, ...[0, 1, 2, 3].map((k) => at(`${'ABCD'[k]}.`, 110 + k * 130, 590))], { graphics: [0, 1, 2, 3].map((k) => image(60 + k * 130, 600, 110, 120)) })];
    expect(optionPictures(pages)).toEqual({ kind: 'mc', texts: ['', '', '', ''], pictures: [1, 1, 1, 1] });
  });

  it('pairs letters printed over their pictures', () => {
    const pages = [
      page([...stem, at('A.', 160, 712), at('B.', 400, 712), at('C.', 160, 522), at('D.', 400, 522)], {
        graphics: [image(66, 560), image(306, 560), image(66, 370), image(306, 370)],
      }),
    ];
    expect(optionPictures(pages)).toEqual({ kind: 'mc', texts: ['', '', '', ''], pictures: [1, 1, 1, 1] });
  });

  it('leaves pictures that are not options, and option letters far from any picture, as they were', () => {
    const captions = [page([at('Study the figures below.', 66, 760), at('(1) Before', 140, 530), at('(2) After', 380, 530)], { graphics: [image(66, 560), image(306, 560)] })];
    expect(raws(captions)).toEqual(['Study the figures below.', '', '', '(1) Before', '(2) After']);
    const far = [page([...stem, at('A.', 54, 300), at('B.', 294, 300)], { graphics: [image(66, 560), image(306, 560)] })];
    expect(raws(far)).toEqual([stem.map((it) => it.str).join(' '), '', '', 'A. B.']);
  });
});

describe('layoutPdf: a marking scheme of stacked two-column tables', () => {
  const twoColumns = (top: number, left: string[], right: string[]) =>
    left.flatMap((t, k) => [at(t, 60, top - k * 12), ...(right[k] ? [at(right[k], 320, top - k * 12)] : [])]);
  const q4 = twoColumns(
    760,
    ['4a. production cost in country A is lower than B (1)', 'so country A will export watches to B (1)', 'as her cost is lower than the terms of trade', 'b. terms of trade of one umbrella is 0.5 W', 'gain from trade is six watches here (2)'],
    ['4a. wrong production cost or no data → 0', 'correct data and country A exports → 2', 'students should explain the comparison', '4b. one mark for the gain per unit only', 'wrong unit or no unit → max. 1 mark'],
  );
  const q6 = twoColumns(
    360,
    ['6a. nominal interest rate equals real rate (1)', 'plus the expected inflation rate here', 'b. no (1). the real income would increase (2)', 'if the fall in prices is larger than wages', 'the purchasing power of wages then rises'],
    ['6a. missing words underlined → 0 overall', 'actual inflation above expected → 1 only', 'b. percentage fall in deflation → -1', 'yes → 0 overall, no standpoint → 0', 'uncertain answers are given no mark at all'],
  );
  const notes = ['Tariff revenue (1)', 'S2 (1) EA (1), M (1) P1 (1)', 'Without S2, only 1 mark for EA'].map((t, k) => at(t, 400, 560 - k * 14));

  it('keeps a question number over a figure, and the notes beside the figure, with that question', () => {
    const pages = [page([...q4, at('5.', 60, 680), ...notes, ...q6], { graphics: [image(60, 420, 300, 240)] })];
    const lines = raws(pages);
    const five = lines.indexOf('5.');
    expect(lines.slice(five, five + 4)).toEqual(['5.', '', 'Tariff revenue (1)', 'S2 (1) EA (1), M (1) P1 (1) Without S2, only 1 mark for EA']);
    expect(lines.findIndex((l) => l.startsWith('4b.'))).toBeLessThan(five);
    expect(lines.findIndex((l) => l.startsWith('6a.'))).toBeGreaterThan(five);
    const sheet = readAnswerSheet(read(pages));
    const text = (q: number, part?: string) =>
      sheet.entries.filter((e) => e.question === q && e.part === part).flatMap((e) => (e.points ?? []).map((p) => p.runs.map((r) => r.text).join(''))).join(' | ');
    expect(text(5)).toContain('Tariff revenue');
    expect(text(4, 'b')).not.toContain('Tariff');
    expect(text(6, 'b')).not.toContain('Tariff');
  });
});
