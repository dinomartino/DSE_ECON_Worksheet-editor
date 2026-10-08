import { describe, expect, it } from 'vitest';
import { rowText } from './pageChrome';
import { layoutPdf, type PdfItem, type PdfPage } from './pdfLayout';

/** An item whose width is estimated from its text: Latin ~0.5 em, CJK 1 em. */
const at = (str: string, x: number, y: number, extra: Partial<PdfItem> = {}): PdfItem => {
  const size = extra.size ?? 11;
  const w = [...str].reduce((sum, ch) => sum + (/[㐀-鿿＀-￯]/.test(ch) ? size : size * 0.5), 0);
  return { str, x, y, w, size, ...extra };
};
const page = (items: PdfItem[]): PdfPage => ({ width: 595, height: 842, items });

/** A body: a question per page, set across the text column (42–552). */
const body = (n: number, top = 700): PdfItem[] => [
  at(`${n}.`, 42, top),
  at('Explain why the demand for salt is price inelastic in Hong Kong today.', 66, top, { w: 486 }),
  at('Give one reason with an example from the market for rice.', 66, top - 14),
];

describe('PDF header and footer', () => {
  it('keeps the running header and footer, zoned by position, with the page number found by counting', () => {
    const pages = [1, 2, 3].map((n) =>
      page([
        at('S.5 Economics Test 2', 42, 800, { size: 10 }),
        at(`Page ${n} of 3`, 510, 800, { size: 10 }),
        at('© A Teacher', 42, 40, { size: 9 }),
        at(`- ${n} -`, 290, 40, { size: 9 }),
        ...body(n),
      ]),
    );
    const { chrome, lines } = layoutPdf(pages);
    expect(chrome?.header?.rows).toEqual([
      { left: [{ kind: 'text', text: 'S.5 Economics Test 2', size: 10 }], center: [], right: [{ kind: 'pageNumber', pattern: 'longForm', prefix: '', suffix: '', size: 10 }] },
    ]);
    expect(chrome?.footer?.rows).toEqual([
      { left: [{ kind: 'text', text: '© A Teacher', size: 9 }], center: [{ kind: 'pageNumber', pattern: 'plain', prefix: '- ', suffix: ' -', size: 9 }], right: [] },
    ]);
    expect(chrome?.firstPageHeader).toBeUndefined();
    expect(lines.map((l) => l.runs.map((r) => r.text).join('')).filter((t) => /Economics|Teacher/.test(t))).toEqual([]);
  });

  it('reads page 1’s own header when the running one is not on page 1, and P.n numbers', () => {
    const first = page([
      at('Unit 3 Worksheet', 230, 800, { size: 14, bold: true }),
      at('Name:', 450, 786),
      at('______________', 480, 786, { w: 72 }),
      ...body(1, 720),
    ]);
    const later = (n: number) => page([at('Unit 3 Worksheet', 42, 800, { size: 10 }), at(`P.${n}`, 530, 800, { size: 10 }), ...body(n)]);
    const { chrome } = layoutPdf([first, later(2), later(3)]);
    expect(chrome?.header?.rows.map(rowText)).toEqual(['Unit 3 Worksheet\tP.#']);
    expect(chrome?.header?.rows[0].right).toEqual([{ kind: 'pageNumber', pattern: 'pDot', prefix: '', suffix: '', size: 10 }]);
    expect(chrome?.firstPageHeader?.rows).toEqual([
      { left: [], center: [{ kind: 'text', text: 'Unit 3 Worksheet', bold: true, size: 14 }], right: [] },
      { left: [], center: [], right: [{ kind: 'fillIn', prefix: 'Name:', suffix: '', widthCh: 14 }] },
    ]);
  });
});

describe('PDF masthead', () => {
  it('takes page 1’s heading rows above the first question, Chinese labels and blanks as fill-ins', () => {
    const items = [
      at('聖保羅中學', 260, 790, { size: 14, bold: true }),
      at('中四經濟科測驗', 250, 770, { bold: true }),
      at('姓名：', 42, 750),
      at('＿＿＿＿＿＿', 75, 750),
      at('班別：', 420, 750),
      at('＿＿＿', 453, 750),
      at('Time allowed: 30 minutes', 42, 735),
      ...body(1, 700),
    ];
    const { chrome, lines } = layoutPdf([page(items)]);
    expect(chrome?.masthead).toEqual([
      { left: [], center: [{ kind: 'text', text: '聖保羅中學', bold: true, size: 14 }], right: [] },
      { left: [], center: [{ kind: 'text', text: '中四經濟科測驗', bold: true }], right: [] },
      { left: [{ kind: 'fillIn', prefix: '姓名：', suffix: '', widthCh: 6 }], center: [], right: [{ kind: 'fillIn', prefix: '班別：', suffix: '', widthCh: 4 }] },
      { left: [{ kind: 'text', text: 'Time allowed: 30 minutes' }], center: [], right: [] },
    ]);
    expect(lines[0].runs.map((r) => r.text).join('')).toMatch(/^1\. Explain why/);
  });

  it('stops at instructions and leaves a paper with none alone', () => {
    const { chrome, lines } = layoutPdf([page([at('Answer ALL questions.', 42, 760), ...body(1, 700)])]);
    expect(chrome).toBeUndefined();
    expect(lines[0].runs.map((r) => r.text).join('')).toBe('Answer ALL questions.');
  });
});
