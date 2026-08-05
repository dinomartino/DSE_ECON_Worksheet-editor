import type {
  Diagram,
  DiagramArrow,
  DiagramCrop,
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
): Projection {
  const autoPad = {
    top: PAD.top * scale + extraTop,
    // Enough for the title, never more than `MAX_X_TITLE_SHARE` of the canvas. A title
    // wider than the cap grows leftward from its anchor into the plot's own whitespace
    // rather than pushing the axes further off-centre — overlapping a stretch of empty
    // plot is a far smaller sin than drawing every diagram lopsided.
    right: Math.min(
      Math.max(PAD.right * scale, rightRoom),
      width * MAX_X_TITLE_SHARE,
    ),
    bottom: PAD.bottom * scale + extraBottom,
    left: PAD.left * scale,
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
  const lines = pickSides(diagram.title, language);
  if (lines.length === 0) return 0;
  return TITLE_TOP * scale + lines.length * TITLE_SIZE * scale * 1.15 + TITLE_GAP * scale;
}

/**
 * The plot's own printed size, before anything around it is counted.
 *
 * The 4:3 the templates are drawn against. It is the *plot* that holds this shape, not
 * the canvas: a supply-demand cross looks wrong stretched, and it is the axes a teacher
 * is judging when they set a width.
 */
const PLOT_ASPECT = 3 / 4;

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
  const plotWidth = width - (PAD.left + PAD.right);
  const plotHeight = Math.max(1, plotWidth) * PLOT_ASPECT;

  // Both axis titles print outside the plot, and a bilingual pair stacks two lines.
  const yTitleLines = pickSides(diagram.y.title, language).length;
  const topRoom = PAD.top + Math.max(0, yTitleLines - 1) * AXIS_TITLE_SIZE * 1.15;

  return {
    widthPx: width,
    heightPx: Math.round(plotHeight + topRoom + PAD.bottom + titleRoom(diagram, language, 1)),
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
    title,
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
