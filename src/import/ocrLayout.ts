/**
 * Recognised text (OCR boxes) → `layoutPdf` → the same lines a PDF gives, `source: 'ocr'`.
 * Pure. The detector's boxes are not a PDF's text items, so each is adapted first:
 *
 * - pixels → points with the render scale; y flipped to run up from the page's bottom;
 * - the page's skew (median angle of long lines) undone, so one row keeps one baseline;
 * - the detector's unclip margin taken off each end, so a label's box stops overlapping
 *   its text; type size from the box's height, baseline a fifth of it above the bottom;
 * - upright text set sideways (the margin's "do not write" strip) marked rotated: dropped;
 * - labels glued to their text split ("3.一位" → "3. 一位", "A.(1)" → "A. (1)",
 *   "(a)Explain" → "(a) Explain", "1：" → "1. ", "la." → "1a.").
 *
 * Running headers drift between scanned pages, so they match within 12 pt, not 3.
 */
import type { OcrResult } from '@/platform/ocr';
import { isCaption } from './figures';
import type { ReadPaste } from './index';
import { marksOnly, parseLabel } from './labels';
import { toSourceLines } from './lines';
import { labelZone } from './normalize';
import type { PageChrome } from './pageChrome';
import { findFigures, isLabelText, layoutPdf, type PdfBox, type PdfGraphic, type PdfItem, type PdfPage } from './pdfLayout';
import type { ImageRef } from './types';

/** Pixels per PDF point of a page rendered at `dpi`. */
export const scaleAt = (dpi: number) => dpi / 72;

/** A picture's pixels per point: its width as an A4 page's (595 pt). */
export const imageScale = (width: number) => Math.max(width, 1) / 595;

/** How far (pt) a running header may move between scanned pages. */
export const OCR_TOLERANCE = 12;

/** Below this, a recognised line is noise (a smudge, a ruled box). */
const MIN_SCORE = 0.3;

type Point = [number, number];

/** A label OCR glued to its text, or misread, made the label the engine reads. */
export function splitGluedLabel(text: string): string {
  return (
    text
      // "3.一位", "12.Which", "1：" (but never "1.5" or "10:30").
      .replace(/^(\s*)(\d{1,2})\s*[.．:：]\s*(?=[^\d\s]|$)/, (_, sp: string, n: string) => `${sp}${n}. `)
      // "A.(1) and (2) only", "B.$45".
      .replace(/^(\s*)([A-E])\s*[.．]\s*(?=\S)/, '$1$2. ')
      // "(a)Explain", "（b）解釋", "(ii)Calculate".
      .replace(/^(\s*)([(（][a-z]{1,4}[)）])(?=\S)/, '$1$2 ')
      // "la." / "Ib)" read for "1a." / "1b)": a scheme's part labels.
      .replace(/^(\s*)[lI|]([a-h])([.)])(?=\s|$)/, (_, sp: string, part: string, end: string) => `${sp}1${part}${end}`)
      .trimEnd()
  );
}

const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const angleOf = (a: Point, b: Point) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;

/** The page's skew in degrees: the median angle of its long, nearly level lines. */
function skewOf(result: OcrResult): number {
  const angles = result.lines
    .filter((l) => l.box.length >= 4 && dist(l.box[0], l.box[1]) > dist(l.box[0], l.box[3]) * 5)
    .map((l) => angleOf(l.box[0], l.box[1]))
    .filter((a) => Math.abs(a) < 10)
    .sort((a, b) => a - b);
  return angles.length >= 3 ? angles[Math.floor(angles.length / 2)] : 0;
}

/**
 * One recognised page as `layoutPdf` input. `scale`: the image's pixels per point. `found`:
 * the page's drawings (`findScanFigures`), given to the layout as pictures, so the short
 * labels in and around them leave the text with them.
 */
