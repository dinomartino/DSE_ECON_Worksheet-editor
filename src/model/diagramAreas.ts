import type {
  Diagram,
  DiagramAnchorRef,
  DiagramArea,
  DiagramAreaEdge,
  DiagramAreaPattern,
  DiagramAreaRevenue,
  DiagramAreaX,
  DiagramCurve,
  DiagramPoint,
} from './diagram';
import type { BiText } from './types';
import { anchorReferences, curveCrossing, curveYAt, resolveAnchor } from './diagramAnchors';

// Anchor resolution lives in `diagramAnchors`; re-exported for existing importers.
export { curveCrossing, curveYAt, resolveAnchor };

/**
 * Shaded areas: from stored references to a unit-space polygon (§ Shaded areas).
 *
 * Pure and renderer-free: `render/diagram.ts` projects the polygon, the canvas
 * hit-tests it. A reference that no longer resolves (its curve deleted) yields no
 * polygon — `detachAreas` freezes such areas into vertices before that can happen.
 * Curves are read as their polyline; a `curved` curve's spline is approximated.
 */

const EPS = 1e-9;

/** The x-range a curve covers, ignoring vertical segments (they have no y at an x). */
function curveSpan(curve: DiagramCurve): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < curve.points.length - 1; i += 1) {
    const a = curve.points[i];
    const b = curve.points[i + 1];
    if (Math.abs(b.x - a.x) < EPS) continue;
    lo = Math.min(lo, a.x, b.x);
    hi = Math.max(hi, a.x, b.x);
  }
  return lo <= hi ? [lo, hi] : null;
}

const curveById = (diagram: Diagram, id: string) => diagram.curves.find((c) => c.id === id);

export function resolveAreaX(diagram: Diagram, x: DiagramAreaX): number | null {
  return typeof x === 'number' ? x : (resolveAnchor(diagram, x)?.x ?? null);
}

/** An edge's height at `x`: a curve's own, or a level's constant. */
function edgeYAt(diagram: Diagram, edge: DiagramAreaEdge, x: number): number | null {
  if ('curve' in edge) {
    const curve = curveById(diagram, edge.curve);
    return curve ? curveYAt(curve, x) : null;
  }
  return typeof edge.level === 'number'
    ? edge.level
    : (resolveAnchor(diagram, edge.level)?.y ?? null);
}

/**
 * `outer` less `inner`, each the P×Q rectangle from the origin to its point: null when
 * `inner` covers it, one rectangle when only price or only quantity is larger, else an L.
 */
export function rectangleDifference(outer: DiagramPoint, inner: DiagramPoint): DiagramPoint[] | null {
  const wider = outer.x - inner.x > 1e-6;
  const taller = outer.y - inner.y > 1e-6;
  if (outer.x < 1e-6 || outer.y < 1e-6 || (!wider && !taller)) return null;
  const { x: qo, y: po } = outer;
  const { x: qi, y: pi } = inner;
  if (wider && taller) {
    return [
      { x: 0, y: pi },
      { x: qi, y: pi },
      { x: qi, y: 0 },
      { x: qo, y: 0 },
      { x: qo, y: po },
      { x: 0, y: po },
    ];
  }
  if (wider) {
    return [
      { x: qi, y: 0 },
      { x: qo, y: 0 },
      { x: qo, y: po },
      { x: qi, y: po },
    ];
  }
  return [
    { x: 0, y: pi },
    { x: qo, y: pi },
    { x: qo, y: po },
    { x: 0, y: po },
  ];
}

/** A revenue change's region now: gain = new rectangle less old, loss = old less new. */
function revenuePolygon(diagram: Diagram, revenue: DiagramAreaRevenue): DiagramPoint[] | null {
  const before = resolveAnchor(diagram, revenue.from);
  const after = resolveAnchor(diagram, revenue.to);
  if (!before || !after) return null;
  return revenue.change === 'gain' ? rectangleDifference(after, before) : rectangleDifference(before, after);
}

/** Whether an area is derived from references (and so is never dragged by its corners). */
export function isAnchoredArea(area: DiagramArea): boolean {
  return Boolean(area.revenue || area.band);
}

