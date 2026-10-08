import { describe, expect, it } from 'vitest';
import { bufferOf, makePdf, type PdfPageSpec, type PdfText } from './fixtures/pdfWriter';
import { analyseLines, isPdfReadError, readPdf, type PdfRead } from './index';
import type { OutBlock } from './types';

const text = (runs: ReadonlyArray<{ text: string }>) => runs.map((r) => r.text).join('');
const stemText = (blocks: readonly OutBlock[]) => blocks.map((b) => (b.kind === 'paragraph' ? text(b.runs) : `[${b.kind}]`)).join(' / ');

async function read(pages: PdfPageSpec[], options: { title?: string } = {}): Promise<PdfRead> {
  const result = await readPdf(bufferOf(makePdf(pages, options)));
  if (isPdfReadError(result)) throw new Error(`unexpected ${result.kind}`);
  return result;
}

/** One question: a hanging number, a wrapped stem, and options whose letters are drawn first. */
function mcQuestion(n: number, top: number, stem: string[], options: string[]): PdfText[] {
  const out: PdfText[] = [];
  options.forEach((_, k) => out.push({ text: `${String.fromCharCode(65 + k)}.`, x: 92, y: top - 24 - stem.length * 12 - k * 12 }));
  out.push({ text: `${n}.`, x: 42, y: top });
  stem.forEach((line, k) => out.push({ text: line, x: 66, y: top - k * 12 }));
  options.forEach((option, k) => out.push({ text: option, x: 116, y: top - 24 - stem.length * 12 - k * 12 }));
  return out;
}

const LONG = 'The government of a small economy has decided to raise the tax on imported cars, and the';

