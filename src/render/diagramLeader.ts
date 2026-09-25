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

/**
 * Where a label that does not fit goes by default: the centre of a `w`×`h` box.
 *
 * Walks out from `from` along eight directions. A spot counts once the box, grown by
 * `gap`, clears the region and the box stays inside `plot`; along each direction the
 * walk continues to the first spot touching none of `lines` (curves, drop-lines) or
 * `regions` (other areas, text, dots). Fewest touches wins, then the shortest walk,
 * then the order above. Deterministic, so preview, `.docx` PNG and canvas agree.
 */
export function placeOutside(
  poly: Pt[],
  from: Pt,
  w: number,
  h: number,
  options: { gap: number; step: number; reach: number; plot: Box; lines: Pt[][]; regions: Pt[][] },
): Pt {
  const { gap, step, reach, plot, lines, regions } = options;
  let best: { at: Pt; score: number } | null = null;
  for (const dir of DIRECTIONS) {
    for (let r = step; r <= reach; r += step) {
      const at = { x: from.x + dir.x * r, y: from.y + dir.y * r };
      if (boxMeets(boxAround(at, w, h, gap), poly)) continue;
      const box = boxAround(at, w, h);
      if (box.x0 < plot.x0 || box.x1 > plot.x1 || box.y0 < plot.y0 || box.y1 > plot.y1) break;
      const hits =
        lines.filter((line) => boxMeetsLine(box, line)).length +
        regions.filter((region) => boxMeets(box, region)).length;
      const score = hits * 1e6 + r;
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
 * The leader from a label box to its region: `from` on the box's edge (plus `gap`),
 * `tip` just inside the region — `reach` past where the line enters it, never past
 * `target`. Null when the box already covers the target (nothing to point across).
 */
export function leaderLine(box: Box, target: Pt, poly: Pt[], gap: number, reach: number): { from: Pt; tip: Pt } | null {
  if (target.x >= box.x0 && target.x <= box.x1 && target.y >= box.y0 && target.y <= box.y1) return null;
  const centre = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  const dx = target.x - centre.x;
  const dy = target.y - centre.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  // Distance from the centre to the box's edge along the ray (slab method).
  const hw = (box.x1 - box.x0) / 2;
  const hh = (box.y1 - box.y0) / 2;
  const toEdge = Math.min(ux ? hw / Math.abs(ux) : Infinity, uy ? hh / Math.abs(uy) : Infinity) + gap;
  if (toEdge >= length) return null;
  const from = { x: centre.x + ux * toEdge, y: centre.y + uy * toEdge };

  // Where the line first enters the region, walking from the label.
  let enter = 1;
  for (const [a, b] of edgesOf(poly)) {
    const t = crossT(from, target, a, b);
    if (t !== null && t < enter) enter = t;
  }
  const span = Math.hypot(target.x - from.x, target.y - from.y);
  const along = Math.min(span, enter * span + reach);
  return { from, tip: { x: from.x + ux * along, y: from.y + uy * along } };
}
