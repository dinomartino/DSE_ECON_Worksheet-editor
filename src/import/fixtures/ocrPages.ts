/**
 * OCR-shaped test pages: what the desktop engine returns for a scan (boxes as four corners
 * in pixels of a 200 DPI page), with the damage real scans showed: boxes padded by the
 * detector's unclip margin, a jitter of a pixel or two, a skewed page, labels glued to
 * their text ("3.一位", "A.$35"), a misread key cell, margin text set sideways, and two
 * answer | notes tables with different gutters under a key grid. Invented text only.
 */
import type { OcrLine, OcrResult } from '@/platform/ocr';
import type { ExpectedQuestion } from './expected';

/** A4 at 200 DPI. */
export const PAGE_W = 1654;
export const PAGE_H = 2339;
export const DPI = 200;

/** Glyph height of 11 pt body text at 200 DPI. */
const H = 30;
/** The detector pads each box by this much on every side. */
const PAD = 6;

const CJK = /[㐀-鿿＀-￯　-〿]/;

/** Deterministic jitter: the same pages every run. */
function jitter(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s / 2147483648) * 4 - 2;
  };
}

export const textWidth = (text: string, h = H) => [...text].reduce((w, ch) => w + (CJK.test(ch) ? h : h * 0.45), 0);

export interface Placed {
  text: string;
  x: number;
  /** Top of the glyphs, in pixels from the page's top. */
  y: number;
  w?: number;
  h?: number;
  score?: number;
  /** Set one character under another down the margin. */
  upright?: boolean;
}

/** One page of recognised lines: boxes padded, jittered and turned by `skew` degrees. */
export function ocrResult(placed: readonly Placed[], options: { seed?: number; skew?: number } = {}): OcrResult {
  const rand = jitter(options.seed ?? 7);
  const turn = ((options.skew ?? 0) * Math.PI) / 180;
  const cx = PAGE_W / 2;
  const cy = PAGE_H / 2;
  const rotate = ([x, y]: [number, number]): [number, number] => [
    Math.round((cx + (x - cx) * Math.cos(turn) - (y - cy) * Math.sin(turn)) * 10) / 10,
    Math.round((cy + (x - cx) * Math.sin(turn) + (y - cy) * Math.cos(turn)) * 10) / 10,
  ];
  const lines: OcrLine[] = placed.map((p) => {
    const h = p.h ?? H;
    const w = p.upright ? h : (p.w ?? textWidth(p.text, h));
    const tall = p.upright ? [...p.text].length * h : h;
    const x0 = p.x - PAD + rand();
    const y0 = p.y - PAD + rand();
    const x1 = p.x + w + PAD + rand();
    const y1 = p.y + tall + PAD + rand();
    return {
      text: p.text,
      score: p.score ?? 0.98,
      box: [rotate([x0, y0]), rotate([x1, y0]), rotate([x1, y1]), rotate([x0, y1])],
    };
  });
  return { width: PAGE_W, height: PAGE_H, lines, ms: 900 };
}

/** Lines down the page from `top`, one per entry, at `step` pixels. */
const down = (top: number, step: number, rows: ReadonlyArray<ReadonlyArray<Omit<Placed, 'y'>> | Omit<Placed, 'y'>>): Placed[] =>
  rows.flatMap((row, k) => (Array.isArray(row) ? row : [row]).map((p: Omit<Placed, 'y'>) => ({ ...p, y: top + k * step })));

const L = 200;
const STEP = 46;

const header = (page: number, drift: number): Placed[] => [
  { text: 'S5 Economics Uniform Test', x: L, y: 120 + drift },
  { text: `${page}`, x: 1420, y: 120 + drift },
];
const margin: Placed = { text: 'Do not write in the margins', x: 1560, y: 600, upright: true };

/** Two pages of MC: glued labels, statements, a skewed second page, a drifting header. */
export function mcPaperPages(): OcrResult[] {
  const page1 = [
    ...header(1, 0),
    margin,
    ...down(300, STEP, [
      { text: '1.Which of the following is a normative statement?', x: L },
      [{ text: 'A.', x: L + 50 }, { text: 'The government should cut salaries tax.', x: L + 100 }],
      { text: 'B.Hong Kong had a budget surplus last year.', x: L + 50 },
      { text: 'C.Rents rose by 3% in 2025.', x: L + 50 },
      { text: 'D.The unemployment rate was 3.1% in May.', x: L + 50 },
      { text: '2.Peter pays $45 for a lunch box. His consumer surplus is $10.', x: L },
      { text: 'The most he is willing to pay for it is', x: L + 50 },
      { text: 'A.$35', x: L + 50 },
      { text: 'B.$45', x: L + 50 },
      { text: 'C.$55', x: L + 50 },
      { text: 'D.$10', x: L + 50 },
    ]),
  ];
  const page2 = [
    ...header(2, 9),
    margin,
    ...down(300, STEP, [
      { text: '3.Which of the following are factors of production?', x: L },
      { text: '(1)land used by a farm', x: L + 50 },
      { text: '(2)a delivery van of a firm', x: L + 50 },
      { text: '(3)the profit earned by a firm', x: L + 50 },
      { text: 'A.(1) and (2) only', x: L + 50 },
      { text: 'B.(1) and (3) only', x: L + 50 },
      { text: 'C.(2) and (3) only', x: L + 50 },
      { text: 'D.(1), (2) and (3)', x: L + 50 },
    ]),
  ];
  return [ocrResult(page1, { seed: 3 }), ocrResult(page2, { seed: 5, skew: 0.8 })];
}