export function ocrPage(result: OcrResult, scale: number, found: readonly PxBox[] = []): PdfPage {
  const k = 1 / scale;
  const width = result.width * k;
  const height = result.height * k;
  const skew = skewOf(result);
  const turn = Math.abs(skew) >= 0.3 ? (-skew * Math.PI) / 180 : 0;
  const cx = result.width / 2;
  const cy = result.height / 2;
  const level = ([x, y]: Point): Point =>
    turn ? [cx + (x - cx) * Math.cos(turn) - (y - cy) * Math.sin(turn), cy + (x - cx) * Math.sin(turn) + (y - cy) * Math.cos(turn)] : [x, y];

  const items: PdfItem[] = [];
  for (const line of result.lines) {
    const str = splitGluedLabel(line.text ?? '');
    if (!str.trim() || line.box?.length < 4 || !(line.score >= MIN_SCORE)) continue;
    const [p0, p1, p2, p3] = line.box.slice(0, 4).map(level);
    // Reading direction from the top edge: far from level is text set sideways.
    const angle = line.angle ?? angleOf(p0, p1);
    const along = (dist(p0, p1) + dist(p3, p2)) / 2;
    const across = (dist(p0, p3) + dist(p1, p2)) / 2;
    const tilted = Math.abs(((angle % 180) + 180) % 180) > 20 && Math.abs(((angle % 180) + 180) % 180) < 160;
    // Upright CJK set one character under another reads level but is tall and narrow.
    const upright = across > along * 1.5 && [...str.trim()].length > 2;
    const rotated = tilted || upright;
    const xs = [p0, p1, p2, p3].map((p) => p[0]);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const centre = (p0[1] + p1[1] + p2[1] + p3[1]) / 4;
    const thick = rotated ? right - left : across;
    // DB detection pads the text by an unclip margin: take it off both ends.
    const pad = Math.min(thick * 0.15, (right - left) * 0.1);
    const size = thick * 0.85 * k;
    items.push({
      str,
      x: (left + pad) * k,
      y: height - (centre + thick * 0.3) * k,
      w: Math.max(right - left - pad * 2, 1) * k,
      size,
      ...(rotated ? { rotated: true } : {}),
    });
  }
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  // A label in a box of its own ("6." then "下表顯示…") often touches its text: keep a space.
  for (const label of items) {
    if (!isLabelText(label.str)) continue;
    const next = items.find((it) => it !== label && Math.abs(it.y - label.y) < label.size * 0.5 && it.x > label.x && it.x - (label.x + label.w) < label.size);
    if (next && next.x - (label.x + label.w) < label.size * 0.3) label.w = Math.max(1, next.x - label.size * 0.3 - label.x);
  }
  const graphics = found.map((b): PdfGraphic => {
    const corners = ([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]] as Point[]).map(level);
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const [left, top, bottom] = [Math.min(...xs), Math.min(...ys), Math.max(...ys)];
    return { kind: 'image', placed: true, box: { x: left * k, y: height - bottom * k, w: (Math.max(...xs) - left) * k, h: (bottom - top) * k } };
  });
  return { width, height, items, ...(graphics.length ? { graphics } : {}) };
}

export type OcrRead = ReadPaste & { title?: string; pages: number; chrome?: PageChrome };

/**
 * The layout's heading, when it can name the paper. OCR's type size is a box's height, so a
 * key-grid row or a part's line can stand taller than the body: a table row, a labelled
 * line or a line with no word in it is not a title (the file name is used instead).
 */
export function ocrTitle(heading: string | undefined): string | undefined {
  if (!heading || heading.includes('\t')) return undefined;
  const t = heading.replace(/\s+/g, ' ').trim();
  if (parseLabel(labelZone(`${t} `)) || marksOnly(t)) return undefined;
  // A word, not only a grid's "2B 7A 12B".
  return /\p{L}{2}/u.test(t) ? t : undefined;
}

/** One page's pictures: the drawings found on it, and each crop where the layout places it. */
export interface ScanFigures {
  found: PxBox[];
  /** `box`: the layout's figure (points); `image`: its crop, stored (null: a slot to fill). */
  crops: Array<{ box: PdfBox; image: ImageRef | null }>;
}

/**
 * Recognised pages, in order, laid out as a PDF's are. `scales[k]`: page k's pixels per
 * point; `figures[k]`: its pictures, placed where the layout puts a PDF's.
 */
