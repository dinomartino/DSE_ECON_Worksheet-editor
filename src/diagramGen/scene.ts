import type { Diagram, DiagramAnchorRef, DiagramArea, DiagramAreaEdge, DiagramAreaPattern, DiagramArrow, DiagramCurve, DiagramPointMark, DiagramSpan } from '@/model/diagram';
import { areaPolygon } from '@/model/diagramAreas';
import { resolveAnchor } from '@/model/diagramAnchors';
import { axes, cross, curve, derived, finish, newId, point, priceLine, shiftArrow, shiftOf, span, type Pair } from '@/model/diagramTemplateKit';
import type { BiText } from '@/model/types';
import { shiftArrowPlace, type Compiled } from './compile';
import { placePointLabels } from './pointLabels';
import { defaultLabel, regionsOf, sceneDef, type SceneDef, type ScenePointDef } from './sceneCatalogue';
import { phrase, plainOf, symbol } from './text';
import type { CurveRole, DiagramIssue, DiagramSpec, Slope, SpecScene, SpecText } from './types';

/**
 * A typed scene → an editable diagram (k-0577). The geometry is code: a tax moves supply up,
 * a ceiling sits below equilibrium, a quota bends supply upright, MSC lies above MPC. Every
 * curve after the first two is a relation (a `shift` copy) and every point and region is
 * anchored to its crossing, so a teacher's drag keeps the economics. The model only chose the
 * type, the slopes, the labels and the letters.
 */

export interface SceneBuilt extends Compiled {
  /** Region id → the area drawn for it (several regions of one measure share a pattern). */
  regionAreas: Map<string, DiagramArea>;
  /** Region id → its letter or words, plain, as printed. */
  regionLabels: Map<string, string>;
  /** Part id → its printed label ('' = not printed). */
  partLabels: Map<string, string>;
  /** Catalogue point id → its letter, for the points the model lettered (k-0577 round 2). */
  pointLabels: Map<string, string>;
  /** Every catalogue point of the scene → where it is (resolved), lettered or not. */
  pointPlaces: Map<string, { x: number; y: number }>;
  /** Every region of the scene → its outline (resolved), drawn or not. */
  regionPolygons: Map<string, Array<{ x: number; y: number }>>;
}

const DEMAND_SLOPE: Record<Slope, number> = { normal: -1, steep: -2.2, flat: -0.42 };
const SUPPLY_SLOPE: Record<Slope, number> = { normal: 1, steep: 2.2, flat: 0.42 };
/** The tax, subsidy, cost rise or external effect, as a vertical distance. */
const SHIFT: Record<SpecScene['size'], number> = { small: 0.2, normal: 0.28, large: 0.36 };
/** A price control's distance from P0. */
const CONTROL: Record<SpecScene['size'], number> = { small: 0.14, normal: 0.2, large: 0.26 };
/** A quota's distance left of Q0. */
const QUOTA: Record<SpecScene['size'], number> = { small: 0.14, normal: 0.18, large: 0.24 };
/** Ticks closer than this read as one. */
const MIN_GAP = 0.06;
const TOP = 0.92;
/** Where the first equilibrium sits, and how much of each size to use: the layout search tries these in turn. */
interface Layout {
  E: Pair;
  k: number;
}
const LAYOUTS: Layout[] = [0.42, 0.5, 0.34].flatMap((x) => [0.46, 0.4, 0.52, 0.34].flatMap((y) => [1, 0.8, 0.62, 0.48].map((k) => ({ E: [x, y] as Pair, k }))));

const NO_NAME: BiText = { en: [], zh: [] };
const PATTERNS: DiagramAreaPattern[] = ['diagonal', 'reverse', 'horizontal', 'vertical', 'cross', 'dots'];

const level = (ref: DiagramAnchorRef | number): DiagramAreaEdge => ({ level: ref });
const on = (c: DiagramCurve): DiagramAreaEdge => ({ curve: c.id });
const at = (p: DiagramPointMark): DiagramAnchorRef => ({ point: p.id });

interface Band {
  edges: [DiagramAreaEdge, DiagramAreaEdge];
  from: number | DiagramAnchorRef;
  to: number | DiagramAnchorRef;
  cap?: DiagramAreaEdge;
}
/** Under `d` and above `lvl`, from the y-axis: capped by d, so a steep demand that starts below the top still closes it. */
const underFromAxis = (d: DiagramCurve, lvl: DiagramAreaEdge, to: DiagramAnchorRef): Band => ({ edges: [level(TOP), lvl], from: 0, to, cap: on(d) });
const band = (edges: [DiagramAreaEdge, DiagramAreaEdge], from: number | DiagramAnchorRef, to: number | DiagramAnchorRef, cap?: DiagramAreaEdge): Band => ({ edges, from, to, ...(cap ? { cap } : {}) });

/** A straight line of slope `m` through E, kept inside the plot (y from `floor` to `top`, x from 0 to 0.9). A falling line stops above the x-axis, so its name clears it. */
function lineAt(E: Pair, m: number, top = TOP, floor = m < 0 ? 0.12 : 0.04, right = 0.9): Pair[] {
  const [ex, ey] = E;
  const yAt = (x: number) => ey + m * (x - ex);
  const xAt = (y: number) => ex + (y - ey) / m;
  const ends: Pair[] = [];
  for (const xEnd of [0, right]) {
    let px = xEnd;
    let py = yAt(px);
    if (py > top) [px, py] = [xAt(top), top];
    if (py < floor) [px, py] = [xAt(floor), floor];
    ends.push([px, py]);
  }
  return ends.sort((a, b) => a[0] - b[0]);
}

