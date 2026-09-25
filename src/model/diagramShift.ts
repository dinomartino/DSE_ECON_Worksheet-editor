import { DIAGRAM_PLOT_ASPECT, type Diagram, type DiagramCurve, type DiagramPoint, type DiagramPointMark } from './diagram';
import { curveCrossing, curveSlopeSign } from './diagramAreas';
import { translateCurvePoints } from './diagramAnchors';

export { translateCurvePoints };
import type { BiText, InlineRun } from './types';

/**
 * "Shift this curve": a translated copy (D → D₁) and, where it meets the curve the
 * original crossed, the new equilibrium — a point with dashed drops to both axes and
 * P/Q ticks, the convention the templates use for E₀. Pure; the canvas commits the
 * result as one edit.
 */

export interface ShiftResult {
  diagram: Diagram;
  curveId: string;
  /** The new equilibrium, when the shifted curve meets a counterpart. */
  pointId?: string;
}

/** The trailing subscript number of a label side ("D₁" → 1), or null. */
function trailingSubscript(runs: InlineRun[]): number | null {
  const last = runs[runs.length - 1];
  if (!last || last.vertAlign !== 'subscript' || !/^\d+$/.test(last.text.trim())) return null;
  return Number(last.text.trim());
}

function withSubscript(runs: InlineRun[], value: number): InlineRun[] {
  if (runs.length === 0 || runs.every((run) => run.text.trim() === '')) return runs;
  const current = trailingSubscript(runs);
  const base = current === null ? runs : runs.slice(0, -1);
  return [...base, { text: String(value), vertAlign: 'subscript' }];
}

const flat = (runs: InlineRun[] | undefined) => (runs ?? []).map((run) => run.text).join('');

/** The subscript a shifted copy of `label` takes: one past the original's, or 1. */
export function shiftedLabel(label: BiText | undefined, taken: Set<string>): BiText | undefined {
  if (!label) return undefined;
  let next = (trailingSubscript(label.en ?? []) ?? trailingSubscript(label.zh ?? []) ?? 0) + 1;
  let candidate: BiText = label;
  for (let guard = 0; guard < 50; guard += 1, next += 1) {
    candidate = { en: withSubscript(label.en ?? [], next), zh: withSubscript(label.zh ?? [], next) };
    if (!taken.has(flat(candidate.en)) && !taken.has(flat(candidate.zh))) break;
  }
  return candidate;
}

const sub = (base: string, n: number): BiText => {
  const runs: InlineRun[] = [{ text: base }, { text: String(n), vertAlign: 'subscript' }];
  return { en: runs, zh: runs.map((run) => ({ ...run })) };
};

/**
 * The curve the original meets at its equilibrium: one of opposite slope where
 * possible, and preferably one whose crossing already carries a marked point.
 */
function counterpartOf(diagram: Diagram, original: DiagramCurve): DiagramCurve | null {
  const sign = curveSlopeSign(original);
  let best: { curve: DiagramCurve; score: number } | null = null;
  for (const curve of diagram.curves) {
    if (curve.id === original.id) continue;
    const at = curveCrossing(original, curve);
    if (!at) continue;
    const other = curveSlopeSign(curve);
    let score = 0;
    if (sign !== 0 && other === -sign) score += 2;
    if (diagram.points.some((p) => Math.hypot(p.at.x - at.x, p.at.y - at.y) < 0.02)) score += 1;
    if (!best || score > best.score) best = { curve, score };
  }
  return best?.curve ?? null;
}

/**
 * Shift a curve by `delta` (unit space: +x right, +y up). Returns the diagram unchanged
 * (and no ids) if the curve is missing or the shift pushes it wholly off the plot.
 */