export function readOcrPages(results: readonly OcrResult[], scales: readonly number[], figures: ReadonlyArray<ScanFigures | undefined> = []): OcrRead {
  const pages = results.map((r, n) => ocrPage(r, scales[n] ?? imageScale(r.width), figures[n]?.found));
  const layout = layoutPdf(pages, { tolerance: OCR_TOLERANCE });
  const lines = toSourceLines(
    layout.lines.map((line) => {
      const { figure, ...rest } = line;
      if (!figure) return rest;
      const crop = bestCrop(figures[line.page - 1]?.crops ?? [], figure);
      return crop?.image ? { ...rest, image: crop.image } : rest;
    }),
  );
  return {
    lines,
    source: 'ocr',
    pages: results.length,
    ...(ocrTitle(layout.heading) ? { title: ocrTitle(layout.heading) } : {}),
    ...(layout.chrome ? { chrome: layout.chrome } : {}),
  };
}

const overlapArea = (a: PdfBox, b: PdfBox) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

function bestCrop<T extends { box: PdfBox }>(crops: readonly T[], box: PdfBox): T | undefined {
  let best: T | undefined;
  let most = 0;
  for (const crop of crops) {
    const area = overlapArea(crop.box, box);
    if (area > most) [best, most] = [crop, area];
  }
  return best;
}

// ---- drawings on a scanned page ----

/** A box in a page image's pixels, y down from the top-left. */
export interface PxBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A page's ink, cell by cell: 1 where a cell's pixels are dark against the paper around them. */
export interface InkMap {
  width: number;
  height: number;
  /** Pixels per cell side. */
  cell: number;
  cols: number;
  rows: number;
  ink: Uint8Array;
  /** Per cell, how often dark and light change along rows and down columns (a barcode's bars change only along rows). */
  changes?: { across: Float32Array; down: Float32Array };
}

/** About half a millimetre: the cell side for an image of `scale` pixels per point. */
export const inkCell = (scale: number) => Math.max(2, Math.round(scale * 1.44));

/** The paper's brightness is the brightest cell this many cells (about 17 mm) around. */
const PAPER_REACH = 24;

function maxFilter(src: Float32Array, cols: number, rows: number, reach: number): Float32Array {
  const across = new Float32Array(src.length);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let m = 0;
      for (let k = Math.max(0, c - reach), end = Math.min(cols - 1, c + reach); k <= end; k++) m = Math.max(m, src[r * cols + k]);
      across[r * cols + c] = m;
    }
  }
  const out = new Float32Array(src.length);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      let m = 0;
      for (let k = Math.max(0, r - reach), end = Math.min(rows - 1, r + reach); k <= end; k++) m = Math.max(m, across[k * cols + c]);
      out[r * cols + c] = m;
    }
  }
  return out;
}

const luma = (px: ArrayLike<number>, p: number) => 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];

/**
 * Where a page image (RGBA) has ink. A pixel is ink when it is under 72% of the paper's
 * brightness nearby, so a phone photo's shading, grey paper and a scan's dark border (no
 * paper to stand against) are not; a cell is ink when an eighth of its pixels are.
 */
export function inkMap(rgba: ArrayLike<number>, width: number, height: number, cell: number): InkMap {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const n = cols * rows;
  const mean = new Float32Array(n);
  const count = new Float32Array(n);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / cell) * cols;
    for (let x = 0, p = y * width * 4; x < width; x++, p += 4) {
      const c = row + Math.floor(x / cell);
      mean[c] += luma(rgba, p);
      count[c]++;
    }
  }
  for (let c = 0; c < n; c++) mean[c] = count[c] ? mean[c] / count[c] : 255;
  const paper = maxFilter(mean, cols, rows, PAPER_REACH);
  const dark = new Float32Array(n);
  // Changes between dark and light along rows and down columns: a barcode's bars change
  // only along rows.
  const changeAcross = new Float32Array(n);
  const changeDown = new Float32Array(n);
  let above = new Uint8Array(width);
  let here = new Uint8Array(width);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / cell) * cols;
    for (let x = 0, p = y * width * 4; x < width; x++, p += 4) {
      const c = row + Math.floor(x / cell);
      here[x] = paper[c] >= 110 && luma(rgba, p) < paper[c] * 0.72 ? 1 : 0;
      dark[c] += here[x];
      if (x && here[x] !== here[x - 1]) changeAcross[c]++;
      if (y && here[x] !== above[x]) changeDown[c]++;
    }
    [above, here] = [here, above];
  }
  const need = Math.max(1, Math.round((cell * cell) / 8));
  const ink = new Uint8Array(n);
  for (let c = 0; c < n; c++) ink[c] = dark[c] >= need ? 1 : 0;
  return { width, height, cell, cols, rows, ink, changes: { across: changeAcross, down: changeDown } };
}