describe('readPdf on generated files', () => {
  it('re-attaches option letters drawn apart from their texts and joins wrapped stems', async () => {
    const r = await read([
      {
        texts: [
          ...mcQuestion(1, 760, [LONG, 'price of cars rises. Which of the following is correct?'], ['Demand falls.', 'Supply rises.', 'Both fall.', 'Neither changes.']),
          ...mcQuestion(2, 600, ['Which of the following is a free good?'], ['Air in a city', 'Sea water', 'Sand in a desert', 'All of the above']),
        ],
      },
    ]);
    expect(r.source).toBe('pdf');
    expect(r.pages).toBe(1);
    const a = analyseLines(r);
    expect(a.kind).toBe('ok');
    expect(a.profile.lineMode).toBe('paragraph');
    expect(a.outline.questions).toHaveLength(2);
    const [q1, q2] = a.outline.questions;
    expect(stemText(q1.stem)).toBe(`${LONG} price of cars rises. Which of the following is correct?`);
    expect(q1.options.map((o) => text(o.runs))).toEqual(['Demand falls.', 'Supply rises.', 'Both fall.', 'Neither changes.']);
    expect(q2.options.map((o) => text(o.runs))).toEqual(['Air in a city', 'Sea water', 'Sand in a desert', 'All of the above']);
    expect(a.flags.filter((f) => f.kind !== 'noAnswer')).toEqual([]);
    expect(r.lines.find((l) => l.text.startsWith('Demand'))).toMatchObject({ page: 1, x: 92, label: 'A.' });
  });

  it('reads a two-column page column by column', async () => {
    const col = (n: number, x: number, top: number): PdfText[] => [
      { text: `${n}.`, x, y: top },
      { text: 'Explain why a firm in a perfectly competitive', x: x + 18, y: top },
      { text: 'market is a price taker in the short run.', x: x + 18, y: top - 12 },
      { text: 'A.', x: x + 18, y: top - 36 },
      { text: 'Many sellers sell the same good', x: x + 36, y: top - 36 },
      { text: 'B.', x: x + 18, y: top - 48 },
      { text: 'Few buyers in the market', x: x + 36, y: top - 48 },
      { text: 'C.', x: x + 18, y: top - 60 },
      { text: 'High barriers to entry for firms', x: x + 36, y: top - 60 },
      { text: 'D.', x: x + 18, y: top - 72 },
      { text: 'The firm is very large in size', x: x + 36, y: top - 72 },
    ];
    const r = await read([{ texts: [...col(1, 40, 760), ...col(3, 310, 760), ...col(2, 40, 640), ...col(4, 310, 640)] }]);
    const a = analyseLines(r);
    expect(a.outline.questions.map((q) => q.number)).toEqual([1, 2, 3, 4]);
    for (const q of a.outline.questions) {
      expect(stemText(q.stem)).toBe('Explain why a firm in a perfectly competitive market is a price taker in the short run.');
      expect(q.options).toHaveLength(4);
    }
  });

  it('attaches right-aligned marks to the line they end', async () => {
    const r = await read([
      {
        texts: [
          { text: '1.', x: 42, y: 760 },
          { text: 'Hong Kong has a high rate of home ownership among middle-income families.', x: 66, y: 760 },
          { text: '(a)', x: 66, y: 736 },
          { text: 'Explain ONE reason why housing is a private good, using an example from the', x: 92, y: 736 },
          { text: 'passage above.', x: 92, y: 724 },
          { text: '(3 marks)', x: 510, y: 724 },
          { text: '(b)', x: 66, y: 700 },
          { text: 'Explain the change in the price of flats.', x: 92, y: 700 },
          { text: '(4 marks)', x: 510, y: 688 },
        ],
      },
    ]);
    const [q] = analyseLines(r).outline.questions;
    expect(q.parts.map((p) => [p.label, p.marks])).toEqual([
      ['(a)', 3],
      ['(b)', 4],
    ]);
    expect(stemText(q.parts[0].blocks)).toBe('Explain ONE reason why housing is a private good, using an example from the passage above.');
  });

  it('drops a running header, footer and page numbers repeated on every page', async () => {
    const page = (n: number): PdfPageSpec => ({
      texts: [
        { text: 'S4 Economics Uniform Test 2026', x: 42, y: 800, size: 10 },
        { text: `Page ${n}`, x: 280, y: 40, size: 9 },
        { text: '(c) Sample School', x: 42, y: 40, size: 9 },
        { text: `${n}.`, x: 42, y: 740 },
        { text: `Define opportunity cost, question ${n}.`, x: 66, y: 740 },
      ],
    });
    const r = await read([page(1), page(2), page(3)]);
    expect(r.lines.map((l) => l.raw)).toEqual(['1. Define opportunity cost, question 1.', '2. Define opportunity cost, question 2.', '3. Define opportunity cost, question 3.']);
    expect(r.lines.map((l) => [l.page, !!l.pageBreak])).toEqual([
      [1, false],
      [2, true],
      [3, true],
    ]);
  });

  it('turns rows aligned in columns into table cells, an empty corner kept', async () => {
    const r = await read([
      {
        texts: [
          { text: '1.', x: 42, y: 760 },
          { text: 'Study the table below.', x: 66, y: 760 },
          { text: 'Firm X', x: 300, y: 736 },
          { text: 'Firm Y', x: 400, y: 736 },
          { text: 'Number of owners', x: 76, y: 718 },
          { text: '3', x: 312, y: 718 },
          { text: '40', x: 410, y: 718 },
          { text: 'Legal status', x: 76, y: 700 },
          { text: 'Legal entity', x: 296, y: 700 },
          { text: 'Not a legal entity', x: 388, y: 700 },
          { text: 'Which firm is a partnership?', x: 66, y: 676 },
        ],
      },
    ]);
    const a = analyseLines(r);
    const table = a.outline.questions[0].stem.find((b) => b.kind === 'table');
    expect(table?.kind === 'table' && table.rows.map((row) => row.map(text))).toEqual([
      ['', 'Firm X', 'Firm Y'],
      ['Number of owners', '3', '40'],
      ['Legal status', 'Legal entity', 'Not a legal entity'],
    ]);
  });

  it('reads bold from the font name, and a bold option as the answer', async () => {
    const r = await read([
      {
        texts: [
          { text: '1.', x: 42, y: 760 },
          { text: 'Which is NOT a factor of production?', x: 66, y: 760 },
          { text: 'A.', x: 92, y: 736 },
          { text: 'Land', x: 116, y: 736 },
          { text: 'B.', x: 92, y: 724, bold: true },
          { text: 'Money', x: 116, y: 724, bold: true },
          { text: 'C.', x: 92, y: 712 },
          { text: 'Labour', x: 116, y: 712 },
          { text: 'D.', x: 92, y: 700 },
          { text: 'Capital', x: 116, y: 700 },
        ],
      },
    ]);
    const [q] = analyseLines(r).outline.questions;
    expect(q.answer).toMatchObject({ index: 1, from: 'format' });
  });

  it('marks a drawn graph as a picture slot and keeps its axis labels out of the text', async () => {
    const r = await read([
      {
        texts: [
          { text: '1.', x: 42, y: 760 },
          { text: 'Refer to the diagram below.', x: 66, y: 760 },
          { text: 'Price', x: 100, y: 720, size: 9 },
          { text: 'Quantity', x: 250, y: 600, size: 9 },
          { text: 'Which curve shifted?', x: 66, y: 570 },
        ],
        // Axes, and a demand curve drawn as a slanted line.
        paths: '1 w 100 610 m 100 730 l S 100 610 m 300 610 l S 120 720 m 280 620 l S',
      },
    ]);
    const a = analyseLines(r);
    expect(r.lines.map((l) => (l.image ? '<figure>' : l.raw))).toEqual(['1. Refer to the diagram below.', '<figure>', 'Which curve shifted?']);
    expect(r.lines[1]).toMatchObject({ page: 1, image: { src: '' } });
    expect(a.flags.map((f) => f.kind)).toContain('imageLost');
  });

  it('reads an image-only file as a scan, with its page count', async () => {
    const scan = { images: [{ x: 0, y: 0, w: 595, h: 842 }] };
    const r = await read([scan, scan, scan]);
    expect(r.pages).toBe(3);
    expect(r.lines).toHaveLength(3);
    const a = analyseLines(r);
    expect(a.kind).toBe('scan');
  });

  it('takes the title from the metadata, else the first large line', async () => {
    const page = {
      texts: [
        { text: 'Mock Examination 2026', x: 200, y: 800, size: 16 },
        { text: '1. Define scarcity and explain why it exists in every economy.', x: 42, y: 760 },
        { text: '2. Explain the difference between a free good and an economic good.', x: 42, y: 736 },
      ],
    };
    expect((await read([page], { title: 'Microsoft Word - S5 Mock Paper 1.docx' })).title).toBe('S5 Mock Paper 1');
    expect((await read([page])).title).toBe('Mock Examination 2026');
  });

  it('drops rotated margin text', async () => {
    const r = await read([
      {
        texts: [
          { text: 'Answers written in the margins will not be marked', x: 20, y: 300, rotated: true },
          { text: '1. Define scarcity.', x: 42, y: 760 },
        ],
      },
    ]);
    expect(r.lines.map((l) => l.raw)).toEqual(['1. Define scarcity.']);
  });

  it('answers errors with a kind the dialog can word', async () => {
    expect(await readPdf(bufferOf(new TextEncoder().encode('PK\u0003\u0004 not a pdf at all')))).toEqual({ kind: 'notPdf' });
    expect(await readPdf(bufferOf(new TextEncoder().encode('%PDF-1.4\nthis is not really a pdf\n')))).toEqual({ kind: 'unreadable' });
    expect(await readPdf(bufferOf(makePdf([{ texts: [{ text: '1. Secret', x: 42, y: 760 }] }], { encrypted: true })))).toEqual({ kind: 'encrypted' });
  });

  it('leaves the caller’s buffer usable', async () => {
    const bytes = bufferOf(makePdf([{ texts: [{ text: '1. Define scarcity.', x: 42, y: 760 }] }]));
    await readPdf(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(isPdfReadError(await readPdf(bytes))).toBe(false);
  });
});