/** The vertical distance a shift needs so the ticks it makes stand apart (the steeper side sets it). */
function shiftFor(base: number, d: number, s: number): number {
  const a = Math.abs(d);
  const b = Math.abs(s);
  // Buyers' share t·a/(a+b), sellers' t·b/(a+b), the quantity change t/(a+b): each at least MIN_GAP.
  const need = Math.max((MIN_GAP * (a + b)) / Math.min(a, b), MIN_GAP * (a + b));
  return Math.min(0.4, Math.max(base, need));
}

/** A tick-carrying point at `ref`: dashed drops to the axes whose ticks it prints (or that bound a region). */
function tickPoint(
  ref: DiagramAnchorRef,
  parts: Array<DiagramCurve | DiagramPointMark>,
  ticks: { x?: BiText | null; y?: BiText | null },
): DiagramPointMark {
  const where = resolveIn(scratchOf(parts), ref);
  const drops: Array<'x' | 'y'> = [];
  if (ticks.x !== undefined) drops.push('x');
  if (ticks.y !== undefined) drops.push('y');
  return point(where.x, where.y, undefined, {
    anchor: ref,
    dot: false,
    dropTo: drops,
    ...(ticks.x ? { xTickLabel: ticks.x } : {}),
    ...(ticks.y ? { yTickLabel: ticks.y } : {}),
  });
}

function scratchOf(parts: Array<DiagramCurve | DiagramPointMark>): Diagram {
  return {
    x: {},
    y: {},
    curves: parts.filter((p): p is DiagramCurve => 'points' in p),
    points: parts.filter((p): p is DiagramPointMark => 'at' in p),
    labels: [],
    arrows: [],
  };
}

function resolveIn(d: Diagram, ref: DiagramAnchorRef): { x: number; y: number } {
  const p = resolveAnchor(d, ref);
  if (!p) throw new Error('scene anchor does not resolve');
  return p;
}

interface Draft {
  curves: DiagramCurve[];
  points: DiagramPointMark[];
  arrows: DiagramArrow[];
  /** Shift arrows to place once every point is known (they keep clear of lettered points too). */
  shifts?: Array<{ source: DiagramCurve; copy: DiagramCurve; by: { x: number; y: number } }>;
  spans?: DiagramSpan[];
  x: BiText;
  y: BiText;
  regions: Record<string, Band>;
  curveRoles: Record<string, { curve: DiagramCurve; role: CurveRole }>;
  levels: Record<string, { vertical: boolean; at: number }>;
  /** Tick part → the point whose drop carries it (for lettered points at a tick's quantity or price). */
  marks: Record<string, DiagramPointMark>;
  /** Stand-ins a catalogue point may name: the externality's `other` and `private` curves. */
  alias?: Record<string, string>;
}

const GAP_WORDS = {
  shortage: { en: 'Shortage', zh: '短缺' },
  surplus: { en: 'Surplus', zh: '過剩' },
  unemployment: { en: 'Unemployment', zh: '失業' },
};

const AX = {
  price: { en: 'Price', zh: '價格' },
  quantity: { en: 'Quantity', zh: '數量' },
  wage: { en: 'Wage rate', zh: '工資率' },
  labour: { en: 'Quantity\nof labour', zh: '勞工數量' },
  cost: { en: 'Price / cost', zh: '價格／成本' },
  benefit: { en: 'Price / benefit', zh: '價格／利益' },
};