interface TextBox {
  text: string;
  score: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type Edges = Pick<TextBox, 'x0' | 'y0' | 'x1' | 'y1'>;

/** Ink across a gap this many cells wide (about a millimetre) is one stroke, or one drawing. */
const BRIDGE = 2;

/** Connected cells, small gaps bridged: each cell's part (-1: none), and each part's cells. */
function partsOf(on: Uint8Array, cols: number, rows: number): { label: Int32Array; parts: number[][] } {
  const parent = new Int32Array(on.length).fill(-1);
  const find = (k: number): number => {
    while (parent[k] !== k) k = parent[k] = parent[parent[k]];
    return k;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      if (!on[k]) continue;
      parent[k] = k;
      // Cells already seen within reach: the rows above, and this row to the left.
      for (let rr = Math.max(0, r - BRIDGE); rr <= r; rr++) {
        for (let cc = Math.max(0, c - BRIDGE); cc <= Math.min(cols - 1, c + BRIDGE); cc++) {
          if (rr === r && cc >= c) break;
          const j = rr * cols + cc;
          if (!on[j]) continue;
          const a = find(j);
          const b = find(k);
          if (a !== b) parent[a] = b;
        }
      }
    }
  }
  const label = new Int32Array(on.length).fill(-1);
  const ids = new Map<number, number>();
  const parts: number[][] = [];
  for (let k = 0; k < on.length; k++) {
    if (!on[k]) continue;
    const root = find(k);
    let id = ids.get(root);
    if (id === undefined) {
      id = parts.length;
      ids.set(root, id);
      parts.push([]);
    }
    label[k] = id;
    parts[id].push(k);
  }
  return { label, parts };
}

interface Runs {
  len: Int32Array;
  start: Int32Array;
}

/** Each ink cell's run along its row (`across`) or column: length and first cell, gaps of `gap` cells bridged (a dotted line is one run). */
function runsOf(on: Uint8Array, cols: number, rows: number, across: boolean, gap = BRIDGE): Runs {
  const len = new Int32Array(on.length);
  const start = new Int32Array(on.length);
  const lines = across ? rows : cols;
  const span = across ? cols : rows;
  const at = (line: number, k: number) => (across ? line * cols + k : k * cols + line);
  for (let line = 0; line < lines; line++) {
    let first = -1;
    let last = -1;
    const close = () => {
      for (let k = first; k <= last; k++) {
        const c = at(line, k);
        if (!on[c]) continue;
        len[c] = last - first + 1;
        start[c] = first;
      }
    };
    for (let k = 0; k < span; k++) {
      if (!on[at(line, k)]) continue;
      if (first < 0 || k - last > gap + 1) {
        if (first >= 0) close();
        first = k;
      }
      last = k;
    }
    if (first >= 0) close();
  }
  return { len, start };
}

