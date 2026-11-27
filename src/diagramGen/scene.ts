import type { Diagram, DiagramAnchorRef, DiagramArea, DiagramAreaEdge, DiagramAreaPattern, DiagramArrow, DiagramCurve, DiagramPointMark, DiagramSpan } from '@/model/diagram';
import { anchorReferences } from '@/model/diagramAnchors';
import { areaPolygon } from '@/model/diagramAreas';
import { axes, cross, curve, derived, finish, newId, point, priceLine, shiftArrow, shiftOf, span, type Pair } from '@/model/diagramTemplateKit';
import { AX, at, band, level, MIN_GAP, on, phraseOf, resolveIn, scratchOf, tickPoint, TOP, underFromAxis, type Band, type Draft, type StageFacts, type StateFacts } from './sceneKit';
import type { BiText } from '@/model/types';
import { shiftArrowPlace, type Compiled } from './compile';
import { monopolyError } from './monopoly';
import { draftMonopoly, MONO_LAYOUTS } from './monopolyDraft';
import { tradeNumbers, type TradeNumbers } from './trade';
import { draftTrade } from './tradeDraft';
import { placePointLabels } from './pointLabels';
import { defaultLabel, regionsOf, type SceneDef, type ScenePointDef } from './sceneCatalogue';
import { grows, isPlan, sceneDefOf, stageAliases, stageParts, stagePlan, stageRegionIds, type StagePlan } from './stageCatalogue';
import { phrase, plainOf, symbol } from './text';

export type { StageFacts, StateFacts } from './sceneKit';
import type { CurveRole, DiagramIssue, DiagramSpec, Slope, SpecScene } from './types';

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
  /** A two-state control (k-0587): both states' market, for the statement check. */
  stage?: StageFacts;
  /** A trade figure (k-0589): its numbers, for the key and the words. */
  trade?: TradeNumbers;
}

const DEMAND_SLOPE: Record<Slope, number> = { normal: -1, steep: -2.2, flat: -0.42 };
const SUPPLY_SLOPE: Record<Slope, number> = { normal: 1, steep: 2.2, flat: 0.42 };
/** The tax, subsidy, cost rise or external effect, as a vertical distance. */
const SHIFT: Record<SpecScene['size'], number> = { small: 0.2, normal: 0.28, large: 0.36 };
/** A price control's distance from P0. */
const CONTROL: Record<SpecScene['size'], number> = { small: 0.14, normal: 0.2, large: 0.26 };
/** A quota's distance left of Q0. */
const QUOTA: Record<SpecScene['size'], number> = { small: 0.14, normal: 0.18, large: 0.24 };
/** Where the first equilibrium sits, and how much of each size to use: the layout search tries these in turn. */
interface Layout {
  E: Pair;
  k: number;
}
const LAYOUTS: Layout[] = [0.42, 0.5, 0.34].flatMap((x) => [0.46, 0.4, 0.52, 0.34].flatMap((y) => [1, 0.8, 0.62, 0.48].map((k) => ({ E: [x, y] as Pair, k }))));

const NO_NAME: BiText = { en: [], zh: [] };
const PATTERNS: DiagramAreaPattern[] = ['diagonal', 'reverse', 'horizontal', 'vertical', 'cross', 'dots'];

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

const GAP_WORDS = {
  shortage: { en: 'Shortage', zh: '短缺' },
  surplus: { en: 'Surplus', zh: '過剩' },
  unemployment: { en: 'Unemployment', zh: '失業' },
};
/** A two-state figure's brackets, when both states have one (k-0587). */
const GAP_WORDS_TWO = {
  shortage: [{ en: 'Original shortage', zh: '原先的短缺' }, { en: 'New shortage', zh: '新的短缺' }],
  surplus: [{ en: 'Original surplus', zh: '原先的過剩' }, { en: 'New surplus', zh: '新的過剩' }],
  unemployment: [{ en: 'Original unemployment', zh: '原先的失業' }, { en: 'New unemployment', zh: '新的失業' }],
};

/** Draws one scene; `name(part)` is the part's printed label (undefined = none), `tick(part)` the same for ticks (null = drop line, no label). */
function draft(scene: SpecScene, name: (part: string) => BiText | undefined, tick: (part: string) => BiText | null | undefined, layout: Layout): Draft {
  const plan = stagePlan(scene);
  if (isPlan(plan)) {
    // Spaced for every labelled quantity first; when that cannot fit, drawn anyway (the layout check then calls it crowded).
    try {
      return draftStage(scene, plan, name, tick, layout, true);
    } catch {
      return draftStage(scene, plan, name, tick, layout, false);
    }
  }
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
    case 'monopoly':
    case 'ppfTrade':
      // Drawn by `monopolyDraft.ts` and `tradeDraft.ts` (k-0589): compileScene calls them.
      throw new Error(`${scene.type} has its own drafter`);
    case 'none':
      throw new Error('no scene');
  }
}

