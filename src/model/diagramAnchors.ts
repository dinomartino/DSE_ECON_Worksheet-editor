import {
  clampUnit,
  DIAGRAM_PLOT_ASPECT,
  type Diagram,
  type DiagramAnchorRef,
  type DiagramCurve,
  type DiagramCurveDerive,
  type DiagramPlace,
  type DiagramPoint,
  type DiagramSpan,
} from './diagram';

/**
 * Geometry that tracks what it measures (§ Anchored geometry).
 *
 * An anchored point, a derived curve and a span end are *relations* — "where D meets
 * S", "MR of D", "on S at Pw + t". Everything drawn reads positions through
 * `resolveDiagram`, which writes each relation's current value into the plain `at` /
 * `points` an older build draws. A relation that no longer resolves (curves that do not
 * meet, a cycle) keeps its stored value.
 */

const EPS = 1e-9;

/** The curve's height at `x` — the first non-vertical segment spanning it — or null. */
export function curveYAt(curve: DiagramCurve, x: number): number | null {
  for (let i = 0; i < curve.points.length - 1; i += 1) {
    const a = curve.points[i];
    const b = curve.points[i + 1];
    if (Math.abs(b.x - a.x) < EPS) continue;
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (x < lo - EPS || x > hi + EPS) continue;
    const t = (x - a.x) / (b.x - a.x);
    return a.y + t * (b.y - a.y);
  }
  return null;
}

/** Where the curve reaches height `y` — the first non-flat segment spanning it — or null. */
export function curveXAt(curve: DiagramCurve, y: number): number | null {
  for (let i = 0; i < curve.points.length - 1; i += 1) {
    const a = curve.points[i];
    const b = curve.points[i + 1];
    if (Math.abs(b.y - a.y) < EPS) continue;
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    if (y < lo - EPS || y > hi + EPS) continue;
    const t = (y - a.y) / (b.y - a.y);
    return a.x + t * (b.x - a.x);
  }
  return null;
}

function segmentCrossing(
  p1: DiagramPoint,
  p2: DiagramPoint,
  p3: DiagramPoint,
  p4: DiagramPoint,
): DiagramPoint | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denominator = d1x * d2y - d1y * d2x;
  if (Math.abs(denominator) < EPS) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denominator;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denominator;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/** Where two curves first cross, walking `a` from its start; null if they never do. */
export function curveCrossing(a: DiagramCurve, b: DiagramCurve): DiagramPoint | null {
  for (let i = 0; i < a.points.length - 1; i += 1) {
    for (let j = 0; j < b.points.length - 1; j += 1) {
      const hit = segmentCrossing(a.points[i], a.points[i + 1], b.points[j], b.points[j + 1]);
      if (hit) return hit;
    }
  }
  return null;
}

/** One cubic Bézier piece of a `curved` curve. */
export interface SplineSegment {
  p1: DiagramPoint;
  c1: DiagramPoint;
  c2: DiagramPoint;
  p2: DiagramPoint;
}

/**
 * The centripetal Catmull–Rom spline a `curved` curve is drawn as (α = ½), one Bézier
 * per hop. Shared by the renderer's path and the tangent here, so both see one curve.
 */
export function splineSegments(pts: DiagramPoint[]): SplineSegment[] {
  const out: SplineSegment[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;

    // Knot intervals: the square root of each hop's length. A coincident pair would
    // zero a denominator, so each interval is floored at a hair above it.
    const d1 = Math.max(Math.hypot(p1.x - p0.x, p1.y - p0.y) ** 0.5, 1e-4);
    const d2 = Math.max(Math.hypot(p2.x - p1.x, p2.y - p1.y) ** 0.5, 1e-4);
    const d3 = Math.max(Math.hypot(p3.x - p2.x, p3.y - p2.y) ** 0.5, 1e-4);

    const c1x =
      (d1 * d1 * p2.x - d2 * d2 * p0.x + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1.x) /
      (3 * d1 * (d1 + d2));
    const c1y =
      (d1 * d1 * p2.y - d2 * d2 * p0.y + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1.y) /
      (3 * d1 * (d1 + d2));
    const c2x =
      (d3 * d3 * p1.x - d2 * d2 * p3.x + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2.x) /
      (3 * d3 * (d3 + d2));
    const c2y =
      (d3 * d3 * p1.y - d2 * d2 * p3.y + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2.y) /
      (3 * d3 * (d3 + d2));
    out.push({ p1, c1: { x: c1x, y: c1y }, c2: { x: c2x, y: c2y }, p2 });
  }
  return out;
}

