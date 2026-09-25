import type {
  Diagram,
  DiagramArea,
  DiagramAreaColor,
  DiagramAreaDensity,
  DiagramAreaFill,
  DiagramAreaPattern,
  DiagramArrow,
  DiagramCrop,
  DiagramCurve,
  DiagramLabel,
  DiagramPoint,
  DiagramPointMark,
  FlowArrow,
  FlowChart,
  FlowNode,
  ForumBubble,
  ForumChart,
  DiagramSpan,
  PieChart,
} from '@/model/diagram';
import { axisTickLabel, DIAGRAM_PLOT_ASPECT } from '@/model/diagram';
import type { BiText, FontPair, LanguageMode, RichText } from '@/model/types';
import { areaPolygon, polygonCentroid } from '@/model/diagramAreas';
import { resolveDiagram, splineSegments } from '@/model/diagramAnchors';
import { spanGeometry, type SpanClearance } from '@/model/diagramSpans';
import { spanLayout, SPAN_LABEL_GAP, SPAN_TICK } from './diagramSpan';
import {
  boxAround,
  boxInside,
  boxPolygon,
  clearance,
  deepestPoint,
  interiorPoint,
  leaderLine,
  placeOutside,
  type Pt,
} from './diagramLeader';

/**
 * Diagram → SVG. One pure function, no DOM, no React.
 *
 * This is the diagram equivalent of the render IR (§ "One IR, three backends"): the
 * preview shows this SVG inline, the .docx exporter rasterizes it to a PNG, and the
 * clipboard embeds that same PNG. Because all three start from this one function, a
 * diagram cannot look different on screen than it does in the exported paper.
 *
 * Everything is laid out from the diagram's unit space (0..1, origin bottom-left) into
 * pixel space here and nowhere else, so the stored geometry never has to know what size
 * it will be printed at.
 */

/**
 * Padding around the plot area, in pixels at the diagram's nominal size.
 *
 * Generous on three sides because the labels live *outside* the plot: the y-axis title
 * sits above the axis, the x-axis title beyond its arrowhead, and curve labels past
 * the end of their curve. Too small a pad does not overflow visibly — the SVG simply
 * clips, which is how "Price level" silently became "Prico lovol".
 */
const PAD = { top: 44, right: 30, bottom: 46, left: 64 };

/**
 * The most of the width the x-axis title may claim. The reserve is measured from the
 * title and capped loosely — a title that does not fit must get its room (clipping
 * loses words; sliding back collides with the axis). 0.35 fits the longest shipped
 * template titles; short titles take only what they measure.
 */
const MAX_X_TITLE_SHARE = 0.35;

const AXIS_WIDTH = 2;
const CURVE_WIDTH = 2;
/**
 * Every piece of diagram text prints at 10pt.
 *
 * The SVG is laid out in CSS pixels and exported at its natural size (96dpi —
 * `EMU_PER_PX`), so a printed point is 96/72 of a pixel: 10pt is 13⅓px. The labels
 * were 13px (9.75pt) and the title 14px (10.5pt), which read as *almost* the body size
 * beside a QAB's 10pt text — close enough to look like a mistake rather than a choice.
 * One size for labels, axis titles and the caption; the caption keeps its underline,
 * which is what actually distinguishes it in the reference papers.
 */
const PX_PER_PT = 96 / 72;
const FONT_SIZE = 10 * PX_PER_PT;
const AXIS_TITLE_SIZE = 10 * PX_PER_PT;
const TITLE_SIZE = 10 * PX_PER_PT;
/** Gap between the title's baseline block and whatever is under it. */
const TITLE_GAP = 10;
/**
 * Space above the caption's first baseline.
 *
 * Not merely one line height: at that value the words sit hard against the top of the
 * white ground with the underline nearly touching the edge, which reads as a rendering
 * mistake rather than as a heading. A little air above is what makes it a caption.
 */
const TITLE_TOP = 8;
/** How far each axis line runs past the plot, carrying its arrowhead. */
const AXIS_OVERSHOOT = 14;
/** Gap between an axis arrowhead and the title that sits past it. */
const AXIS_TITLE_GAP = 8;
/** Half an arrowhead's base width, px at nominal size (axes, shift arrows, flow arrows). */
const ARROWHEAD = 5;
/**
 * Tick labels sit against their axis, as the reference schemes print them: an x label's
 * top this far under the axis line, a y label's right edge this far left of it (clear of
 * the y arrowhead's half-width).
 */
const X_TICK_GAP = 4;
const Y_TICK_GAP = 6;
/** Air between the tick labels and an axis span resting past them, px at nominal size. */
const SPAN_AXIS_AIR = 3;
/** How far a span's strokes reach either side of its shaft: an arrowhead or end tick. */
const SPAN_REACH = Math.max(ARROWHEAD, SPAN_TICK);
/** White kept between the outermost span mark and the canvas edge. */
const SPAN_EDGE_AIR = 4;

/**
 * A solid arrowhead on the segment `from → end`: tip `0.2·head` past `end`, base
 * `1.8·head` behind it, `2·head` wide — the triangle the old `<marker>` drew.
 * Plain geometry because a marker resolves by page-wide id: in the print PDF the first
 * `#arrowhead` on the page was an editor copy outside `#print-root`, hidden, so every
 * head vanished.
 */
function arrowheadPath(
  from: { x: number; y: number },
  end: { x: number; y: number },
  head: number,
): string {
  const length = Math.hypot(end.x - from.x, end.y - from.y);
  // A zero-length shaft points along +x, as `orient="auto"` did.
  const ux = length > 0 ? (end.x - from.x) / length : 1;
  const uy = length > 0 ? (end.y - from.y) / length : 0;
  const bx = end.x - 1.8 * head * ux;
  const by = end.y - 1.8 * head * uy;
  return (
    `<path d="M ${n(bx + head * uy)} ${n(by - head * ux)} ` +
    `L ${n(end.x + 0.2 * head * ux)} ${n(end.y + 0.2 * head * uy)} ` +
    `L ${n(bx - head * uy)} ${n(by + head * ux)} z" fill="#000" data-arrowhead=""/>`
  );
}

/**
 * How far left of the y-axis its title starts.
 *
 * The title is left-anchored, so without a pull it begins *at* the axis and the whole
 * word sits to its right. A small indent centres it over the line the way the reference
 * papers print it, while staying inside `PAD.left`.
 */
const AXIS_TITLE_INDENT = 12;