/** Draws one scene; `name(part)` is the part's printed label (undefined = none), `tick(part)` the same for ticks (null = drop line, no label). */
function draft(scene: SpecScene, name: (part: string) => BiText | undefined, tick: (part: string) => BiText | null | undefined, layout: Layout): Draft {
  const { E, k } = layout;
  const lineThrough = (m: number, top?: number, floor?: number) => lineAt(E, m, top, floor);
  const dm = DEMAND_SLOPE[scene.demand] ?? -1;
  const sm = SUPPLY_SLOPE[scene.supply] ?? 1;
  const labour = scene.market === 'labour';
  const axisX = phraseOf(labour ? AX.labour : AX.quantity);
  const axisY = phraseOf(labour ? AX.wage : AX.price);
  const arrows: DiagramArrow[] = [];
  const room = (top: number) => lineAt(E, sm, top, 0);

  switch (scene.type) {
    case 'surplus': {
      const d = curve(lineThrough(dm), name('D'));
      const s = curve(room(TOP), name('S'));
      const e0 = tickPoint(cross(d, s), [d, s], { x: tick('Q0'), y: tick('P0') });
      return {
        curves: [d, s],
        points: [e0],
        arrows,
        x: axisX,
        y: axisY,
        regions: {
          cs: underFromAxis(d, level(at(e0)), at(e0)),
          ps: band([level(0), level(at(e0))], 0, at(e0), on(s)),
          cost: band([on(s), level(0)], 0, at(e0)),
        },
        curveRoles: { D: { curve: d, role: 'demand' }, S: { curve: s, role: 'supply' } },
        levels: {},
        marks: { P0: e0, Q0: e0 },
      };
    }
    case 'taxChange': {
      // Two taxes: t₁ moves S₀ up to S₁, t₂ = 2t₁ to S₂; each step's quantity change kept readable.
      const t = Math.min(0.2, shiftFor((SHIFT[scene.size] ?? 0.28) * k * 0.7, dm, sm));
      const d = curve(lineThrough(dm), name('D'));
      const s0 = curve(room(TOP - 2 * t), name('S0'));
      const s1 = shiftOf(s0, 0, t, name('S1'));
      const s2 = shiftOf(s1, 0, t, name('S2'));
      const parts: Array<DiagramCurve | DiagramPointMark> = [d, s0, s1, s2];
      const e0 = tickPoint(cross(d, s0), parts, { x: tick('Q0'), y: tick('P0') });
      const e1 = tickPoint(cross(d, s1), parts, { x: tick('Qt1'), y: tick('Pt1') });
      const e2 = tickPoint(cross(d, s2), parts, { x: tick('Qt2'), y: tick('Pt2') });
      return {
        curves: [d, s0, s1, s2],
        points: [e0, e1, e2],
        arrows,
        shifts: [
          { source: s0, copy: s1, by: { x: 0, y: t } },
          { source: s1, copy: s2, by: { x: 0, y: t } },
        ],
        x: axisX,
        y: axisY,
        regions: {
          dwlBefore: band([on(d), on(s0)], at(e1), at(e0)),
          dwlAddUpper: band([on(d), on(s1)], at(e2), at(e1)),
          dwlAddLower: band([on(s1), on(s0)], at(e2), at(e1)),
        },
        curveRoles: { D: { curve: d, role: 'demand' }, S0: { curve: s0, role: 'supply' }, S1: { curve: s1, role: 'supply' }, S2: { curve: s2, role: 'supply' } },
        levels: {},
        marks: { Q0: e0, P0: e0, Qt1: e1, Pt1: e1, Qt2: e2, Pt2: e2 },
      };
    }
    case 'unitTax':
    case 'costRise': {
      const t = shiftFor((SHIFT[scene.size] ?? 0.28) * k, dm, sm);
      const d = curve(lineThrough(dm), name('D'));
      const s0 = curve(room(TOP - t), name('S0'));
      const s1 = shiftOf(s0, 0, t, name('S1'));
      const parts: Array<DiagramCurve | DiagramPointMark> = [d, s0, s1];
      const e0 = tickPoint(cross(d, s0), parts, { x: tick('Q0'), y: tick('P0') });
      const e1 = tickPoint(cross(d, s1), parts, { x: tick('Q1'), y: tick(scene.type === 'unitTax' ? 'Pb' : 'P1') });
      // Under a tax, sellers keep P₂ on S₀ above Q₁.
      const sp = scene.type === 'unitTax' ? tickPoint({ on: s0.id, x: at(e1) }, [...parts, e1], { y: tick('Ps') }) : undefined;
      const regions: Record<string, Band> = sp
        ? {
            csAfter: underFromAxis(d, level(at(e1)), at(e1)),
            buyersBurden: band([level(at(e1)), level(at(e0))], 0, at(e1)),
            sellersBurden: band([level(at(e0)), level(at(sp))], 0, at(e1)),
            psAfter: band([level(0), level(at(sp))], 0, at(e1), on(s0)),
            dwlBuyers: band([on(d), level(at(e0))], at(e1), at(e0)),
            dwlSellers: band([level(at(e0)), on(s0)], at(e1), at(e0)),
          }
        : {
            band: band([on(s1), on(s0)], 0, at(e1)),
            triangle: band([on(d), on(s0)], at(e1), at(e0)),
            remaining: band([on(d), on(s1)], 0, at(e1)),
          };
      return {
        curves: [d, s0, s1],
        points: [e0, e1, ...(sp ? [sp] : [])],
        arrows,
        shifts: [{ source: s0, copy: s1, by: { x: 0, y: t } }],
        x: axisX,
        y: axisY,
        regions,
        curveRoles: { D: { curve: d, role: 'demand' }, S0: { curve: s0, role: 'supply' }, S1: { curve: s1, role: 'supply' } },
        levels: {},
        marks: { Q0: e0, P0: e0, Q1: e1, Pb: e1, P1: e1, ...(sp ? { Ps: sp } : {}) },
      };
    }
    case 'unitSubsidy': {
      const t = shiftFor((SHIFT[scene.size] ?? 0.28) * k, dm, sm);
      const d = curve(lineThrough(dm), name('D'));
      // Room below: S₁ = S₀ − s must still start above the x-axis.
      const s0Line = lineThrough(sm, TOP, t + 0.02);
      const s0 = curve(s0Line, name('S0'));
      const s1 = shiftOf(s0, 0, -t, name('S1'));
      const parts: Array<DiagramCurve | DiagramPointMark> = [d, s0, s1];
      const e0 = tickPoint(cross(d, s0), parts, { x: tick('Q0'), y: tick('P0') });
      const e1 = tickPoint(cross(d, s1), parts, { x: tick('Q1'), y: tick('Pb') });
      // Sellers receive P₂ on S₀ above Q₁; its drop runs down through E₁, the DWL's right edge.
      const sp = tickPoint({ on: s0.id, x: at(e1) }, [...parts, e1], { x: null, y: tick('Ps') });
      return {
        curves: [d, s0, s1],
        points: [e0, e1, sp],
        arrows,
        shifts: [{ source: s0, copy: s1, by: { x: 0, y: -t } }],
        x: axisX,
        y: axisY,
        regions: {
          consumerBenefit: band([level(at(e0)), level(at(e1))], 0, at(e1), on(d)),
          producerBenefit: band([level(at(e0)), level(at(sp))], 0, at(e1), on(s0)),
          dwl: band([on(s0), on(d)], at(e0), at(e1)),
        },
        curveRoles: { D: { curve: d, role: 'demand' }, S0: { curve: s0, role: 'supply' }, S1: { curve: s1, role: 'supply' } },
        levels: {},
        marks: { Q0: e0, P0: e0, Q1: e1, Pb: e1, Ps: sp },
      };
    }
    case 'subsidyChange': {
      // Two subsidies (k-0586, HKDSE 2024 P1 Q20): s₁ moves S₀ down to S₁, s₂ = 2s₁ to S₂; room below for both.
      const t = Math.min(0.18, shiftFor((SHIFT[scene.size] ?? 0.28) * k * 0.7, dm, sm));
      const d = curve(lineThrough(dm), name('D'));
      const s0 = curve(lineThrough(sm, TOP, 2 * t + 0.02), name('S0'));
      const s1 = shiftOf(s0, 0, -t, name('S1'));
      const s2 = shiftOf(s1, 0, -t, name('S2'));
      const parts: Array<DiagramCurve | DiagramPointMark> = [d, s0, s1, s2];
      const e0 = tickPoint(cross(d, s0), parts, { x: tick('Q0'), y: tick('P0') });
      const e1 = tickPoint(cross(d, s1), parts, { x: tick('Qs1'), y: tick('Ps1') });
      const e2 = tickPoint(cross(d, s2), parts, { x: tick('Qs2'), y: tick('Ps2') });
      return {
        curves: [d, s0, s1, s2],
        points: [e0, e1, e2],
        arrows,
        shifts: [
          { source: s0, copy: s1, by: { x: 0, y: -t } },
          { source: s1, copy: s2, by: { x: 0, y: -t } },
        ],
        x: axisX,
        y: axisY,
        regions: {
          dwlBefore: band([on(s0), on(d)], at(e0), at(e1)),
          dwlAddUpper: band([on(s0), on(s1)], at(e1), at(e2)),
          dwlAddLower: band([on(s1), on(d)], at(e1), at(e2)),
        },
        curveRoles: { D: { curve: d, role: 'demand' }, S0: { curve: s0, role: 'supply' }, S1: { curve: s1, role: 'supply' }, S2: { curve: s2, role: 'supply' } },
        levels: {},
        marks: { Q0: e0, P0: e0, Qs1: e1, Ps1: e1, Qs2: e2, Ps2: e2 },
      };
    }
    case 'priceCeiling':
    case 'priceFloor': {
      const ceiling = scene.type === 'priceCeiling';
      const d = curve(lineThrough(dm), name('D'));
      const s = curve(room(TOP), name('S'));
      const c = Math.max((CONTROL[scene.size] ?? 0.2) * k, MIN_GAP * Math.max(Math.abs(dm), sm));
      const y = Math.min(0.86, Math.max(0.08, E[1] + (ceiling ? -c : c)));
      const lineId = ceiling ? 'Pc' : 'Pf';
      const line = priceLine(y, name(lineId) ?? NO_NAME);
      const parts: Array<DiagramCurve | DiagramPointMark> = [d, s, line];
      const e0 = tickPoint(cross(d, s), parts, { x: tick('Q0'), y: tick('P0') });
      const qs = tickPoint(cross(s, line), parts, { x: tick('Qs') });
      const qd = tickPoint(cross(d, line), parts, { x: tick('Qd') });
      const points = [e0, qs, qd];
      // A fourth quantity only a distractor names ("Q₃Q₄"): on D, one step further below the ceiling.
      const marks: Record<string, DiagramPointMark> = { Q0: e0, P0: e0, Qs: qs, Qd: qd };
      if (ceiling && tick('Qx') !== undefined) {
        const qx = tickPoint({ on: d.id, y: Math.max(0.13, y - Math.max(0.07, c * 0.6)) }, parts, { x: tick('Qx') });
        points.push(qx);
        marks.Qx = qx;
      }
      const spans: DiagramSpan[] = [];
      if (scene.gap) {
        const words = ceiling ? GAP_WORDS.shortage : labour ? GAP_WORDS.unemployment : GAP_WORDS.surplus;
        const [from, to] = ceiling ? [qs, qd] : [qd, qs];
        spans.push(span(at(from), at(to), 'bracket', { offset: ceiling ? -0.05 : 0.04, label: phraseOf(words) }));
      }
      // The traded side (Qs under a ceiling, Qd over a floor) bounds the DWL: its drop runs up to D (a ceiling) through the line.
      if (ceiling && scene.areas.length) {
        // A steep demand may start above the plot left of Qs: then the region's edge is the plot's top, no line needed.
        try {
          points.push(tickPoint({ on: d.id, x: at(qs) }, [...parts, qs], { x: null }));
        } catch {
          // D does not reach above Qs.
        }
      }
      const regions: Record<string, Band> = ceiling
        ? {
            csKept: underFromAxis(d, level(at(e0)), at(qs)),
            transfer: band([level(at(e0)), level(at(qs))], 0, at(qs)),
            dwlBuyers: band([on(d), level(at(e0))], at(qs), at(e0)),
            dwlSellers: band([level(at(e0)), on(s)], at(qs), at(e0)),
            psAfter: band([level(0), level(at(qs))], 0, at(qs), on(s)),
          }
        : {
            csAfter: underFromAxis(d, level(at(qd)), at(qd)),
            transfer: band([level(at(qd)), level(at(e0))], 0, at(qd)),
            dwlBuyers: band([on(d), level(at(e0))], at(qd), at(e0)),
            dwlSellers: band([level(at(e0)), on(s)], at(qd), at(e0)),
            psKept: band([level(0), level(at(e0))], 0, at(qd), on(s)),
          };
      return {
        curves: [d, s, line],
        points,
        arrows,
        spans,
        x: axisX,
        y: axisY,
        regions,
        curveRoles: { D: { curve: d, role: 'demand' }, S: { curve: s, role: 'supply' }, [lineId]: { curve: line, role: 'horizontal' } },
        levels: { [lineId]: { vertical: false, at: y } },
        marks,
      };
    }
    case 'ceilingDemandRise': {
      // HKDSE 2023 P1 Q21: D₁ meets S at a, on the ceiling P₁; D₂ = D₁ moved right meets S at c,
      // P₁ at f, and stands at b above a. The loss abc is bounded on the left by a dashed line b–a.
      // Q₁ to Q₂ is h·|d|/(s+|d|) and Q₂ to Q₃ is h·s/(s+|d|): each kept clear of the next.
      // b, h·|d| above a, stays under the top of the plot.
      const h = Math.min(0.34, (TOP - 0.04 - E[1]) / Math.abs(dm), Math.max(0.2 * k + 0.04, (MIN_GAP * 1.2 * (sm + Math.abs(dm))) / Math.min(sm, Math.abs(dm))));
      const s = curve(room(TOP), name('S'));
      const d1 = curve(lineAt(E, dm, TOP, 0.12, 0.9 - h), name('D1'));
      const d2 = shiftOf(d1, h, 0, name('D2'));
      const line = derived({ kind: 'level', y: E[1], from: 0, to: Math.min(0.9, E[0] + h + 0.16) }, [], name('Pc') ?? NO_NAME, { labelAt: 'start', weight: 0.8, stroke: 'dashed' });
      const parts: Array<DiagramCurve | DiagramPointMark> = [d1, d2, s, line];
      const e1 = tickPoint(cross(d1, s), parts, { x: tick('Qs') });
      const e2 = tickPoint(cross(d2, s), parts, { x: tick('Q2'), y: tick('P2') });
      const qd = tickPoint(cross(d2, line), parts, { x: tick('Qd') });
      const curves = [d1, d2, s, line];
      // b–a, the loss's left side, when an area is lettered and Q₁ has no drop of its own to carry it.
      if ((scene.areas.length || scene.points?.length) && tick('Qs') === undefined) {
        const b = resolveIn(scratchOf([...parts, e1]), { on: d2.id, x: at(e1) });
        curves.push(derived({ kind: 'vertical', x: at(e1), from: E[1], to: b.y }, [...parts, e1], undefined, { stroke: 'dashed', weight: 0.8 }));
      }
      return {
        curves,
        points: [e1, e2, qd],
        arrows,
        x: axisX,
        y: axisY,
        regions: {
          dwl: band([on(d2), on(s)], at(e1), at(e2)),
          shortfall: band([on(s), level(at(e1))], at(e1), at(qd), on(d2)),
          csAfter: underFromAxis(d2, level(at(e1)), at(e1)),
          psAfter: band([level(0), level(at(e1))], 0, at(e1), on(s)),
        },
        curveRoles: { D1: { curve: d1, role: 'demand' }, D2: { curve: d2, role: 'demand' }, S: { curve: s, role: 'supply' }, Pc: { curve: line, role: 'horizontal' } },
        levels: { Pc: { vertical: false, at: E[1] } },
        marks: { Qs: e1, Q2: e2, P2: e2, Qd: qd },
      };
    }
    case 'quota': {
      const d = curve(lineThrough(dm), name('D'));
      const sLine = room(TOP);
      const s = curve(sLine, name('S'));
      const q = Math.max((QUOTA[scene.size] ?? 0.18) * k, MIN_GAP / Math.min(1, Math.abs(dm)), MIN_GAP / Math.min(1, sm));
      const qx = Math.max(0.12, E[0] - q);
      const [[x0, y0], [x1, y1]] = sLine;
      const sy = y0 + ((qx - x0) * (y1 - y0)) / (x1 - x0);
      // S up to the quota, then upright: the domestic-quota template's kinked curve.
      const s1 = curve([[x0, y0], [qx, sy], [qx, TOP]], name('S1'));
      const parts: Array<DiagramCurve | DiagramPointMark> = [d, s, s1];
      const e0 = tickPoint(cross(d, s), parts, { x: tick('Q0'), y: tick('P0') });
      const e1 = tickPoint({ on: d.id, x: { x: qx, y: 0 } }, parts, { x: tick('Qq'), y: tick('P1') });
      return {
        curves: [d, s, s1],
        points: [e0, e1],
        arrows,
        x: axisX,
        y: axisY,
        regions: {
          csAfter: underFromAxis(d, level(at(e1)), at(e1)),
          transfer: band([level(at(e1)), level(at(e0))], 0, at(e1)),
          psKept: band([level(0), level(at(e0))], 0, at(e1), on(s)),
          dwlBuyers: band([on(d), level(at(e0))], at(e1), at(e0)),
          dwlSellers: band([level(at(e0)), on(s)], at(e1), at(e0)),
        },
        curveRoles: { D: { curve: d, role: 'demand' }, S: { curve: s, role: 'supply' }, S1: { curve: s1, role: 'supply' } },
        levels: { Qq: { vertical: true, at: qx } },
        marks: { Q0: e0, P0: e0, Qq: e1, P1: e1 },
      };
    }
    case 'externality': {
      const kind = scene.externality === 'none' ? 'negativeProduction' : scene.externality;
      const inProduction = kind === 'negativeProduction' || kind === 'positiveProduction';
      const up = kind === 'negativeProduction' || kind === 'positiveConsumption';
      const e = shiftFor((SHIFT[scene.size] ?? 0.28) * k, dm, sm);
      const d = curve(lineThrough(dm, inProduction ? TOP : up ? TOP - e : TOP, inProduction ? 0.12 : up ? 0.12 : 0.12 + e), name('D'));
      const s = curve(lineThrough(sm, inProduction && up ? TOP - e : TOP, inProduction && !up ? e + 0.02 : 0), name('S'));
      const privateCurve = inProduction ? s : d;
      const social = shiftOf(privateCurve, 0, up ? e : -e, name('social'));
      const other = inProduction ? d : s;
      const parts: Array<DiagramCurve | DiagramPointMark> = [d, s, social];
      const em = tickPoint(cross(d, s), parts, { x: tick('Qm'), ...(tick('Pm') !== undefined ? { y: tick('Pm') } : {}) });
      const ee = tickPoint(cross(social, other), parts, { x: tick('Qe'), ...(tick('Pe') !== undefined ? { y: tick('Pe') } : {}) });
      // Which of the two outputs is smaller: the social optimum under a negative externality.
      const negative = kind === 'negativeProduction' || kind === 'negativeConsumption';
      const [lo, hi] = negative ? [ee, em] : [em, ee];
      const upper = (a: DiagramCurve, b: DiagramCurve): [DiagramAreaEdge, DiagramAreaEdge] => [on(a), on(b)];
      // The DWL triangle: the curve on top first.
      const dwlEdges: [DiagramAreaEdge, DiagramAreaEdge] =
        kind === 'negativeProduction' ? upper(social, d) : kind === 'positiveProduction' ? upper(d, social) : kind === 'negativeConsumption' ? upper(s, social) : upper(social, s);
      const externalEdges: [DiagramAreaEdge, DiagramAreaEdge] = up ? [on(social), on(privateCurve)] : [on(privateCurve), on(social)];
      // Beside the DWL, between the curve the social one crosses and the private curve: the rest of the band between lo and hi.
      const wedgeEdges: [DiagramAreaEdge, DiagramAreaEdge] =
        kind === 'negativeProduction' ? upper(d, s) : kind === 'positiveProduction' ? upper(s, d) : kind === 'negativeConsumption' ? upper(d, s) : upper(s, d);
      return {
        curves: [d, s, social],
        points: [em, ee],
        arrows,
        x: axisX,
        y: phraseOf(scene.market === 'labour' ? AX.wage : inProduction ? AX.cost : AX.benefit),
        regions: {
          dwl: band(dwlEdges, at(lo), at(hi)),
          external: band(externalEdges, 0, at(lo)),
          wedge: band(wedgeEdges, at(lo), at(hi)),
        },
        curveRoles: { D: { curve: d, role: 'demand' }, S: { curve: s, role: 'supply' }, social: { curve: social, role: inProduction ? 'supply' : 'demand' } },
        levels: {},
        marks: { Qm: em, Pm: em, Qe: ee, Pe: ee },
        alias: { other: inProduction ? 'D' : 'S', private: inProduction ? 'S' : 'D' },
      };
    }
    case 'tariff': {
      const d = curve(lineThrough(dm), name('D'));
      const s = curve(room(TOP), name('S'));
      // World price under the domestic equilibrium, the tariff between: four quantities apart.
      // Pw and Pt below E, Q₁ … Q₄ on the plot and apart: the gap below E shared 60 / 40 between the tariff and Pt to E.
      const a = Math.min(0.3 * k, (E[0] - 0.04) * sm, (0.88 - E[0]) * Math.abs(dm), E[1] - 0.1);
      const pwY = E[1] - a;
      // Each quantity gap is the tariff over a slope: at least 0.05 on the steeper side.
      const t = Math.min(a - 0.02, Math.max(a * 0.45, 0.052 * Math.max(1, Math.abs(dm), sm)));
      const pw = priceLine(pwY, name('Pw') ?? NO_NAME);
      const pt = priceLine(pwY + t, name('Pt') ?? NO_NAME);
      const parts: Array<DiagramCurve | DiagramPointMark> = [d, s, pw, pt];
      const q1 = tickPoint(cross(s, pw), parts, { x: tick('Q1') });
      const q2 = tickPoint(cross(s, pt), parts, { x: tick('Q2') });
      const q3 = tickPoint(cross(d, pt), parts, { x: tick('Q3') });
      const q4 = tickPoint(cross(d, pw), parts, { x: tick('Q4') });
      return {
        curves: [d, s, pw, pt],
        points: [q1, q2, q3, q4],
        arrows,
        x: axisX,
        y: axisY,
        regions: {
          psGain: band([on(pw), on(pt)], 0, at(q2), on(s)),
          dwlProduction: band([on(s), on(pw)], at(q1), at(q2)),
          revenue: band([on(pt), on(pw)], at(q2), at(q3)),
          dwlConsumption: band([on(d), on(pw)], at(q3), at(q4)),
          csAfter: underFromAxis(d, on(pt), at(q3)),
          psBefore: band([level(0), on(pw)], 0, at(q1), on(s)),
        },
        curveRoles: { D: { curve: d, role: 'demand' }, S: { curve: s, role: 'supply' }, Pw: { curve: pw, role: 'horizontal' }, Pt: { curve: pt, role: 'horizontal' } },
        levels: { Pw: { vertical: false, at: pwY }, Pt: { vertical: false, at: pwY + t } },
        marks: { Q1: q1, Q2: q2, Q3: q3, Q4: q4 },
      };
    }
    case 'none':
      throw new Error('no scene');
  }
}

