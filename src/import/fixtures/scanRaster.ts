/**
 * Scanned pages drawn in memory: an RGBA page at 200 DPI with the recognised lines the
 * engine would return for it (boxes padded by the detector's margin). For the scan-figure
 * detector (`findScanFigures`). Invented content only.
 */
import type { OcrLine, OcrResult } from '@/platform/ocr';

export const SCAN_W = 1654;
export const SCAN_H = 2339;
export const SCAN_SCALE = 200 / 72;

/** Glyph height of body text at 200 DPI, and the detector's padding round a line. */
const H = 30;
const PAD = 6;

export class ScanPage {
  readonly rgba: Uint8ClampedArray;
  readonly lines: OcrLine[] = [];

  constructor(
    readonly width = SCAN_W,
    readonly height = SCAN_H,
  ) {
    this.rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  }

  private dot(x: number, y: number, v: number) {
    const [px, py] = [Math.round(x), Math.round(y)];
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const p = (py * this.width + px) * 4;
    this.rgba[p] = this.rgba[p + 1] = this.rgba[p + 2] = v;
  }

  /** A filled rectangle. */
  rect(x: number, y: number, w: number, h: number, v = 0): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.dot(xx, yy, v);
    return this;
  }

  /** A stroke `thick` pixels wide. */
  line(x0: number, y0: number, x1: number, y1: number, thick = 2, v = 0): this {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= steps; k++) this.rect(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps, thick, thick, v);
    return this;
  }

  /** A box outline. */
  frame(x: number, y: number, w: number, h: number, thick = 2): this {
    return this.line(x, y, x + w, y, thick).line(x, y + h, x + w, y + h, thick).line(x, y, x, y + h, thick).line(x + w, y, x + w, y + h, thick);
  }

  /** A dotted answer line. */
  dotted(x0: number, x1: number, y: number): this {
    for (let x = x0; x < x1; x += 9) this.rect(x, y, 3, 3);
    return this;
  }

  /** A line of text: glyph-like ink, and the engine's box round it. */
  text(text: string, x: number, y: number, score = 0.98, h = H): this {
    const step = h * 0.5;
    let at = x;
    for (const ch of text) {
      if (ch !== ' ') this.frame(at, y, step * 0.6, h, 2);
      at += step;
    }
    const [x0, y0, x1, y1] = [x - PAD, y - PAD, at + PAD, y + h + PAD];
    this.lines.push({
      text,
      score,
      box: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
    });
    return this;
  }

  /** What the engine returned for this page. */
  get result(): OcrResult {
    return { width: this.width, height: this.height, lines: this.lines, ms: 1 };
  }
}

/** Where the graph on `graphPage` is drawn (axes, curves and labels), in pixels. */
export const GRAPH = { x0: 330, y0: 300, x1: 1130, y1: 935 };

/**
 * A structured question with a supply and demand graph: its prose, a caption above the
 * graph, axis names and curve labels round it, and parts after it.
 */
export function graphPage(): ScanPage {
  return (
    new ScanPage()
      .text('1. The diagram below shows the market for rice in a city.', 160, 160)
      .text('Figure 1', 700, 250)
      // Axes, with an arrow head at each end.
      .line(400, 330, 400, 900)
      .line(400, 900, 1000, 900)
      .line(400, 330, 390, 350)
      .line(400, 330, 410, 350)
      .line(1000, 900, 980, 890)
      .line(1000, 900, 980, 910)
      // Demand and supply.
      .line(450, 400, 950, 850)
      .line(450, 850, 950, 400)
      .text('Price ($)', 330, 300)
      .text('S', 960, 370)
      .text('D', 960, 850)
      .text('0', 370, 905)
      .text('Quantity', 1010, 885)
      .text('(a) Explain why the price of rice rises. (2 marks)', 160, 990)
      .text('(b) Show the change in Figure 1. (2 marks)', 160, 1050)
  );
}

/** A marking scheme's key grid: 5 rows of 9 ruled cells, each "1C"…, and a handwritten mark in one cell. */
export function keyGridPage(): ScanPage {
  const page = new ScanPage().text('Answers:', 200, 240);
  const [x0, y0, cw, ch] = [200, 300, 130, 50];
  for (let r = 0; r <= 5; r++) page.line(x0, y0 + r * ch, x0 + 9 * cw, y0 + r * ch);
  for (let c = 0; c <= 9; c++) page.line(x0 + c * cw, y0, x0 + c * cw, y0 + 5 * ch);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) page.text(`${c * 5 + r + 1}${'ABCD'[(c + r) % 4]}`, x0 + c * cw + 20, y0 + r * ch + 10);
  // A correction scribbled over cell 8.
  for (let k = 0; k < 40; k++) page.rect(x0 + cw + 30 + k, y0 + 2 * ch + 20 + Math.round(10 * Math.sin(k / 4)), 3, 3);
  return page.text('1a. Yes, the opportunity cost stays the same. (1)', 200, 600);
}

/** A question-answer book page: a frame round it, a question, dotted answer lines. */
export function answerLinesPage(): ScanPage {
  const page = new ScanPage().frame(140, 140, 1374, 2060).text('2. Explain one reason why firms merge. (3 marks)', 200, 200);
  for (let y = 300; y < 2100; y += 66) page.dotted(200, 1450, y);
  return page;
}