export interface DiagramSvgOptions {
  widthPx: number;
  heightPx: number;
  language: LanguageMode;
  fonts?: FontPair;
  /**
   * Scale every dimension. Used by the exporter to rasterize at 2–3× so the PNG is
   * crisp on a 600dpi printer while occupying the same space on the page.
   */
  scale?: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Round to 2dp: keeps the SVG small and makes rendered output stable to compare. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Pick the side(s) of a `BiText` to draw — the one funnel to drawn lines. Bilingual
 * stacks EN over ZH only on standalone axis titles (two lines on every curve label
 * would collide with the curves); each side is then cut at its own hard breaks (a
 * newline is run text and would otherwise print as a space).
 */
function pickSides(text: BiText | undefined, language: LanguageMode): RichText[] {
  if (!text) return [];
  const en = text.en ?? [];
  const zh = text.zh ?? [];
  const hasEn = en.some((run) => run.text.trim() !== '');
  const hasZh = zh.some((run) => run.text.trim() !== '');

  if (language === 'en') return hasEn ? richLines(en) : hasZh ? richLines(zh) : [];
  if (language === 'zh') return hasZh ? richLines(zh) : hasEn ? richLines(en) : [];

  const sides: RichText[] = [];
  if (hasEn) sides.push(...richLines(en));
  // Curve and point names are symbols, not prose: "AD", "LRAS", "E₀" and "Q₁" are
  // written the same in both languages, and a teacher fills both sides so the label
  // survives whichever mode the worksheet is printed in. Stacking two identical lines
  // would print "AD" twice on top of the curve, so an identical side is dropped —
  // only a genuine translation ("Price level" / "價格水平") stacks.
  if (hasZh && !(hasEn && sameText(en, zh))) sides.push(...richLines(zh));
  return sides;
}

/**
 * One side's runs, cut into printed lines at every hard break.
 *
 * Run-aware, unlike `runLines` in `model/text.ts`, which splits a plain string: a
 * diagram label is exactly where formatting must survive a break, since "M" + subscript
 * "d1" is one run pair and a label like "average\ngrowth rate" may carry bold on one
 * word. Splitting the flattened string and re-parsing would drop `vertAlign`, which is
 * the whole naming convention of DSE diagrams.
 *
 * A run holding no newline passes through untouched, so the common single-line label
 * allocates one array and keeps its run identity.
 */
function richLines(runs: RichText): RichText[] {
  const lines: RichText[] = [[]];
  for (const run of runs) {
    const pieces = run.text.replace(/\r\n?/g, '\n').split('\n');
    pieces.forEach((piece, index) => {
      // Every piece after the first opens a new line; the break itself prints nothing.
      if (index > 0) lines.push([]);
      if (piece !== '') lines[lines.length - 1].push({ ...run, text: piece });
    });
  }
  return lines;
}


/** Do these two sides render to the same string? */
function sameText(a: RichText, b: RichText): boolean {
  const flatten = (runs: RichText) => runs.map((run) => run.text).join('').trim();
  return flatten(a) === flatten(b);
}

/**
 * Render one rich-text line into `<tspan>`s.
 *
 * Sub/superscripts matter more here than anywhere else in the app — "E₀", "S₁", "P₁+t"
 * are the entire naming convention of DSE diagrams — so the inline run's `vertAlign`
 * becomes a `baseline-shift` with a reduced font size rather than being dropped.
 */
function richTspans(runs: RichText, fontSize: number): string {
  return runs
    .map((run) => {
      const styles: string[] = [];
      if (run.bold) styles.push('font-weight:bold');
      if (run.italic) styles.push('font-style:italic');
      if (run.underline) styles.push('text-decoration:underline');

      const attrs: string[] = [];
      if (run.vertAlign) {
        const shift = run.vertAlign === 'superscript' ? 'super' : 'sub';
        attrs.push(`baseline-shift="${shift}"`);
        attrs.push(`font-size="${n(fontSize * 0.72)}"`);
      }
      if (styles.length > 0) attrs.push(`style="${styles.join(';')}"`);

      return `<tspan${attrs.length ? ' ' + attrs.join(' ') : ''}>${escapeXml(run.text)}</tspan>`;
    })
    .join('');
}

interface TextOptions {
  anchor?: 'start' | 'middle' | 'end';
  /** Vertical placement of the FIRST line relative to y. */
  baseline?: 'auto' | 'middle' | 'hanging';
  fontSize?: number;
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
  /**
   * A white outline painted *under* the glyphs (`paint-order: stroke`), in px. Used by
   * pie slice labels, which sit on hatched and dotted fills — without the halo the
   * pattern's lines run through the letters.
   */
  halo?: number;
}

/** One or two stacked lines of text at a pixel position. */
function textAt(
  lines: RichText[],
  x: number,
  y: number,
  options: TextOptions = {},
): string {
  if (lines.length === 0) return '';
  const size = options.fontSize ?? FONT_SIZE;
  const anchor = options.anchor ?? 'start';
  const style: string[] = [];
  if (options.italic) style.push('font-style:italic');
  if (options.bold) style.push('font-weight:bold');
  // On the whole `<text>` rather than per-run, so the rule runs unbroken under a caption
  // whose runs differ — an underline that stopped at every bold word would read as a
  // mistake rather than as the single rule the reference papers draw.
  if (options.underline) style.push('text-decoration:underline');
  if (options.halo) {
    style.push('paint-order:stroke', 'stroke:#fff', `stroke-width:${n(options.halo)}px`);
  }

  return lines
    .map((line, index) => {
      const dy = index * size * 1.15;
      const attrs =
        `x="${n(x)}" y="${n(y + dy)}" font-size="${n(size)}" text-anchor="${anchor}"` +
        (options.baseline && options.baseline !== 'auto'
          ? ` dominant-baseline="${options.baseline}"`
          : '') +
        (style.length ? ` style="${style.join(';')}"` : '');
      return `<text ${attrs}>${richTspans(line, size)}</text>`;
    })
    .join('');
}

/**
 * Maps unit space (0..1, bottom-left origin) to SVG pixels (top-left origin).
 *
 * `ux` / `uy` are the exact inverses of `px` / `py`. The drawing canvas (§5.3) needs
 * them to turn a pointer position back into stored geometry, and it has to be *this*
 * projection rather than a second one derived from the same constants: the padding is
 * not fixed — it grows with the axis titles — so a canvas that recomputed it would put
 * a dropped point somewhere the renderer then draws slightly elsewhere.
 */
export interface Projection {
  px: (x: number) => number;
  py: (y: number) => number;
  ux: (px: number) => number;
  uy: (py: number) => number;
  plot: { left: number; right: number; top: number; bottom: number };
  /**
   * The drawn canvas height, in the same pixels as `plot`.
   *
   * Carried so anything positioned against the *edge* rather than the plot can find it
   * without being handed the options again. A title printed below is measured back from
   * this edge: measuring forward from the plot overshot the room reserved for it and put
   * the words outside the picture.
   */
  canvasHeight: number;
  /**
   * Where the **measured** canvas edges sit, in the same pixels as `plot`.
   *
   * Equal to the real edges (0 and `canvasHeight`) whenever the frame is auto-sized —
   * which is why every anchor formula reads these instead of the literals. Under a
   * teacher's crop the two part company: the crop moves the real edges, and anything
   * that anchored to them would drift away from the plot as the frame was dragged. The
   * title and the axis titles are *content*; a crop chooses the white around content,
   * it must not reposition it — so they lay out against this frame, staying put
   * relative to the plot, and a frame cropped tighter than they need visibly clips
   * them, which is the canvas telling the teacher the crop is too tight.
   */
  frame: { top: number; bottom: number };
}

/**
 * Rough width of a rendered line, in pixels.
 *
 * There is no text metrics API available here — this has to stay a pure function that
 * runs in the test runner as well as the browser — so it approximates: Latin glyphs
 * average a bit over half the font size, CJK glyphs are full-width. It only ever sizes
 * *padding*, so a small error costs a little whitespace rather than clipping anything.
 */
function estimateWidth(lines: RichText[], fontSize: number): number {
  let widest = 0;
  for (const line of lines) {
    let total = 0;
    for (const run of line) {
      for (const char of run.text) {
        // CJK, fullwidth forms and CJK punctuation occupy a full em.
        const wide = /[　-鿿豈-﫿＀-｠]/.test(char);
        total += fontSize * (wide ? 1 : run.vertAlign ? 0.4 : 0.55);
      }
    }
    widest = Math.max(widest, total);
  }
  return widest;
}

/**
 * Wrap rich lines to a width, measured by the same `estimateWidth` everything else
 * reads — a second metric would wrap at one width and floor the canvas at another.
 *
 * Greedy: Latin breaks at spaces, CJK glyphs anywhere (their own typographic rule);
 * an unbreakable word longer than the width keeps its line whole — the caller floors
 * the canvas on the widest *wrapped* line, so a long word costs width, never
 * clipping. The teacher's own hard breaks (`richLines`) arrive as separate input
 * lines and are preserved. A line that already fits passes through untouched, run
 * identity intact, so a document wide enough for its title renders byte-identically.
 */
function wrapRichLines(
  lines: RichText[],
  maxWidth: number,
  fontSize: number,
  /**
   * The metric to wrap by, defaulting to the shared `estimateWidth`. The forum
   * passes its own per-character measure: its boxes hug the wrapped text, so a
   * coarse estimate there is not merely whitespace — it is a visibly wrong box.
   */
  measure: (lines: RichText[], fontSize: number) => number = estimateWidth,
): RichText[] {
  const wrapped: RichText[] = [];
  for (const line of lines) {
    if (measure([line], fontSize) <= maxWidth) {
      wrapped.push(line);
      continue;
    }

    // The line's break units: whitespace, one CJK glyph, or a whole Latin word. The
    // full-width class matches `estimateWidth`'s, or a wrapped line would measure
    // wider than the wrap allowed.
    type Unit = { run: RichText[number]; text: string; width: number };
    const units: Unit[] = [];
    for (const run of line) {
      const pieces = run.text.match(
        /\s+|[　-鿿豈-﫿＀-｠]|[^\s　-鿿豈-﫿＀-｠]+/g,
      );
      for (const piece of pieces ?? []) {
        units.push({
          run,
          text: piece,
          width: measure([[{ ...run, text: piece }]], fontSize),
        });
      }
    }

    let current: RichText = [];
    let currentWidth = 0;
    const flush = () => {
      if (current.length > 0) wrapped.push(current);
      current = [];
      currentWidth = 0;
    };
    for (const unit of units) {
      const blank = unit.text.trim() === '';
      if (!blank && current.length > 0 && currentWidth + unit.width > maxWidth) flush();
      if (blank && current.length === 0) continue; // the break swallows the space at it
      current.push({ ...unit.run, text: unit.text });
      currentWidth += unit.width;
    }
    flush();
  }
  return wrapped;
}

/**
 * ── Axis spans rest outside the axes ──────────────────────────────────────────────
 *
 * A change arrow on an axis sits past the tick labels (below Q₀ Q₁, left of P₀ P₁), as
 * the schemes draw it. Its clearance is measured from the same text the ticks print.
 */

/** Every tick label printed on `axis` (points' and the axis's own), at its unit position. */
function tickLabelsOn(diagram: Diagram, axis: 'x' | 'y', language: LanguageMode): Array<{ at: number; lines: RichText[] }> {
  const out: Array<{ at: number; lines: RichText[] }> = [];
  for (const mark of diagram.points) {
    const lines = pickSides(axis === 'x' ? mark.xTickLabel : mark.yTickLabel, language);
    const nudge = (axis === 'x' ? mark.xTickOffset : mark.yTickOffset) ?? 0;
    if (lines.length > 0) out.push({ at: mark.at[axis] + nudge, lines });
  }
  for (const tick of diagram[axis].ticks ?? []) {
    const lines = pickSides(axisTickLabel(diagram[axis], tick), language);
    if (lines.length > 0) out.push({ at: tick.at + (tick.offset ?? 0), lines });
  }
  return out;
}

/** Height of a hanging tick label of `count` lines. */
const tickRowHeight = (count: number) => (count > 0 ? (count - 1) * FONT_SIZE * 1.15 + FONT_SIZE : 0);

/**
 * px (nominal) from an axis span's axis to its shaft at rest: the tick-label row (x) or
 * the widest y label the span passes, plus air and the heads' reach, so none overlaps.
 */
function axisSpanClearancePx(diagram: Diagram, span: DiagramSpan, language: LanguageMode): number {
  const geometry = spanGeometry(diagram, span);
  if (!geometry || !span.along) return 0;
  const labels = tickLabelsOn(diagram, span.along, language);
  if (span.along === 'x') {
    const row = tickRowHeight(Math.max(0, ...labels.map((label) => label.lines.length)));
    return X_TICK_GAP + row + SPAN_AXIS_AIR + SPAN_REACH;
  }
  const ys = geometry.base.map((p) => p.y);
  const lo = Math.min(...ys) - 0.03;
  const hi = Math.max(...ys) + 0.03;
  const passed = labels.filter((label) => label.at >= lo && label.at <= hi);
  const widest = Math.max(0, ...passed.map((label) => estimateWidth(label.lines, FONT_SIZE)));
  return Y_TICK_GAP + widest + SPAN_AXIS_AIR + SPAN_REACH;
}

/** Each axis span's rest outside its axis, in unit space for this projection. */
export function axisSpanClearance(
  diagram: Diagram,
  proj: Projection,
  scale: number,
  language: LanguageMode,
): SpanClearance {
  return (span) => {
    const px = axisSpanClearancePx(diagram, span, language) * scale;
    return span.along === 'x' ? px / plotSpanY(proj) : px / plotSpanX(proj);
  };
}

/**
 * What each axis span needs beyond its axis: `fixed` nominal px (clearance, reach, its
 * label) plus `offset` of the plot's span. `x` spans claim the bottom pad, `y` the left.
 */
interface AxisSpanRoom {
  x: Array<{ fixed: number; offset: number }>;
  y: Array<{ fixed: number; offset: number }>;
}

function axisSpanRoom(diagram: Diagram, language: LanguageMode): AxisSpanRoom {
  const room: AxisSpanRoom = { x: [], y: [] };
  for (const span of diagram.spans ?? []) {
    if (!span.along) continue;
    const lines = pickSides(span.label, language);
    const label =
      lines.length === 0
        ? 0
        : SPAN_LABEL_GAP + (span.along === 'x' ? tickRowHeight(lines.length) : estimateWidth(lines, FONT_SIZE));
    room[span.along].push({
      fixed: axisSpanClearancePx(diagram, span, language) + Math.max(SPAN_REACH, label) + SPAN_EDGE_AIR,
      offset: span.offset ?? 0,
    });
  }
  return room;
}

/**
 * The pad one side needs: the base pad, or more for a span there. `total` is the pad plus
 * the plot's span on that axis, so `pad = fixed + offset·(total − pad)` solves directly.
 */
function padFor(base: number, spans: AxisSpanRoom['x'], scale: number, total: number): number {
  let pad = base;
  for (const { fixed, offset } of spans) {
    if (offset <= -1) continue;
    pad = Math.max(pad, (fixed * scale + offset * total) / (1 + offset));
  }
  return pad;
}

function projection(
  width: number,
  height: number,
  scale: number,
  /** Extra top room, so a two-line (bilingual) y-axis title never overlaps the plot. */
  extraTop = 0,
  /** Room the x-axis title needs beyond the axis, so it never sits on the arrowhead. */
  rightRoom = 0,
  /**
   * Extra bottom room for a title printed *below* the plot.
   *
   * Separate from `extraTop` rather than one signed number: the two are reserved against
   * different padding constants (`PAD.top` clears the y-axis title, `PAD.bottom` clears
   * the x-axis tick labels), so a single value would have to know which side it was
   * being added to anyway.
   */
  extraBottom = 0,
  /** A teacher's cropped frame, at nominal size. Replaces every derived pad. */
  crop?: DiagramCrop,
  /** What the axis spans need outside the axes (`axisSpanRoom`). */
  room: AxisSpanRoom = { x: [], y: [] },
): Projection {
  const padTop = PAD.top * scale + extraTop;
  // Enough for the title, never more than `MAX_X_TITLE_SHARE` of the canvas. A title
  // wider than the cap grows leftward from its anchor into the plot's own whitespace
  // rather than pushing the axes further off-centre — overlapping a stretch of empty
  // plot is a far smaller sin than drawing every diagram lopsided.
  const padRight = Math.min(Math.max(PAD.right * scale, rightRoom), width * MAX_X_TITLE_SHARE);
  const autoPad = {
    top: padTop,
    right: padRight,
    bottom: padFor(PAD.bottom * scale, room.x, scale, height - padTop - extraBottom) + extraBottom,
    left: padFor(PAD.left * scale, room.y, scale, width - padRight),
  };
  const pad = crop
    ? {
        top: crop.top * scale,
        right: crop.right * scale,
        bottom: crop.bottom * scale,
        left: crop.left * scale,
      }
    : autoPad;
  const left = pad.left;
  const right = width - pad.right;
  const top = pad.top;
  const bottom = height - pad.bottom;
  const spanX = right - left || 1;
  const spanY = bottom - top || 1;
  return {
    px: (x) => left + x * spanX,
    py: (y) => bottom - y * spanY,
    ux: (pixel) => (pixel - left) / spanX,
    uy: (pixel) => (bottom - pixel) / spanY,
    plot: { left, right, top, bottom },
    canvasHeight: height,
    // The measured edges: exactly the real ones under auto sizing, and the positions
    // the auto pads *would* have put them under a crop — so content anchored to the
    // frame holds still while the crop drags the real edges around it.
    frame: { top: top - autoPad.top, bottom: bottom + autoPad.bottom },
  };
}

/**
 * A smooth path through the points (centripetal Catmull-Rom converted to cubic
 * Béziers).
 *
 * Used only by `curved` curves. Straight ones emit a polyline so that a kinked supply
 * curve keeps its corners sharp instead of being rounded off into something that no
 * longer reads as a quota.
 *
 * Centripetal (α = ½) rather than uniform parameterization: a teacher's points are
 * never evenly spaced, and the uniform spline weights every segment the same, so a
 * short hop next to a long one bends the curve hard at the join — the business-cycle
 * wave's ascent visibly kinked at its crest. The centripetal knots scale each tangent
 * by the distances actually travelled, which is the standard cure (it also cannot
 * cusp or self-intersect).
 */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 3) return `M ${n(pts[0].x)} ${n(pts[0].y)} L ${n(pts[pts.length - 1].x)} ${n(pts[pts.length - 1].y)}`;

  let d = `M ${n(pts[0].x)} ${n(pts[0].y)}`;
  // The control points come from the model's spline, so a tangent computed there
  // touches the curve drawn here.
  for (const { c1, c2, p2 } of splineSegments(pts)) {
    d += ` C ${n(c1.x)} ${n(c1.y)}, ${n(c2.x)} ${n(c2.y)}, ${n(p2.x)} ${n(p2.y)}`;
  }
  return d;
}

function curveSvg(
  curve: DiagramCurve,
  proj: Projection,
  language: LanguageMode,
  scale: number,
): string {
  const pts = curve.points.map((p) => ({ x: proj.px(p.x), y: proj.py(p.y) }));
  if (pts.length < 2) return '';

  const width = CURVE_WIDTH * (curve.weight ?? 1) * scale;
  const dash = curve.stroke === 'dashed' ? ` stroke-dasharray="${n(6 * scale)},${n(4 * scale)}"` : '';
  const d =
    curve.shape === 'curved'
      ? smoothPath(pts)
      : `M ${pts.map((p) => `${n(p.x)} ${n(p.y)}`).join(' L ')}`;

  const path =
    `<path d="${d}" fill="none" stroke="#000" stroke-width="${n(width)}" ` +
    `stroke-linecap="round" stroke-linejoin="round"${dash}/>`;

  const lines = pickSides(curve.label, language);
  if (lines.length === 0) return path;

  const placed = curveLabelAnchor(curve, proj, scale);
  if (!placed) return path;
  return (
    path +
    textAt(lines, placed.x, placed.y, {
      anchor: placed.anchor,
      baseline: 'middle',
      fontSize: FONT_SIZE * scale,
      bold: true,
    })
  );
}

/**
 * Where a curve's label is drawn. Shared with the canvas — see `pointLabelAnchor`.
 *
 * The label sits just beyond the chosen end, pushed along the curve's own direction so
 * it clears the line instead of sitting on it, then nudged by `labelOffset` if dragged.
 * The offset is relative to that end, which is why re-dragging the curve carries the
 * label with it rather than stranding it.
 */
export function curveLabelAnchor(
  curve: DiagramCurve,
  proj: Projection,
  scale: number,
): { x: number; y: number; anchor: 'start' | 'end' } | null {
  const pts = curve.points.map((p) => ({ x: proj.px(p.x), y: proj.py(p.y) }));
  if (pts.length < 2) return null;

  const atEnd = (curve.labelAt ?? 'end') === 'end';
  const anchor = atEnd ? pts[pts.length - 1] : pts[0];
  const neighbour = atEnd ? pts[pts.length - 2] : pts[1];
  const dx = anchor.x - neighbour.x;
  const dy = anchor.y - neighbour.y;
  const length = Math.hypot(dx, dy) || 1;
  const gap = 10 * scale;

  const offset = curve.labelOffset;
  return {
    x: anchor.x + (dx / length) * gap + (offset ? offset.x * plotSpanX(proj) : 0),
    y: anchor.y + (dy / length) * gap - (offset ? offset.y * plotSpanY(proj) : 0),
    anchor: dx >= 0 ? 'start' : 'end',
  };
}

/**
 * Where a point's label sits when it has not been told.
 *
 * `right`, not `upRight`. A marked point in a DSE diagram is almost always an
 * intersection, so the diagonal space above-right of it is exactly where the *other*
 * curve runs — an equilibrium label placed there lands on the line it is meant to
 * annotate. Straight right clears both curves, which is what the reference papers do.
 */
const DEFAULT_LABEL_SIDE = 'right' as const;

const SIDE_OFFSETS: Record<NonNullable<DiagramPointMark['labelSide']>, { x: number; y: number; anchor: 'start' | 'middle' | 'end' }> = {
  up: { x: 0, y: -1, anchor: 'middle' },
  down: { x: 0, y: 1, anchor: 'middle' },
  left: { x: -1, y: 0, anchor: 'end' },
  right: { x: 1, y: 0, anchor: 'start' },
  upRight: { x: 1, y: -1, anchor: 'start' },
  upLeft: { x: -1, y: -1, anchor: 'end' },
  downRight: { x: 1, y: 1, anchor: 'start' },
  downLeft: { x: -1, y: 1, anchor: 'end' },
};

/** Pixel span of the plot, used to convert unit-space label offsets into pixels. */
export const plotSpanX = (proj: Projection) => proj.plot.right - proj.plot.left;
export const plotSpanY = (proj: Projection) => proj.plot.bottom - proj.plot.top;

/**
 * Where a point's label is drawn, and how it is anchored.
 *
 * Exported because the drawing canvas has to hit-test and drag labels at exactly the
 * positions the renderer puts them. This is the same rule `diagramPlot` follows for the
 * projection (§7.5): a canvas that recomputed a label's anchor from the same constants
 * would drift the moment one of them changed here, and the label would be grabbable
 * somewhere it is not drawn.
 */