/** A straight line of slope `m` through E, from x0 to x1, kept between y `lo` and `hi`. */
function clipLine(E: Pair, m: number, x0: number, x1: number, lo: number, hi: number): Pair[] {
  const [ex, ey] = E;
  const yAt = (x: number) => ey + m * (x - ex);
  const xAt = (y: number) => ex + (y - ey) / m;
  const ends: Pair[] = [];
  for (const xEnd of [x0, x1]) {
    let px = xEnd;
    let py = yAt(px);
    if (py > hi) [px, py] = [xAt(hi), hi];
    if (py < lo) [px, py] = [xAt(lo), lo];
    ends.push([px, py]);
  }
  if (ends[1][0] - ends[0][0] < 0.1) throw new Error('line off the plot');
  return ends.sort((a, b) => a[0] - b[0]);
}

/** A linear curve as numbers: y at x, x at y. */
export interface Lin {
  m: number;
  at: Pair;
}
const yOf = (l: Lin, x: number) => l.at[1] + l.m * (x - l.at[0]);
const xOf = (l: Lin, y: number) => l.at[0] + (y - l.at[1]) / l.m;
export const meetOf = (a: Lin, b: Lin): Pair => {
  const xm = (b.at[1] - a.at[1] + a.m * a.at[0] - b.m * b.at[0]) / (a.m - b.m);
  return [xm, yOf(a, xm)];
};
/** ∫ from 0 to q of (top − bottom), both linear. */
const between = (top: Lin, bottom: Lin, q0: number, q1: number) => {
  const f = (x: number) => yOf(top, x) - yOf(bottom, x);
  return ((f(q0) + f(q1)) / 2) * (q1 - q0);
};

/** One state's market, from its curves and its control (a price line, or a quota). */
export function stateFacts(plan: StagePlan, d: Lin, s: Lin, control: number): StateFacts {
  const [xe, ye] = meetOf(d, s);
  const eps = 1e-6;
  let binds = false;
  let quantity = xe;
  let price = ye;
  let shortage = 0;
  let surplus = 0;
  if (plan.control === 'ceiling' && control < ye - eps) {
    binds = true;
    price = control;
    quantity = xOf(s, control);
    shortage = xOf(d, control) - quantity;
  } else if (plan.control === 'floor' && control > ye + eps) {
    binds = true;
    price = control;
    quantity = xOf(d, control);
    surplus = xOf(s, control) - quantity;
  } else if (plan.control === 'quota' && control < xe - eps) {
    binds = true;
    quantity = control;
    price = yOf(d, control);
  }
  const zero: Lin = { m: 0, at: [0, price] };
  const cs = between(d, zero, 0, quantity);
  const ps = between(zero, s, 0, quantity);
  const tss = cs + ps;
  const dwl = between(d, s, quantity, xe);
  return { binds, quantity, price, cs, ps, tss, dwl, shortage, surplus };
}

/**
 * Where between the two equilibrium prices a control that binds only before sits (HKDSE 2026
 * P1 Q16): the fraction of the gap that keeps the quantities the question labels furthest apart.
 */
function betweenAt(ticks: Array<(y: number) => number>, lo: number, hi: number, fractions = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]): number {
  if (ticks.length < 2) return 0.5;
  let best = 0.5;
  let bestGap = -1;
  for (const f of fractions) {
    const yy = lo + (hi - lo) * f;
    const xs = ticks.map((t) => t(yy)).sort((a, b) => a - b);
    const gap = Math.min(...xs.slice(1).map((v, i) => v - xs[i]));
    if (gap > bestGap + 1e-6) [best, bestGap] = [f, gap];
  }
  return best;
}

/**
 * A two-state control (k-0587): one figure, a price ceiling, floor or quota with a second state:
 * the control moved (two lines) or a curve shifted under it. The lines go where the plan says
 * the control binds; the deadweight-loss regions are the kept, added and removed parts.
 */