export function shiftCurve(
  diagram: Diagram,
  curveId: string,
  delta: DiagramPoint,
  mint: () => string,
): ShiftResult | null {
  const original = diagram.curves.find((c) => c.id === curveId);
  if (!original) return null;
  const points = translateCurvePoints(original.points, delta);
  if (!points) return null;

  const taken = new Set(diagram.curves.flatMap((c) => [flat(c.label?.en), flat(c.label?.zh)]));
  // The copy keeps the original's style; its label starts at the default spot.
  const copy: DiagramCurve = {
    ...original,
    id: mint(),
    points,
    label: shiftedLabel(original.label, taken),
  };
  delete copy.labelOffset;
  // A derived copy would resolve back onto the original: a numeric level moves its
  // number, anything else becomes plain geometry.
  if (original.derive?.kind === 'level' && typeof original.derive.y === 'number') {
    copy.derive = { ...original.derive, y: points[0].y };
  } else if (original.derive?.kind === 'vertical' && typeof original.derive.x === 'number') {
    copy.derive = { ...original.derive, x: points[0].x };
  } else {
    delete copy.derive;
  }
  let next: Diagram = { ...diagram, curves: [...diagram.curves, copy] };

  // The shift arrow, the templates' convention: between the two curves, a quarter of
  // the way down from the original's upper end, where it clears the equilibria.
  const upper = [...original.points].sort((a, b) => b.y - a.y);
  const top = upper[0];
  const far = upper[upper.length - 1];
  const from = { x: top.x + (far.x - top.x) * 0.25, y: top.y + (far.y - top.y) * 0.25 };
  const inset = 0.15;
  const tail = { x: from.x + delta.x * inset, y: from.y + delta.y * inset };
  const head = { x: from.x + delta.x * (1 - inset), y: from.y + delta.y * (1 - inset) };
  if ([tail, head].every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) {
    next = { ...next, arrows: [...next.arrows, { id: mint(), from: tail, to: head }] };
  }

  const counterpart = counterpartOf(diagram, original);
  const at = counterpart ? curveCrossing(copy, counterpart) : null;
  if (!counterpart || !at) return { diagram: next, curveId: copy.id };

  // The equilibrium already on the original crossing follows its curves from now on.
  const before = curveCrossing(original, counterpart);
  if (before) {
    next = {
      ...next,
      points: next.points.map((p) =>
        !p.anchor && Math.hypot(p.at.x - before.x, p.at.y - before.y) < 0.02
          ? { ...p, at: before, anchor: { cross: [original.id, counterpart.id] } }
          : p,
      ),
    };
  }

  // Numbered after the new curve (D₁ → P₁, Q₁) unless that number is taken — a second
  // shift in one diagram — then one past the highest E, P or Q already there.
  const fromCurve = trailingSubscript(copy.label?.en ?? []);
  const used = diagram.points
    .flatMap((p) => [
      /^E/.test(flat(p.label?.en)) ? p.label : undefined,
      /^[PQ]/.test(flat(p.xTickLabel?.en)) ? p.xTickLabel : undefined,
      /^[PQ]/.test(flat(p.yTickLabel?.en)) ? p.yTickLabel : undefined,
    ])
    .map((text) => (text ? trailingSubscript(text.en ?? []) : null))
    .filter((value): value is number => value !== null);
  const index =
    fromCurve !== null && !used.includes(fromCurve)
      ? fromCurve
      : used.length > 0
        ? Math.max(...used) + 1
        : 1;
  const mark: DiagramPointMark = {
    id: mint(),
    at,
    anchor: { cross: [copy.id, counterpart.id] },
    // No name: E₁ is opt-in from the point inspector (`nextEquilibriumName`).
    dot: true,
    dropTo: ['x', 'y'],
    xTickLabel: sub('Q', index),
    yTickLabel: sub('P', index),
  };
  next = { ...next, points: [...next.points, mark] };
  return { diagram: next, curveId: copy.id, pointId: mark.id };
}

/*
 * ── Naming an equilibrium ─────────────────────────────────────────────────────────
 *
 * Crossing points ship unnamed; the inspector adds "E₀" on request, placed on the side
 * that keeps it off the curves through the dot.
 */

type LabelSide = NonNullable<DiagramPointMark['labelSide']>;
type Seg = [DiagramPoint, DiagramPoint];

/** Nominal plot size in px, to judge clearance on screen rather than in unit space. */
const PLOT_PX = { x: 300, y: 300 * DIAGRAM_PLOT_ASPECT };
/**
 * The ink of a short name ("E₀", bold 10pt) on each side of the dot, px, y down: the
 * renderer's 7px gap, a 9px cap height and the subscript below the baseline.
 */
const NAME_INK = { w: 14, gap: 7, cap: 9, sub: 2 };
/** Clearance beyond this counts as enough; preference then decides. */
const NAME_ENOUGH = 4;
/** How much each side is preferred, px of clearance: right, then its diagonals. */
const NAME_PREFERENCE: Partial<Record<LabelSide, number>> = { right: 3, upRight: 2, downRight: 2 };

const NAME_SIDES: Array<[LabelSide, { x0: number; x1: number; y0: number; y1: number }]> = (() => {
  const { w, gap, cap, sub: tail } = NAME_INK;
  const right = { x0: gap, x1: gap + w };
  const left = { x0: -gap - w, x1: -gap };
  const mid = { x0: -w / 2, x1: w / 2 };
  const level = { y0: -cap / 2, y1: cap / 2 + tail };
  const above = { y0: -gap - cap, y1: -gap + tail };
  const below = { y0: gap, y1: gap + cap + tail };
  return [
    ['right', { ...right, ...level }],
    ['upRight', { ...right, ...above }],
    ['downRight', { ...right, ...below }],
    ['upLeft', { ...left, ...above }],
    ['left', { ...left, ...level }],
    ['downLeft', { ...left, ...below }],
    ['up', { ...mid, ...above }],
    ['down', { ...mid, ...below }],
  ];
})();