interface Bounds {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

function boundsOf(cells: readonly number[], cols: number): Bounds {
  const b = { c0: Infinity, r0: Infinity, c1: -1, r1: -1 };
  for (const k of cells) {
    const r = Math.floor(k / cols);
    const c = k - r * cols;
    b.c0 = Math.min(b.c0, c);
    b.c1 = Math.max(b.c1, c);
    b.r0 = Math.min(b.r0, r);
    b.r1 = Math.max(b.r1, r);
  }
  return b;
}

/** One straight line, or nearly: the cells barely spread across their main direction. */
function lineLike(cells: readonly number[], cols: number): boolean {
  let sx = 0;
  let sy = 0;
  for (const k of cells) {
    sx += k % cols;
    sy += Math.floor(k / cols);
  }
  const mx = sx / cells.length;
  const my = sy / cells.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const k of cells) {
    const dx = (k % cols) - mx;
    const dy = Math.floor(k / cols) - my;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  const half = (xx + yy) / 2;
  const root = Math.sqrt(Math.max(0, half * half - (xx * yy - xy * xy)));
  return half + root === 0 || (half - root) / (half + root) < 0.015;
}

/** A pair of axes: a long upright stroke at the left meeting a long level one at the bottom, and no box's other sides. */
function axesIn(cells: readonly number[], b: Bounds, across: Runs, down: Runs, cols: number, near: number): boolean {
  const w = b.c1 - b.c0 + 1;
  const h = b.r1 - b.r0 + 1;
  let upright: { c: number; bottom: number } | undefined;
  let level: { r: number; left: number } | undefined;
  let boxed = false;
  for (const k of cells) {
    const r = Math.floor(k / cols);
    const c = k - r * cols;
    if (down.len[k] >= h * 0.6) {
      if (c <= b.c0 + w * 0.25) upright ??= { c, bottom: down.start[k] + down.len[k] - 1 };
      else if (c >= b.c1 - w * 0.25) boxed = true;
    }
    if (across.len[k] >= w * 0.6) {
      if (r >= b.r1 - h * 0.25) level ??= { r, left: across.start[k] };
      else if (r <= b.r0 + h * 0.25) boxed = true;
    }
  }
  return !boxed && !!upright && !!level && Math.abs(upright.bottom - level.r) <= near && Math.abs(upright.c - level.left) <= near;
}

const within = (b: Edges, x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/** Breaks or ends like a sentence, or carries a mark ("(1)", "(2 marks)"): text, not a label on a drawing. */
const SENTENCE = /[，。；：,;:]|[.?？!！]$|[(（]\s*\d{1,2}\s*(?:marks?|分)?\s*[)）]$/i;

/**
 * The drawing with the text on it and the short labels around it (axis names, "S", "0"),
 * then any line it cuts through. Never a question label, a caption, a sentence, or the text
 * after a label on its row ("(a) 在圖1中…").
 */
function withLabels(box: Edges, texts: readonly TextBox[], reach: number): PxBox {
  const grown = { ...box };
  const take = (t: TextBox) => {
    grown.x0 = Math.min(grown.x0, t.x0);
    grown.y0 = Math.min(grown.y0, t.y0);
    grown.x1 = Math.max(grown.x1, t.x1);
    grown.y1 = Math.max(grown.y1, t.y1);
  };
  const sameRow = (a: TextBox, b: TextBox) => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > Math.min(a.y1 - a.y0, b.y1 - b.y0) * 0.5;
  const read = texts.filter((t) => t.score >= MIN_SCORE);
  const near = read.filter((t) => t.x0 <= box.x1 + reach && t.x1 >= box.x0 - reach && t.y0 <= box.y1 + reach && t.y1 >= box.y0 - reach);
  for (const t of near) if (within(box, (t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2)) take(t);
  const bare = { ...grown };
  let labelArea = 0;
  for (const t of near) {
    if (within(box, (t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2)) continue;
    if (
      [...t.text].length <= 24 &&
      !SENTENCE.test(t.text) &&
      !isLabelText(splitGluedLabel(t.text)) &&
      !isCaption(t.text) &&
      !read.some((l) => l !== t && l.x1 <= t.x0 + (t.y1 - t.y0) && l.x0 < t.x0 && sameRow(l, t) && isLabelText(splitGluedLabel(l.text)))
    ) {
      take(t);
      labelArea += (t.x1 - t.x0) * (t.y1 - t.y0);
    }
  }
  // Labels outweighing the drawing (a photo's description in its table cell) are text.
  if (labelArea > (grown.x1 - grown.x0) * (grown.y1 - grown.y0) * 0.15) Object.assign(grown, bare);
  // A line mostly on the drawing (a speech bubble's) is part of it.
  const cut = { ...grown };
  for (const t of read) {
    const overlap = Math.max(0, Math.min(t.x1, cut.x1) - Math.max(t.x0, cut.x0)) * Math.max(0, Math.min(t.y1, cut.y1) - Math.max(t.y0, cut.y0));
    if (overlap > (t.x1 - t.x0) * (t.y1 - t.y0) * 0.5 && !isCaption(t.text) && !isLabelText(splitGluedLabel(t.text))) take(t);
  }
  // A caption beside an axis name ("Figure 1" level with "Fares ($)") stays text: its middle stays out.
  for (const t of read) {
    const [cx, cy] = [(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2];
    if (!isCaption(t.text) || !within(grown, cx, cy) || within(box, cx, cy)) continue;
    // The layout tests a line's middle a little below its box's, within a point.
    if (cy < (box.y0 + box.y1) / 2) grown.y0 = Math.max(grown.y0, cy + (t.y1 - t.y0) * 0.25 + 4);
    else grown.y1 = Math.min(grown.y1, cy - 4);
  }
  return { x: grown.x0, y: grown.y0, w: grown.x1 - grown.x0, h: grown.y1 - grown.y0 };
}

/**
 * Drawings on a scanned page (graphs, charts, pictures), from its ink and its recognised
 * text, with no layout model. In image pixels. The rule:
 *
 * 1. Confidently read text comes off the ink (not a rule running through it, like an axis
 *    under its tick labels); lines, curves and pictures are left.
 * 2. Thin straight strokes (a row or column of ink over 6 mm, dotted too) come off where
 *    they frame text on all four sides (tables, boxes) or cross most of the page (answer
 *    lines, the page frame). Solid ink they touch (a photo in a table cell) stays.
 * 3. A patch of joined ink left is a drawing when it is at least 10 × 10 mm (144 mm²),
 *    inside the text area, not one straight line, not a barcode, not carrying much text,
 *    and either has 40 mm of curved or slanted strokes or solid areas spread across it, or
 *    is a pair of axes (an L of long strokes, not a box).
 * 4. The short labels on and around it join it. Drawings that then overlap are one.
 *
 * So a key grid, a ruled table, dotted answer lines, the page frame, a dark scan border, a
 * barcode and a small handwritten mark are never drawings.
 */
export function findScanFigures(result: OcrResult, map: InkMap, scale: number): PxBox[] {
  const { cols, rows, cell } = map;
  if (!cols || !rows || !result.width || !result.height) return [];
  const mm = (v: number) => (v * 72 * scale) / 25.4 / cell;
  const fx = map.width / result.width;
  const fy = map.height / result.height;
  const texts: TextBox[] = [];
  for (const line of result.lines) {
    const text = (line.text ?? '').trim();
    if (!text || !(line.box?.length >= 4)) continue;
    const xs = line.box.map((p) => p[0] * fx);
    const ys = line.box.map((p) => p[1] * fy);
    texts.push({ text, score: line.score, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  }
  const sure = texts.filter((t) => t.score >= 0.5);
  if (!sure.length) return [];
  const thick = (t: TextBox) => Math.min(t.x1 - t.x0, t.y1 - t.y0);
  const typeHeight = sure.map(thick).sort((a, b) => a - b)[Math.floor(sure.length / 2)];

  // 1. Text off the ink (a "line" far taller than type is a misread drawing: it stays), but
  //    not a thin rule running on past the text's box (an axis under its tick labels).
  const mask = map.ink.slice();
  const solidAcross = runsOf(map.ink, cols, rows, true, 0);
  const solidDown = runsOf(map.ink, cols, rows, false, 0);
  const ruleRun = mm(4);
  const through = (k: number, b: Bounds) =>
    (solidAcross.len[k] >= ruleRun && solidDown.len[k] <= 3 && (solidAcross.start[k] < b.c0 - 1 || solidAcross.start[k] + solidAcross.len[k] > b.c1 + 2)) ||
    (solidDown.len[k] >= ruleRun && solidAcross.len[k] <= 3 && (solidDown.start[k] < b.r0 - 1 || solidDown.start[k] + solidDown.len[k] > b.r1 + 2));
  for (const t of sure) {
    if (thick(t) > typeHeight * 4) continue;
    const b = {
      c0: Math.max(0, Math.floor(t.x0 / cell)),
      r0: Math.max(0, Math.floor(t.y0 / cell)),
      c1: Math.min(cols - 1, Math.floor(t.x1 / cell)),
      r1: Math.min(rows - 1, Math.floor(t.y1 / cell)),
    };
    for (let r = b.r0; r <= b.r1; r++) for (let k = r * cols + b.c0; k <= r * cols + b.c1; k++) if (mask[k] && !through(k, b)) mask[k] = 0;
  }

  // 2. Straight strokes that frame text, or cross most of the page, come off: their thin
  //    rules only, so a picture they touch (a photo in a table) stays.
  const across = runsOf(mask, cols, rows, true);
  const down = runsOf(mask, cols, rows, false);
  const solid = { across: runsOf(mask, cols, rows, true, 0), down: runsOf(mask, cols, rows, false, 0) };
  const longRun = mm(6);
  const straight = new Uint8Array(mask.length);
  for (let k = 0; k < mask.length; k++) straight[k] = mask[k] && (across.len[k] >= longRun || down.len[k] >= longRun) ? 1 : 0;
  const thin = (k: number) => (across.len[k] >= longRun && solid.down.len[k] <= 3) || (down.len[k] >= longRun && solid.across.len[k] <= 3);
  const strokes = partsOf(straight, cols, rows);
  for (const [id, cells] of strokes.parts.entries()) {
    const b = boundsOf(cells, cols);
    const w = b.c1 - b.c0 + 1;
    const h = b.r1 - b.r0 + 1;
    let framed = 0;
    let framedArea = 0;
    // A rule of this stroke in the rows and columns given.
    const ours = (r0: number, r1: number, c0: number, c1: number) => {
      for (let r = Math.max(r0, b.r0); r <= Math.min(r1, b.r1); r++) {
        for (let c = Math.max(c0, b.c0); c <= Math.min(c1, b.c1); c++) if (strokes.label[r * cols + c] === id && thin(r * cols + c)) return true;
      }
      return false;
    };
    // Framed: a rule above, below, left and right of the text (a table's cell, a box), not
    // only a curve above and an axis below.
    for (const t of sure) {
      const [left, right] = [Math.floor(t.x0 / cell), Math.floor(t.x1 / cell)];
      const [top, bottom] = [Math.floor(t.y0 / cell), Math.floor(t.y1 / cell)];
      const [c, r] = [(left + right) >> 1, (top + bottom) >> 1];
      if (c < b.c0 || c > b.c1 || r < b.r0 || r > b.r1) continue;
      if (ours(b.r0, top - 1, c - 1, c + 1) && ours(bottom + 1, b.r1, c - 1, c + 1) && ours(r - 1, r + 1, b.c0, left - 1) && ours(r - 1, r + 1, right + 1, b.c1)) {
        framed++;
        framedArea += (t.x1 - t.x0) * (t.y1 - t.y0);
      }
    }
    const area = w * h * cell * cell;
    const frame = w >= cols * 0.75 || h >= rows * 0.75 || framedArea >= area * 0.08 || (framed >= 3 && framedArea >= area * 0.03);
    if (frame) for (const k of cells) if (thin(k)) mask[k] = 0;
  }

  // 3. Drawings among what is left.
  const hull = sure.reduce((a, t) => ({ x0: Math.min(a.x0, t.x0), y0: Math.min(a.y0, t.y0), x1: Math.max(a.x1, t.x1), y1: Math.max(a.y1, t.y1) }), {
    x0: Infinity,
    y0: Infinity,
    x1: -Infinity,
    y1: -Infinity,
  });
  const [slackX, slackY] = [map.width * 0.05, map.height * 0.05];
  const found: PxBox[] = [];
  for (const cells of partsOf(mask, cols, rows).parts) {
    const b = boundsOf(cells, cols);
    const w = b.c1 - b.c0 + 1;
    const h = b.r1 - b.r0 + 1;
    if (w < mm(10) || h < mm(10) || w * h < mm(12) * mm(12) || cells.length < mm(60)) continue;
    if (b.c0 === 0 || b.r0 === 0 || b.c1 === cols - 1 || b.r1 === rows - 1) continue;
    const box = { x0: b.c0 * cell, y0: b.r0 * cell, x1: (b.c1 + 1) * cell, y1: (b.r1 + 1) * cell };
    if (box.x0 < hull.x0 - slackX || box.x1 > hull.x1 + slackX || box.y0 < hull.y0 - slackY || box.y1 > hull.y1 + slackY) continue;
    if (lineLike(cells, cols)) continue;
    // Drawn ink: strokes that are not straight, and solid areas 3 mm across (a photo, a
    // filled bar; never a bold frame or a barcode's bars).
    const drawnCells = cells.filter((k) => !straight[k] || Math.min(solid.across.len[k], solid.down.len[k]) >= mm(3));
    const spread = drawnCells.length ? boundsOf(drawnCells, cols) : undefined;
    const drawn = !!spread && drawnCells.length >= mm(40) && (spread.c1 - spread.c0 + 1 >= w * 0.3 || spread.r1 - spread.r0 + 1 >= h * 0.3);
    if (!drawn && !axesIn(cells, b, across, down, cols, mm(4))) continue;
    // A barcode, not a picture: dark and light change along its rows, hardly down them.
    if (map.changes) {
      const { across: ca, down: cd } = map.changes;
      const [sideways, upright] = cells.reduce(([s, u], k) => [s + ca[k], u + cd[k]], [0, 0]);
      if (sideways > upright * 4) continue;
    }
    // Much text on it: a table or a text box its strokes did not frame.
    const textArea = sure.filter((t) => within(box, (t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2)).reduce((sum, t) => sum + (t.x1 - t.x0) * (t.y1 - t.y0) * 0.7, 0);
    if (textArea > (box.x1 - box.x0) * (box.y1 - box.y0) * 0.2) continue;
    found.push(withLabels(box, texts, mm(3) * cell));
  }

  // 4. Overlapping drawings are one.
  for (let changed = true; changed; ) {
    changed = false;
    for (let a = 0; a < found.length && !changed; a++) {
      for (let b = a + 1; b < found.length && !changed; b++) {
        const [p, q] = [found[a], found[b]];
        if (p.x > q.x + q.w || q.x > p.x + p.w || p.y > q.y + q.h || q.y > p.y + p.h) continue;
        const x = Math.min(p.x, q.x);
        const y = Math.min(p.y, q.y);
        found[a] = { x, y, w: Math.max(p.x + p.w, q.x + q.w) - x, h: Math.max(p.y + p.h, q.y + q.h) - y };
        found.splice(b, 1);
        changed = true;
      }
    }
  }
  return found;
}

/**
 * A page's drawings as the layout will place them: found on its ink, then grown and merged
 * as a PDF's figures are (`findFigures`). `crop`: each one's region of the page image, with
 * a small margin, inside the image.
 */
export function scanFigures(result: OcrResult, map: InkMap, scale: number): { found: PxBox[]; figures: Array<{ box: PdfBox; crop: PxBox }> } {
  const found = findScanFigures(result, map, scale);
  if (!found.length) return { found, figures: [] };
  const page = ocrPage(result, scale, found);
  const pad = 4 * scale;
  const figures = findFigures(page).figures.map((box) => {
    const x = Math.max(0, box.x * scale - pad);
    const y = Math.max(0, (page.height - box.y - box.h) * scale - pad);
    const crop = { x, y, w: Math.min(result.width, (box.x + box.w) * scale + pad) - x, h: Math.min(result.height, (page.height - box.y) * scale + pad) - y };
    return { box, crop };
  });
  return { found, figures };
}