/** A Chinese structured page: "3.一位…", "(a)舉出…" glued; a label in a box of its own touching its text. */
export function zhStructuredPages(): OcrResult[] {
  const page = [
    ...down(300, 52, [
      { text: '甲部（20分）', x: L },
      { text: '3.一位畫家在網上免費分享他的作品。很多人欣賞他的作品卻沒有付款。', x: L },
      { text: '解釋為甚麼上述情況未必涉及界外效應。', x: L + 50 },
      { text: '(3分)', x: 1300 },
      [{ text: '4.', x: L }, { text: '在一個小島上，所有島民均以貝殼作交易。', x: L + 30 }],
      { text: '(a)舉出兩個原因解釋為甚麼貝殼不是良好的貨幣。', x: L + 50 },
      { text: '(4分)', x: 1300 },
      { text: '(b)解釋為甚麼借用漁網一個月後歸還時附上的魚可被視為利息。', x: L + 50 },
      { text: '(2分)', x: 1300 },
    ]),
  ];
  return [ocrResult(page, { seed: 11 })];
}

/** The key grid: 45 answers in five rows of nine; 8C misread as "803". */
export const KEY = 'CBDCABACCDBBCDCABDDCBACBDCDCDDBCABDDCACBABDCD';

/** A marking scheme page: the key grid, then two answer | notes tables, each with its own gutter. */
export function schemePages(): OcrResult[] {
  const grid: Placed[] = [{ text: 'Answers:', x: L, y: 240 }];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 9; col++) {
      const q = col * 5 + row + 1;
      grid.push({ text: q === 8 ? '803' : `${q}${KEY[q - 1]}`, x: L + col * 130, y: 290 + row * 44, score: q === 8 ? 0.67 : 0.99 });
    }
  }
  // Table 1: gutter at about x 700.
  const t1 = down(560, 40, [
    [{ text: '1a. Yes, the cost stays the same (1)', x: L }, { text: '1a. no → 0', x: 760 }],
    [{ text: 'as the tax only lowers the return', x: L }, { text: '1a lower return on the chosen option – ok', x: 760 }],
    { text: 'on shares (1)', x: L },
    [{ text: '1b. No, the cost changes (1). If cash', x: L }, { text: '1b. yes → 0', x: 760 }],
    [{ text: 'becomes the main concern, saving', x: L }, { text: '1b. no reason given → 1 mark only', x: 760 }],
    [{ text: 'gains value (1). So the cost rises. (1)', x: L }, { text: '1b. uncertain or no stand → 0 overall', x: 760 }],
  ]);
  // Table 2: gutter at about x 950, so no x is free down the whole page.
  const t2 = down(860, 40, [
    [{ text: '2a. It equalises chances (1) as parents with a low income', x: L }, { text: '2a. missing key words → 0', x: 1010 }],
    [{ text: 'can now look for a job with a higher income (1)', x: L }, { text: 'for that point', x: 1010 }],
    [{ text: 'or it lowers what poor families spend on care (1)', x: L }, { text: 'two reasons for equal income →', x: 1010 }],
    [{ text: 'b. Unemployment rate =', x: L }, { text: 'max. 2 marks', x: 1010 }],
    [{ text: '(unemployed / labour force) × 100% (1)', x: L + 40 }, { text: '2b. equation without 100% → -1', x: 1010 }],
    [{ text: 'as some parents join the labour force (1)', x: L }, { text: 'Missing % → -1', x: 1010 }],
  ]);
  return [ocrResult([...grid, ...t1, ...t2], { seed: 13 })];
}

/** What the scorecard expects of each OCR page set (the outline shape of `expected.ts`). */
export const OCR_PAGE_FIXTURES: Array<{ name: string; pages: () => OcrResult[]; questions: ExpectedQuestion[] }> = [
  {
    name: 'ocr pages: MC, glued, skewed',
    pages: mcPaperPages,
    questions: [
      { stem: 'Which of the following is a normative statement?', kind: 'mc', options: ['The government should', 'Hong Kong had', 'Rents rose', 'The unemployment rate'] },
      { stem: 'Peter pays $45 for a lunch box.', kind: 'mc', options: ['$35', '$45', '$55', '$10'] },
      { stem: 'Which of the following are factors of production?', kind: 'mc', statements: 3, options: ['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'] },
    ],
  },
  {
    name: 'ocr pages: 中文 structured',
    pages: zhStructuredPages,
    questions: [
      { stem: '一位畫家在網上免費分享他的作品。', kind: 'structured', marks: 3, side: 'zh' },
      {
        stem: '在一個小島上，所有島民均以貝殼作交易。',
        kind: 'structured',
        side: 'zh',
        parts: [
          { text: '舉出兩個原因', marks: 4 },
          { text: '解釋為甚麼借用漁網', marks: 2 },
        ],
      },
    ],
  },
];
