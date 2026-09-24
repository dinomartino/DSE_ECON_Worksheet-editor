import {
  ANSWER_GRAPH_LINE_PT,
  answerGraphWidthShare,
  clampAnswerGraphLines,
} from '@/model/answerGraph';
import { isBiTextEmpty, plain, runLines } from '@/model/text';
import type { AnswerGraph, BiText, FontPair, LanguageMode } from '@/model/types';
import type { AnswerGraphNode } from './ir';

/**
 * The graph answer space's IR node, its printed box, and its drawing (§ `AnswerGraph`).
 *
 * One SVG serves every backend, as a diagram's does: the preview draws it inline, the
 * export pre-pass (`export/diagramImage.ts`) rasterises it into the one PNG that the
 * `.docx` and the clipboard embed. The box is sized here, from the text column, so the
 * three cannot disagree about how big it prints.
 */

const PX_PER_PT = 96 / 72;
/** CSS px per twip at 96dpi (1440 twips to the inch). */
const PX_PER_TWIP = 96 / 1440;

/**
 * White kept *below* the drawing inside its line box. Word sits an inline picture on
 * the text baseline, one font descent above the line's bottom; a picture a full line
 * box tall would push the box open by that descent and drift the page's 12pt rhythm.
 * 4px (3pt) is more than any body font's descent at 11pt.
 */
export const ANSWER_GRAPH_INSET_PX = 4;

/** The drawing's text: axis titles and the origin, 10pt like every diagram label. */
const FONT_SIZE = 10 * PX_PER_PT;
const LINE_HEIGHT = FONT_SIZE * 1.15;
const AXIS_WIDTH = 2;
/** Arrowhead half-size, as `diagramSvg` draws it. */
const HEAD = 5;
/** How far each axis runs past the plot, carrying its arrowhead. */
const OVERSHOOT = 14;
/** Between an arrowhead and the title beside it. */
const TITLE_GAP = 8;
/** How far left of the y-axis its title starts, so the word sits over the line. */
const Y_TITLE_INDENT = 12;
const PAD = { top: 4, right: 4, bottom: 24, left: 28 };
/** One grid square: a 12pt body line, so the squares echo the page's rhythm. */
const GRID_STEP = ANSWER_GRAPH_LINE_PT * PX_PER_PT;
const GRID_COLOUR = '#bfbfbf';

/** The resolved node for one stored box. */
export function answerGraphNode(graph: AnswerGraph): AnswerGraphNode {
  const lines = clampAnswerGraphLines(graph.lines);
  const widthShare = answerGraphWidthShare(graph);
  const grid = Boolean(graph.grid);
  const showOrigin = Boolean(graph.showOrigin);
  const xTitle = isBiTextEmpty(graph.xTitle) ? undefined : graph.xTitle;
  const yTitle = isBiTextEmpty(graph.yTitle) ? undefined : graph.yTitle;
  return {
    kind: 'answerGraph',
    key: `answerGraph:${JSON.stringify([lines, widthShare, grid, showOrigin, xTitle, yTitle])}`,
    lines,
    widthShare,
    grid,
    showOrigin,
    ...(xTitle ? { xTitle } : {}),
    ...(yTitle ? { yTitle } : {}),
  };
}

export interface AnswerGraphBox {
  /** The picture's width: the node's share of the text column, whole px. */
  widthPx: number;
  /** The box on the page: exactly `lines` × 12pt. */
  boxHeightPx: number;
  /** The picture inside it, `ANSWER_GRAPH_INSET_PX` shorter. */
  imageHeightPx: number;
}

/** The printed size, from the live text column (twips) — shared by all three backends. */
export function answerGraphBox(
  node: Pick<AnswerGraphNode, 'lines' | 'widthShare'>,
  contentWidthTwips: number,
): AnswerGraphBox {
  const boxHeightPx = node.lines * ANSWER_GRAPH_LINE_PT * PX_PER_PT;
  return {
    widthPx: Math.floor(contentWidthTwips * PX_PER_TWIP * node.widthShare),
    boxHeightPx,
    imageHeightPx: boxHeightPx - ANSWER_GRAPH_INSET_PX,
  };
}

/** The box's height in twips — the `.docx` line box that holds the picture. */
export function answerGraphLineTwips(node: Pick<AnswerGraphNode, 'lines'>): number {
  return node.lines * ANSWER_GRAPH_LINE_PT * 20;
}