export function pointLabelAnchor(
  mark: DiagramPointMark,
  proj: Projection,
  scale: number,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end'; baseline: 'auto' | 'middle' | 'hanging' } {
  const x = proj.px(mark.at.x);
  const y = proj.py(mark.at.y);
  const side = SIDE_OFFSETS[mark.labelSide ?? DEFAULT_LABEL_SIDE];
  const gap = 7 * scale;

  if (mark.labelOffset) {
    // A freely dragged label is centred on where it was dropped: the compass anchoring
    // exists to push text clear of the dot, and once a teacher has placed it by hand,
    // re-applying that push would land it somewhere other than where they let go.
    return {
      x: x + mark.labelOffset.x * plotSpanX(proj),
      y: y - mark.labelOffset.y * plotSpanY(proj),
      anchor: 'middle',
      baseline: 'middle',
    };
  }

  return {
    x: x + side.x * gap,
    y: y + side.y * gap,
    anchor: side.anchor,
    baseline: side.y > 0 ? 'hanging' : side.y < 0 ? 'auto' : 'middle',
  };
}

function pointSvg(
  mark: DiagramPointMark,
  proj: Projection,
  language: LanguageMode,
  scale: number,
): string {
  const x = proj.px(mark.at.x);
  const y = proj.py(mark.at.y);
  const parts: string[] = [];

  // Drop-lines first so the dot and label draw over them.
  for (const axis of mark.dropTo ?? []) {
    const to = axis === 'x' ? { x, y: proj.plot.bottom } : { x: proj.plot.left, y };
    parts.push(
      `<path d="M ${n(x)} ${n(y)} L ${n(to.x)} ${n(to.y)}" fill="none" stroke="#000" ` +
        `stroke-width="${n(1 * scale)}" stroke-dasharray="${n(4 * scale)},${n(3 * scale)}"/>`,
    );
  }

  if (mark.dot !== false) {
    parts.push(`<circle cx="${n(x)}" cy="${n(y)}" r="${n(3.2 * scale)}" fill="#000"/>`);
  }

  const lines = pickSides(mark.label, language);
  if (lines.length > 0) {
    // A dragged label carries a free offset, which supersedes the compass slot; the
    // slot remains the tidy default a template ships with and the sidebar restores.
    const anchored = pointLabelAnchor(mark, proj, scale);
    parts.push(
      textAt(lines, anchored.x, anchored.y, {
        anchor: anchored.anchor,
        baseline: anchored.baseline,
        fontSize: FONT_SIZE * scale,
        bold: true,
      }),
    );
  }

  // Tick labels sit on the axis where the drop-lines land, offset along it if dragged.
  const xTick = pickSides(mark.xTickLabel, language);
  if (xTick.length > 0) {
    const at = pointTickAnchor(mark, 'x', proj, scale, language);
    parts.push(textAt(xTick, at.x, at.y, { anchor: 'middle', baseline: 'hanging', fontSize: FONT_SIZE * scale }));
  }
  const yTick = pickSides(mark.yTickLabel, language);
  if (yTick.length > 0) {
    const at = pointTickAnchor(mark, 'y', proj, scale, language);
    parts.push(textAt(yTick, at.x, at.y, { anchor: 'end', baseline: 'middle', fontSize: FONT_SIZE * scale }));
  }

  return parts.join('');
}

function labelSvg(
  label: DiagramLabel,
  proj: Projection,
  language: LanguageMode,
  scale: number,
): string {
  const lines = pickSides(label.text, language);
  if (lines.length === 0) return '';
  const anchor = label.align === 'right' ? 'end' : label.align === 'left' ? 'start' : 'middle';
  return textAt(lines, proj.px(label.at.x), proj.py(label.at.y), {
    anchor,
    baseline: 'middle',
    fontSize: FONT_SIZE * scale,
    italic: label.italic,
  });
}

function arrowSvg(
  arrow: DiagramArrow,
  proj: Projection,
  language: LanguageMode,
  scale: number,
): string {
  const from = { x: proj.px(arrow.from.x), y: proj.py(arrow.from.y) };
  const to = { x: proj.px(arrow.to.x), y: proj.py(arrow.to.y) };

  // Bow a curved shaft perpendicular to its own direction, so a shift arrow can arc
  // around the curves it sits between. The head aims along the tangent at `to`, which
  // for a quadratic is the line from the control point.
  const control = arrow.curved
    ? (() => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        const bow = length * 0.2;
        return {
          x: (from.x + to.x) / 2 - (dy / length) * bow,
          y: (from.y + to.y) / 2 + (dx / length) * bow,
        };
      })()
    : undefined;
  const d = control
    ? `M ${n(from.x)} ${n(from.y)} Q ${n(control.x)} ${n(control.y)}, ${n(to.x)} ${n(to.y)}`
    : `M ${n(from.x)} ${n(from.y)} L ${n(to.x)} ${n(to.y)}`;

  const shaft =
    `<path d="${d}" fill="none" stroke="#000" stroke-width="${n(1.8 * scale)}"/>` +
    arrowheadPath(control ?? from, to, ARROWHEAD * scale);

  const lines = pickSides(arrow.label, language);
  const placed = arrowLabelAnchor(arrow, proj, scale);
  const label =
    lines.length > 0
      ? textAt(lines, placed.x, placed.y, { anchor: 'middle', fontSize: FONT_SIZE * scale })
      : '';

  return shaft + label;
}

/** A span: its strokes and heads in the arrow's ink, and its label beside the midpoint. */
function spanSvg(
  diagram: Diagram,
  span: DiagramSpan,
  proj: Projection,
  language: LanguageMode,
  scale: number,
): string {
  const layout = spanLayout(diagram, span, proj, scale, axisSpanClearance(diagram, proj, scale, language));
  if (!layout) return '';
  const strokes = layout.lines
    .map(
      ([a, b]) =>
        `<path d="M ${n(a.x)} ${n(a.y)} L ${n(b.x)} ${n(b.y)}" fill="none" stroke="#000" ` +
        `stroke-width="${n(layout.strokeWidth)}"/>`,
    )
    .join('');
  const heads = layout.heads.map((head) => arrowheadPath(head.from, head.end, ARROWHEAD * scale)).join('');
  const lines = pickSides(span.label, language);
  // Extra lines grow away from the shaft: up for a label above it, both ways beside it.
  const extra = (lines.length - 1) * FONT_SIZE * scale * 1.15;
  const lift = layout.label.baseline === 'auto' ? extra : layout.label.baseline === 'middle' ? extra / 2 : 0;
  const label =
    lines.length > 0
      ? textAt(lines, layout.label.x, layout.label.y - lift, {
          anchor: layout.label.anchor,
          baseline: layout.label.baseline,
          fontSize: FONT_SIZE * scale,
        })
      : '';
  return strokes + heads + label;
}

/** Where an arrow's label is drawn: above the shaft's midpoint, plus any dragged nudge. */
export function arrowLabelAnchor(
  arrow: DiagramArrow,
  proj: Projection,
  scale: number,
): { x: number; y: number } {
  const from = { x: proj.px(arrow.from.x), y: proj.py(arrow.from.y) };
  const to = { x: proj.px(arrow.to.x), y: proj.py(arrow.to.y) };
  const offset = arrow.labelOffset;
  return {
    x: (from.x + to.x) / 2 + (offset ? offset.x * plotSpanX(proj) : 0),
    y: (from.y + to.y) / 2 - 9 * scale - (offset ? offset.y * plotSpanY(proj) : 0),
  };
}

/*
 * ── Shaded areas ──────────────────────────────────────────────────────────────────
 *
 * Fills draw under the axes and curves; labels draw on top of everything. Hatching is
 * emitted as explicit line segments clipped to the polygon rather than an SVG
 * `<pattern>`: pattern ids collide between the inline SVGs on one page, and plain
 * lines rasterize identically everywhere.
 */

/**
 * The area palette: a shade tint and a hatch ink per named colour.
 *
 * Tints step down in lightness (yellow → purple, relative luminance ≈ .87 .80 .69 .63
 * .53 .45) so neighbouring areas still differ on a monochrome photocopy, and all stay
 * light enough for black curves and letters to read through. Grey is the original
 * `#d9d9d9` / `#000`, so an area with no colour renders byte-identically.
 */
export const AREA_PALETTE: Record<DiagramAreaColor, { name: string; shade: string; hatch: string }> = {
  grey: { name: 'Grey', shade: '#d9d9d9', hatch: '#000' },
  yellow: { name: 'Yellow', shade: '#fff1a6', hatch: '#8a6d00' },
  green: { name: 'Green', shade: '#d8eecd', hatch: '#2e7d32' },
  blue: { name: 'Blue', shade: '#b8d3ee', hatch: '#1f5aa6' },
  red: { name: 'Red', shade: '#f2b0b0', hatch: '#b3261e' },
  purple: { name: 'Purple', shade: '#c2a8de', hatch: '#6a3d9a' },
};
/** Perpendicular distance between hatch lines, px at nominal size; `dense` closes it up. */
const AREA_HATCH_GAP = 5;
const AREA_HATCH_GAP_DENSE = 3;
/** A dot pattern's pitch, as a multiple of the line gap, and each dot's radius (px). */
const AREA_DOT_PITCH = 1.2;
const AREA_DOT_RADIUS = 0.9;
/** Clearance a label needs inside its region, each side, px at nominal size. */
const AREA_LABEL_MARGIN = 3;
/** Minimum air between a leader label and its region, px at nominal size. */
const LEADER_GAP = 18;
/** How far a leader's tip sits inside the region, from every edge, px at nominal size. */
const LEADER_DEPTH = 10;
/** Air a leader label keeps from curves and other text — the text estimate runs tight. */
const LEADER_AIR = 3;
/** How much of an em above and below a line of text carries no ink. */
const LEADER_INK_TRIM = 0.12;
/** Air between a leader's tail and its label's box, px at nominal size. */
const LEADER_TAIL_GAP = 2;
/** Half the leader arrowhead's base width — smaller than an axis head. */
const LEADER_HEAD = 3;

/** Where and how an area's label is drawn: inside at its centroid, or out on a leader. */
export interface AreaLabelLayout {
  /** The label's centre. */
  x: number;
  y: number;
  placement: 'inside' | 'leader';
  /** The leader's start (on the label's edge) and arrow tip (inside the region). */
  leader: { from: { x: number; y: number }; tip: { x: number; y: number } } | null;
}

const project = (proj: Projection) => (p: { x: number; y: number }) => ({ x: proj.px(p.x), y: proj.py(p.y) });

/**
 * What a leader label should not sit on: curves, drop-lines and arrow shafts as lines;
 * dots and every other label's estimated box as regions.
 */
function leaderObstacles(
  diagram: Diagram,
  proj: Projection,
  language: LanguageMode,
  scale: number,
): { lines: Pt[][]; regions: Pt[][] } {
  const to = project(proj);
  const size = FONT_SIZE * scale;
  const lines = diagram.curves.map((curve) => curve.points.map(to));
  const regions: Pt[][] = [];
  const text = (
    label: BiText | undefined,
    x: number,
    y: number,
    anchor: 'start' | 'middle' | 'end',
    baseline: 'auto' | 'middle' | 'hanging',
  ) => {
    const drawn = pickSides(label, language);
    if (drawn.length === 0) return;
    const w = estimateWidth(drawn, size);
    const h = (drawn.length - 1) * size * 1.15 + size;
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
    const y0 = baseline === 'hanging' ? y : baseline === 'middle' ? y - size / 2 : y - size;
    regions.push(boxPolygon({ x0, y0, x1: x0 + w, y1: y0 + h }));
  };

  for (const curve of diagram.curves) {
    const at = curveLabelAnchor(curve, proj, scale);
    if (at) text(curve.label, at.x, at.y, at.anchor, 'middle');
  }
  for (const mark of diagram.points) {
    const at = to(mark.at);
    for (const axis of mark.dropTo ?? []) {
      lines.push([at, axis === 'x' ? { x: at.x, y: proj.plot.bottom } : { x: proj.plot.left, y: at.y }]);
    }
    if (mark.dot !== false) regions.push(boxPolygon(boxAround(at, 8 * scale, 8 * scale)));
    const label = pointLabelAnchor(mark, proj, scale);
    text(mark.label, label.x, label.y, label.anchor, label.baseline);
  }
  for (const arrow of diagram.arrows) {
    lines.push([to(arrow.from), to(arrow.to)]);
    const at = arrowLabelAnchor(arrow, proj, scale);
    text(arrow.label, at.x, at.y, 'middle', 'auto');
  }
  for (const label of diagram.labels) {
    const anchor = label.align === 'right' ? 'end' : label.align === 'left' ? 'start' : 'middle';
    text(label.text, proj.px(label.at.x), proj.py(label.at.y), anchor, 'middle');
  }
  return { lines, regions };
}

/**
 * An area label's width: `estimateWidth`, but capitals at 0.65em. Area labels are mostly
 * capitals (CS, DWL), which the shared 0.55em average undersizes by a fifth — enough
 * for a leader label to land on a neighbouring point's name.
 */
function areaLabelWidth(lines: RichText[], fontSize: number): number {
  const capitals = (line: RichText) =>
    line.reduce((sum, run) => sum + (run.vertAlign ? 0 : (run.text.match(/[A-Z]/g)?.length ?? 0)), 0);
  return Math.max(0, ...lines.map((line) => estimateWidth([line], fontSize) + capitals(line) * 0.1 * fontSize));
}

/**
 * Where an area's label goes (§ Shaded areas). The fit rule: the label's estimated box
 * plus `AREA_LABEL_MARGIN` each side, centred on the region's centroid, must lie wholly
 * inside the region. `auto` (absent) puts a fitting label there — exactly as before
 * leaders existed — and any other outside on a leader; `inside`/`leader` force a side.
 * A leader label sits at centroid + `labelOffset`, or, undragged, at the nearest clear
 * spot `placeOutside` finds. Shared with the canvas, so it drags where it is drawn.
 * Leader labels are placed in `areas` order, each clear of the ones before it.
 */
export function areaLabelLayout(
  diagram: Diagram,
  area: DiagramArea,
  proj: Projection,
  language: LanguageMode,
  scale: number,
): AreaLabelLayout | null {
  const index = (diagram.areas ?? []).indexOf(area);
  if (index < 0) return layoutAreaLabel(diagram, area, proj, language, scale, []).layout;
  const c = labelCache;
  if (!c || c.diagram !== diagram || c.proj !== proj || c.language !== language || c.scale !== scale) {
    const placed: Pt[][] = [];
    const layouts = (diagram.areas ?? []).map((each) => {
      const { layout, box } = layoutAreaLabel(diagram, each, proj, language, scale, placed);
      if (box) placed.push(box);
      return layout;
    });
    labelCache = { diagram, proj, language, scale, layouts };
  }
  return labelCache!.layouts[index];
}

/** The last diagram's label layouts: a render asks once per area, and each needs all. */
let labelCache: {
  diagram: Diagram;
  proj: Projection;
  language: LanguageMode;
  scale: number;
  layouts: Array<AreaLabelLayout | null>;
} | null = null;