/**
 * The polygon an area covers now, in unit space, or null when it cannot be drawn.
 *
 * A band walks edge 0 left to right and edge 1 back, sampled at `from`, `to` and every
 * curve vertex between — exact for polylines. The range is clipped to where both edges
 * exist, so a curve that stops short of the y-axis bounds the area where it stops.
 */
export function areaPolygon(diagram: Diagram, area: DiagramArea): DiagramPoint[] | null {
  if (area.revenue) return revenuePolygon(diagram, area.revenue);
  if (area.band?.cap) return cappedBandPolygon(diagram, area.band, area.band.cap);
  if (!area.band) return area.vertices && area.vertices.length >= 3 ? area.vertices : null;

  const { edges, from, to } = area.band;
  const x0 = resolveAreaX(diagram, from);
  const x1 = resolveAreaX(diagram, to);
  if (x0 === null || x1 === null) return null;
  let lo = Math.max(0, Math.min(x0, x1));
  let hi = Math.min(1, Math.max(x0, x1));

  const breaks: number[] = [];
  for (const edge of edges) {
    if (!('curve' in edge)) continue;
    const curve = curveById(diagram, edge.curve);
    const span = curve ? curveSpan(curve) : null;
    if (!curve || !span) return null;
    lo = Math.max(lo, span[0]);
    hi = Math.min(hi, span[1]);
    breaks.push(...curve.points.map((p) => p.x));
  }
  if (hi - lo < 1e-6) return null;

  const xs = [lo, ...breaks.filter((x) => x > lo + EPS && x < hi - EPS), hi].sort((a, b) => a - b);
  const unique = xs.filter((x, i) => i === 0 || x - xs[i - 1] > EPS);

  const walk = (edge: DiagramAreaEdge) => {
    const out: DiagramPoint[] = [];
    for (const x of unique) {
      const y = edgeYAt(diagram, edge, x);
      if (y === null) return null;
      out.push({ x, y });
    }
    return out;
  };
  const first = walk(edges[0]);
  const second = walk(edges[1]);
  if (!first || !second) return null;

  const polygon = [...first, ...second.reverse()];
  // Where the two edges meet (a triangle's apex) the walk visits the point twice.
  return polygon.filter((p, i) => {
    const prev = polygon[(i + polygon.length - 1) % polygon.length];
    return Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-7;
  });
}

