import type {
  Diagram,
  DiagramArrow,
  DiagramCurve,
  DiagramLabel,
  DiagramPointMark,
} from '@/model/diagram';
import type { BiText, FontPair, LanguageMode, RichText } from '@/model/types';

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
const PAD = { top: 44, right: 116, bottom: 46, left: 64 };

const AXIS_WIDTH = 2;
const CURVE_WIDTH = 2;
const FONT_SIZE = 13;
const AXIS_TITLE_SIZE = 13;
/** How far each axis line runs past the plot, carrying its arrowhead. */
const AXIS_OVERSHOOT = 14;
/** Gap between an axis arrowhead and the title that sits past it. */
const AXIS_TITLE_GAP = 8;
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
 * Pick the side of a `BiText` to draw.
 *
 * Diagrams differ from body text here: a bilingual worksheet stacks EN over ZH in a
 * paragraph, but stacking two lines on every curve label would collide with the curves.
 * So a bilingual diagram prints the English label with the Chinese beneath it *only*
 * where the label is a standalone axis title, and prefers the single populated side
 * everywhere else. `pickSides` returns the lines to draw, in order.
 */
function pickSides(text: BiText | undefined, language: LanguageMode): RichText[] {
  if (!text) return [];
  const en = text.en ?? [];
  const zh = text.zh ?? [];
  const hasEn = en.some((run) => run.text.trim() !== '');
  const hasZh = zh.some((run) => run.text.trim() !== '');

  if (language === 'en') return hasEn ? [en] : hasZh ? [zh] : [];
  if (language === 'zh') return hasZh ? [zh] : hasEn ? [en] : [];

  const sides: RichText[] = [];
  if (hasEn) sides.push(en);
  // Curve and point names are symbols, not prose: "AD", "LRAS", "E₀" and "Q₁" are
  // written the same in both languages, and a teacher fills both sides so the label
  // survives whichever mode the worksheet is printed in. Stacking two identical lines
  // would print "AD" twice on top of the curve, so an identical side is dropped —
  // only a genuine translation ("Price level" / "價格水平") stacks.
  if (hasZh && !(hasEn && sameText(en, zh))) sides.push(zh);
  return sides;
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

function projection(
  width: number,
  height: number,
  scale: number,
  /** Extra top room, so a two-line (bilingual) y-axis title never overlaps the plot. */
  extraTop = 0,
  /** Room the x-axis title needs beyond the axis, so it never sits on the arrowhead. */
  rightRoom = 0,
): Projection {
  const pad = {
    top: PAD.top * scale + extraTop,
    right: Math.max(PAD.right * scale, rightRoom),
    bottom: PAD.bottom * scale,
    left: PAD.left * scale,
  };
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
  };
}