function layoutAreaLabel(
  diagram: Diagram,
  area: DiagramArea,
  proj: Projection,
  language: LanguageMode,
  scale: number,
  placed: Pt[][],
): { layout: AreaLabelLayout | null; box?: Pt[] } {
  const polygon = areaPolygon(diagram, area);
  if (!polygon) return { layout: null };
  const pts = polygon.map(project(proj));
  const centroid = project(proj)(polygonCentroid(polygon));
  const offset = area.labelOffset;
  const nudged = {
    x: centroid.x + (offset ? offset.x * plotSpanX(proj) : 0),
    y: centroid.y - (offset ? offset.y * plotSpanY(proj) : 0),
  };

  const lines = pickSides(area.label, language);
  const size = FONT_SIZE * scale;
  const w = areaLabelWidth(lines, size);
  const h = (Math.max(1, lines.length) - 1) * size * 1.15 + size;
  const mode = area.labelPlacement ?? 'auto';
  const fits = () => boxInside(boxAround(centroid, w, h, AREA_LABEL_MARGIN * scale), pts);
  if (lines.length === 0 || mode === 'inside' || (mode === 'auto' && fits())) {
    return { layout: { ...nudged, placement: 'inside', leader: null } };
  }

  const obstacles = () => {
    const { lines, regions } = leaderObstacles(diagram, proj, language, scale);
    for (const other of diagram.areas ?? []) {
      const polygon = other.id === area.id ? null : areaPolygon(diagram, other);
      if (polygon) regions.push(polygon.map(project(proj)));
    }
    return { lines, regions: [...regions, ...placed] };
  };
  const target = deepestPoint(pts, interiorPoint(pts, centroid), LEADER_DEPTH * scale);
  const at = offset
    ? nudged
    : placeOutside(pts, target, w, h, {
        gap: LEADER_GAP * scale,
        air: LEADER_AIR * scale,
        tailGap: LEADER_TAIL_GAP * scale,
        step: 2 * scale,
        reach: 240 * scale,
        plot: { x0: proj.plot.left, y0: proj.plot.top, x1: proj.plot.right, y1: proj.plot.bottom },
        ...obstacles(),
      });
  // The tail leaves the letters' ink, not the line box: trim the em's empty top and foot.
  const ink = boxAround(at, w, h - LEADER_INK_TRIM * 2 * size);
  const leader = leaderLine(ink, target, pts, {
    gap: LEADER_TAIL_GAP * scale,
    depth: LEADER_DEPTH * scale,
    slack: scale,
    minShaft: 8 * scale,
    step: 0.5 * scale,
  });
  return { layout: { ...at, placement: 'leader', leader }, box: boxPolygon(boxAround(at, w, h)) };
}

/**
 * Where an area's label is drawn: its region's centroid plus any dragged nudge, or its
 * leader position (`areaLabelLayout`). `language`/`scale` measure the label for the fit.
 */
export function areaLabelAnchor(
  diagram: Diagram,
  area: DiagramArea,
  proj: Projection,
  language: LanguageMode = 'en',
  scale = 1,
): { x: number; y: number } | null {
  const layout = areaLabelLayout(diagram, area, proj, language, scale);
  return layout ? { x: layout.x, y: layout.y } : null;
}

/**
 * The unit-space `labelOffset` that reproduces where the label is drawn now — what a
 * drag of an undragged leader label must start from, or it jumps onto the region.
 */
export function areaLabelSeedOffset(
  diagram: Diagram,
  area: DiagramArea,
  proj: Projection,
  language: LanguageMode,
): DiagramPoint | null {
  if (area.labelOffset) return area.labelOffset;
  const polygon = areaPolygon(diagram, area);
  const layout = areaLabelLayout(diagram, area, proj, language, 1);
  if (!polygon || !layout || layout.placement === 'inside') return null;
  const centre = polygonCentroid(polygon);
  return {
    x: (layout.x - proj.px(centre.x)) / plotSpanX(proj),
    y: (proj.py(centre.y) - layout.y) / plotSpanY(proj),
  };
}

/**
 * Lines `a·x + b·y = c` clipped to a pixel polygon (even-odd), `gap` apart
 * perpendicular (`norm` = |(a, b)|), as path segments. `c` sits on a fixed grid so
 * neighbouring areas hatch in step. `(1, 1, √2)` is the original "/" hatch, unchanged.
 */
export function hatchLines(pts: Pt[], a: number, b: number, norm: number, gap: number): string[] {
  const step = gap * norm;
  const values = pts.map((p) => a * p.x + b * p.y);
  const first = Math.ceil(Math.min(...values) / step);
  const last = Math.floor(Math.max(...values) / step);
  const parts: string[] = [];
  for (let k = first; k <= last; k += 1) {
    const c = k * step;
    const hits: Pt[] = [];
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const fp = a * p.x + b * p.y - c;
      const fq = a * q.x + b * q.y - c;
      if (fp > 0 === fq > 0) continue;
      const t = fp / (fp - fq);
      hits.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    }
    // Pair the crossings along the line: by x, or by y for a vertical line.
    hits.sort(b === 0 ? (p, q) => p.y - q.y : (p, q) => p.x - q.x);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      parts.push(`M ${n(hits[i].x)} ${n(hits[i].y)} L ${n(hits[i + 1].x)} ${n(hits[i + 1].y)}`);
    }
  }
  return parts;
}

/**
 * A staggered grid of dots, each wholly inside the polygon, as closed circles in one
 * path. The grid is fixed in pixel space, like the lines.
 */
export function hatchDots(pts: Pt[], gap: number, radius: number): string[] {
  const pitch = gap * AREA_DOT_PITCH;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const parts: string[] = [];
  for (let j = Math.ceil(Math.min(...ys) / pitch); j <= Math.floor(Math.max(...ys) / pitch); j += 1) {
    const shift = j % 2 === 0 ? 0 : pitch / 2;
    const i1 = Math.floor((Math.max(...xs) - shift) / pitch);
    for (let i = Math.ceil((Math.min(...xs) - shift) / pitch); i <= i1; i += 1) {
      const at = { x: i * pitch + shift, y: j * pitch };
      if (clearance(at, pts) < radius) continue;
      parts.push(
        `M ${n(at.x - radius)} ${n(at.y)} a ${n(radius)} ${n(radius)} 0 1 0 ${n(2 * radius)} 0 ` +
          `a ${n(radius)} ${n(radius)} 0 1 0 ${n(-2 * radius)} 0 Z`,
      );
    }
  }
  return parts;
}

/** Each line pattern's families, `[a, b, |(a, b)|]` for lines `a·x + b·y = c`. */
const PATTERN_LINES: Record<Exclude<DiagramAreaPattern, 'dots'>, Array<[number, number, number]>> = {
  diagonal: [[1, 1, Math.SQRT2]],
  reverse: [[1, -1, Math.SQRT2]],
  cross: [
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
  ],
  horizontal: [[0, 1, 1]],
  vertical: [[1, 0, 1]],
};

/** How an area is painted: the fields of `DiagramArea` that decide it. */
export type AreaPaint = Pick<DiagramArea, 'fill' | 'color' | 'pattern' | 'density'>;

/**
 * An area's paint over a pixel polygon: a tint, or a pattern in the hatch ink as plain
 * clipped lines or dots — never an SVG `<pattern>`. Shared with the inspector's
 * swatches, so a preview is the paper's own drawing. Empty when nothing lands inside.
 */
export function areaFillMarkup(pts: Pt[], paint: AreaPaint, scale: number): string {
  const ink = AREA_PALETTE[paint.color ?? 'grey'] ?? AREA_PALETTE.grey;
  const fill: DiagramAreaFill = paint.fill ?? 'shade';
  if (fill === 'shade') {
    const d = `M ${pts.map((p) => `${n(p.x)} ${n(p.y)}`).join(' L ')} Z`;
    return `<path d="${d}" fill="${ink.shade}" stroke="none"/>`;
  }
  const density: DiagramAreaDensity = paint.density ?? 'normal';
  const gap = (density === 'dense' ? AREA_HATCH_GAP_DENSE : AREA_HATCH_GAP) * scale;
  const pattern = paint.pattern ?? 'diagonal';
  if (pattern === 'dots') {
    const d = hatchDots(pts, gap, AREA_DOT_RADIUS * scale).join(' ');
    return d ? `<path d="${d}" fill="${ink.hatch}" stroke="none"/>` : '';
  }
  const families = PATTERN_LINES[pattern] ?? PATTERN_LINES.diagonal;
  const d = families.flatMap(([a, b, norm]) => hatchLines(pts, a, b, norm, gap)).join(' ');
  return d
    ? `<path d="${d}" fill="none" stroke="${ink.hatch}" stroke-width="${n(0.8 * scale)}" stroke-linecap="butt"/>`
    : '';
}

function areaFillSvg(diagram: Diagram, area: DiagramArea, proj: Projection, scale: number): string {
  const polygon = areaPolygon(diagram, area);
  if (!polygon) return '';
  return areaFillMarkup(polygon.map(project(proj)), area, scale);
}

function areaLabelSvg(
  diagram: Diagram,
  area: DiagramArea,
  proj: Projection,
  language: LanguageMode,
  scale: number,
): string {
  const lines = pickSides(area.label, language);
  if (lines.length === 0) return '';
  const at = areaLabelLayout(diagram, area, proj, language, scale);
  if (!at) return '';
  let leader = '';
  if (at.leader) {
    // A thin line in diagram ink ending in a plain triangle whose point is `tip`.
    const { from, tip } = at.leader;
    const length = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
    const head = LEADER_HEAD * scale;
    const end = {
      x: tip.x - ((tip.x - from.x) / length) * 0.2 * head,
      y: tip.y - ((tip.y - from.y) / length) * 0.2 * head,
    };
    leader =
      `<path d="M ${n(from.x)} ${n(from.y)} L ${n(end.x)} ${n(end.y)}" fill="none" stroke="#000" ` +
      `stroke-width="${n(0.8 * scale)}" stroke-linecap="round" data-leader=""/>` +
      arrowheadPath(from, end, head);
  }
  return (
    leader +
    textAt(lines, at.x, at.y - ((lines.length - 1) * FONT_SIZE * scale * 1.15) / 2, {
      anchor: 'middle',
      baseline: 'middle',
      fontSize: FONT_SIZE * scale,
      // Letters on hatching, or out among the curves on a leader, need the white halo
      // the pie's patterned slices use.
      halo: area.fill === 'hatch' || at.placement === 'leader' ? 3 * scale : undefined,
    })
  );
}

/**
 * Where an axis title is drawn, plus any dragged nudge. The x title is clamped inside
 * the canvas (overlapping empty plot beats silent truncation). The clamp lives here,
 * not `diagramSvg`, because `DiagramCanvas` builds the drag handle from this same
 * function. `titleOffset` applies on top.
 */
export function axisTitleAnchor(
  diagram: Diagram,
  axis: 'x' | 'y',
  proj: Projection,
  width: number,
  scale: number,
  /** Needed to measure the title for the clamp; defaults to the widest (bilingual) case. */
  language: LanguageMode = 'bilingual',
): { x: number; y: number } {
  const offset = diagram[axis].titleOffset;
  const base =
    axis === 'x'
      ? // Anchored just past the arrowhead rather than at the SVG's right edge. The
        // edge is `PAD.right` away — room reserved so a long title cannot clip — so
        // right-anchoring there stranded a short title like "Quantity" in open space,
        // far from the axis it names. `AXIS_TITLE_GAP` past the arrow is where the
        // reference papers put it, and a long title still grows leftward into the
        // reserved room rather than off the canvas.
        {
          // Just past the arrowhead, pulled back only as far as the canvas edge demands
          // — and never past the arrow tip itself (`Math.max`), because sliding the
          // title left of the arrow trades a clipped word for a word drawn *on* the
          // axis. With the cap above sized to fit the longest template title, the pull
          // is normally zero; it only engages for a title longer than any shipped one,
          // where slight overhang beats losing the end of the words.
          x: Math.max(
            proj.plot.right + AXIS_OVERSHOOT * scale,
            Math.min(
              proj.plot.right + AXIS_OVERSHOOT * scale + AXIS_TITLE_GAP * scale,
              width -
                AXIS_TITLE_GAP * scale -
                estimateWidth(pickSides(diagram.x.title, language), AXIS_TITLE_SIZE * scale),
            ),
          ),
          y: proj.plot.bottom,
        }
      : // Sat just under the top of the *SVG* rather than above the axis, so it floated
        // in open space well clear of the arrowhead and started to the right of the
        // line. Anchored to the arrow tip instead, and pulled left so the word sits
        // over the axis rather than beside it. `Math.max` keeps the whole title inside
        // the canvas when the plot starts very near the top — the baseline can never
        // rise above one line height from the edge, which is what the old constant was
        // really protecting.
        {
          x: proj.plot.left - AXIS_TITLE_INDENT * scale,
          // The floor is one line height below whatever sits above — the canvas edge
          // normally, but the diagram's title when one prints *there*. Clamping to the
          // edge regardless would push the axis title up through it on a diagram whose
          // plot starts near the top, which is precisely the collision the title's
          // reserved room exists to prevent. A title placed below sits under the plot
          // and contends for nothing up here, so it contributes no floor.
          // Measured from `frame.top`, not 0: under a crop the real canvas edge is the
          // teacher's to move, and the floor must hold the title still beside the plot
          // rather than follow the frame up into the new whitespace.
          y: Math.max(
            proj.frame.top +
              (diagram.titlePlacement === 'below' ? 0 : titleRoom(diagram, language, scale)) +
              AXIS_TITLE_SIZE * scale * 1.1,
            proj.plot.top - AXIS_OVERSHOOT * scale - AXIS_TITLE_GAP * scale,
          ),
        };
  return {
    x: base.x + (offset ? offset.x * plotSpanX(proj) : 0),
    y: base.y - (offset ? offset.y * plotSpanY(proj) : 0),
  };
}

/**
 * How many lines the diagram's title occupies, and the room they need.
 *
 * Shared by the projection (which reserves the space) and the anchor (which places the
 * text in it), so the caption cannot be drawn somewhere the padding did not account for.
 * Zero when there is no title: an absent caption must cost no room at all, or every
 * untitled diagram would render with a blank strip on top.
 */
function titleRoom(diagram: Diagram, language: LanguageMode, scale: number): number {
  return titleRoomFor(pickSides(diagram.title, language).length, scale);
}

/**
 * The room `count` title lines need. The pie variant counts *wrapped* lines — which
 * depend on the width, which `titleRoom`'s signature cannot know — so the line count
 * and the room it costs are separate questions with one formula between them.
 */
function titleRoomFor(count: number, scale: number): number {
  if (count === 0) return 0;
  return TITLE_TOP * scale + count * TITLE_SIZE * scale * 1.15 + TITLE_GAP * scale;
}

/**
 * The plot's own printed size, before anything around it is counted.
 *
 * The 4:3 the templates are drawn against. It is the *plot* that holds this shape, not
 * the canvas: a supply-demand cross looks wrong stretched, and it is the axes a teacher
 * is judging when they set a width.
 */