/** Screen distance from a box to a segment (0 when they touch). */
function boxToSegment(box: { x0: number; x1: number; y0: number; y1: number }, [a, b]: Seg): number {
  const corners = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ];
  const toBox = (p: DiagramPoint) =>
    Math.hypot(Math.max(box.x0 - p.x, 0, p.x - box.x1), Math.max(box.y0 - p.y, 0, p.y - box.y1));
  const edges: Seg[] = corners.map((c, i) => [c, corners[(i + 1) % 4]]);
  if (toBox(a) === 0 || toBox(b) === 0 || edges.some((edge) => segmentsCross(edge, [a, b]))) return 0;
  const toSegment = (p: DiagramPoint) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1e-12)));
    return Math.hypot(a.x + k * dx - p.x, a.y + k * dy - p.y);
  };
  return Math.min(...corners.map(toSegment), toBox(a), toBox(b));
}

function segmentsCross([p, q]: Seg, [r, s]: Seg): boolean {
  const cross = (o: DiagramPoint, a: DiagramPoint, b: DiagramPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const d1 = cross(r, s, p);
  const d2 = cross(r, s, q);
  const d3 = cross(p, q, r);
  const d4 = cross(p, q, s);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Where a new name goes: the side scoring best on clearance from every curve (capped at
 * "enough"), half-weighted clearance from the dashed drops, and a preference for right,
 * then up- or down-right. So right unless a curve runs through it.
 */
export function equilibriumLabelSide(diagram: Diagram, mark: DiagramPointMark): LabelSide {
  // Everything drawn near the dot, in screen px relative to it (y down).
  const screen = (p: DiagramPoint) => ({ x: (p.x - mark.at.x) * PLOT_PX.x, y: (mark.at.y - p.y) * PLOT_PX.y });
  const curves: Seg[] = diagram.curves.flatMap((c) =>
    c.points.slice(1).map((p, i): Seg => [screen(c.points[i]), screen(p)]),
  );
  const drops: Seg[] = diagram.points.flatMap((p) =>
    (p.dropTo ?? []).map((axis): Seg => [screen(p.at), screen(axis === 'x' ? { x: p.at.x, y: 0 } : { x: 0, y: p.at.y })]),
  );
  const clear = (box: (typeof NAME_SIDES)[number][1], segs: Seg[]) =>
    Math.min(NAME_ENOUGH, ...segs.map((seg) => boxToSegment(box, seg)));
  const score = ([side, box]: (typeof NAME_SIDES)[number]) =>
    clear(box, curves) + clear(box, drops) / 2 + (NAME_PREFERENCE[side] ?? 0);
  return NAME_SIDES.reduce((best, side) => (score(side) > score(best) ? side : best))[0];
}

/** "E₀" for this point: its ticks' number when free, else the lowest number no E has yet. */
export function nextEquilibriumName(diagram: Diagram, mark: DiagramPointMark): BiText {
  const taken = new Set(
    diagram.points
      .filter((p) => p.id !== mark.id && /^E/.test(flat(p.label?.en)))
      .map((p) => trailingSubscript(p.label?.en ?? []))
      .filter((value): value is number => value !== null),
  );
  const own = trailingSubscript(mark.xTickLabel?.en ?? []) ?? trailingSubscript(mark.yTickLabel?.en ?? []);
  if (own !== null && !taken.has(own)) return sub('E', own);
  let n = 0;
  while (taken.has(n)) n += 1;
  return sub('E', n);
}

/** A point's name in lists: its label, else its ticks ("Point (Q₁, P₁)"), else "Point". */
export function pointTitle(mark: DiagramPointMark): string {
  const text = (value?: BiText) => (flat(value?.en) || flat(value?.zh)).trim();
  const ticks = [text(mark.xTickLabel), text(mark.yTickLabel)].filter(Boolean);
  return text(mark.label) || (ticks.length > 0 ? `Point (${ticks.join(', ')})` : 'Point');
}

/** The point with `label`; a first name is placed by `equilibriumLabelSide` unless dragged by hand. */
export function withPointLabel(diagram: Diagram, mark: DiagramPointMark, label: BiText): DiagramPointMark {
  const named = (text?: BiText) => flat(text?.en).trim() !== '' || flat(text?.zh).trim() !== '';
  if (named(mark.label) || !named(label) || mark.labelOffset) return { ...mark, label };
  return { ...mark, label, labelSide: equilibriumLabelSide(diagram, mark) };
}
