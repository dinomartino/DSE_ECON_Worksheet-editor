import type { Diagram, DiagramCurve, DiagramPoint, DiagramPointMark } from './diagram';
import { curveCrossing, curveSlopeSign } from './diagramAreas';
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

/** Liang–Barsky: the part of segment a→b inside the unit square, or null. */
function clipSegment(a: DiagramPoint, b: DiagramPoint): [DiagramPoint, DiagramPoint] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: Array<[number, number]> = [
    [-dx, a.x],
    [dx, 1 - a.x],
    [-dy, a.y],
    [dy, 1 - a.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  const at = (t: number) => ({ x: a.x + t * dx, y: a.y + t * dy });
  return [at(t0), at(t1)];
}

/**
 * The polyline translated by `delta` and trimmed to the plot — trimmed, not clamped, so
 * the slope survives a shift that pushes an end off the edge. Keeps the first stretch
 * that stays inside; null if nothing does.
 */
export function translateCurvePoints(points: DiagramPoint[], delta: DiagramPoint): DiagramPoint[] | null {
  const moved = points.map((p) => ({ x: p.x + delta.x, y: p.y + delta.y }));
  const out: DiagramPoint[] = [];
  for (let i = 0; i < moved.length - 1; i += 1) {
    const clipped = clipSegment(moved[i], moved[i + 1]);
    if (!clipped) {
      if (out.length > 0) break;
      continue;
    }
    const [start, end] = clipped;
    if (out.length === 0) out.push(start);
    else if (Math.hypot(start.x - out[out.length - 1].x, start.y - out[out.length - 1].y) > 1e-9) break;
    out.push(end);
    // Left the square mid-segment: the stretch is over.
    if (end !== moved[i + 1] && Math.hypot(end.x - moved[i + 1].x, end.y - moved[i + 1].y) > 1e-9) break;
  }
  return out.length >= 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) > 1e-6
    ? out
    : null;
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
  if (!at) return { diagram: next, curveId: copy.id };

  // Numbered after the new curve (D₁ → E₁, P₁, Q₁) unless that E is taken — a second
  // shift in one diagram — then one past the highest E.
  const fromCurve = trailingSubscript(copy.label?.en ?? []);
  const used = diagram.points
    .map((p) => (/^E/.test(flat(p.label?.en)) ? trailingSubscript(p.label?.en ?? []) : null))
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
    label: sub('E', index),
    labelSide: 'right',
    dot: true,
    dropTo: ['x', 'y'],
    xTickLabel: sub('Q', index),
    yTickLabel: sub('P', index),
  };
  next = { ...next, points: [...next.points, mark] };
  return { diagram: next, curveId: copy.id, pointId: mark.id };
}