/** Liang–Barsky: the part of segment a→b inside the unit square, or null. */
function clipToPlot(a: DiagramPoint, b: DiagramPoint): [DiagramPoint, DiagramPoint] | null {
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
  const at = (t: number) => ({ x: clampUnit(a.x + t * dx), y: clampUnit(a.y + t * dy) });
  const start = at(t0);
  const end = at(t1);
  return Math.hypot(end.x - start.x, end.y - start.y) > 1e-6 ? [start, end] : null;
}

/** The whole line through `p` along `dir`, as the stretch that crosses the plot. */
function lineAcrossPlot(p: DiagramPoint, dir: DiagramPoint): DiagramPoint[] | null {
  const length = Math.hypot(dir.x, dir.y);
  if (length < EPS) return null;
  const k = 3 / length;
  return clipToPlot({ x: p.x - dir.x * k, y: p.y - dir.y * k }, { x: p.x + dir.x * k, y: p.y + dir.y * k });
}

/** A place that is a fixed unit point rather than a reference (a composite of numbers is one). */
export function isFixedPlace(place: DiagramPlace): place is DiagramPoint {
  const loose = place as { x?: unknown; y?: unknown };
  return typeof loose.x === 'number' && typeof loose.y === 'number' && !('on' in place);
}

/**
 * The point on `curve` nearest `near` and the curve's direction there. Judged with y
 * scaled by `aspect`, as the plot is drawn — the spline is only the same shape there.
 */