/** A page scanned crooked: dark borders along its bottom and right edges, a slanted edge between. */
export function darkBorderPage(): ScanPage {
  const page = new ScanPage()
    .text('3. State two functions of money. (2 marks)', 200, 200)
    .text('(a) A medium of exchange.', 200, 280)
    .text('Answers written in the margins will not be marked.', 200, 2080);
  for (let y = SCAN_H - 160; y < SCAN_H; y++) page.rect(0, y, SCAN_W, 1, 20);
  for (let x = 0; x < SCAN_W; x++) page.rect(x, SCAN_H - 160 - Math.round(x * 0.03), 1, Math.round(x * 0.03) + 1, 20);
  page.rect(SCAN_W - 90, 0, 90, SCAN_H, 25);
  return page;
}

/** An arrow from (x0, y0) to (x1, y1), its head at the end. */
function arrow(page: ScanPage, x0: number, y0: number, x1: number, y1: number): ScanPage {
  const a = Math.atan2(y1 - y0, x1 - x0);
  const head = (turn: number) => page.line(x1, y1, x1 - 18 * Math.cos(a + turn), y1 - 18 * Math.sin(a + turn), 3);
  page.line(x0, y0, x1, y1);
  head(0.4);
  return head(-0.4);
}

/** Where the flow chart on `flowChartPage` is drawn (boxes, arrows and their labels), in pixels. */
export const FLOW = { x0: 274, y0: 394, x1: 1282, y1: 756 };

/**
 * An MC question round a flow chart: four ruled boxes of short text, joined by arrows
 * (slanted ones and one level one), money labels on the arrows, then options.
 */
export function flowChartPage(): ScanPage {
  const page = new ScanPage().text('23. A production chain of Good X in an economy is shown below.', 160, 200);
  const boxes: Array<[number, number, string, string]> = [
    [400, 400, 'Local', 'importers'],
    [400, 600, 'Local', 'farmers'],
    [700, 500, 'Local', 'retailers'],
    [1080, 500, 'Local', 'consumers'],
  ];
  for (const [x, y, a, b] of boxes)
    page
      .frame(x, y, 200, 90)
      .text(a, x + 60, y + 10)
      .text(b, x + 40, y + 48);
  arrow(page, 600, 445, 700, 520);
  arrow(page, 600, 645, 700, 570);
  arrow(page, 900, 545, 1080, 545);
  arrow(page, 280, 445, 400, 445);
  return page
    .text('$200', 280, 400)
    .text('$400', 620, 440)
    .text('$600', 620, 640)
    .text('$1 200', 930, 500)
    .text('raw', 290, 460)
    .text('$50', 470, 720)
    .text('The contribution of the chain to the GDP at factor cost is ______.', 160, 840)
    .text('A.', 200, 920)
    .text('$1 400', 260, 920)
    .text('B.', 200, 970)
    .text('$1 450', 260, 970)
    .text('C.', 200, 1020)
    .text('$1 500', 260, 1020)
    .text('D.', 200, 1070)
    .text('$1 550', 260, 1070);
}

/** A ruled table of short cells (rows of a GDP account), in a question. */
export function ruledTablePage(): ScanPage {
  const page = new ScanPage().text('24. Refer to the data of an economy.', 160, 200);
  const [x0, y0, cw, ch] = [300, 300, 300, 70];
  for (let r = 0; r <= 4; r++) page.line(x0, y0 + r * ch, x0 + 3 * cw, y0 + r * ch);
  for (let c = 0; c <= 3; c++) page.line(x0 + c * cw, y0, x0 + c * cw, y0 + 4 * ch);
  const cells = [
    ['Item', 'Year 1', 'Year 2'],
    ['Nominal GDP', '+2%', '+3%'],
    ['Real GDP', '-1%', '+1%'],
    ['Population', '+1%', '0'],
  ];
  cells.forEach((row, r) => row.forEach((text, c) => page.text(text, x0 + c * cw + 30, y0 + r * ch + 18)));
  return page.text('Which of the following is correct?', 160, 640);
}

/** A source extract in a ruled box, and three answer boxes in a row, nothing drawn between them. */
export function boxedTextPage(): ScanPage {
  const page = new ScanPage().text('Source A', 160, 160).frame(160, 220, 1300, 330);
  ['A city raised its bus fares by 10% last year.', 'Fewer people took the bus, and', 'more drove to work. The city', 'says traffic got worse.'].forEach(
    (line, k) => page.text(line, 200, 250 + k * 70),
  );
  page.text('Write your answers in the boxes.', 160, 640);
  for (const [k, label] of ['(a)', '(b)', '(c)'].entries()) page.frame(200 + k * 420, 720, 300, 90).text(label, 220 + k * 420, 745);
  return page;
}

/** A cover page's barcode: upright bars of mixed width, and its number under it. */
export function barcodePage(): ScanPage {
  const page = new ScanPage().text('ECONOMICS PAPER 2', 600, 400).text('Question-Answer Book', 600, 460);
  let x = 1000;
  for (let k = 0; k < 60; k++) {
    const w = 2 + ((k * 7) % 3) * 2;
    page.rect(x, 2000, w, 140);
    x += w + 3 + ((k * 5) % 3) * 2;
  }
  return page.text('*A080E002*', 1050, 2150);
}