function draftStage(scene: SpecScene, plan: StagePlan, name: (part: string) => BiText | undefined, tick: (part: string) => BiText | null | undefined, layout: Layout, spaced: boolean): Draft {
  const { E, k } = layout;
  const dm = DEMAND_SLOPE[scene.demand] ?? -1;
  const sm = SUPPLY_SLOPE[scene.supply] ?? 1;
  const labour = scene.market === 'labour';
  const { parts: partDefs } = stageParts(plan);
  const has = (id: string) => partDefs.some((p) => p.id === id);
  const { control, shift } = plan;
  const ad = Math.abs(dm);
  // A horizontal shift, each quantity step it makes kept apart (round 3's ceilingDemandRise sizing).
  let h = 0;
  if (shift) {
    // Round 3's sizing for a ceiling at the old price (HKDSE 2023 Q21 looks as it did); elsewhere the
    // shift only keeps the ticks a question labels apart, which the layout search checks.
    h = plan.place === 'old' && plan.stage === 'demandRise' ? Math.min(0.34, (TOP - 0.04 - E[1]) / ad, Math.max(0.2 * k + 0.04, (MIN_GAP * 1.2 * (sm + ad)) / Math.min(sm, ad))) : Math.min(0.3, 0.26 * k + 0.06);
    // Demand after must still meet a quota left of Q₀ under the top of the plot.
    const lead = control === 'quota' && plan.place === 'beyond' ? Math.max((QUOTA[scene.size] ?? 0.18) * k * 0.7, 0.07) : 0;
    if (plan.stage === 'demandRise') h = Math.min(h, (TOP - 0.04 - E[1]) / ad - lead);
    if (h < 0.06) throw new Error('no room for the shift');
  }
  const dx = shift === null ? 0 : plan.stage === 'demandRise' || plan.stage === 'supplyRise' ? h : -h;
  // Each curve kept inside the plot so its shifted copy is too.
  const dLine = clipLine(E, dm, shift === 'demand' && dx < 0 ? h : 0, shift === 'demand' && dx > 0 ? 0.9 - h : 0.9, 0.12, TOP);
  const sLine = clipLine(E, sm, shift === 'supply' && dx < 0 ? h : 0, shift === 'supply' && dx > 0 ? 0.9 - h : 0.9, 0, TOP);
  const d = curve(dLine, name('D'));
  const s = curve(sLine, name('S'));
  const d2 = shift === 'demand' ? shiftOf(d, dx, 0, name('D2')) : null;
  const s2 = shift === 'supply' ? shiftOf(s, dx, 0, name('S2')) : null;
  const D: Lin = { m: dm, at: E };
  const S: Lin = { m: sm, at: E };
  const D2: Lin = d2 ? { m: dm, at: [E[0] + dx, E[1]] } : D;
  const S2: Lin = s2 ? { m: sm, at: [E[0] + dx, E[1]] } : S;
  const E2 = meetOf(D2, S2);
  const curves: DiagramCurve[] = [d, ...(d2 ? [d2] : []), s, ...(s2 ? [s2] : [])];
  const roles: Draft['curveRoles'] = { D: { curve: d, role: 'demand' }, S: { curve: s, role: 'supply' } };
  if (d2) roles.D2 = { curve: d2, role: 'demand' };
  if (s2) roles.S2 = { curve: s2, role: 'supply' };
  const levels: Draft['levels'] = {};
  const marks: Record<string, DiagramPointMark> = {};
  const points: DiagramPointMark[] = [];
  const all = () => [...curves, ...points];
  const lettering = scene.areas.length > 0 || (scene.points ?? []).length > 0;

  // The control in each state: a price (ceiling, floor) or a quantity (quota).
  let c1: number;
  let c2: number;
  if (control !== 'quota') {
    const sign = control === 'ceiling' ? -1 : 1;
    // The layout search tries several sizes; ticks only the question labels must stand apart (layoutOk).
    // Two control lines: the quantities a question labels on the steeper curve need the larger step.
    const labelled = (ids: string[]) => ids.some((id) => Boolean(tick(id)));
    const need = shift === null && spaced ? 0.056 * Math.max(labelled(['Qs1', 'Qs2']) ? sm : 0, labelled(['Qd1', 'Qd2']) ? ad : 0) : 0;
    // Two binding lines with brackets: room for the upper bracket's words between them.
    const room = shift === null && scene.gap && plan.binds === 'both' && spaced ? 0.12 : 0;
    const c = Math.max((CONTROL[scene.size] ?? 0.2) * k * (shift === null ? 0.6 : 0.8), 0.05, need, room);
    const P0 = E[1];
    if (shift === null) {
      const near = (bind: boolean, far: boolean) => P0 + (bind ? sign : -sign) * (far ? 2 * c : c);
      if (plan.binds === 'both') [c1, c2] = plan.tighten ? [near(true, false), near(true, true)] : [near(true, true), near(true, false)];
      else if (plan.binds === 'neither') [c1, c2] = plan.tighten ? [near(false, true), near(false, false)] : [near(false, false), near(false, true)];
      else [c1, c2] = plan.binds === 'after' ? [near(false, false), near(true, false)] : [near(true, false), near(false, false)];
    } else {
      const Pn = E2[1];
      // The quantities the question labels, as functions of the control's price.
      const tickAt: Record<string, (yy: number) => number> = { Q0: () => E[0], Qn: () => E2[0], Qd1: (yy) => xOf(D, yy), Qs1: (yy) => xOf(S, yy), Qd2: (yy) => xOf(D2, yy), Qs2: (yy) => xOf(S2, yy) };
      const betweenTicks = Object.entries(tickAt)
        .filter(([id]) => has(id) && Boolean(tick(id)))
        .map(([, f]) => f);
      const lo = Math.min(P0, Pn);
      const hi = Math.max(P0, Pn);
      const y =
        plan.place === 'old' ? P0 : plan.place === 'between' ? lo + (hi - lo) * betweenAt(betweenTicks, lo, hi) : plan.place === 'beyond' ? (sign < 0 ? lo - c : hi + c) : sign < 0 ? hi + c : lo - c;
      c1 = c2 = y;
    }
    for (const yy of [c1, c2]) if (yy < 0.08 || yy > 0.86) throw new Error('control off the plot');
  } else {
    const q = Math.max((QUOTA[scene.size] ?? 0.18) * k * 0.7, 0.07);
    const Q0 = E[0];
    if (shift === null) [c1, c2] = plan.tighten ? [Q0 - q, Q0 - 2 * q] : [Q0 - 2 * q, Q0 - q];
    else {
      const Qn = E2[0];
      const lo = Math.min(Q0, Qn);
      const hi = Math.max(Q0, Qn);
      const quotaTicks = [tick('Qq1') ? (xx: number) => xx : null, tick('Qn') ? () => Qn : null, has('Q0') && tick('Q0') ? () => Q0 : null].filter((f): f is (xx: number) => number => Boolean(f));
      const x = plan.place === 'old' ? Q0 : plan.place === 'between' ? lo + (hi - lo) * betweenAt(quotaTicks, lo, hi, [0.5, 0.4, 0.6, 0.35, 0.65]) /* the loss before (quota to Q₀) keeps some width */ : lo - q;
      c1 = c2 = x;
    }
    // Each quota must meet every demand curve (a steep one starts right of the y-axis).
    const dStart = Math.max(...[dLine, ...(d2 ? [dLine.map(([px, py]) => [px + dx, py] as Pair)] : [])].map((l) => l[0][0]));
    for (const xx of [c1, c2]) if (xx < Math.max(0.1, dStart + 0.01)) throw new Error('quota off the plot');
  }

  // Control lines (dashed, as HKDSE prints two price lines) and kinked quota supplies.
  let l1: DiagramCurve | null = null;
  let l2: DiagramCurve | null = null;
  if (control !== 'quota') {
    // Across the plot for two lines; to just past the last crossing for one line under a shift.
    const rightOf = (yy: number) => Math.max(...[D, S, D2, S2].map((l) => xOf(l, yy)));
    const right = shift === null ? 0.9 : Math.min(0.9, rightOf(c1) + 0.12);
    const mk = (yy: number, part: string) => derived({ kind: 'level', y: yy, from: 0, to: right }, [], name(part) ?? NO_NAME, { labelAt: 'start', weight: 0.8, stroke: 'dashed' });
    l1 = mk(c1, 'Pc1');
    curves.push(l1);
    roles.Pc1 = { curve: l1, role: 'horizontal' };
    levels.Pc1 = { vertical: false, at: c1 };
    if (shift === null) {
      l2 = mk(c2, 'Pc2');
      curves.push(l2);
      roles.Pc2 = { curve: l2, role: 'horizontal' };
      levels.Pc2 = { vertical: false, at: c2 };
    }
  } else {
    const kinked = (qx: number, part: string) => {
      const [[x0, y0], [x1, y1]] = sLine;
      const sy = y0 + ((qx - x0) * (y1 - y0)) / (x1 - x0);
      return curve([[x0, y0], [qx, sy], [qx, TOP]], name(part));
    };
    const q1 = kinked(c1, 'S1');
    curves.push(q1);
    roles.S1 = { curve: q1, role: 'supply' };
    levels.Qq1 = { vertical: true, at: c1 };
    if (shift === null) {
      const q2 = kinked(c2, 'S2');
      curves.push(q2);
      roles.S2 = { curve: q2, role: 'supply' };
      levels.Qq2 = { vertical: true, at: c2 };
    }
  }

  // The equilibria.
  const atOld = plan.place === 'old';
  const e0 = tickPoint(cross(d, s), all(), control === 'quota' && atOld ? { x: tick('Qq1'), y: tick('P0') } : { x: tick('Q0'), y: has('P0') ? tick('P0') : undefined });
  points.push(e0);
  marks.Q0 = e0;
  if (has('P0')) marks.P0 = e0;
  if (control === 'quota' && atOld) marks.Qq1 = e0;
  let en: DiagramPointMark | null = null;
  if (d2 || s2) {
    en = tickPoint(cross(d2 ?? d, s2 ?? s), all(), { x: tick('Qn'), y: tick('Pn') });
    points.push(en);
    marks.Qn = en;
    marks.Pn = en;
  }
  // Where each curve meets a control: the quantities a student reads.
  const reading = (c: DiagramCurve, line: DiagramCurve, part: string) => {
    const p = tickPoint(cross(c, line), all(), { x: tick(part) });
    points.push(p);
    marks[part] = p;
    return p;
  };
  const qp: Record<string, DiagramPointMark> = {};
  if (control !== 'quota') {
    if (has('Qd1')) qp.Qd1 = reading(d, l1!, 'Qd1');
    if (has('Qs1')) qp.Qs1 = reading(s, l1!, 'Qs1');
    if (shift === null) {
      qp.Qd2 = reading(d, l2!, 'Qd2');
      qp.Qs2 = reading(s, l2!, 'Qs2');
    } else if (shift === 'demand') qp.Qd2 = reading(d2!, l1!, 'Qd2');
    else qp.Qs2 = reading(s2!, l1!, 'Qs2');
    if (atOld) {
      qp.Qd1 = e0;
      qp.Qs1 = e0;
    }
  } else {
    // The price with each quota, on demand directly above it.
    if (!atOld) {
      const p1 = tickPoint({ on: d.id, x: { x: c1, y: 0 } }, all(), { x: tick('Qq1'), y: tick('Pq1') });
      points.push(p1);
      marks.Qq1 = p1;
      marks.Pq1 = p1;
      qp.Qq1 = p1;
    } else qp.Qq1 = e0;
    if (shift === null) {
      const p2 = tickPoint({ on: d.id, x: { x: c2, y: 0 } }, all(), { x: tick('Qq2'), y: tick('Pq2') });
      points.push(p2);
      marks.Qq2 = p2;
      marks.Pq2 = p2;
      qp.Qq2 = p2;
    } else if (plan.b2) {
      const p2 = tickPoint({ on: d2!.id, x: { x: c1, y: 0 } }, all(), { x: plan.stage === 'demandRise' ? null : undefined, y: tick('Pq2') });
      points.push(p2);
      marks.Pq2 = p2;
      qp.Pq2 = p2;
    }
  }

  // Each state's market: curves, the point its quantity is read at, its equilibrium.
  const traded = (state: 1 | 2): DiagramPointMark => {
    const b = state === 1 ? plan.b1 : plan.b2;
    if (!b) return state === 1 ? e0 : (en ?? e0);
    if (control === 'quota') return state === 1 || shift === null ? qp[state === 1 ? 'Qq1' : 'Qq2'] : qp.Qq1;
    const sup = state === 1 ? qp.Qs1 : (qp.Qs2 ?? qp.Qs1);
    const dem = state === 1 ? qp.Qd1 : (qp.Qd2 ?? qp.Qd1);
    return control === 'ceiling' ? sup : dem;
  };
  const top1 = d;
  const top2 = d2 ?? d;
  const bot1 = s;
  const bot2 = s2 ?? s;
  const eq1 = e0;
  const eq2 = en ?? e0;
  const t1 = traded(1);
  const t2 = traded(2);

  // Under a ceiling the loss's left side runs from the quantity traded on S up to demand: a dashed line there when areas are lettered.
  if (control === 'ceiling' && lettering) {
    for (const [b, t] of [
      [plan.b1, t1],
      [plan.b2, t2],
    ] as const) {
      if (!b) continue;
      const tops = [top1, top2].map((c) => {
        try {
          return { c, y: resolveIn(scratchOf([...all(), t]), { on: c.id, x: at(t) }).y };
        } catch {
          return null;
        }
      });
      const best = tops.filter((v): v is { c: DiagramCurve; y: number } => Boolean(v)).sort((a, b2) => b2.y - a.y)[0];
      if (!best || best.y < t.at.y + 0.02) continue;
      if (curves.some((c) => c.derive?.kind === 'vertical' && Math.abs((c.points[0]?.x ?? -1) - t.at.x) < 1e-6)) continue;
      curves.push(derived({ kind: 'vertical', x: at(t), from: t.at.y, to: best.y }, [...all(), t], undefined, { stroke: 'dashed', weight: 0.8 }));
    }
  }

  // The deadweight-loss regions: kept, added, removed.
  const regions: Record<string, Band> = {};
  const ids = stageRegionIds(plan);
  if (ids.length === 1) {
    const [top, bot, t, e] = ids[0] === 'dwlRemoved' ? [top1, bot1, t1, eq1] : [top2, bot2, t2, eq2];
    regions[ids[0]] = band([on(top), on(bot)], at(t), at(e));
  } else if (ids.length === 2) {
    const grow = grows(plan);
    if (shift === null) {
      // One market, two controls: the looser one's loss is inside the tighter one's.
      const [tight, loose] = plan.tighten ? [t2, t1] : [t1, t2];
      regions.dwlKept = band([on(d), on(s)], at(loose), at(e0));
      regions[grow ? 'dwlAdded' : 'dwlRemoved'] = band([on(d), on(s)], at(tight), at(loose));
    } else if (shift === 'demand') {
      // The quantity traded stays (on S, or at the quota); the new demand moves the loss's far corner.
      const t = t1;
      if (grow) {
        regions.dwlKept = band([on(d), on(s)], at(t), at(e0));
        regions.dwlAdded = band([on(s), on(d2!)], at(t), at(en!), on(d));
      } else {
        regions.dwlKept = band([on(d2!), on(s)], at(t), at(en!));
        regions.dwlRemoved = band([on(s), on(d)], at(t), at(e0), on(d2!));
      }
    } else {
      // A floor and a supply shift: the quantity traded stays on D.
      const t = t1;
      if (grow) {
        regions.dwlKept = band([on(d), on(s)], at(t), at(e0));
        regions.dwlAdded = band([on(d), on(s2!)], at(t), at(en!), on(s));
      } else {
        regions.dwlKept = band([on(d), on(s2!)], at(t), at(en!));
        regions.dwlRemoved = band([on(d), on(s)], at(t), at(e0), on(s2!));
      }
    }
  }

  // The shortage or surplus brackets (a model answer): one per state the control binds in.
  const spans: DiagramSpan[] = [];
  if (scene.gap && control !== 'quota') {
    const kind = control === 'ceiling' ? 'shortage' : labour ? 'unemployment' : 'surplus';
    const states = ([1, 2] as const).filter((i) => (i === 1 ? plan.b1 : plan.b2));
    const base = control === 'ceiling' ? -0.05 : 0.04;
    states.forEach((i, n) => {
      const sup = i === 1 ? qp.Qs1 : (qp.Qs2 ?? qp.Qs1);
      const dem = i === 1 ? qp.Qd1 : (qp.Qd2 ?? qp.Qd1);
      const [from, to] = control === 'ceiling' ? [sup, dem] : [dem, sup];
      const words = states.length === 2 ? GAP_WORDS_TWO[kind][n] : GAP_WORDS[kind];
      // Two brackets on one line (a curve shift): the second sits further off it.
      const sameLine = states.length === 2 && shift !== null && n === 1;
      spans.push(span(at(from), at(to), 'bracket', { offset: sameLine ? base * 2.6 : base, label: phraseOf(words) }));
    });
  }

  const before = stateFacts(plan, D, S, c1);
  const after = stateFacts(plan, D2, S2, c2);
  const arrows: DiagramArrow[] = [];
  return {
    curves,
    points,
    arrows,
    ...(d2 || s2 ? { shifts: [{ source: d2 ? d : s, copy: (d2 ?? s2)!, by: { x: dx, y: 0 } }] } : {}),
    spans,
    x: phraseOf(labour ? AX.labour : AX.quantity),
    y: phraseOf(labour ? AX.wage : AX.price),
    regions,
    curveRoles: roles,
    levels,
    marks,
    stage: { plan, before, after },
  };
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

const tickKeyOf = (label: string) => label.replace(/[_{}\s]/g, '').toUpperCase();

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
  let scene = spec.scene;
  const def = scene ? sceneDefOf(scene) : undefined;
  if (!scene || !def) {
    error('scene.type', `"${scene?.type ?? ''}" is not a scene type: use one of the scene list, or kind "curves".`);
    return empty();
  }
  const plan = stagePlan(scene);
  if (plan && 'error' in plan) {
    error('scene.stage', plan.error);
    return empty();
  }
  const monoError = monopolyError(scene);
  if (monoError) {
    error('scene.stage', monoError);
    return empty();
  }
  if (scene.type === 'ppfTrade') {
    const problems = scene.trade ? tradeNumbers(scene.trade).errors : ['A trade figure needs scene.trade: the world price and each country\'s PPF.'];
    if ((scene.stage ?? 'none') !== 'none') problems.push(`A trade figure takes stage "none" (growth is trade.grow), not "${scene.stage}".`);
    if (problems.length) {
      for (const p of problems) error('scene.trade', p);
      return empty();
    }
  }
  // A part this figure does not draw: a label on one that sits on another part moves there; an empty one is nothing to print (k-0587).
  const aliases = isPlan(plan) ? stageAliases(plan) : {};
  const sceneLabelsIn: typeof scene.labels = [];
  for (const l of scene.labels) {
    const part = l.part.trim();
    if (def.parts.some((p) => p.id === part)) sceneLabelsIn.push(l);
    else if (aliases[part] && l.label.trim()) {
      const other = scene.labels.find((k) => k.part.trim() === aliases[part] && k.label.trim());
      if (other && tickKeyOf(other.label) !== tickKeyOf(l.label)) error('scene.part', `${part} and ${aliases[part]} are one point on this figure, but they are labelled ${l.label} and ${other.label}: give it one label.`);
      else if (!other) sceneLabelsIn.push({ part: aliases[part], label: l.label });
    } else if (l.label.trim()) error('scene.part', `Scene ${def.type}${isPlan(plan) ? ` (stage ${plan.stage}, binds ${plan.binds})` : ''} has no part "${l.part}". Its parts are ${def.parts.map((p) => p.id).join(', ')}.`);
  }
  scene = { ...scene, labels: sceneLabelsIn };
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
  const sceneNow = scene;
  const tries: Array<() => Draft> =
    scene.type === 'monopoly'
      ? MONO_LAYOUTS.map((l) => () => draftMonopoly(sceneNow, name, tick, l))
      : scene.type === 'ppfTrade'
        ? [() => draftTrade(sceneNow, name, tick)]
        : LAYOUTS.map((l) => () => draft(sceneNow, name, tick, l));
  for (const attempt of tries) {
    try {
      const candidate = attempt();
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
    issues.push({ level: 'look', code: 'scene.layout', text: `Scene ${def.type}${plan ? ` (stage ${plan.stage}, binds ${plan.binds})` : ''} with demand ${scene.demand} and supply ${scene.supply} is crowded: some ticks or regions are close.` });
  }
  if (!built) {
    error('scene.build', `Scene ${def.type} could not be drawn with these choices (${plan ? `stage ${plan.stage}, binds ${plan.binds}, ` : ''}demand ${scene.demand}, supply ${scene.supply}, size ${scene.size}).`);
    return empty();
  }

  // Areas: each region or measure the model letters, one pattern per entry.
  const regionLabels = new Map<string, string>();
  const plans: Array<{ id: string; regions: string[]; label?: BiText; pattern: DiagramAreaPattern; text: string; areas: DiagramArea[] }> = [];
  /** Region → whether the area covering it carries a letter. */
  const used = new Map<string, boolean>();
  const isLetter = (text: string) => /^[A-Za-z]$/.test(text.trim());
  scene.areas.forEach((a, i) => {
    const id = a.region.trim();
    const regions = regionsOf(def, id);
    if (!regions.length) {
      error('scene.region', `Scene ${def.type} has no region or area "${id}". Regions: ${def.regions.map((r) => r.id).join(', ')}; areas: ${Object.keys(def.measures).join(', ')}.`);
      return;
    }
    const words = def.regions.find((r) => r.id === id)?.words ?? def.measureWords[id as keyof SceneDef['measureWords']] ?? (regions.length === 1 ? def.regions.find((r) => r.id === regions[0])?.words : null) ?? null;
    const given = phrase(a.label);
    const label = given ?? (words ? phrase(words) : undefined);
    if (!label) {
      error('scene.label', `Area "${id}" needs a label (a letter such as "A", or words): it has no standard name.`);
      return;
    }
    const text = plainOf(label) || plainOf(label, 'zh');
    // Two areas in words may overlap (k-0589: a model answer's original and new deadweight loss, hatched both ways); a letter names one area only.
    const overlap = regions.filter((r) => used.has(r));
    if (overlap.length && (isLetter(text) || overlap.some((r) => used.get(r)))) {
      error('scene.overlap', `"${id}" covers ${overlap.join(', ')}, which another lettered area already covers: each region carries one label.`);
      return;
    }
    regions.forEach((r) => {
      if (!used.has(r)) {
        used.set(r, isLetter(text));
        regionLabels.set(r, text);
      }
    });
    plans.push({ id, regions, label, pattern: PATTERNS[i % PATTERNS.length], text, areas: [] });
  });
  /** Regions two worded areas share: their labels go on a part of their own. */
  const shared = new Set(plans.flatMap((p) => p.regions).filter((r, i, all) => all.indexOf(r) !== i));

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
          plan.areas = plan.regions.map((r) => {
            const b = built.regions[r];
            const area: DiagramArea = { id: newId(), band: { edges: b.edges, from: b.from, to: b.to, ...(b.cap ? { cap: b.cap } : {}) }, fill: 'hatch', pattern: plan.pattern };
            if (!regionAreas.has(r)) regionAreas.set(r, area);
            return area;
          });
          areas.push(...plan.areas);
        }
        return areas;
      },
    );
  } catch {
    error('scene.resolve', `Scene ${def.type} could not be resolved.`);
    return empty();
  }

  // Each region must have area; the label goes on the largest of its plan (of its own regions, when two plans share some).
  for (const plan of plans) {
    const sized = plan.regions.map((r, i) => {
      const area = plan.areas[i];
      const poly = areaPolygon(diagram, area);
      return { r, area, size: poly ? polygonArea(poly) : 0, poly };
    });
    for (const s of sized) {
      if (s.size < 1e-4) error('scene.empty', `Region ${s.r} has no area with these choices.`);
    }
    const own = sized.filter((s) => !shared.has(s.r) && s.size >= 1e-4);
    const largest = (own.length ? own : sized).reduce((a, b) => (b.size > a.size ? b : a));
    if (plan.label) largest.area.label = plan.label;
  }
  // A trade figure's axes read in the goods' units (k-0589).
  if (built.axisMax) diagram = { ...diagram, x: { ...diagram.x, max: Math.round(built.axisMax.x * 1000) / 1000 }, y: { ...diagram.y, max: Math.round(built.axisMax.y * 1000) / 1000 } };
  // `finish` copied the areas: write the labels into the diagram's own.
  const planAreas = plans.flatMap((p) => p.areas);
  diagram = { ...diagram, areas: (diagram.areas ?? []).map((a) => planAreas.find((r) => r.id === a.id) ?? a) };
  // A figure the student completes (k-0589): what the printed figure does not give is the answer layer.
  const given = (scene.given ?? []).map((g) => g.trim()).filter(Boolean);
  if (given.length) {
    const unknown = given.filter((g) => !def.parts.some((p) => p.id === g) && !def.regions.some((r) => r.id === g) && !def.measures[g as keyof SceneDef['measures']]);
    if (unknown.length) error('scene.given', `"given" names ${unknown.join(', ')}, which scene ${def.type} does not have. Its parts are ${def.parts.map((p) => p.id).join(', ')}.`);
    if (spec.placement !== 'question') error('scene.given', 'A figure the student completes ("given" listed) is printed with the question: set placement "question". The model answer is drawn on it as its answer layer.');
    // A number on the axis goes with the curve or point it belongs to (a given PPF prints its intercepts).
    const expanded = new Set(given);
    for (const p of def.parts) if (p.of && expanded.has(p.of)) expanded.add(p.id);
    diagram = answerLayerOf(diagram, built, expanded, plans.filter((p) => !given.includes(p.id)).flatMap((p) => p.areas.map((a) => a.id)), lettered);
  }
  // Each letter beside its own point, clear of every line, arrow, dot and label.
  const toPlace = new Set([...letteredIds.values(), ...(built.named ?? [])]);
  if (toPlace.size) diagram = placePointLabels(diagram, toPlace);

  // Every region's outline, drawn or not: a corner-named area is checked against them.
  const regionPolygons = new Map<string, Array<{ x: number; y: number }>>();
  for (const [id, b] of Object.entries(built.regions)) {
    const poly = areaPolygon(diagram, { id: 'probe', band: { edges: b.edges, from: b.from, to: b.to, ...(b.cap ? { cap: b.cap } : {}) } });
    if (poly) regionPolygons.set(id, poly);
  }

  return { diagram, issues, curveIds, roles, levels, regionAreas, regionLabels, partLabels: labels, pointLabels, pointPlaces, regionPolygons, ...(built.stage ? { stage: built.stage } : {}), ...(built.trade ? { trade: built.trade } : {}) };
}