/** The area-weighted centre of a polygon; the vertex mean when it is degenerate. */
export function polygonCentroid(points: DiagramPoint[]): DiagramPoint {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    const n = points.length || 1;
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / n,
      y: points.reduce((sum, p) => sum + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
}

/** Even-odd point-in-polygon, for hit-testing an area's body. */
export function insidePolygon(p: DiagramPoint, polygon: DiagramPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Every curve and point id an area's references name. */
export function areaReferences(area: DiagramArea): string[] {
  const ids: string[] = [];
  const anchor = (ref: DiagramAnchorRef) => ids.push(...anchorReferences(ref));
  if (area.revenue) {
    anchor(area.revenue.from);
    anchor(area.revenue.to);
    return ids;
  }
  if (!area.band) return ids;
  for (const edge of area.band.cap ? [...area.band.edges, area.band.cap] : area.band.edges) {
    if ('curve' in edge) ids.push(edge.curve);
    else if (typeof edge.level !== 'number') anchor(edge.level);
  }
  for (const x of [area.band.from, area.band.to]) if (typeof x !== 'number') anchor(x);
  return ids;
}

/** An area as a free polygon, frozen at the shape it has in `diagram`. Null if undrawable. */
export function freezeArea(diagram: Diagram, area: DiagramArea): DiagramArea | null {
  const polygon = areaPolygon(diagram, area);
  if (!polygon) return null;
  const frozen: DiagramArea = { ...area, vertices: polygon.map((p) => ({ x: p.x, y: p.y })) };
  delete frozen.band;
  delete frozen.revenue;
  return frozen;
}

/**
 * After an edit that removed geometry, freeze every area whose references it broke.
 *
 * `before` is the diagram the areas were drawn against: the frozen polygon is the one
 * the teacher last saw, so deleting a curve never deletes — or silently hides — the
 * shading that leaned on it. An area that could not be drawn even then is dropped.
 */
export function detachAreas(before: Diagram, after: Diagram): Diagram {
  if (!after.areas || after.areas.length === 0) return after;
  const alive = new Set([...after.curves.map((c) => c.id), ...after.points.map((p) => p.id)]);
  let changed = false;
  const areas: DiagramArea[] = [];
  for (const area of after.areas) {
    if (areaReferences(area).every((id) => alive.has(id))) {
      areas.push(area);
      continue;
    }
    changed = true;
    const frozen = freezeArea(before, area);
    if (frozen) areas.push(frozen);
  }
  return changed ? { ...after, areas } : after;
}

/*
 * ── Presets: the standard welfare areas ─────────────────────────────────────────
 */

export type AreaPreset = 'consumerSurplus' | 'producerSurplus' | 'deadweightLoss' | 'taxRevenue';

/** Which curve plays which part. `taxed` is the supply curve after a per-unit tax. */
export interface MarketCurves {
  demand?: string;
  supply?: string;
  taxed?: string;
}

const same = (text: string): BiText => ({ en: [{ text }], zh: [{ text }] });

export const AREA_PRESETS: Array<{ id: AreaPreset; name: string; needsTax: boolean; label: BiText }> = [
  { id: 'consumerSurplus', name: 'Consumer surplus', needsTax: false, label: same('CS') },
  { id: 'producerSurplus', name: 'Producer surplus', needsTax: false, label: same('PS') },
  { id: 'deadweightLoss', name: 'Deadweight loss', needsTax: true, label: same('DWL') },
  {
    id: 'taxRevenue',
    name: 'Tax revenue',
    needsTax: true,
    // Short: the wedge is often thin, and a teacher usually re-letters it anyway.
    label: { en: [{ text: 'Tax' }], zh: [{ text: '稅收' }] },
  },
];

/**
 * The hatch each preset starts with, so the four read apart on a monochrome photocopy.
 * Applied only when a preset is created (`newPresetArea`); stored areas keep their fill.
 */
export const PRESET_PATTERNS: Record<AreaPreset, DiagramAreaPattern> = {
  consumerSurplus: 'diagonal',
  producerSurplus: 'reverse',
  deadweightLoss: 'cross',
  taxRevenue: 'dots',
};

/** A preset as the Shade menu adds it: `presetArea` hatched in its own pattern. */
export function newPresetArea(preset: AreaPreset, curves: MarketCurves, id: string): DiagramArea | null {
  const area = presetArea(preset, curves, id);
  return area && { ...area, fill: 'hatch', pattern: PRESET_PATTERNS[preset] };
}

/** Rising (+1), falling (−1) or neither (0: vertical, flat or a single point). */
export function curveSlopeSign(curve: DiagramCurve): -1 | 0 | 1 {
  if (curve.points.length < 2) return 0;
  const sorted = [...curve.points].sort((a, b) => a.x - b.x);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (dx < 1e-6 || Math.abs(dy) < 1e-6) return 0;
  return dy > 0 ? 1 : -1;
}

/**
 * A best guess at demand, supply and a taxed supply, by slope: the first falling curve
 * is demand; of the rising curves that cross it, the lowest crossing is supply and the
 * next is the taxed one (a tax raises the price buyers pay). The panel lets the
 * teacher re-pick every bound, so a wrong guess costs a click, not a redraw.
 */
export function guessMarketCurves(diagram: Diagram): MarketCurves {
  const demand = diagram.curves.find((c) => curveSlopeSign(c) < 0);
  const rising = diagram.curves.filter((c) => curveSlopeSign(c) > 0);
  if (!demand) return { supply: rising[0]?.id };
  const crossing = rising
    .map((curve) => ({ curve, at: curveCrossing(demand, curve) }))
    .filter((entry): entry is { curve: DiagramCurve; at: DiagramPoint } => entry.at !== null)
    .sort((a, b) => a.at.y - b.at.y);
  return {
    demand: demand.id,
    supply: crossing[0]?.curve.id ?? rising[0]?.id,
    taxed: crossing[1]?.curve.id,
  };
}

/**
 * A preset area as references, or null when the curves it needs are missing.
 *
 * With a `taxed` curve, CS sits above the price buyers pay and PS below the price
 * sellers keep (`{ on: supply }` under the taxed quantity); DWL is the triangle between
 * demand and supply from the taxed quantity to the free-market one, and tax revenue the
 * rectangle between the two prices. The same bands describe a subsidy.
 */
export function presetArea(preset: AreaPreset, curves: MarketCurves, id: string): DiagramArea | null {
  const { demand, supply, taxed } = curves;
  if (!demand || !supply) return null;
  const label = AREA_PRESETS.find((entry) => entry.id === preset)!.label;
  const market: DiagramAnchorRef = { cross: [demand, taxed ?? supply] };
  const sellers: DiagramAnchorRef = taxed ? { on: supply, x: market } : market;

  switch (preset) {
    case 'consumerSurplus':
      return {
        id,
        band: { edges: [{ curve: demand }, { level: market }], from: 0, to: market },
        label,
      };
    case 'producerSurplus':
      return {
        id,
        band: { edges: [{ level: sellers }, { curve: supply }], from: 0, to: market },
        label,
      };
    case 'deadweightLoss':
      if (!taxed) return null;
      return {
        id,
        band: {
          edges: [{ curve: demand }, { curve: supply }],
          from: market,
          to: { cross: [demand, supply] },
        },
        label,
      };
    case 'taxRevenue':
      if (!taxed) return null;
      return {
        id,
        band: { edges: [{ level: market }, { level: sellers }], from: 0, to: market },
        label,
        fill: 'hatch',
      };
  }
}

/*
 * ── Revenue presets: P × Q rectangles ───────────────────────────────────────────
 */

export type RevenuePreset = 'totalRevenue' | 'revenueGain' | 'revenueLoss';

/** Two equilibria, before and after — the points a revenue preset is measured at. */
export interface RevenuePoints {
  before?: DiagramAnchorRef;
  after?: DiagramAnchorRef;
}

export const REVENUE_PRESETS: Array<{ id: RevenuePreset; name: string; label: BiText }> = [
  { id: 'totalRevenue', name: 'Total revenue', label: { en: [{ text: 'TR' }], zh: [{ text: '總收益' }] } },
  { id: 'revenueGain', name: 'Revenue gain', label: { en: [{ text: 'Gain' }], zh: [{ text: '收益增加' }] } },
  { id: 'revenueLoss', name: 'Revenue loss', label: { en: [{ text: 'Loss' }], zh: [{ text: '收益減少' }] } },
];

const plainText = (label: BiText | undefined) => (label?.en ?? []).map((run) => run.text).join('');

/**
 * A best guess at E₀ and E₁: the first and last marked point, preferring points named
 * "E…". The inspector re-picks either, so a wrong guess costs a click.
 */
export function guessRevenuePoints(diagram: Diagram): RevenuePoints {
  const named = diagram.points.filter((p) => /^E/.test(plainText(p.label)));
  const pool = named.length >= 2 ? named : diagram.points;
  const first = pool[0];
  const last = pool.length >= 2 ? pool[pool.length - 1] : undefined;
  return { before: first && { point: first.id }, after: last && { point: last.id } };
}

/**
 * A revenue preset as references, or null when it lacks its points. Total revenue is
 * the band under E₀'s price out to E₀'s quantity, shaded; a gain or loss is the
 * derived difference of two rectangles, hatched in dots or cross so it reads in
 * monochrome over the TR shading.
 */
export function revenueArea(preset: RevenuePreset, points: RevenuePoints, id: string): DiagramArea | null {
  const label = REVENUE_PRESETS.find((entry) => entry.id === preset)!.label;
  const { before, after } = points;
  if (preset === 'totalRevenue') {
    if (!before) return null;
    return { id, band: { edges: [{ level: 0 }, { level: before }], from: 0, to: before }, label };
  }
  if (!before || !after) return null;
  const gain = preset === 'revenueGain';
  return {
    id,
    revenue: { change: gain ? 'gain' : 'loss', from: before, to: after },
    label,
    fill: 'hatch',
    pattern: gain ? 'dots' : 'cross',
  };
}

/*
 * ── Capped bands: a trapezium as one area ───────────────────────────────────────
 */

type AreaBand = NonNullable<DiagramArea['band']>;

/**
 * A band whose edge 0 is clamped between edge 1 and `cap` at every x. Sampled at the
 * band's and the cap's vertices plus every x where the cap crosses an edge, so it is
 * exact for polylines. Where the cap curve does not reach, edge 0 is left as it is.
 */
function cappedBandPolygon(diagram: Diagram, band: AreaBand, cap: DiagramAreaEdge): DiagramPoint[] | null {
  const x0 = resolveAreaX(diagram, band.from);
  const x1 = resolveAreaX(diagram, band.to);
  if (x0 === null || x1 === null) return null;
  let lo = Math.max(0, Math.min(x0, x1));
  let hi = Math.min(1, Math.max(x0, x1));

  const breaks: number[] = [];
  for (const edge of band.edges) {
    if (!('curve' in edge)) continue;
    const curve = curveById(diagram, edge.curve);
    const span = curve ? curveSpan(curve) : null;
    if (!curve || !span) return null;
    lo = Math.max(lo, span[0]);
    hi = Math.min(hi, span[1]);
    breaks.push(...curve.points.map((p) => p.x));
  }
  if ('curve' in cap) {
    const curve = curveById(diagram, cap.curve);
    if (!curve) return null;
    breaks.push(...curve.points.map((p) => p.x));
  } else if (edgeYAt(diagram, cap, lo) === null) return null;
  if (hi - lo < 1e-6) return null;

  const sorted = (xs: number[]) =>
    xs.sort((a, b) => a - b).filter((x, i, all) => i === 0 || x - all[i - 1] > EPS);
  let xs = sorted([lo, ...breaks.filter((x) => x > lo + EPS && x < hi - EPS), hi]);
  // Between two samples every edge is straight, so a sign change brackets one crossing.
  const crossings: number[] = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    const [a, b] = [xs[i], xs[i + 1]];
    for (const edge of band.edges) {
      const gap = (x: number) => {
        const c = edgeYAt(diagram, cap, x);
        const e = edgeYAt(diagram, edge, x);
        return c === null || e === null ? null : c - e;
      };
      const ga = gap(a);
      const gb = gap(b);
      if (ga !== null && gb !== null && ga * gb < 0) crossings.push(a + ((b - a) * ga) / (ga - gb));
    }
  }
  xs = sorted([...xs, ...crossings]);

  const first: DiagramPoint[] = [];
  const second: DiagramPoint[] = [];
  for (const x of xs) {
    const y0 = edgeYAt(diagram, band.edges[0], x);
    const y1 = edgeYAt(diagram, band.edges[1], x);
    if (y0 === null || y1 === null) return null;
    const c = edgeYAt(diagram, cap, x);
    const y = c === null ? y0 : [y0, c, y1].sort((a, b) => a - b)[1];
    first.push({ x, y });
    second.push({ x, y: y1 });
  }
  // Columns the cap has closed to nothing at either end are not part of the region.
  const open = (i: number) => Math.abs(first[i].y - second[i].y) > 1e-7;
  let start = 0;
  while (start < xs.length - 1 && !open(start) && !open(start + 1)) start += 1;
  let end = xs.length - 1;
  while (end > start && !open(end) && !open(end - 1)) end -= 1;
  const top = first.slice(start, end + 1);
  const bottom = second.slice(start, end + 1).reverse();
  const polygon = [...top, ...bottom];
  const clean = polygon.filter((p, i) => {
    const prev = polygon[(i + polygon.length - 1) % polygon.length];
    return Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-7;
  });
  return clean.length >= 3 ? clean : null;
}