function phraseOf(t: SpecText): BiText {
  return phrase(t) ?? { en: [], zh: [] };
}

function arrowFor(source: DiagramCurve, copy: DiagramCurve, by: { x: number; y: number }, curves: DiagramCurve[], points: DiagramPointMark[]): DiagramArrow[] {
  const place = shiftArrowPlace(source, by, { curves, points, keep: [source.id, copy.id] });
  if (!place) return [];
  try {
    return [shiftArrow(source, copy, place[0], place[1])];
  } catch {
    return [];
  }
}

/** The model's label for a part, else the catalogue's; '' = deliberately none. */
export function sceneLabels(def: SceneDef, scene: SpecScene): Map<string, string> {
  const given = new Map(scene.labels.map((l) => [l.part.trim(), l.label]));
  const out = new Map<string, string>();
  for (const part of def.parts) {
    const label = given.has(part.id) ? given.get(part.id)! : part.kind !== 'curve' && !def.shown.includes(part.id) ? '' : defaultLabel(part, scene.market, scene.externality);
    out.set(part.id, label.trim());
  }
  return out;
}

export function compileScene(spec: DiagramSpec): SceneBuilt {
  const issues: DiagramIssue[] = [];
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const empty = (): SceneBuilt => ({
    diagram: null,
    issues,
    curveIds: new Map(),
    roles: new Map(),
    levels: new Map(),
    regionAreas: new Map(),
    regionLabels: new Map(),
    partLabels: new Map(),
    pointLabels: new Map(),
    pointPlaces: new Map(),
    regionPolygons: new Map(),
  });
  const scene = spec.scene;
  const def = scene ? sceneDef(scene.type) : undefined;
  if (!scene || !def) {
    error('scene.type', `"${scene?.type ?? ''}" is not a scene type: use one of the scene list, or kind "curves".`);
    return empty();
  }
  for (const l of scene.labels) {
    if (!def.parts.some((p) => p.id === l.part.trim())) error('scene.part', `Scene ${def.type} has no part "${l.part}". Its parts are ${def.parts.map((p) => p.id).join(', ')}.`);
  }
  const labels = sceneLabels(def, scene);
  const scenePoints = scene.points ?? [];
  // Lettered corners need the dashed lines that bound their areas, as lettered regions do.
  const anyArea = scene.areas.length > 0 || scenePoints.length > 0;
  const name = (part: string) => symbol(labels.get(part) ?? '');
  // A tick with no label still draws its dashed line when lettered regions need it as an edge.
  const tick = (part: string): BiText | null | undefined => {
    const label = labels.get(part) ?? '';
    if (label) return symbol(label);
    return anyArea && def.edges.includes(part) ? null : undefined;
  };

  // The first layout whose ticks stand apart on the plot and whose regions all have area.
  let built: Draft | null = null;
  let fallback: Draft | null = null;
  for (const layout of LAYOUTS) {
    try {
      const candidate = draft(scene, name, tick, layout);
      if (layoutOk(candidate, def.regions.map((r) => r.id))) {
        built = candidate;
        break;
      }
      fallback ??= candidate;
    } catch {
      // Lines that do not cross on the plot: try the next layout.
    }
  }
  if (!built && fallback) {
    built = fallback;
    issues.push({ level: 'look', code: 'scene.layout', text: `Scene ${def.type} with demand ${scene.demand} and supply ${scene.supply} is crowded: some ticks or regions are close.` });
  }
  if (!built) {
    error('scene.build', `Scene ${def.type} could not be drawn with these choices (demand ${scene.demand}, supply ${scene.supply}, size ${scene.size}).`);
    return empty();
  }

  // Areas: each region or measure the model letters, one pattern per entry.
  const regionLabels = new Map<string, string>();
  const plans: Array<{ regions: string[]; label?: BiText; pattern: DiagramAreaPattern; text: string }> = [];
  const used = new Set<string>();
  scene.areas.forEach((a, i) => {
    const id = a.region.trim();
    const regions = regionsOf(def, id);
    if (!regions.length) {
      error('scene.region', `Scene ${def.type} has no region or area "${id}". Regions: ${def.regions.map((r) => r.id).join(', ')}; areas: ${Object.keys(def.measures).join(', ')}.`);
      return;
    }
    const overlap = regions.filter((r) => used.has(r));
    if (overlap.length) {
      error('scene.overlap', `"${id}" covers ${overlap.join(', ')}, which another lettered area already covers: each region carries one label.`);
      return;
    }
    regions.forEach((r) => used.add(r));
    const words = def.regions.find((r) => r.id === id)?.words ?? def.measureWords[id as keyof SceneDef['measureWords']] ?? (regions.length === 1 ? def.regions.find((r) => r.id === regions[0])?.words : null) ?? null;
    const given = phrase(a.label);
    const label = given ?? (words ? phrase(words) : undefined);
    if (!label) {
      error('scene.label', `Area "${id}" needs a label (a letter such as "A", or words): it has no standard name.`);
      return;
    }
    const text = plainOf(label) || plainOf(label, 'zh');
    regions.forEach((r) => regionLabels.set(r, text));
    plans.push({ regions, label, pattern: PATTERNS[i % PATTERNS.length], text });
  });

  // Lettered points (k-0577 round 2): each on its catalogue place, anchored so a drag keeps it there.
  const pointLabels = new Map<string, string>();
  const lettered: DiagramPointMark[] = [];
  const letteredIds = new Map<string, string>();
  const pointPlaces = new Map<string, { x: number; y: number }>();
  const parts: Array<DiagramCurve | DiagramPointMark> = [...built.curves, ...built.points];
  const refOf = (p: ScenePointDef): DiagramAnchorRef | null => {
    const curveOf = (id: string) => built!.curveRoles[built!.alias?.[id] ?? id]?.curve;
    const on = curveOf(p.on);
    if (!on) return null;
    const other = curveOf(p.at);
    if (other) return cross(on, other);
    const kind = def.parts.find((q) => q.id === p.at)?.kind;
    const mark = built!.marks[p.at];
    if (!mark || !kind || kind === 'curve') return null;
    return kind === 'xTick' ? { on: on.id, x: at(mark) } : { on: on.id, y: at(mark) };
  };
  for (const p of def.points) {
    const ref = refOf(p);
    if (!ref) continue;
    try {
      pointPlaces.set(p.id, resolveIn(scratchOf(parts), ref));
    } catch {
      // Not on the plot with these choices.
    }
  }
  const seenLetters = new Set<string>();
  for (const sp of scenePoints) {
    const p = def.points.find((q) => q.id === sp.point);
    if (!p) {
      error('scene.point', `Scene ${def.type} has no point "${sp.point}". Its points are ${def.points.map((q) => q.id).join(', ')}.`);
      continue;
    }
    const letter = sp.label.trim();
    if (!/^[A-Za-z]$/.test(letter)) {
      error('scene.pointLabel', `Point ${p.id} needs one letter as its label (got "${sp.label}").`);
      continue;
    }
    if (seenLetters.has(letter) || pointLabels.has(p.id)) {
      error('scene.pointTwice', `Letter ${letter} or point ${p.id} is used twice: one letter per point.`);
      continue;
    }
    const ref = refOf(p);
    const where = pointPlaces.get(p.id);
    if (!ref || !where) {
      error('scene.pointOff', `Point ${p.id} is not on the figure with these choices.`);
      continue;
    }
    seenLetters.add(letter);
    pointLabels.set(p.id, letter);
    const mark = point(where.x, where.y, symbol(letter), { anchor: ref, dot: true });
    letteredIds.set(p.id, mark.id);
    lettered.push(mark);
  }
  // A lettered point above a tick's point (n on S₂ above e) takes over its dashed line, so the line runs up to it.
  for (const [part, mark] of Object.entries(built.marks)) {
    if (!mark.dropTo?.includes('x') || def.parts.find((q) => q.id === part)?.kind !== 'xTick') continue;
    const above = lettered.filter((l) => Math.abs(l.at.x - mark.at.x) < 1e-6 && l.at.y > mark.at.y + 1e-6).sort((a, b) => b.at.y - a.at.y)[0];
    if (!above) continue;
    above.dropTo = ['x'];
    if (mark.xTickLabel) above.xTickLabel = mark.xTickLabel;
    mark.dropTo = mark.dropTo.filter((a) => a !== 'x');
    delete mark.xTickLabel;
  }
  // Shift arrows last: clear of every line, point and lettered point, and of each other.
  const arrows = [...built.arrows];
  for (const sh of built.shifts ?? []) {
    const placed = arrows.flatMap((a) => [a.from, a.to, { x: (a.from.x + a.to.x) / 2, y: (a.from.y + a.to.y) / 2 }].map((at) => ({ id: 'probe', at })));
    arrows.push(...arrowFor(sh.source, sh.copy, sh.by, built.curves, [...built.points, ...lettered, ...placed]));
  }

  const curveIds = new Map<string, string>();
  const roles = new Map<string, CurveRole>();
  for (const [part, { curve: c, role }] of Object.entries(built.curveRoles)) {
    curveIds.set(part, c.id);
    roles.set(part, role);
  }
  const levels = new Map(Object.entries(built.levels));

  const regionAreas = new Map<string, DiagramArea>();
  let diagram: Diagram;
  try {
    diagram = finish(
      axes(built.x, built.y, { curves: built.curves, points: [...built.points, ...lettered], arrows, ...(built.spans?.length ? { spans: built.spans } : {}) }),
      () => {
        const areas: DiagramArea[] = [];
        for (const plan of plans) {
          // The label sits on the plan's largest region; the others share its hatch, unlabelled.
          const drawn = plan.regions.map((r) => {
            const b = built.regions[r];
            const area: DiagramArea = { id: newId(), band: { edges: b.edges, from: b.from, to: b.to, ...(b.cap ? { cap: b.cap } : {}) }, fill: 'hatch', pattern: plan.pattern };
            regionAreas.set(r, area);
            return area;
          });
          areas.push(...drawn);
        }
        return areas;
      },
    );
  } catch {
    error('scene.resolve', `Scene ${def.type} could not be resolved.`);
    return empty();
  }

  // Each region must have area; the label goes on the largest of its plan.
  for (const plan of plans) {
    const sized = plan.regions.map((r) => {
      const area = regionAreas.get(r)!;
      const poly = areaPolygon(diagram, area);
      return { r, area, size: poly ? polygonArea(poly) : 0, poly };
    });
    for (const s of sized) {
      if (s.size < 1e-4) error('scene.empty', `Region ${s.r} has no area with these choices.`);
    }
    const largest = sized.reduce((a, b) => (b.size > a.size ? b : a));
    if (plan.label) largest.area.label = plan.label;
  }
  // `finish` copied the areas: write the labels into the diagram's own.
  diagram = { ...diagram, areas: (diagram.areas ?? []).map((a) => [...regionAreas.values()].find((r) => r.id === a.id) ?? a) };
  // Each letter beside its own point, clear of every line, arrow, dot and label.
  if (lettered.length) diagram = placePointLabels(diagram, new Set(letteredIds.values()));

  // Every region's outline, drawn or not: a corner-named area is checked against them.
  const regionPolygons = new Map<string, Array<{ x: number; y: number }>>();
  for (const [id, b] of Object.entries(built.regions)) {
    const poly = areaPolygon(diagram, { id: 'probe', band: { edges: b.edges, from: b.from, to: b.to, ...(b.cap ? { cap: b.cap } : {}) } });
    if (poly) regionPolygons.set(id, poly);
  }

  return { diagram, issues, curveIds, roles, levels, regionAreas, regionLabels, partLabels: labels, pointLabels, pointPlaces, regionPolygons };
}