function tangentOn(
  curve: DiagramCurve,
  near: DiagramPoint,
  aspect: number,
): { at: DiagramPoint; dir: DiagramPoint } | null {
  const pts = curve.points.map((p) => ({ x: p.x, y: p.y * aspect }));
  const q = { x: near.x, y: near.y * aspect };
  if (pts.length < 2) return null;
  let best: { d: number; at: DiagramPoint; dir: DiagramPoint } | null = null;
  const consider = (at: DiagramPoint, dir: DiagramPoint) => {
    const d = Math.hypot(at.x - q.x, at.y - q.y);
    if (Math.hypot(dir.x, dir.y) > EPS && (!best || d < best.d)) best = { d, at, dir };
  };

  // A two-point `curved` curve is drawn straight, as a polyline is.
  if (curve.shape !== 'curved' || pts.length < 3) {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      if (lengthSq < EPS) continue;
      const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / lengthSq));
      consider({ x: a.x + t * dx, y: a.y + t * dy }, { x: dx, y: dy });
    }
  } else {
    const STEPS = 128;
    for (const { p1, c1, c2, p2 } of splineSegments(pts)) {
      for (let s = 0; s <= STEPS; s += 1) {
        const t = s / STEPS;
        const u = 1 - t;
        const at = {
          x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
          y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
        };
        const dir = {
          x: 3 * u * u * (c1.x - p1.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (p2.x - c2.x),
          y: 3 * u * u * (c1.y - p1.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (p2.y - c2.y),
        };
        consider(at, dir);
      }
    }
  }
  const found = best as { at: DiagramPoint; dir: DiagramPoint } | null;
  if (!found) return null;
  return {
    at: { x: found.at.x, y: found.at.y / aspect },
    dir: { x: found.dir.x, y: found.dir.y / aspect },
  };
}

/** Thrown when resolving `key` reaches `key` again; caught by that key's own frame. */
class Cycle {
  constructor(readonly key: string) {}
}

interface Resolver {
  anchor: (ref: DiagramAnchorRef) => DiagramPoint | null;
  place: (place: DiagramPlace) => DiagramPoint | null;
  point: (id: string) => DiagramPoint | null;
  curve: (id: string) => DiagramCurve | null;
}

/**
 * Memoised, cycle-safe resolution over one diagram. A point or curve whose relation
 * leads back to itself resolves to its stored value; so does one that resolves to null.
 */
function createResolver(diagram: Diagram, aspect: number): Resolver {
  const points = new Map(diagram.points.map((p) => [p.id, p]));
  const curves = new Map(diagram.curves.map((c) => [c.id, c]));
  const memo = new Map<string, unknown>();
  const active = new Set<string>();

  const guarded = <T>(key: string, compute: () => T, fallback: () => T): T => {
    if (memo.has(key)) return memo.get(key) as T;
    if (active.has(key)) throw new Cycle(key);
    active.add(key);
    let value: T;
    try {
      value = compute();
    } catch (error) {
      if (!(error instanceof Cycle) || error.key !== key) throw error;
      value = fallback();
    } finally {
      active.delete(key);
    }
    memo.set(key, value);
    return value;
  };

  const coordinate = (value: DiagramAnchorRef | number, axis: 'x' | 'y'): number | null =>
    typeof value === 'number' ? value : (anchor(value)?.[axis] ?? null);

  function point(id: string): DiagramPoint | null {
    const mark = points.get(id);
    if (!mark) return null;
    const ref = mark.anchor;
    if (!ref) return mark.at;
    return guarded(`p:${id}`, () => anchor(ref) ?? mark.at, () => mark.at);
  }

  function curve(id: string): DiagramCurve | null {
    const found = curves.get(id);
    if (!found) return null;
    const derive = found.derive;
    if (!derive) return found;
    return guarded(
      `c:${id}`,
      () => {
        const derived = derivePoints(derive);
        return derived ? { ...found, points: derived } : found;
      },
      () => found,
    );
  }

  function anchor(ref: DiagramAnchorRef): DiagramPoint | null {
    if ('point' in ref) return point(ref.point);
    if ('cross' in ref) {
      const a = curve(ref.cross[0]);
      const b = curve(ref.cross[1]);
      return a && b ? curveCrossing(a, b) : null;
    }
    if ('on' in ref) {
      const on = curve(ref.on);
      if (!on) return null;
      if ('x' in ref) {
        const base = anchor(ref.x);
        const y = base ? curveYAt(on, base.x) : null;
        return base && y !== null ? { x: base.x, y } : null;
      }
      const level = coordinate(ref.y, 'y');
      const x = level === null ? null : curveXAt(on, level);
      return level !== null && x !== null ? { x, y: level } : null;
    }
    const x = coordinate(ref.x, 'x');
    const y = coordinate(ref.y, 'y');
    return x === null || y === null ? null : { x, y };
  }

  const place = (value: DiagramPlace): DiagramPoint | null => (isFixedPlace(value) ? value : anchor(value));

  function derivePoints(derive: DiagramCurveDerive): DiagramPoint[] | null {
    switch (derive.kind) {
      case 'marginalRevenue': {
        const source = curve(derive.of);
        if (!source || source.points.length < 2) return null;
        const a = source.points[0];
        const z = source.points[source.points.length - 1];
        const dx = z.x - a.x;
        if (Math.abs(dx) < 1e-6) return null;
        const slope = (z.y - a.y) / dx;
        const intercept = a.y - slope * a.x;
        return clipToPlot({ x: 0, y: intercept }, { x: 1, y: intercept + 2 * slope });
      }
      case 'parallel': {
        const source = curve(derive.to);
        const through = place(derive.through);
        if (!source || !through || source.points.length < 2) return null;
        const a = source.points[0];
        const z = source.points[source.points.length - 1];
        return lineAcrossPlot(through, { x: z.x - a.x, y: z.y - a.y });
      }
      case 'tangent': {
        const source = curve(derive.to);
        const near = place(derive.at);
        const touch = source && near ? tangentOn(source, near, aspect) : null;
        if (!touch) return null;
        // Left to right (or upward), so the label at its end sits on the right.
        const flip = touch.dir.x < 0 || (Math.abs(touch.dir.x) < EPS && touch.dir.y < 0) ? -1 : 1;
        return lineAcrossPlot(touch.at, { x: touch.dir.x * flip, y: touch.dir.y * flip });
      }
      case 'level': {
        const y = coordinate(derive.y, 'y');
        if (y === null) return null;
        const level = clampUnit(y);
        return [
          { x: clampUnit(derive.from ?? 0), y: level },
          { x: clampUnit(derive.to ?? 1), y: level },
        ];
      }
      case 'vertical': {
        const x = coordinate(derive.x, 'x');
        if (x === null) return null;
        const at = clampUnit(x);
        return [
          { x: at, y: clampUnit(derive.from ?? 0) },
          { x: at, y: clampUnit(derive.to ?? 1) },
        ];
      }
    }
  }

  return { anchor, place, point, curve };
}

/** Where an anchor sits now, following anchored points and derived curves; null if unresolvable. */
export function resolveAnchor(
  diagram: Diagram,
  ref: DiagramAnchorRef,
  aspect: number = DIAGRAM_PLOT_ASPECT,
): DiagramPoint | null {
  return createResolver(diagram, aspect).anchor(ref);
}

/** A place's position now: a fixed point as itself, an anchor resolved. */
export function resolvePlace(
  diagram: Diagram,
  place: DiagramPlace,
  aspect: number = DIAGRAM_PLOT_ASPECT,
): DiagramPoint | null {
  return createResolver(diagram, aspect).place(place);
}

const samePoints = (a: DiagramPoint[], b: DiagramPoint[]) =>
  a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);