const PLOT_ASPECT = DIAGRAM_PLOT_ASPECT;

/**
 * The size a diagram needs, measured from what it draws: the plot keeps its 4:3 and
 * each side grows by the room its text needs. The printed size follows the labels
 * (the page reflows — the accepted cost of never clipping and never padding);
 * `widthPx` stays the teacher's number, floored by what the title needs
 * (`titleWidthFloor`). Shared with `diagramPlot`, so projection and canvas agree.
 */
export function diagramSize(
  diagram: Diagram,
  widthPx: number,
  language: LanguageMode,
): { widthPx: number; heightPx: number } {
  // The pie variant has no plot aspect and no crop: a circle plus the title's room.
  if (diagram.pie) return pieSize(diagram, widthPx, language);
  // The flow variant's shape comes entirely from its own measured layout.
  if (diagram.flow) return flowSize(diagram, diagram.flow, widthPx, language);
  // So does the forum's: bubbles measured from their own wrapped text.
  if (diagram.forum) return forumSize(diagram, diagram.forum, widthPx, language);
  // A cropped diagram is sized by its frame, not by measuring: the teacher chose the
  // clearance on every side, so the plot takes what the width leaves after their pads
  // and the height follows from the plot's aspect plus their top and bottom. Language
  // deliberately stops mattering here — a chosen frame must not resize itself when the
  // paper is switched to bilingual.
  if (diagram.crop) {
    const { left, top, right, bottom } = diagram.crop;
    const croppedPlotWidth = Math.max(1, widthPx - (left + right));
    return {
      widthPx,
      heightPx: Math.round(croppedPlotWidth * PLOT_ASPECT + top + bottom),
    };
  }
  const width = titleWidthFloor(diagram, widthPx, language);
  // Axis spans rest outside the axes, so they may widen the left and bottom pads.
  const room = axisSpanRoom(diagram, language);
  const left = padFor(PAD.left, room.y, 1, width - PAD.right);
  const plotWidth = width - (left + PAD.right);
  const plotHeight = Math.max(1, plotWidth) * PLOT_ASPECT;
  const bottom = Math.max(PAD.bottom, ...room.x.map((r) => r.fixed + r.offset * plotHeight));

  // Both axis titles print outside the plot, and a bilingual pair stacks two lines.
  const yTitleLines = pickSides(diagram.y.title, language).length;
  const topRoom = PAD.top + Math.max(0, yTitleLines - 1) * AXIS_TITLE_SIZE * 1.15;

  return {
    widthPx: width,
    heightPx: Math.round(plotHeight + topRoom + bottom + titleRoom(diagram, language, 1)),
  };
}

/**
 * The narrowest canvas on which the centred title fits, never less than `widthPx`:
 * `w ≥ T + |padLeft − padRight|` (the title centres on the plot, which sits off the
 * canvas centre). Two passes reach a fixed point (the cap can only loosen at the
 * widened width); a small cushion covers `estimateWidth`'s error.
 */
function titleWidthFloor(diagram: Diagram, widthPx: number, language: LanguageMode): number {
  const lines = pickSides(diagram.title, language);
  if (lines.length === 0) return widthPx;
  const title = estimateWidth(lines, TITLE_SIZE);
  const rightRoom =
    estimateWidth(pickSides(diagram.x.title, language), AXIS_TITLE_SIZE) + 30;
  const CUSHION = 10;
  let width = widthPx;
  for (let pass = 0; pass < 2; pass += 1) {
    const padRight = Math.min(Math.max(PAD.right, rightRoom), width * MAX_X_TITLE_SHARE);
    width = Math.max(widthPx, Math.ceil(title + Math.abs(PAD.left - padRight)) + CUSHION);
  }
  return width;
}

/*
 * ── The pie chart variant ─────────────────────────────────────────────────────────
 *
 * A `Diagram` carrying `pie` draws slices instead of axes: same SVG contract, same
 * rasterization, same measured-size rule. The slices start at 12 o'clock and run
 * clockwise in array order, exactly as the reference chart
 * (`real_life_reference/Pie_chart.png`) is drawn.
 */

/** White clearance between the circle and the canvas edge, px at nominal size. */
const PIE_PAD = 14;

/**
 * Slice fills, cycling by index: white → hatch → grey → dots → cross-hatch → light
 * grey. Patterns rather than colours because the papers print in black and white —
 * the reference chart itself uses exactly white/hatch/grey/dots.
 */
const PIE_FILLS = [
  '#fff',
  'url(#pieHatch)',
  '#c4c4c4',
  'url(#pieDots)',
  'url(#pieCross)',
  '#ececec',
];

/** The pattern tiles behind `PIE_FILLS`. Sized in user units, so scaled explicitly. */
function piePatternDefs(scale: number): string {
  const cell = n(6 * scale);
  const line = `stroke="#000" stroke-width="${n(scale)}"`;
  const ground = `<rect width="${cell}" height="${cell}" fill="#fff"/>`;
  const pattern = (id: string, rotate: boolean, content: string) =>
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${cell}" height="${cell}"` +
    (rotate ? ' patternTransform="rotate(45)"' : '') +
    `>${ground}${content}</pattern>`;
  return (
    '<defs>' +
    pattern('pieHatch', true, `<line x1="0" y1="0" x2="0" y2="${cell}" ${line}/>`) +
    pattern(
      'pieDots',
      false,
      `<circle cx="${n(1.6 * scale)}" cy="${n(1.6 * scale)}" r="${n(0.9 * scale)}" fill="#000"/>`,
    ) +
    pattern(
      'pieCross',
      true,
      `<line x1="0" y1="0" x2="0" y2="${cell}" ${line}/><line x1="0" y1="0" x2="${cell}" y2="0" ${line}/>`,
    ) +
    '</defs>'
  );
}

/**
 * The printed percent for one slice — derived from the values, never stored, so the
 * labels stay right when a slice is added or a figure corrected. One decimal at most:
 * "36.5%", but "33%" rather than "33.0%", matching the reference chart's own mix.
 */
export function pieSlicePercent(value: number, total: number): string {
  const pct = Math.round((value / total) * 1000) / 10;
  return `${pct}%`;
}

/** One wedge from `a0` to `a1`, radians clockwise from 12 o'clock. */
function wedgePath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const at = (a: number) => ({ x: cx + Math.sin(a) * r, y: cy - Math.cos(a) * r });
  const from = at(a0);
  const to = at(a1);
  const largeArc = a1 - a0 > Math.PI ? 1 : 0;
  return (
    `M ${n(cx)} ${n(cy)} L ${n(from.x)} ${n(from.y)} ` +
    `A ${n(r)} ${n(r)} 0 ${largeArc} 1 ${n(to.x)} ${n(to.y)} Z`
  );
}

/** White either side of the pie's centred title, px at nominal size. */
const PIE_TITLE_CUSHION = 10;

/**
 * The pie title's wrapped lines and the width the canvas must hold, resolved
 * together. **The title wraps rather than flooring the chart**: a headline like the
 * reference's ("Market Shares (%) of China's Online Food Delivery Sector in 2017")
 * cost 490px on one line, and a teacher shrinking the figure wants a smaller chart
 * at the same 12pt title, not a clipped or shrunken one. The only remaining floor is
 * the widest *wrapped* line — an unbreakable word — so nothing ever clips. One
 * function serves `pieSize` and `pieSvg`, or the two would wrap at different widths.
 */
function pieTitleLayout(
  diagram: Diagram,
  widthPx: number,
  language: LanguageMode,
): { width: number; lines: RichText[] } {
  const lines = pickSides(diagram.title, language);
  if (lines.length === 0) return { width: widthPx, lines };
  const wrapped = wrapRichLines(lines, widthPx - 2 * PIE_TITLE_CUSHION, TITLE_SIZE);
  // Widening to the widest wrapped line can only loosen the wrap, so the lines stay
  // valid at the final width — no second pass needed.
  const width = Math.max(
    widthPx,
    Math.ceil(estimateWidth(wrapped, TITLE_SIZE)) + 2 * PIE_TITLE_CUSHION,
  );
  return { width, lines: wrapped };
}

/** `diagramSize` for the pie variant: the circle fills the width, title room on top. */
function pieSize(
  diagram: Diagram,
  widthPx: number,
  language: LanguageMode,
): { widthPx: number; heightPx: number } {
  const { width, lines } = pieTitleLayout(diagram, widthPx, language);
  const diameter = Math.max(1, width - 2 * PIE_PAD);
  return {
    widthPx: width,
    heightPx: Math.round(diameter + 2 * PIE_PAD + titleRoomFor(lines.length, 1)),
  };
}

/** `diagramSvg` for the pie variant. */
function pieSvg(diagram: Diagram, pie: PieChart, options: DiagramSvgOptions): string {
  const scale = options.scale ?? 1;
  const width = options.widthPx * scale;
  const height = options.heightPx * scale;
  const language = options.language;

  const fontFamily = options.fonts
    ? `${options.fonts.latin}, ${options.fonts.eastAsia}, serif`
    : 'Times New Roman, serif';

  // The same wrapped lines the measurement reserved room for (§ `pieTitleLayout`) —
  // wrapped at the nominal width, so the raster's higher `scale` cannot re-wrap.
  const titleLines = pieTitleLayout(diagram, options.widthPx, language).lines;
  const room = titleRoomFor(titleLines.length, scale);
  const below = diagram.titlePlacement === 'below';
  const pad = PIE_PAD * scale;
  // The circle takes whatever the canvas leaves after the pads and the title's room —
  // measured against both dimensions so a stale stored height can squash, not clip.
  const radius = Math.max(1, Math.min(width - 2 * pad, height - 2 * pad - room)) / 2;
  const cx = width / 2;
  const cy = (below ? pad : pad + room) + radius;

  const slices = pie.slices.filter((slice) => slice.value > 0);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const stroke = `stroke="#000" stroke-width="${n(1.2 * scale)}"`;

  const wedges: string[] = [];
  const labels: string[] = [];
  let angle = 0;
  slices.forEach((slice, index) => {
    const a0 = angle;
    const a1 = angle + (slice.value / total) * Math.PI * 2;
    angle = a1;
    const fill = `fill="${PIE_FILLS[index % PIE_FILLS.length]}"`;
    // A lone slice is the whole circle; its wedge path would collapse (the arc's two
    // endpoints coincide), so it is drawn as the circle it is.
    wedges.push(
      a1 - a0 >= Math.PI * 2 - 1e-6
        ? `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius)}" ${fill} ${stroke}/>`
        : `<path d="${wedgePath(cx, cy, radius, a0, a1)}" ${fill} ${stroke}/>`,
    );

    // Name over derived percent, centred as a block on the slice's own centroid, with
    // a white halo so the letters survive the hatched and dotted fills.
    const mid = (a0 + a1) / 2;
    const size = FONT_SIZE * scale;
    const lines = [
      ...pickSides(slice.label, language),
      [{ text: pieSlicePercent(slice.value, total) }],
    ];
    labels.push(
      textAt(
        lines,
        cx + Math.sin(mid) * radius * 0.6,
        cy - Math.cos(mid) * radius * 0.6 - ((lines.length - 1) * size * 1.15) / 2,
        { anchor: 'middle', baseline: 'middle', fontSize: size, halo: 3 * scale },
      ),
    );
  });

  // No shares yet: an empty circle, so the inserted block is visible and clickable
  // rather than a blank strip.
  const empty =
    slices.length === 0
      ? `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius)}" fill="#fff" ${stroke}/>`
      : '';

  // Bold and not underlined, as the reference pie prints its heading — unlike the axes
  // diagrams, whose underline is what marks their caption.
  const title = textAt(
    titleLines,
    cx,
    below
      ? height - room + TITLE_GAP * scale + TITLE_SIZE * scale
      : (TITLE_TOP + TITLE_SIZE * 1.1) * scale,
    { anchor: 'middle', fontSize: TITLE_SIZE * scale, bold: true },
  );

  const body = [
    piePatternDefs(scale),
    // White ground: a transparent PNG would print as whatever is behind it in Word.
    `<rect width="${n(width)}" height="${n(height)}" fill="#fff"/>`,
    empty,
    ...wedges,
    ...labels,
    title,
  ].join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
    `viewBox="0 0 ${n(width)} ${n(height)}" font-family="${escapeXml(fontFamily)}">` +
    body +
    '</svg>'
  );
}

/*
 * ── The flow chart variant ────────────────────────────────────────────────────────
 *
 * A `Diagram` carrying `flow` draws the production-chain figure the papers use for
 * value-added and national-income questions (`real_life_reference/flow1–4.png`):
 * boxed stages in left-to-right columns, arrows between them carrying the payment
 * labels, and open-ended stub arrows entering or leaving the chart.
 *
 * Nothing here is positioned in pixels by the teacher. A node names a column and a
 * row; every box is measured from its own text; column gaps grow to fit the widest
 * label crossing them — so the chart lays itself out the way the reference figures
 * are drawn, and re-wording a stage reflows the picture instead of clipping it.
 *
 * The layout is computed at a **natural size** (all text at the usual 10pt) and then
 * scaled uniformly to the block's stored width, photo-style. Flow charts are the one
 * diagram whose natural width is set by prose in boxes rather than by a plot aspect,
 * and the reference figures are wider than the text column often enough that "shrink
 * the whole picture" is the only honest way to honour the teacher's width.
 */

/** Text clearance inside a box, px at natural size. */
const FLOW_BOX_PAD_X = 10;
const FLOW_BOX_PAD_Y = 7;
/** No stage box narrower than this: a box around "$50" alone stops reading as a stage. */
const FLOW_MIN_BOX_WIDTH = 64;
/** The floor for the white gap between two columns; labels widen it. */
const FLOW_COL_GAP = 64;
/** Vertical gap between two boxes stacked in one column. */
const FLOW_ROW_GAP = 30;
/** Length of an open-ended stub arrow. */
const FLOW_STUB = 48;
/** White clearance around the whole chart. */
const FLOW_PAD = 12;
/** Clearance between an arrow shaft and the label riding on it. */
const FLOW_LABEL_GAP = 7;
const FLOW_LINE_HEIGHT = FONT_SIZE * 1.15;