/**
 * The answer layer of a figure the student completes (k-0589): every curve whose part the printed
 * figure does not give, every point carrying a tick it does not give, the shift arrow of an answer
 * curve, the brackets and the areas (unless given) are flagged `answer` (`model/diagramAnswers.ts`):
 * drawn in red in the teacher's copy and the marking scheme, left out of the students' paper with
 * everything that leans on them.
 */
function answerLayerOf(diagram: Diagram, built: Draft, given: ReadonlySet<string>, answerAreas: readonly string[], lettered: readonly DiagramPointMark[]): Diagram {
  const partOf = new Map(Object.entries(built.curveRoles).map(([part, { curve: c }]) => [c.id, part]));
  const allGiven = [...partOf.values()].every((p) => given.has(p));
  const answerCurves = new Set(diagram.curves.filter((c) => (partOf.has(c.id) ? !given.has(partOf.get(c.id)!) : !allGiven)).map((c) => c.id));
  const carried = new Map<string, string[]>();
  for (const [part, mark] of Object.entries(built.marks)) carried.set(mark.id, [...(carried.get(mark.id) ?? []), part]);
  const letteredIds = new Set(lettered.map((l) => l.id));
  const refs = (p: DiagramPointMark): string[] => (p.anchor ? anchorReferences(p.anchor) : []);
  const answerPoint = (p: DiagramPointMark) => {
    const parts = carried.get(p.id) ?? [];
    if (parts.length) return parts.some((part) => !given.has(part)) || refs(p).some((id) => answerCurves.has(id));
    return letteredIds.has(p.id) ? refs(p).some((id) => answerCurves.has(id)) : !allGiven;
  };
  const flag = <T extends object>(x: T, on: boolean): T => (on ? { ...x, answer: true as const } : x);
  return {
    ...diagram,
    curves: diagram.curves.map((c) => flag(c, answerCurves.has(c.id))),
    points: diagram.points.map((p) => flag(p, answerPoint(p))),
    arrows: diagram.arrows.map((a) => flag(a, a.follows ? answerCurves.has(a.follows) : !allGiven)),
    ...(diagram.spans ? { spans: diagram.spans.map((sp) => flag(sp, true)) } : {}),
    ...(diagram.areas ? { areas: diagram.areas.map((a) => flag(a, answerAreas.includes(a.id))) } : {}),
  };
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