/**
 * The diagram with every anchored point's `at` and every derived curve's `points` at
 * their current value. Returns the same object when nothing moves, so a diagram with no
 * relations — every older document — renders byte-identically. `aspect` is the plot's
 * height ÷ width (only a tangent to a spline depends on it).
 */
export function resolveDiagram(diagram: Diagram, aspect: number = DIAGRAM_PLOT_ASPECT): Diagram {
  if (!diagram.points.some((p) => p.anchor) && !diagram.curves.some((c) => c.derive)) return diagram;
  const resolver = createResolver(diagram, aspect);
  let changed = false;
  const curves = diagram.curves.map((curve) => {
    if (!curve.derive) return curve;
    const points = resolver.curve(curve.id)?.points ?? curve.points;
    if (samePoints(points, curve.points)) return curve;
    changed = true;
    return { ...curve, points: points.map((p) => ({ x: p.x, y: p.y })) };
  });
  const points = diagram.points.map((mark) => {
    if (!mark.anchor) return mark;
    const at = resolver.point(mark.id) ?? mark.at;
    if (at.x === mark.at.x && at.y === mark.at.y) return mark;
    changed = true;
    return { ...mark, at: { x: at.x, y: at.y } };
  });
  return changed ? { ...diagram, curves, points } : diagram;
}

/** Every curve and point id an anchor names. */
export function anchorReferences(ref: DiagramAnchorRef): string[] {
  if ('point' in ref) return [ref.point];
  if ('cross' in ref) return [...ref.cross];
  const nested = (value: DiagramAnchorRef | number) => (typeof value === 'number' ? [] : anchorReferences(value));
  if ('on' in ref) return [ref.on, ...('x' in ref ? anchorReferences(ref.x) : nested(ref.y))];
  return [...nested(ref.x), ...nested(ref.y)];
}

export const placeReferences = (place: DiagramPlace): string[] =>
  isFixedPlace(place) ? [] : anchorReferences(place);

/** Every curve and point id a derived curve reads. */
export function deriveReferences(derive: DiagramCurveDerive): string[] {
  switch (derive.kind) {
    case 'marginalRevenue':
      return [derive.of];
    case 'parallel':
      return [derive.to, ...placeReferences(derive.through)];
    case 'tangent':
      return [derive.to, ...placeReferences(derive.at)];
    case 'level':
      return typeof derive.y === 'number' ? [] : anchorReferences(derive.y);
    case 'vertical':
      return typeof derive.x === 'number' ? [] : anchorReferences(derive.x);
  }
}