/**
 * A smooth path through the points (Catmull-Rom converted to cubic Béziers).
 *
 * Used only by `curved` curves. Straight ones emit a polyline so that a kinked supply
 * curve keeps its corners sharp instead of being rounded off into something that no
 * longer reads as a quota.
 */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length < 3) return `M ${n(pts[0].x)} ${n(pts[0].y)} L ${n(pts[pts.length - 1].x)} ${n(pts[pts.length - 1].y)}`;

  let d = `M ${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${n(c1x)} ${n(c1y)}, ${n(c2x)} ${n(c2y)}, ${n(p2.x)} ${n(p2.y)}`;
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
    parts.push(
      textAt(xTick, x + (mark.xTickOffset ?? 0) * plotSpanX(proj), proj.plot.bottom + 8 * scale, {
        anchor: 'middle',
        baseline: 'hanging',
        fontSize: FONT_SIZE * scale,
      }),
    );
  }
  const yTick = pickSides(mark.yTickLabel, language);
  if (yTick.length > 0) {
    parts.push(
      textAt(yTick, proj.plot.left - 8 * scale, y - (mark.yTickOffset ?? 0) * plotSpanY(proj), {
        anchor: 'end',
        baseline: 'middle',
        fontSize: FONT_SIZE * scale,
      }),
    );
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

  const d = arrow.curved
    ? (() => {
        // Bow the shaft perpendicular to its own direction, so a shift arrow can
        // arc around the curves it sits between.
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        const bow = length * 0.2;
        return `M ${n(from.x)} ${n(from.y)} Q ${n(mx - (dy / length) * bow)} ${n(my + (dx / length) * bow)}, ${n(to.x)} ${n(to.y)}`;
      })()
    : `M ${n(from.x)} ${n(from.y)} L ${n(to.x)} ${n(to.y)}`;

  const shaft =
    `<path d="${d}" fill="none" stroke="#000" stroke-width="${n(1.8 * scale)}" ` +
    `marker-end="url(#arrowhead)"/>`;

  const lines = pickSides(arrow.label, language);
  const placed = arrowLabelAnchor(arrow, proj, scale);
  const label =
    lines.length > 0
      ? textAt(lines, placed.x, placed.y, { anchor: 'middle', fontSize: FONT_SIZE * scale })
      : '';

  return shaft + label;
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

/**
 * Where an axis title is drawn, including any dragged nudge.
 *
 * The anchor stays derived from the plot edges and `diagramPlot` still sizes the padding
 * from the title's own estimated width, so a long title reserves its room and cannot
 * clip (the hazard the `PAD` comment describes). `titleOffset` only moves the title
 * *within* that reserved space.
 */
export function axisTitleAnchor(
  diagram: Diagram,
  axis: 'x' | 'y',
  proj: Projection,
  width: number,
  scale: number,
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
          x: proj.plot.right + AXIS_OVERSHOOT * scale + AXIS_TITLE_GAP * scale,
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
          y: Math.max(
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
): { x: number; y: number } {
  return axis === 'x'
    ? {
        x: proj.px(tick.at) + (tick.offset ?? 0) * plotSpanX(proj),
        y: proj.plot.bottom + 8 * scale,
      }
    : {
        x: proj.plot.left - 8 * scale,
        y: proj.py(tick.at) - (tick.offset ?? 0) * plotSpanY(proj),
      };
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
  const extraTop = Math.max(0, yTitleLines.length - 1) * AXIS_TITLE_SIZE * scale * 1.15;
  const xTitleLines = pickSides(diagram.x.title, options.language);
  const rightRoom = estimateWidth(xTitleLines, AXIS_TITLE_SIZE * scale) + 30 * scale;
  return projection(
    options.widthPx * scale,
    options.heightPx * scale,
    scale,
    extraTop,
    rightRoom,
  );
}

/**
 * Render a diagram to a standalone SVG document.
 *
 * The output embeds no external references of any kind — no fonts to fetch, no images —
 * because it has to survive being turned into a data URL and handed to an `<img>` for
 * rasterization, where anything external would silently fail to load.
 */
export function diagramSvg(diagram: Diagram, options: DiagramSvgOptions): string {
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

  const head = 5 * scale;
  const defs =
    `<defs><marker id="arrowhead" markerWidth="${n(head * 2)}" markerHeight="${n(head * 2)}" ` +
    `refX="${n(head * 1.8)}" refY="${n(head)}" orient="auto" markerUnits="userSpaceOnUse">` +
    `<path d="M 0 0 L ${n(head * 2)} ${n(head)} L 0 ${n(head * 2)} z" fill="#000"/></marker></defs>`;

  // Axes, each with an arrowhead at the far end, exactly as the papers draw them.
  const axisStroke = `stroke="#000" stroke-width="${n(AXIS_WIDTH * scale)}" fill="none" marker-end="url(#arrowhead)"`;
  const overshoot = AXIS_OVERSHOOT * scale;
  const axes =
    `<path d="M ${n(plot.left)} ${n(plot.bottom)} L ${n(plot.right + overshoot)} ${n(plot.bottom)}" ${axisStroke}/>` +
    `<path d="M ${n(plot.left)} ${n(plot.bottom)} L ${n(plot.left)} ${n(plot.top - overshoot)}" ${axisStroke}/>`;

  // Right-anchored at the very edge, so a long title ("Quantity of Good X") grows back
  // into the padding reserved for it rather than off the side, where the SVG clips.
  const xTitleAt = axisTitleAnchor(diagram, 'x', proj, width, scale);
  const xTitle = textAt(xTitleLines, xTitleAt.x, xTitleAt.y, {
    // Left-anchored now that it starts at the arrowhead rather than at the far edge.
    anchor: 'start',
    baseline: 'middle',
    fontSize: AXIS_TITLE_SIZE * scale,
    bold: true,
  });

  // The y-axis title sits above the axis rather than rotated along it: that is how
  // every reference paper prints it, and rotated CJK would be unreadable. Its baseline
  // is measured down from the top of the SVG rather than up from the plot, so the text
  // is always inside the canvas however tall the top padding is.
  const yTitleAt = axisTitleAnchor(diagram, 'y', proj, width, scale);
  const yTitle = textAt(yTitleLines, yTitleAt.x, yTitleAt.y, {
    anchor: 'start',
    fontSize: AXIS_TITLE_SIZE * scale,
    bold: true,
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
      const at = axisTickAnchor(tick, 'x', proj, scale);
      return textAt(pickSides(tick.label, language), at.x, at.y, {
        anchor: 'middle',
        baseline: 'hanging',
        fontSize: FONT_SIZE * scale,
      });
    }),
    ...(diagram.y.ticks ?? []).map((tick) => {
      const at = axisTickAnchor(tick, 'y', proj, scale);
      return textAt(pickSides(tick.label, language), at.x, at.y, {
        anchor: 'end',
        baseline: 'middle',
        fontSize: FONT_SIZE * scale,
      });
    }),
  ].join('');

  const body = [
    defs,
    // White ground: a transparent PNG would print as whatever is behind it in Word.
    `<rect width="${n(width)}" height="${n(height)}" fill="#fff"/>`,
    axes,
    origin,
    axisTicks,
    xTitle,
    yTitle,
    ...diagram.curves.map((curve) => curveSvg(curve, proj, language, scale)),
    ...diagram.arrows.map((arrow) => arrowSvg(arrow, proj, language, scale)),
    ...diagram.points.map((point) => pointSvg(point, proj, language, scale)),
    ...diagram.labels.map((label) => labelSvg(label, proj, language, scale)),
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