export interface FlowBoxLayout {
  node: FlowNode;
  lines: RichText[];
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FlowLabelLayout {
  lines: RichText[];
  x: number;
  /** Baseline of the FIRST line, matching `textAt`. */
  y: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface FlowArrowLayout {
  /** The stored arrow this segment draws, so an editor can hit-test back to it. */
  arrow: FlowArrow;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: FlowLabelLayout;
  labelBelow?: FlowLabelLayout;
}

/**
 * Where a centre-aimed arrow meets a box: the point where the segment from the box's
 * centre towards `toward` crosses the box's own boundary. This is how the reference
 * charts draw — every arrow aims at its stage's centre and stops at the wall — and it
 * is what staggers two arrows entering one box along its edge instead of stacking
 * both arrowheads on the edge's midpoint.
 */
function flowEdgePoint(
  box: FlowBoxLayout,
  toward: { x: number; y: number },
): { x: number; y: number } {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const tx = dx === 0 ? Infinity : box.w / 2 / Math.abs(dx);
  const ty = dy === 0 ? Infinity : box.h / 2 / Math.abs(dy);
  const t = Math.min(tx, ty);
  if (!Number.isFinite(t)) return { x: cx, y: cy };
  return { x: cx + dx * t, y: cy + dy * t };
}

export interface FlowLayout {
  boxes: FlowBoxLayout[];
  arrows: FlowArrowLayout[];
  /** Natural canvas size, title room included. */
  width: number;
  height: number;
  /** Vertical room the title occupies, and which side it sits. */
  titleRoom: number;
  titleBelow: boolean;
}

/**
 * Lay the chart out at natural size. Shared by `flowSize` (which needs only the box)
 * and `flowSvg` (which draws it), so the measured size and the drawing cannot disagree.
 */
function flowLayout(diagram: Diagram, flow: FlowChart, language: LanguageMode): FlowLayout {
  const room = titleRoom(diagram, language, 1);
  const titleBelow = diagram.titlePlacement === 'below';

  // Measure every box from its own text.
  const measured = flow.nodes.map((node) => {
    const lines = pickSides(node.label, language);
    const textW = estimateWidth(lines, FONT_SIZE);
    const textH = Math.max(1, lines.length) * FLOW_LINE_HEIGHT;
    const boxed = node.boxed !== false;
    return {
      node,
      lines,
      w: boxed ? Math.max(FLOW_MIN_BOX_WIDTH, textW + 2 * FLOW_BOX_PAD_X) : textW + 4,
      h: boxed ? textH + 2 * FLOW_BOX_PAD_Y : textH + 2,
    };
  });

  // An empty chart still shows something clickable: one empty stage box, the flow
  // equivalent of the empty pie's bare circle.
  if (measured.length === 0) {
    const w = 120;
    const h = 40;
    return {
      boxes: [
        {
          node: { id: '__empty', label: { en: [], zh: [] }, col: 0, row: 0 },
          lines: [],
          x: FLOW_PAD + 28,
          y: FLOW_PAD + (titleBelow ? 0 : room) + 12,
          w,
          h,
        },
      ],
      arrows: [],
      width: w + 2 * FLOW_PAD + 56,
      height: h + 2 * FLOW_PAD + 24 + room,
      titleRoom: room,
      titleBelow,
    };
  }

  // Columns compact to their sorted order, so stored col/row values never need
  // renumbering when a stage is removed.
  const colValues = [...new Set(measured.map((box) => box.node.col))].sort((a, b) => a - b);
  const colIndex = new Map(colValues.map((value, index) => [value, index]));
  const columns: (typeof measured)[] = colValues.map(() => []);
  for (const box of measured) columns[colIndex.get(box.node.col)!].push(box);
  for (const column of columns) column.sort((a, b) => a.node.row - b.node.row);

  // Two widths per column: the slot the column occupies (its widest member, so a wide
  // bare-text annotation still gets its room), and the width its *boxes* share — an
  // annotation must not fatten the stages above it (the reference's "increase in
  // inventory $50" is wider than the boxes it hangs under).
  const colWidth = columns.map((column) => Math.max(...column.map((box) => box.w)));
  const colBoxWidth = columns.map((column, index) => {
    const boxed = column.filter((box) => box.node.boxed !== false);
    return boxed.length > 0 ? Math.max(...boxed.map((box) => box.w)) : colWidth[index];
  });

  /** The widest of an arrow's two labels — both ride the same stretch of shaft. */
  const arrowLabelWidth = (arrow: FlowArrow): number =>
    Math.max(
      estimateWidth(pickSides(arrow.label, language), FONT_SIZE),
      estimateWidth(pickSides(arrow.labelBelow, language), FONT_SIZE),
    );

  // A gap must fit the widest label crossing it between adjacent columns; an arrow
  // spanning further already has more than one gap's room.
  const boxById = new Map<string, (typeof measured)[number]>();
  for (const box of measured) boxById.set(box.node.id, box);
  const gaps = colValues.slice(0, -1).map(() => FLOW_COL_GAP);
  for (const arrow of flow.arrows) {
    const from = arrow.from ? boxById.get(arrow.from) : undefined;
    const to = arrow.to ? boxById.get(arrow.to) : undefined;
    if (!from || !to) continue;
    const a = colIndex.get(from.node.col)!;
    const b = colIndex.get(to.node.col)!;
    if (Math.abs(a - b) !== 1) continue;
    const width = arrowLabelWidth(arrow);
    if (width === 0) continue;
    const gap = Math.min(a, b);
    gaps[gap] = Math.max(gaps[gap], width + 16);
  }

  // Positions: columns left to right, each column's stack centred on y = 0.
  const colX: number[] = [];
  let x = 0;
  colValues.forEach((_, index) => {
    colX.push(x);
    x += colWidth[index] + (index < gaps.length ? gaps[index] : 0);
  });

  const boxes: FlowBoxLayout[] = [];
  columns.forEach((column, index) => {
    // Stack in row order, then centre the column on its **boxed** stages: an
    // annotation hangs off the stack without pulling the stages off the chart's
    // midline — the reference centres "Local supermarkets" between the two source
    // boxes while "increase in inventory $50" dangles below them.
    let y = 0;
    const placed = column.map((box) => {
      const top = y;
      y += box.h + FLOW_ROW_GAP;
      return { box, top };
    });
    const boxed = placed.filter(({ box }) => box.node.boxed !== false);
    const anchor = boxed.length > 0 ? boxed : placed;
    const centre =
      (anchor[0].top + anchor[anchor.length - 1].top + anchor[anchor.length - 1].box.h) / 2;
    for (const { box, top } of placed) {
      // Boxed stages take their column's shared box width — the reference charts draw
      // a column's boxes at one width, and ragged boxes read as a mistake beside them.
      const w = box.node.boxed !== false ? colBoxWidth[index] : box.w;
      boxes.push({
        ...box,
        w,
        x: colX[index] + (colWidth[index] - w) / 2,
        y: top - centre,
      });
    }
  });

  const placedById = new Map<string, FlowBoxLayout>();
  for (const box of boxes) placedById.set(box.node.id, box);

  // Resolve every arrow to a segment between box edges (or a stub off one edge).
  const arrows: FlowArrowLayout[] = [];
  for (const arrow of flow.arrows) {
    const from = arrow.from ? placedById.get(arrow.from) : undefined;
    const to = arrow.to ? placedById.get(arrow.to) : undefined;
    if (!from && !to) continue;

    let x1: number;
    let y1: number;
    let x2: number;
    let y2: number;
    if (from && to) {
      // Centre-aimed: each end sits where the line between the two centres crosses
      // that box's own wall (§ `flowEdgePoint`) — two arrows into one stage enter its
      // edge at different heights, as the reference charts draw them.
      const fromCentre = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
      const toCentre = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
      const start = flowEdgePoint(from, toCentre);
      const end = flowEdgePoint(to, fromCentre);
      x1 = start.x;
      y1 = start.y;
      x2 = end.x;
      y2 = end.y;
    } else {
      // A stub grows to fit its own labels — a fixed length put the wording on top
      // of the box it enters.
      const stub = Math.max(FLOW_STUB, arrowLabelWidth(arrow) + 12);
      if (to) {
        // Open start: a stub entering the target from its left.
        x2 = to.x;
        y2 = to.y + to.h / 2;
        x1 = x2 - stub;
        y1 = y2;
      } else {
        // Open end: a stub leaving the source to its right.
        x1 = from!.x + from!.w;
        y1 = from!.y + from!.h / 2;
        x2 = x1 + stub;
        y2 = y1;
      }
    }

    // Both label slots ride the shaft's midpoint, one per side. On a mostly-vertical
    // shaft, `above` reads as the right side and `below` as the left.
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
    const placeLabel = (
      text: BiText | undefined,
      below: boolean,
    ): FlowLabelLayout | undefined => {
      const lines = pickSides(text, language);
      if (lines.length === 0) return undefined;
      if (vertical) {
        return {
          lines,
          x: midX + (below ? -FLOW_LABEL_GAP : FLOW_LABEL_GAP),
          y: midY - ((lines.length - 1) * FLOW_LINE_HEIGHT) / 2 + FONT_SIZE * 0.35,
          anchor: below ? 'end' : 'start',
        };
      }
      // A diagonal shaft rises through the label's own span, so the clearance grows
      // by how far the line climbs across half the label's width — without it the
      // shaft ran through the end of every label on a branching arrow.
      const labelW = estimateWidth(lines, FONT_SIZE);
      const rise = Math.abs(y2 - y1) / Math.max(1, Math.abs(x2 - x1));
      const gap = FLOW_LABEL_GAP + Math.min(rise * (labelW / 2), 18);
      // The last baseline clears the shaft above; the first hangs below it.
      return {
        lines,
        x: midX,
        y: below
          ? midY + gap + FONT_SIZE * 0.8
          : midY - gap - (lines.length - 1) * FLOW_LINE_HEIGHT,
        anchor: 'middle',
      };
    };
    arrows.push({
      arrow,
      x1,
      y1,
      x2,
      y2,
      label: placeLabel(arrow.label, false),
      labelBelow: placeLabel(arrow.labelBelow, true),
    });
  }

  // Bounds over everything drawn — boxes, shafts and label blocks — so no label can
  // leave the canvas (an SVG clips silently; § "Prico lovol").
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const include = (left: number, top: number, right: number, bottom: number) => {
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
    minY = Math.min(minY, top);
    maxY = Math.max(maxY, bottom);
  };
  for (const box of boxes) include(box.x, box.y, box.x + box.w, box.y + box.h);
  for (const arrow of arrows) {
    include(
      Math.min(arrow.x1, arrow.x2),
      Math.min(arrow.y1, arrow.y2),
      Math.max(arrow.x1, arrow.x2),
      Math.max(arrow.y1, arrow.y2),
    );
    for (const label of [arrow.label, arrow.labelBelow]) {
      if (!label) continue;
      const width = estimateWidth(label.lines, FONT_SIZE);
      const left =
        label.anchor === 'middle'
          ? label.x - width / 2
          : label.anchor === 'end'
            ? label.x - width
            : label.x;
      include(
        left,
        label.y - FONT_SIZE * 0.8,
        left + width,
        label.y + (label.lines.length - 1) * FLOW_LINE_HEIGHT + FONT_SIZE * 0.25,
      );
    }
  }

  // Shift into the canvas: padding all round, the title's room on its own side only.
  const dx = FLOW_PAD - minX;
  const dy = FLOW_PAD + (titleBelow ? 0 : room) - minY;
  for (const box of boxes) {
    box.x += dx;
    box.y += dy;
  }
  for (const arrow of arrows) {
    arrow.x1 += dx;
    arrow.x2 += dx;
    arrow.y1 += dy;
    arrow.y2 += dy;
    for (const label of [arrow.label, arrow.labelBelow]) {
      if (!label) continue;
      label.x += dx;
      label.y += dy;
    }
  }

  const contentW = maxX - minX + 2 * FLOW_PAD;
  const titleW =
    room > 0 ? estimateWidth(pickSides(diagram.title, language), TITLE_SIZE) + 20 : 0;
  return {
    boxes,
    arrows,
    width: Math.max(contentW, titleW),
    height: maxY - minY + 2 * FLOW_PAD + room,
    titleRoom: room,
    titleBelow,
  };
}

/**
 * The flow chart's natural layout, for the flow editor: box rectangles and arrow
 * segments in natural pixels (the coordinates `flowSvg` draws at scale 1), each
 * carrying the stored node/arrow it renders. The editor's stage draws the SVG at
 * natural size × zoom, so hit-testing is pointer ÷ zoom against exactly these boxes —
 * the same shared-projection rule the axes canvas lives by.
 */
export function flowChartLayout(
  diagram: Diagram,
  flow: FlowChart,
  language: LanguageMode,
): FlowLayout {
  return flowLayout(diagram, flow, language);
}

/**
 * `diagramSize` for the flow variant: the teacher's width, with the height following
 * the natural layout's own aspect. The whole picture scales uniformly — text included —
 * because the natural width is set by the boxed prose, and a chart wider than the text
 * column must be shrinkable without re-laying anything out.
 */
function flowSize(
  diagram: Diagram,
  flow: FlowChart,
  widthPx: number,
  language: LanguageMode,
): { widthPx: number; heightPx: number } {
  const layout = flowLayout(diagram, flow, language);
  const width = Math.max(160, widthPx);
  return { widthPx: width, heightPx: Math.max(1, Math.round((width * layout.height) / layout.width)) };
}

/** `diagramSvg` for the flow variant. */
function flowSvg(diagram: Diagram, flow: FlowChart, options: DiagramSvgOptions): string {
  const scale = options.scale ?? 1;
  const width = options.widthPx * scale;
  const height = options.heightPx * scale;
  const language = options.language;
  const layout = flowLayout(diagram, flow, language);
  // One uniform factor from natural to stored size, fitted to both dimensions and
  // centred — a stale stored height (measured in another language mode) letterboxes
  // evenly rather than distorting or leaving a lopsided blank strip.
  const eff = Math.min(width / layout.width, height / layout.height);
  const tx = (width - layout.width * eff) / 2;
  const ty = (height - layout.height * eff) / 2;

  const fontFamily = options.fonts
    ? `${options.fonts.latin}, ${options.fonts.eastAsia}, serif`
    : 'Times New Roman, serif';

  const boxStroke = `stroke="#000" stroke-width="1.2" fill="#fff"`;
  const parts: string[] = [];
  for (const box of layout.boxes) {
    if (box.node.boxed !== false) {
      parts.push(
        `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" ${boxStroke}/>`,
      );
    }
    parts.push(
      textAt(
        box.lines,
        box.x + box.w / 2,
        // First baseline centres the block of lines in the box.
        box.y +
          box.h / 2 -
          ((box.lines.length - 1) * FLOW_LINE_HEIGHT) / 2 +
          FONT_SIZE * 0.35,
        { anchor: 'middle' },
      ),
    );
  }

  const shaftStroke = `stroke="#000" stroke-width="1.6" fill="none"`;
  for (const arrow of layout.arrows) {
    parts.push(
      `<path d="M ${n(arrow.x1)} ${n(arrow.y1)} L ${n(arrow.x2)} ${n(arrow.y2)}" ${shaftStroke}/>` +
        arrowheadPath({ x: arrow.x1, y: arrow.y1 }, { x: arrow.x2, y: arrow.y2 }, ARROWHEAD),
    );
    for (const label of [arrow.label, arrow.labelBelow]) {
      if (!label) continue;
      parts.push(textAt(label.lines, label.x, label.y, { anchor: label.anchor }));
    }
  }

  // The caption, centred on the canvas and underlined like the axes diagrams' — a flow
  // chart in the papers is introduced by a caption in exactly that style.
  const titleLines = pickSides(diagram.title, language);
  const title = textAt(
    titleLines,
    layout.width / 2,
    layout.titleBelow
      ? layout.height - layout.titleRoom + TITLE_GAP + TITLE_SIZE
      : TITLE_TOP + TITLE_SIZE * 1.1,
    { anchor: 'middle', fontSize: TITLE_SIZE, underline: true },
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
    `viewBox="0 0 ${n(width)} ${n(height)}" font-family="${escapeXml(fontFamily)}">` +
    // White ground: a transparent PNG would print as whatever is behind it in Word.
    `<rect width="${n(width)}" height="${n(height)}" fill="#fff"/>` +
    `<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(eff)})">` +
    parts.join('') +
    title +
    '</g>' +
    '</svg>'
  );
}

/*
 * ── The forum figure variant ──────────────────────────────────────────────────────
 *
 * A `Diagram` carrying `forum` draws the "views expressed in a forum" stimulus both
 * reference DRQs print (`real_life_reference/2023_essay.png` Source B,
 * `2025_essay.png` Source C): speech bubbles — an underlined speaker line over a
 * body — with pointed tails aimed at a central illustration.
 *
 * Placement is slot-based, never free: a bubble names one of four corners, the boxes
 * are measured from their own wrapped text, and the tails are derived from where the
 * picture actually is — so re-wording a view reflows the figure instead of stranding
 * a tail.
 *
 * Unlike the flow chart, the layout is computed **at the stored width**, not at a
 * natural size scaled photo-style: bubble prose has no natural width of its own (it
 * wraps at whatever the box gives it), and scaling shrank the text with the figure —
 * a 400px forum printed ~6pt bubbles beside 10pt diagram text everywhere else. Laying
 * out at the stored width keeps every glyph at the diagram's one 10pt size and makes
 * the width honest: a narrower figure means more wrapped lines, never smaller type.
 */

/** White clearance around the whole figure. */
const FORUM_PAD = 6;
/**
 * A bubble's default width as a fraction of the figure's — two bubbles and a gutter
 * fill the row, the reference proportion. A bubble's own `width` overrides it.
 */
const FORUM_BUBBLE_SHARE = 292 / 640;
/** The stored fraction is clamped here: a sliver box holds no words, a full-width one leaves no gutter. */
const FORUM_BUBBLE_MIN_SHARE = 0.15;
const FORUM_BUBBLE_MAX_SHARE = 0.92;
/** No bubble narrower than this, whatever the fraction says of a small figure. */
const FORUM_MIN_BUBBLE_PX = 90;
const FORUM_BUBBLE_PAD_X = 9;
const FORUM_BUBBLE_PAD_Y = 7;
/** Vertical reach of a tail from its box edge toward the picture row. */
const FORUM_TAIL_LEN = 46;
/** Width of a tail where it leaves its box. */
const FORUM_TAIL_BASE = 26;
/** The central picture's width as a share of the natural canvas. */
const FORUM_IMAGE_SHARE = 0.42;
const FORUM_LINE_HEIGHT = FONT_SIZE * 1.15;

export interface ForumBubbleLayout {
  bubble: ForumBubble;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The underlined speaker line(s); may be empty. */
  speakerLines: RichText[];
  /** The body, wrapped to the box. */
  bodyLines: RichText[];
  /** The tail's tip, in layout px. */
  tip: { x: number; y: number };
  /** Which edge the tail leaves: top bubbles point down, bottom bubbles up. */
  tailFrom: 'top' | 'bottom';
}

export interface ForumLayout {
  bubbles: ForumBubbleLayout[];
  /** The picture's drawn box; undefined when the forum has none. */
  image?: { x: number; y: number; w: number; h: number };
  width: number;
  height: number;
  titleRoom: number;
  titleBelow: boolean;
}

/**
 * Per-character advance widths for the forum's prose, in ems of the font size.
 *
 * The shared `estimateWidth` charges a flat 0.55em per Latin glyph — fine where it
 * only sizes padding, but a forum bubble's box **hugs** its wrapped text, so the
 * error is not whitespace, it is a box visibly wider than its words (the flat rate
 * overshoots Times prose by ~10–15%, and every line wrapped early to match). These
 * are Times New Roman's real advances bucketed into classes; a few percent of error
 * remains — the hug below keeps a small cushion for it.
 */
function forumCharEm(char: string): number {
  if (/[　-鿿豈-﫿＀-｠]/.test(char)) return 1;
  if (/[ .,'’]/.test(char)) return 0.25;
  if (/[ijltfrI:;!()\-\/\[\]]/.test(char)) return 0.31;
  if (/[acegksvxyzJ]/.test(char)) return 0.46;
  if (/[mw%]/.test(char)) return 0.74;
  if (/[MW]/.test(char)) return 0.9;
  if (/[A-HK-VX-Z]/.test(char)) return 0.68;
  // Remaining lowercase, digits, "$", "?", and anything unclassified.
  return 0.5;
}

/** The forum's own text metric, run through the same shapes as `estimateWidth`. */
function forumTextWidth(lines: RichText[], fontSize: number): number {
  let widest = 0;
  for (const line of lines) {
    let total = 0;
    for (const run of line) {
      // Bold sits a touch wider; sub/superscripts render at a reduced size.
      const factor = (run.bold ? 1.03 : 1) * (run.vertAlign ? 0.72 : 1);
      for (const char of run.text) total += fontSize * forumCharEm(char) * factor;
    }
    widest = Math.max(widest, total);
  }
  return widest;
}

/** One bubble's drawn width: its own fraction (or the default share) of the figure. */
function forumBubbleWidth(bubble: ForumBubble, figureWidth: number): number {
  const share = Math.min(
    FORUM_BUBBLE_MAX_SHARE,
    Math.max(FORUM_BUBBLE_MIN_SHARE, bubble.width ?? FORUM_BUBBLE_SHARE),
  );
  return Math.min(
    figureWidth - 2 * FORUM_PAD,
    Math.max(FORUM_MIN_BUBBLE_PX, share * figureWidth),
  );
}

/** Cushion the hug keeps beyond the widest measured line, px — the metric's residual error. */
const FORUM_HUG_CUSHION = 3;

/**
 * Measure one bubble's text wrapped to its target width, and the box that hugs it.
 *
 * `w` is the *drawn* width: the widest wrapped line plus the padding, never more
 * than the target — the teacher's width is the wrap limit, but the box closes onto
 * the words it actually holds. Drawing the full target left the wrap's leftover as
 * a blank right margin inside the frame, which no reference bubble shows.
 */
function forumBubbleText(
  bubble: ForumBubble,
  targetWidth: number,
  language: LanguageMode,
): { speakerLines: RichText[]; bodyLines: RichText[]; w: number; h: number } {
  const inner = targetWidth - 2 * FORUM_BUBBLE_PAD_X;
  const speakerLines = wrapRichLines(
    pickSides(bubble.speaker, language), inner, FONT_SIZE, forumTextWidth,
  );
  const bodyLines = wrapRichLines(
    pickSides(bubble.text, language), inner, FONT_SIZE, forumTextWidth,
  );
  const lines = [...speakerLines, ...bodyLines];
  const count = Math.max(1, lines.length);
  const content = forumTextWidth(lines, FONT_SIZE);
  const w =
    lines.length === 0
      ? targetWidth
      : Math.max(
          FORUM_MIN_BUBBLE_PX,
          Math.min(targetWidth, content + 2 * FORUM_BUBBLE_PAD_X + FORUM_HUG_CUSHION),
        );
  return {
    speakerLines,
    bodyLines,
    w,
    h: 2 * FORUM_BUBBLE_PAD_Y + count * FORUM_LINE_HEIGHT,
  };
}

/**
 * Lay the forum out at the figure's stored width. Shared by `forumSize` and
 * `forumSvg`, so the measured box and the drawing cannot disagree — the flow chart's
 * own rule — and exported to the forum canvas as `forumChartLayout` for hit-testing.
 */
function forumLayout(
  diagram: Diagram,
  forum: ForumChart,
  widthPx: number,
  language: LanguageMode,
): ForumLayout {
  const room = titleRoom(diagram, language, 1);
  const titleBelow = diagram.titlePlacement === 'below';
  const top = FORUM_PAD + (titleBelow ? 0 : room);
  const width = Math.max(160, widthPx);

  // An empty forum still shows something clickable: one empty bubble, the forum
  // equivalent of the empty pie's bare circle.
  const stored =
    forum.bubbles.length > 0 || forum.image
      ? forum.bubbles
      : [{ id: 'placeholder', slot: 'topLeft' as const, speaker: { en: [], zh: [] }, text: { en: [], zh: [] } }];

  const topRow = stored.filter((bubble) => bubble.slot.startsWith('top'));
  const bottomRow = stored.filter((bubble) => bubble.slot.startsWith('bottom'));

  const measure = (bubble: ForumBubble) =>
    forumBubbleText(bubble, forumBubbleWidth(bubble, width), language);
  const rowHeight = (row: ForumBubble[]) =>
    row.length === 0 ? 0 : Math.max(...row.map((bubble) => measure(bubble).h));

  const topRowY = top;
  const topRowH = rowHeight(topRow);

  // The picture row. The tails reach `FORUM_TAIL_LEN` from each bubble row, so the
  // picture sits that far below the top row (and the bottom row that far below it).
  // With no picture, the tails still get their reach and point at the row's middle.
  const imageTop = topRowY + topRowH + (topRow.length > 0 ? FORUM_TAIL_LEN : 0);
  const imageW = width * FORUM_IMAGE_SHARE;
  const imageH = forum.image
    ? (imageW * forum.image.naturalHeightPx) / Math.max(1, forum.image.naturalWidthPx)
    : topRow.length > 0 && bottomRow.length > 0
      ? 24
      : 0;
  const image = forum.image
    ? { x: (width - imageW) / 2, y: imageTop, w: imageW, h: imageH }
    : undefined;

  const bottomRowY = imageTop + imageH + (bottomRow.length > 0 ? FORUM_TAIL_LEN : 0);
  const bottomRowH = rowHeight(bottomRow);

  const height =
    (bottomRow.length > 0 ? bottomRowY + bottomRowH : imageTop + imageH) +
    FORUM_PAD +
    (titleBelow ? room : 0);

  // Where every tail aims: the picture's centre, or the picture row's middle when
  // there is nothing there yet.
  const target = {
    x: width / 2,
    y: image ? image.y + image.h / 2 : imageTop + (imageH || FORUM_TAIL_LEN) / 2,
  };

  const place = (bubble: ForumBubble, rowY: number): ForumBubbleLayout => {
    const text = measure(bubble);
    const w = text.w;
    const onLeft = bubble.slot === 'topLeft' || bubble.slot === 'bottomLeft';
    // Anchored to its slot's own edge, so a resized bubble grows toward the middle
    // and its outer margin never moves.
    const x = onLeft ? FORUM_PAD : width - FORUM_PAD - w;
    const fromTopRow = bubble.slot.startsWith('top');
    const y = rowY;
    const edgeY = fromTopRow ? y + text.h : y;
    // The tail leaves the box near its inner side and slants toward the picture,
    // stopping just inside its edge so the join reads as the reference draws it.
    const baseX = Math.min(Math.max(target.x, x + 30), x + w - 30);
    const tipY = image
      ? fromTopRow
        ? image.y + 10
        : image.y + image.h - 10
      : fromTopRow
        ? edgeY + FORUM_TAIL_LEN
        : edgeY - FORUM_TAIL_LEN;
    const tipX = baseX + (target.x - baseX) * 0.55;
    return {
      bubble,
      x,
      y,
      w,
      h: text.h,
      speakerLines: text.speakerLines,
      bodyLines: text.bodyLines,
      tip: { x: tipX, y: tipY },
      tailFrom: fromTopRow ? 'bottom' : 'top',
    };
  };

  return {
    bubbles: [
      ...topRow.map((bubble) => place(bubble, topRowY)),
      ...bottomRow.map((bubble) => place(bubble, bottomRowY)),
    ],
    image,
    width,
    height,
    titleRoom: room,
    titleBelow,
  };
}

/**
 * One bubble's outline: its rectangle with a notch on the tail edge, closed through
 * the tip — a single path, so the box border and the tail share one stroke and the
 * join cannot show a seam.
 */
function forumBubblePath(box: ForumBubbleLayout): string {
  const { x, y, w, h, tip } = box;
  const half = FORUM_TAIL_BASE / 2;
  const baseX = Math.min(Math.max(tip.x, x + 8 + half), x + w - 8 - half);
  const b1 = baseX - half;
  const b2 = baseX + half;
  if (box.tailFrom === 'bottom') {
    // Clockwise from the top-left; the bottom edge detours through the tip.
    return (
      `M ${n(x)} ${n(y)} H ${n(x + w)} V ${n(y + h)} H ${n(b2)} ` +
      `L ${n(tip.x)} ${n(tip.y)} L ${n(b1)} ${n(y + h)} H ${n(x)} Z`
    );
  }
  // Tail on the top edge, pointing up.
  return (
    `M ${n(x)} ${n(y)} H ${n(b1)} L ${n(tip.x)} ${n(tip.y)} L ${n(b2)} ${n(y)} ` +
    `H ${n(x + w)} V ${n(y + h)} H ${n(x)} Z`
  );
}

/** The layout `forumSvg` draws, exported for the forum canvas's hit-testing. */
export function forumChartLayout(
  diagram: Diagram,
  forum: ForumChart,
  widthPx: number,
  language: LanguageMode,
): ForumLayout {
  return forumLayout(diagram, forum, widthPx, language);
}

/**
 * `diagramSize` for the forum variant: the teacher's width, the height measured from
 * the layout at that width. Deliberately **not** the flow chart's photo-scale —
 * bubble prose wraps at whatever the box gives it, so the honest response to a
 * narrower figure is more lines at the same 10pt, never smaller type.
 */
function forumSize(
  diagram: Diagram,
  forum: ForumChart,
  widthPx: number,
  language: LanguageMode,
): { widthPx: number; heightPx: number } {
  const layout = forumLayout(diagram, forum, widthPx, language);
  return {
    widthPx: layout.width,
    heightPx: Math.max(1, Math.round(layout.height)),
  };
}

/** `diagramSvg` for the forum variant. */
function forumSvg(diagram: Diagram, forum: ForumChart, options: DiagramSvgOptions): string {
  const scale = options.scale ?? 1;
  const width = options.widthPx * scale;
  const height = options.heightPx * scale;
  const language = options.language;
  const layout = forumLayout(diagram, forum, options.widthPx, language);
  // The layout already is the stored width, so this factor is normally just `scale`;
  // fitted against both dimensions and centred so a stale stored height (measured in
  // another language mode) letterboxes rather than distorts — the flow chart's rule.
  const eff = Math.min(width / layout.width, height / layout.height);
  const tx = (width - layout.width * eff) / 2;
  const ty = (height - layout.height * eff) / 2;

  const fontFamily = options.fonts
    ? `${options.fonts.latin}, ${options.fonts.eastAsia}, serif`
    : 'Times New Roman, serif';

  const parts: string[] = [];

  // The picture first, so a tail tip that overlaps its edge draws *over* it — the
  // reference tails visibly enter the illustration.
  if (layout.image && forum.image) {
    parts.push(
      `<image x="${n(layout.image.x)}" y="${n(layout.image.y)}" ` +
        `width="${n(layout.image.w)}" height="${n(layout.image.h)}" ` +
        `preserveAspectRatio="xMidYMid meet" href="${escapeXml(forum.image.src)}"/>`,
    );
  }

  const stroke = `stroke="#000" stroke-width="1.2" fill="#fff"`;
  for (const box of layout.bubbles) {
    parts.push(`<path d="${forumBubblePath(box)}" ${stroke}/>`);
    // The speaker line is underlined, the body is not — the one formatting difference
    // the reference figures draw — so the two blocks are separate `textAt` calls.
    const textX = box.x + FORUM_BUBBLE_PAD_X;
    const firstBaseline = box.y + FORUM_BUBBLE_PAD_Y + FONT_SIZE * 0.8;
    if (box.speakerLines.length > 0) {
      parts.push(textAt(box.speakerLines, textX, firstBaseline, { underline: true }));
    }
    if (box.bodyLines.length > 0) {
      parts.push(
        textAt(
          box.bodyLines,
          textX,
          firstBaseline + box.speakerLines.length * FORUM_LINE_HEIGHT,
          {},
        ),
      );
    }
  }

  // The caption, centred and underlined like the flow chart's — a forum figure in
  // the papers is introduced by its source label, so most carry no title at all.
  const titleLines = pickSides(diagram.title, language);
  const title = textAt(
    titleLines,
    layout.width / 2,
    layout.titleBelow
      ? layout.height - layout.titleRoom + TITLE_GAP + TITLE_SIZE
      : TITLE_TOP + TITLE_SIZE * 1.1,
    { anchor: 'middle', fontSize: TITLE_SIZE, underline: true },
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
    `viewBox="0 0 ${n(width)} ${n(height)}" font-family="${escapeXml(fontFamily)}">` +
    // White ground: a transparent PNG would print as whatever is behind it in Word.
    `<rect width="${n(width)}" height="${n(height)}" fill="#fff"/>` +
    `<g transform="translate(${n(tx)} ${n(ty)}) scale(${n(eff)})">` +
    parts.join('') +
    title +
    '</g>' +
    '</svg>'
  );
}

/**
 * Where the diagram's title is drawn.
 *
 * Centred on the **plot**, not on the canvas: the plot is off-centre by design (a wide
 * left pad for the y-axis ticks against a narrow right one), so centring on the SVG
 * would sit the caption visibly left of the picture it names. The reference paper centres
 * it over the axes.
 *
 * Exported so `DiagramCanvas` can draw the title in the same place the renderer does —
 * it is inert there (it is edited in the sidebar), but the canvas must still show the
 * picture as it will print.
 */
export function diagramTitleAnchor(
  diagram: Diagram,
  proj: Projection,
  scale: number,
  /**
   * Needed for the `below` case only, to count the title's *lines*.
   *
   * `textAt` draws the first line at the anchor and stacks the rest downward, so a
   * bilingual title anchored at the foot of its reserved block prints its second line
   * past the canvas edge — which is exactly what happened once: the English fitted and
   * the Chinese underneath it did not.
   */
  language: LanguageMode = 'bilingual',
): { x: number; y: number } {
  const below = diagram.titlePlacement === 'below';
  return {
    // Centred on the plot, with no stored nudge to apply: the canvas is sized around the
    // title, so it always has its own room and never needs moving out of anything.
    x: (proj.plot.left + proj.plot.right) / 2,
    // Above: the first baseline sits one line height below the frame's top, so a two-line
    // bilingual title grows downward into the room `titleRoom` reserved for it rather
    // than upward off the canvas.
    //
    // Below: measured *back from the frame's bottom edge*, so the block cannot leave it,
    // and the extra lines are subtracted because the anchor is the FIRST of them.
    //
    // Both read the frame, not the canvas: under a crop the words must hold their place
    // beside the plot while the teacher drags the real edges around them.
    y: below
      ? proj.frame.bottom -
        TITLE_GAP * scale -
        TITLE_SIZE * 0.3 * scale -
        Math.max(0, pickSides(diagram.title, language).length - 1) * TITLE_SIZE * 1.15 * scale
      : proj.frame.top + (TITLE_TOP + TITLE_SIZE * 1.1) * scale,
  };
}

/**
 * Where an axis tick label is drawn.
 *
 * `offset` slides it **along** its own axis only. A tick that drifted off the axis would
 * stop reading as a tick, so the cross-axis coordinate stays pinned.
 */
export function axisTickAnchor(
  tick: { at: number; offset?: number },
  axis: 'x' | 'y',
  proj: Projection,
  scale: number,
  /** The label's drawn width, px: an x label reaching the arrowhead drops clear of it. */
  width = 0,
): { x: number; y: number } {
  if (axis === 'y') {
    return { x: proj.plot.left - Y_TICK_GAP * scale, y: proj.py(tick.at) - (tick.offset ?? 0) * plotSpanY(proj) };
  }
  const x = proj.px(tick.at) + (tick.offset ?? 0) * plotSpanX(proj);
  // The x arrowhead's base starts `1.8·head` short of its tip and reaches `head` below
  // the axis; a label under it hangs below the head instead of on it.
  const headBase = proj.plot.right + (AXIS_OVERSHOOT - 1.8 * ARROWHEAD) * scale;
  const underHead = x + width / 2 > headBase;
  return { x, y: proj.plot.bottom + (underHead ? ARROWHEAD + 2 : X_TICK_GAP) * scale };
}

/** Where a point's x or y tick label is drawn: `axisTickAnchor` at its point, nudge included. */
export function pointTickAnchor(
  mark: DiagramPointMark,
  axis: 'x' | 'y',
  proj: Projection,
  scale: number,
  language: LanguageMode,
): { x: number; y: number } {
  const text = axis === 'x' ? mark.xTickLabel : mark.yTickLabel;
  const offset = axis === 'x' ? mark.xTickOffset : mark.yTickOffset;
  return axisTickAnchor({ at: mark.at[axis], offset }, axis, proj, scale, tickLabelWidth(text, language, scale));
}

/** A tick label's estimated drawn width, px at `scale`. */
export function tickLabelWidth(text: BiText | undefined, language: LanguageMode, scale: number): number {
  return estimateWidth(pickSides(text, language), FONT_SIZE * scale);
}

/** The plot's drawn height ÷ width: what a tangent to a spline is judged against. */
export function plotAspectOf(proj: Projection): number {
  const width = plotSpanX(proj);
  return width > 0 ? plotSpanY(proj) / width : DIAGRAM_PLOT_ASPECT;
}

/**
 * The projection `diagramSvg` will use for these exact options.
 *
 * Split out so the drawing canvas can share it rather than reimplement it. The title
 * measurements below are the whole reason it cannot be a constant: a bilingual y-axis
 * title pushes the plot down, and a long x-axis title pulls its right edge in.
 */
export function diagramPlot(diagram: Diagram, options: DiagramSvgOptions): Projection {
  const scale = options.scale ?? 1;
  const yTitleLines = pickSides(diagram.y.title, options.language);
  // The title's room is reserved on whichever side it prints, and on that side only.
  // Adding it to both would leave an untitled strip opposite the words — the same
  // "absent title must cost nothing" rule, applied per side.
  const room = titleRoom(diagram, options.language, scale);
  const below = diagram.titlePlacement === 'below';
  // Above, the title is stacked over the y-axis title, so its room adds to the same top
  // pad rather than competing for it — otherwise a titled diagram would print its
  // words straight through "Price (Renminbi)".
  const extraTop =
    Math.max(0, yTitleLines.length - 1) * AXIS_TITLE_SIZE * scale * 1.15 +
    (below ? 0 : room);
  const xTitleLines = pickSides(diagram.x.title, options.language);
  const rightRoom = estimateWidth(xTitleLines, AXIS_TITLE_SIZE * scale) + 30 * scale;
  return projection(
    options.widthPx * scale,
    options.heightPx * scale,
    scale,
    extraTop,
    rightRoom,
    below ? room : 0,
    diagram.crop,
    axisSpanRoom(diagram, options.language),
  );
}

/**
 * Render a diagram to a standalone SVG document.
 *
 * The output embeds no external references of any kind — no fonts to fetch, no linked
 * images — because it has to survive being turned into a data URL and handed to an
 * `<img>` for rasterization, where anything external would silently fail to load. The
 * forum variant's central picture is not an exception: its `src` is a `data:` URL, so
 * it rides *inline* in the SVG and loads with no fetch.
 */
export function diagramSvg(stored: Diagram, options: DiagramSvgOptions): string {
  if (stored.pie) return pieSvg(stored, stored.pie, options);
  if (stored.flow) return flowSvg(stored, stored.flow, options);
  if (stored.forum) return forumSvg(stored, stored.forum, options);
  // Anchored points and derived curves are drawn where their relations put them now.
  const diagram = resolveDiagram(stored, plotAspectOf(diagramPlot(stored, options)));
  const scale = options.scale ?? 1;
  const width = options.widthPx * scale;
  const height = options.heightPx * scale;
  const language = options.language;

  // A bilingual y-axis title prints two stacked lines above the axis, and a long x-axis
  // title prints past the arrowhead — both move the plot edges, which is why the
  // projection is computed from the titles rather than from the padding constants alone.
  const yTitleLines = pickSides(diagram.y.title, language);
  const xTitleLines = pickSides(diagram.x.title, language);

  const proj = diagramPlot(diagram, options);
  const { plot } = proj;

  const fontFamily = options.fonts
    ? `${options.fonts.latin}, ${options.fonts.eastAsia}, serif`
    : 'Times New Roman, serif';

  // Axes, each with an arrowhead at the far end, exactly as the papers draw them.
  const head = ARROWHEAD * scale;
  const axisStroke = `stroke="#000" stroke-width="${n(AXIS_WIDTH * scale)}" fill="none"`;
  const overshoot = AXIS_OVERSHOOT * scale;
  const corner = { x: plot.left, y: plot.bottom };
  const xEnd = { x: plot.right + overshoot, y: plot.bottom };
  const yEnd = { x: plot.left, y: plot.top - overshoot };
  const axes =
    `<path d="M ${n(corner.x)} ${n(corner.y)} L ${n(xEnd.x)} ${n(xEnd.y)}" ${axisStroke}/>` +
    arrowheadPath(corner, xEnd, head) +
    `<path d="M ${n(corner.x)} ${n(corner.y)} L ${n(yEnd.x)} ${n(yEnd.y)}" ${axisStroke}/>` +
    arrowheadPath(corner, yEnd, head);

  // Anchored by the shared `axisTitleAnchor`, which now also clamps a long title back
  // onto the canvas — the drag handle in `DiagramCanvas` is built from the same call,
  // so the clamp has to live there or the handle would float off the drawn text.
  const xTitleAt = axisTitleAnchor(diagram, 'x', proj, width, scale, language);
  const xTitle = textAt(xTitleLines, xTitleAt.x, xTitleAt.y, {
    anchor: 'start',
    baseline: 'middle',
    fontSize: AXIS_TITLE_SIZE * scale,
    bold: true,
  });

  // The y-axis title sits above the axis rather than rotated along it: that is how
  // every reference paper prints it, and rotated CJK would be unreadable. Its baseline
  // is measured down from the top of the SVG rather than up from the plot, so the text
  // is always inside the canvas however tall the top padding is.
  // The language is passed here too, not left to default: the y title's floor is now
  // measured against the caption's room, and that depends on how many sides the caption
  // prints. Defaulting to bilingual would reserve a two-line gap on an English-only page.
  const yTitleAt = axisTitleAnchor(diagram, 'y', proj, width, scale, language);
  const yTitle = textAt(yTitleLines, yTitleAt.x, yTitleAt.y, {
    anchor: 'start',
    fontSize: AXIS_TITLE_SIZE * scale,
    bold: true,
  });

  // The caption, centred over the plot and underlined, as the reference papers set it.
  const titleAt = diagramTitleAnchor(diagram, proj, scale, language);
  const title = textAt(pickSides(diagram.title, language), titleAt.x, titleAt.y, {
    anchor: 'middle',
    fontSize: TITLE_SIZE * scale,
    underline: true,
  });

  const origin =
    diagram.showOrigin === false
      ? ''
      : textAt([[{ text: '0' }]], plot.left - 7 * scale, plot.bottom + 7 * scale, {
          anchor: 'end',
          baseline: 'hanging',
          fontSize: FONT_SIZE * scale,
          bold: true,
        });

  const axisTicks = [
    ...(diagram.x.ticks ?? []).map((tick) => {
      const text = axisTickLabel(diagram.x, tick);
      const at = axisTickAnchor(tick, 'x', proj, scale, tickLabelWidth(text, language, scale));
      return textAt(pickSides(text, language), at.x, at.y, {
        anchor: 'middle',
        baseline: 'hanging',
        fontSize: FONT_SIZE * scale,
      });
    }),
    ...(diagram.y.ticks ?? []).map((tick) => {
      const at = axisTickAnchor(tick, 'y', proj, scale);
      return textAt(pickSides(axisTickLabel(diagram.y, tick), language), at.x, at.y, {
        anchor: 'end',
        baseline: 'middle',
        fontSize: FONT_SIZE * scale,
      });
    }),
  ].join('');

  const areas = diagram.areas ?? [];
  const body = [
    // White ground: a transparent PNG would print as whatever is behind it in Word.
    `<rect width="${n(width)}" height="${n(height)}" fill="#fff"/>`,
    // Shading under everything, so axes and curves stay crisp over it. No areas, no
    // bytes: an older diagram renders exactly as it always did.
    ...areas.map((area) => areaFillSvg(diagram, area, proj, scale)),
    axes,
    origin,
    axisTicks,
    title,
    xTitle,
    yTitle,
    ...diagram.curves.map((curve) => curveSvg(curve, proj, language, scale)),
    ...diagram.arrows.map((arrow) => arrowSvg(arrow, proj, language, scale)),
    ...(diagram.spans ?? []).map((span) => spanSvg(diagram, span, proj, language, scale)),
    ...diagram.points.map((point) => pointSvg(point, proj, language, scale)),
    ...diagram.labels.map((label) => labelSvg(label, proj, language, scale)),
    ...areas.map((area) => areaLabelSvg(diagram, area, proj, language, scale)),
  ].join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
    `viewBox="0 0 ${n(width)} ${n(height)}" font-family="${escapeXml(fontFamily)}">` +
    body +
    '</svg>'
  );
}

/** The SVG as a data URL, ready for an `<img>` src or a rasterization step. */
export function diagramSvgDataUrl(diagram: Diagram, options: DiagramSvgOptions): string {
  const svg = diagramSvg(diagram, options);
  // encodeURIComponent rather than base64: it keeps the URL readable in devtools and
  // avoids needing a base64 encoder that works in both the browser and the test runner.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
