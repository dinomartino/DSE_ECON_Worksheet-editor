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
import type { ReadPaste } from './index';
import { marksOnly, parseLabel } from './labels';
import { toSourceLines } from './lines';
import { labelZone } from './normalize';
import type { PageChrome } from './pageChrome';
import { isLabelText, layoutPdf, type PdfItem, type PdfPage } from './pdfLayout';

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

/** One recognised page as `layoutPdf` input. `scale`: the image's pixels per point. */
export function ocrPage(result: OcrResult, scale: number): PdfPage {
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
  return { width, height, items };
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

/** Recognised pages, in order, laid out as a PDF's are. `scales[k]`: page k's pixels per point. */
export function readOcrPages(results: readonly OcrResult[], scales: readonly number[]): OcrRead {
  const pages = results.map((r, n) => ocrPage(r, scales[n] ?? imageScale(r.width)));
  const layout = layoutPdf(pages, { tolerance: OCR_TOLERANCE });
  const lines = toSourceLines(
    layout.lines.map((line) => {
      const { figure, ...rest } = line;
      void figure;
      return rest;
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