export interface AnswerGraphSvgOptions {
  widthPx: number;
  heightPx: number;
  language: LanguageMode;
  fonts?: FontPair;
  /** Scale every dimension; the exporter rasterises at 3×. */
  scale?: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The printed lines of a title: one side, or both stacked when bilingual and they
 * differ — the diagram's rule, so "Price" / "價格" stacks and a symbol prints once.
 */
function titleLines(text: BiText | undefined, language: LanguageMode): string[] {
  if (!text) return [];
  const en = plain(text.en).trim();
  const zh = plain(text.zh).trim();
  const split = (value: string) => runLines(value).map((line) => line.trim()).filter(Boolean);
  if (language === 'en') return split(en || zh);
  if (language === 'zh') return split(zh || en);
  return [...split(en), ...(zh && zh !== en ? split(zh) : [])];
}

/** Rough bold-serif advance: a CJK glyph is a full em, Latin a little over half. */
function estimateWidth(lines: string[]): number {
  let widest = 0;
  for (const line of lines) {
    let width = 0;
    for (const char of line) width += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 1 : 0.56;
    widest = Math.max(widest, width * FONT_SIZE);
  }
  return widest;
}

/** Where the axes sit inside a box of this size, at 1×. */
export function answerGraphPlot(
  node: Pick<AnswerGraphNode, 'xTitle' | 'yTitle'>,
  widthPx: number,
  heightPx: number,
  language: LanguageMode,
): { left: number; right: number; top: number; bottom: number } {
  const yLines = titleLines(node.yTitle, language);
  const xLines = titleLines(node.xTitle, language);
  // The y title sits above the arrow tip; with none the tip rises to the top pad.
  const tip =
    yLines.length > 0
      ? PAD.top + FONT_SIZE * 0.9 + (yLines.length - 1) * LINE_HEIGHT + TITLE_GAP
      : PAD.top + HEAD;
  const left = PAD.left;
  const bottom = heightPx - PAD.bottom;
  const xRoom = xLines.length > 0 ? TITLE_GAP + estimateWidth(xLines) : HEAD;
  // A narrow box never inverts its plot: the axes keep at least 40px each way.
  const right = Math.max(left + 40, widthPx - PAD.right - xRoom - OVERSHOOT);
  const top = Math.min(bottom - 40, tip + OVERSHOOT);
  return { left, right, top, bottom };
}

/** The drawing: white ground, optional grid, two arrowed axes, titles, origin. */
export function answerGraphSvg(node: AnswerGraphNode, options: AnswerGraphSvgOptions): string {
  const scale = options.scale ?? 1;
  const width = options.widthPx * scale;
  const height = options.heightPx * scale;
  const plot = answerGraphPlot(node, options.widthPx, options.heightPx, options.language);
  const s = (value: number) => value * scale;
  const left = s(plot.left);
  const right = s(plot.right);
  const top = s(plot.top);
  const bottom = s(plot.bottom);

  const fontFamily = options.fonts
    ? `${options.fonts.latin}, ${options.fonts.eastAsia}, serif`
    : 'Times New Roman, serif';
  const fontSize = s(FONT_SIZE);

  const head = s(HEAD);

  // Whole squares only, counted out from the origin: a clipped last column reads as a
  // drawing error rather than as paper.
  let grid = '';
  if (node.grid) {
    const step = s(GRID_STEP);
    const columns = Math.floor((right - left) / step);
    const rows = Math.floor((bottom - top) / step);
    const gridRight = left + columns * step;
    const gridTop = bottom - rows * step;
    const path: string[] = [];
    for (let i = 1; i <= columns; i += 1) {
      const x = left + i * step;
      path.push(`M ${n(x)} ${n(bottom)} V ${n(gridTop)}`);
    }
    for (let j = 1; j <= rows; j += 1) {
      const y = bottom - j * step;
      path.push(`M ${n(left)} ${n(y)} H ${n(gridRight)}`);
    }
    if (path.length > 0) {
      grid = `<path d="${path.join(' ')}" stroke="${GRID_COLOUR}" stroke-width="${n(s(0.75))}" fill="none"/>`;
    }
  }

  /*
   * Arrowheads are drawn as triangles, not `<marker>`s: markers resolve by document-wide
   * id, and the first match on the page can sit in the pagination probe, which the print
   * stylesheet removes — every head then vanished from the PDF.
   */
  const axisStroke = `stroke="#000" stroke-width="${n(s(AXIS_WIDTH))}" fill="none"`;
  const overshoot = s(OVERSHOOT);
  const xTip = right + overshoot;
  const yTip = top - overshoot;
  const reach = head * 1.8;
  const axes =
    `<path d="M ${n(left)} ${n(bottom)} L ${n(xTip - reach / 2)} ${n(bottom)}" ${axisStroke}/>` +
    `<path d="M ${n(left)} ${n(bottom)} L ${n(left)} ${n(yTip + reach / 2)}" ${axisStroke}/>` +
    `<path d="M ${n(xTip)} ${n(bottom)} L ${n(xTip - reach)} ${n(bottom - head)} ` +
    `L ${n(xTip - reach)} ${n(bottom + head)} z" fill="#000" data-arrowhead=""/>` +
    `<path d="M ${n(left)} ${n(yTip)} L ${n(left - head)} ${n(yTip + reach)} ` +
    `L ${n(left + head)} ${n(yTip + reach)} z" fill="#000" data-arrowhead=""/>`;

  const text = (lines: string[], x: number, y: number, anchor: string, baseline?: string) =>
    lines
      .map(
        (line, index) =>
          `<text x="${n(x)}" y="${n(y + index * s(LINE_HEIGHT))}" font-size="${n(fontSize)}" ` +
          `text-anchor="${anchor}"${baseline ? ` dominant-baseline="${baseline}"` : ''} ` +
          `style="font-weight:bold">${escapeXml(line)}</text>`,
      )
      .join('');

  const yLines = titleLines(node.yTitle, options.language);
  const yTitle = text(
    yLines,
    left - s(Y_TITLE_INDENT),
    s(PAD.top + FONT_SIZE * 0.9),
    'start',
  );
  const xLines = titleLines(node.xTitle, options.language);
  // Centred on the axis as a block, so a bilingual pair straddles the line.
  const xTitle = text(
    xLines,
    right + overshoot + s(TITLE_GAP),
    bottom - ((xLines.length - 1) * s(LINE_HEIGHT)) / 2,
    'start',
    'middle',
  );
  const origin = node.showOrigin
    ? text(['0'], left - s(7), bottom + s(7), 'end', 'hanging')
    : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
    `viewBox="0 0 ${n(width)} ${n(height)}" font-family="${escapeXml(fontFamily)}">` +
    `<rect width="${n(width)}" height="${n(height)}" fill="#fff"/>` +
    grid +
    axes +
    origin +
    xTitle +
    yTitle +
    '</svg>'
  );
}

/** The SVG as a data URL, for an `<img>` that needs no canvas (thumbnails). */
export function answerGraphSvgDataUrl(node: AnswerGraphNode, options: AnswerGraphSvgOptions): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(answerGraphSvg(node, options))}`;
}