/** Ticks on the plot and apart, every region with area: the layout a teacher can read. */
function layoutOk(d: Draft, regionIds: string[]): boolean {
  let diagram: Diagram;
  try {
    diagram = finish(axes(d.x, d.y, { curves: d.curves, points: d.points, arrows: d.arrows }));
  } catch {
    return false;
  }
  for (const c of diagram.curves) if (c.points.some((p) => p.x < -1e-6 || p.x > 1 || p.y < -1e-6 || p.y > 0.97)) return false;
  for (const axis of ['x', 'y'] as const) {
    const at = diagram.points.filter((p) => p.dropTo?.includes(axis) && (axis === 'x' ? p.xTickLabel : p.yTickLabel)).map((p) => p.at[axis]);
    for (const c of diagram.curves) if (axis === 'y' && c.derive?.kind === 'level' && c.label?.en.length) at.push(c.points[0].y);
    const sorted = [...new Set(at.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
    if (sorted.some((n) => n < 0.03 || n > 0.95)) return false;
    for (let i = 1; i < sorted.length; i += 1) if (sorted[i] - sorted[i - 1] < 0.05) return false;
  }
  for (const id of regionIds) {
    const b = d.regions[id];
    const poly = b && areaPolygon(diagram, { id: 'probe', band: { edges: b.edges, from: b.from, to: b.to, ...(b.cap ? { cap: b.cap } : {}) } });
    if (!poly || polygonArea(poly) < 4e-4) return false;
  }
  return true;
}

function polygonArea(points: Array<{ x: number; y: number }>): number {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}