export const spanReferences = (span: DiagramSpan): string[] => [
  ...placeReferences(span.from),
  ...placeReferences(span.to),
];

/** An anchor with every id passed through `renamed` (unmapped ids kept). */
export function renameAnchor(ref: DiagramAnchorRef, renamed: Map<string, string>): DiagramAnchorRef {
  const id = (value: string) => renamed.get(value) ?? value;
  const nested = <T extends DiagramAnchorRef | number>(value: T): T =>
    (typeof value === 'number' ? value : renameAnchor(value, renamed)) as T;
  if ('point' in ref) return { point: id(ref.point) };
  if ('cross' in ref) return { cross: [id(ref.cross[0]), id(ref.cross[1])] };
  if ('on' in ref) return 'x' in ref ? { on: id(ref.on), x: renameAnchor(ref.x, renamed) } : { on: id(ref.on), y: nested(ref.y) };
  return { x: nested(ref.x), y: nested(ref.y) };
}

export const renamePlace = (place: DiagramPlace, renamed: Map<string, string>): DiagramPlace =>
  isFixedPlace(place) ? { x: place.x, y: place.y } : renameAnchor(place, renamed);

export function renameDerive(derive: DiagramCurveDerive, renamed: Map<string, string>): DiagramCurveDerive {
  const id = (value: string) => renamed.get(value) ?? value;
  switch (derive.kind) {
    case 'marginalRevenue':
      return { ...derive, of: id(derive.of) };
    case 'parallel':
      return { ...derive, to: id(derive.to), through: renamePlace(derive.through, renamed) };
    case 'tangent':
      return { ...derive, to: id(derive.to), at: renamePlace(derive.at, renamed) };
    case 'level':
      return typeof derive.y === 'number' ? { ...derive } : { ...derive, y: renameAnchor(derive.y, renamed) };
    case 'vertical':
      return typeof derive.x === 'number' ? { ...derive } : { ...derive, x: renameAnchor(derive.x, renamed) };
  }
}

/**
 * After an edit that removed geometry, cut every relation that named it: points and
 * derived curves keep the position they had in `before`, a span end becomes that
 * fixed point (a span that could not be drawn then is dropped).
 */
export function detachRelations(before: Diagram, after: Diagram): Diagram {
  const alive = new Set([...after.curves.map((c) => c.id), ...after.points.map((p) => p.id)]);
  const broken = (ids: string[]) => ids.some((id) => !alive.has(id));
  const resolved = resolveDiagram(before);
  let changed = false;

  const points = after.points.map((mark) => {
    if (!mark.anchor || !broken(anchorReferences(mark.anchor))) return mark;
    changed = true;
    const rest = { ...mark };
    delete rest.anchor;
    const at = resolved.points.find((p) => p.id === mark.id)?.at ?? mark.at;
    return { ...rest, at: { x: at.x, y: at.y } };
  });
  const curves = after.curves.map((curve) => {
    if (!curve.derive || !broken(deriveReferences(curve.derive))) return curve;
    changed = true;
    const rest = { ...curve };
    delete rest.derive;
    const pts = resolved.curves.find((c) => c.id === curve.id)?.points ?? curve.points;
    return { ...rest, points: pts.map((p) => ({ x: p.x, y: p.y })) };
  });
  let spans = after.spans;
  if (after.spans?.some((span) => broken(spanReferences(span)))) {
    changed = true;
    spans = after.spans.flatMap((span) => {
      if (!broken(spanReferences(span))) return [span];
      const fix = (place: DiagramPlace) =>
        broken(placeReferences(place)) ? resolvePlace(resolved, place) : place;
      const from = fix(span.from);
      const to = fix(span.to);
      return from && to ? [{ ...span, from, to }] : [];
    });
  }
  if (!changed) return after;
  const next: Diagram = { ...after, points, curves };
  if (spans) next.spans = spans;
  return next;
}
