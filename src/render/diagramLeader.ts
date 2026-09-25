/**
 * Leader labels for shaded areas: pure pixel geometry (§ Shaded areas).
 *
 * `render/diagram.ts` measures the label and projects the polygon; this module only
 * answers "does the box fit", "where outside does it go" and "where does the leader
 * run". No text, no SVG, no model imports — so it is testable with plain numbers.
 */

export interface Pt {
  x: number;
  y: number;
}

/** An axis-aligned box in SVG pixels (y grows downward). */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A `w`×`h` box centred on `at`, grown by `pad` on every side. */
export function boxAround(at: Pt, w: number, h: number, pad = 0): Box {
  return { x0: at.x - w / 2 - pad, y0: at.y - h / 2 - pad, x1: at.x + w / 2 + pad, y1: at.y + h / 2 + pad };
}

const corners = (b: Box): Pt[] => [
  { x: b.x0, y: b.y0 },
  { x: b.x1, y: b.y0 },
  { x: b.x1, y: b.y1 },
  { x: b.x0, y: b.y1 },
];

/** Even-odd point-in-polygon. */
export function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Where segment p→q meets segment r→s, as the parameter t along p→q; null if it does not. */
function crossT(p: Pt, q: Pt, r: Pt, s: Pt): number | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const ex = s.x - r.x;
  const ey = s.y - r.y;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((r.x - p.x) * ey - (r.y - p.y) * ex) / den;
  const u = ((r.x - p.x) * dy - (r.y - p.y) * dx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

const edgesOf = (poly: Pt[]) => poly.map((a, i) => [a, poly[(i + 1) % poly.length]] as const);

function boxEdgesCross(box: Box, poly: Pt[]): boolean {
  const sides = edgesOf(corners(box));
  return edgesOf(poly).some(([a, b]) => sides.some(([c, d]) => crossT(a, b, c, d) !== null));
}

const inBox = (p: Pt, b: Box) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1;

/** The whole box lies inside the polygon: every corner in, no edge crossing a side. */
export function boxInside(box: Box, poly: Pt[]): boolean {
  return corners(box).every((c) => inside(c, poly)) && !boxEdgesCross(box, poly);
}

/** The box and the polygon share any area at all. */
export function boxMeets(box: Box, poly: Pt[]): boolean {
  return (
    corners(box).some((c) => inside(c, poly)) ||
    poly.some((p) => inBox(p, box)) ||
    boxEdgesCross(box, poly)
  );
}

/** A polyline (curve, drop-line) passes through the box. */
export function boxMeetsLine(box: Box, line: Pt[]): boolean {
  if (line.some((p) => inBox(p, box))) return true;
  const sides = edgesOf(corners(box));
  for (let i = 0; i + 1 < line.length; i += 1) {
    if (sides.some(([c, d]) => crossT(line[i], line[i + 1], c, d) !== null)) return true;
  }
  return false;
}

/**
 * A point inside the polygon to aim at: `preferred` (the centroid) when it is inside,
 * else the middle of the widest inside run of the horizontal line through it — a
 * concave band's centroid can fall outside its own region.
 */
export function interiorPoint(poly: Pt[], preferred: Pt): Pt {
  if (inside(preferred, poly)) return preferred;
  const xs: number[] = [];
  for (const [a, b] of edgesOf(poly)) {
    if (a.y > preferred.y !== b.y > preferred.y) {
      xs.push(a.x + ((preferred.y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
  }
  xs.sort((p, q) => p - q);
  let best: Pt = preferred;
  let widest = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] - xs[i] > widest) {
      widest = xs[i + 1] - xs[i];
      best = { x: (xs[i] + xs[i + 1]) / 2, y: preferred.y };
    }
  }
  return best;
}

/** Distance from `p` to the segment a→b. */
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** How far `p` is from the polygon's nearest edge; 0 when it lies outside. */
export function clearance(p: Pt, poly: Pt[]): number {
  if (!inside(p, poly)) return 0;
  let best = Infinity;
  for (const [a, b] of edgesOf(poly)) best = Math.min(best, segmentDistance(p, a, b));
  return best;
}

/**
 * The point to aim a leader at: `near` when it is at least `want` from every edge,
 * else the point that gets deepest (capped at `want`), nearest `near` among equals —
 * an approximate pole of inaccessibility, by a grid sample refined twice.
 */
export function deepestPoint(poly: Pt[], near: Pt, want: number): Pt {
  if (clearance(near, poly) >= want) return near;
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const score = (p: Pt) => Math.min(clearance(p, poly), want) - 0.01 * Math.hypot(p.x - near.x, p.y - near.y);
  let best = near;
  let bestScore = score(near);
  let cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  let cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let hw = (Math.max(...xs) - Math.min(...xs)) / 2;
  let hh = (Math.max(...ys) - Math.min(...ys)) / 2;
  const cells = 24;
  for (let round = 0; round < 3; round += 1) {
    for (let i = 0; i <= cells; i += 1) {
      for (let j = 0; j <= cells; j += 1) {
        const p = { x: cx - hw + (2 * hw * i) / cells, y: cy - hh + (2 * hh * j) / cells };
        const s = score(p);
        if (s > bestScore) {
          best = p;
          bestScore = s;
        }
      }
    }
    // Zoom in on the best cell's neighbourhood.
    cx = best.x;
    cy = best.y;
    hw = (4 * hw) / cells;
    hh = (4 * hh) / cells;
  }
  return best;
}

/** Screen directions tried for a leader label, in order of preference. */
const DIRECTIONS: Pt[] = [
  { x: 1, y: 0 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: -1 },
  { x: -1, y: 0 },
  { x: -1, y: 1 },
].map((d) => {
  const length = Math.hypot(d.x, d.y);
  return { x: d.x / length, y: d.y / length };
});

/** The point of `box`, grown by `gap`, nearest `target` — where a leader leaves the label. */
export function leaderTail(box: Box, target: Pt, gap: number): Pt {
  return {
    x: Math.max(box.x0 - gap, Math.min(box.x1 + gap, target.x)),
    y: Math.max(box.y0 - gap, Math.min(box.y1 + gap, target.y)),
  };
}

/**
 * How many `lines` and `regions` the leader tail→target runs across before it enters
 * `poly`. The entry itself is not counted: the region's own edge is often a curve.
 */
export function leaderCrossings(tail: Pt, target: Pt, poly: Pt[], lines: Pt[][], regions: Pt[][]): number {
  const span = Math.hypot(target.x - tail.x, target.y - tail.y);
  if (span === 0) return 0;
  let enter = 1;
  for (const [a, b] of edgesOf(poly)) {
    const t = crossT(tail, target, a, b);
    if (t !== null && t < enter) enter = t;
  }
  const before = Math.max(0, enter - 0.5 / span);
  const end = { x: tail.x + (target.x - tail.x) * before, y: tail.y + (target.y - tail.y) * before };
  const meets = (line: Pt[], closed: boolean) => {
    const n = closed ? line.length : line.length - 1;
    for (let i = 0; i < n; i += 1) {
      if (crossT(tail, end, line[i], line[(i + 1) % line.length]) !== null) return true;
    }
    return closed && (inside(tail, line) || inside(end, line));
  };
  return lines.filter((line) => meets(line, false)).length + regions.filter((region) => meets(region, true)).length;
}

/**
 * Where a label that does not fit goes by default: the centre of a `w`×`h` box.
 *
 * Walks out from `from` (the leader's target) along eight directions. A spot counts once
 * the box, grown by `gap`, clears the region and the box stays inside `plot`; along each
 * direction the walk continues to the first spot whose box, grown by `air`, touches
 * none of `lines` (curves, drop-lines) or `regions` (other areas, text, dots). Cost:
 * each touch, then each line or region the leader itself crosses on its way in (tail
 * `tailGap` off the box), then the walk's length, then the order above. Deterministic, so preview, `.docx` PNG and canvas agree.
 */
export function placeOutside(
  poly: Pt[],
  from: Pt,
  w: number,
  h: number,
  options: { gap: number; air: number; tailGap: number; step: number; reach: number; plot: Box; lines: Pt[][]; regions: Pt[][] },
): Pt {
  const { gap, air, tailGap, step, reach, plot, lines, regions } = options;
  let best: { at: Pt; score: number } | null = null;
  for (const dir of DIRECTIONS) {
    for (let r = step; r <= reach; r += step) {
      const at = { x: from.x + dir.x * r, y: from.y + dir.y * r };
      if (boxMeets(boxAround(at, w, h, gap), poly)) continue;
      const box = boxAround(at, w, h);
      if (box.x0 < plot.x0 || box.x1 > plot.x1 || box.y0 < plot.y0 || box.y1 > plot.y1) break;
      const clear = boxAround(at, w, h, air);
      const hits =
        lines.filter((line) => boxMeetsLine(clear, line)).length +
        regions.filter((region) => boxMeets(clear, region)).length;
      const crossings = leaderCrossings(leaderTail(box, from, tailGap), from, poly, lines, regions);
      const score = hits * 1e6 + crossings * 1e4 + r;
      if (!best || score < best.score) best = { at, score };
      if (hits === 0) break;
    }
  }
  // Nowhere clears the region inside the plot: sit above it, the least-bad fallback.
  return best?.at ?? { x: from.x, y: from.y - h - gap };
}

/** A box as a four-point polygon, for `placeOutside`'s `regions`. */
export const boxPolygon = (b: Box): Pt[] => corners(b);

/**
 * The leader from a label box to its region. `from` is the box's point nearest
 * `target`, `gap` off its edge; `tip` is the first point on the way to `target` that
 * is `depth` from every edge — or, in a region too small for that, `slack` short of
 * `target`'s own depth. The tip sits at least `minShaft` from `from`, scanned in
 * `step`s. Null when the box (plus gap) covers the target or sits closer than
 * `minShaft` to it: nothing to point across.
 */
export function leaderLine(
  box: Box,
  target: Pt,
  poly: Pt[],
  options: { gap: number; depth: number; slack: number; minShaft: number; step: number },
): { from: Pt; tip: Pt } | null {
  const { gap, depth, slack, minShaft, step } = options;
  const from = leaderTail(box, target, gap);
  const span = Math.hypot(target.x - from.x, target.y - from.y);
  if (span < minShaft) return null;
  const ux = (target.x - from.x) / span;
  const uy = (target.y - from.y) / span;
  const deep = clearance(target, poly);
  const want = deep >= depth ? depth : Math.max(0, deep - slack);
  let along = span;
  for (let s = minShaft; s < span; s += step) {
    const depthHere = clearance({ x: from.x + ux * s, y: from.y + uy * s }, poly);
    if (depthHere > 0 && depthHere >= want) {
      along = s;
      break;
    }
  }
  return { from, tip: { x: from.x + ux * along, y: from.y + uy * along } };
}
