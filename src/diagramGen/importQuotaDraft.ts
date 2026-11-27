import type { DiagramAnchorRef, DiagramArrow, DiagramCurve, DiagramPointMark, DiagramSpan } from '@/model/diagram';
import { importQuotaPoints } from '@/model/diagramAnchors';
import { arrow, cross, curve, derived, priceLine, shiftOf, span, type Pair } from '@/model/diagramTemplateKit';
import type { BiText } from '@/model/types';
import { drawn, freeImports, isImportQuotaStage, quotaChanges, quotaPrice, quotaStates, quotaVariants, QUOTA_WORDS, type QuotaMarket } from './importQuota';
import { AX, at, band, level, lineAt, on, phraseOf, tickPoint, TOP, underFromAxis, type Band, type Draft } from './sceneKit';
import { plainOf } from './text';
import type { Slope, SpecScene } from './types';

/**
 * Draws the import quota scene (k-0589): D and the domestic S through the no-trade equilibrium,
 * the world price Pw below it, S with the quota as the editor's `importQuota` relation on S at Pw
 * (so a drag of S, Pw or the step keeps the kink), the price with the quota where D meets it, and
 * every quantity anchored to its crossing. The quota rent and the deadweight loss are bands
 * between the lines, as the tariff scene draws them.
 */

export interface QuotaLayout {
  E: Pair;
  /** How much of the room below E the world price uses. */
  k: number;
  /** Ticks closer than a teacher reads easily: tried only when no spaced layout fits (the figure is then called crowded). */
  tight?: boolean;
}
const SPACED: QuotaLayout[] = [0.45, 0.4, 0.5, 0.36, 0.58, 0.3, 0.66].flatMap((x) => [0.62, 0.56, 0.68, 0.5].flatMap((y) => [1, 0.85, 0.7].map((k) => ({ E: [x, y] as Pair, k }))));
export const QUOTA_LAYOUTS: QuotaLayout[] = [...SPACED, ...SPACED.filter((l) => l.k === 1).map((l) => ({ ...l, tight: true }))];

const DEMAND_SLOPE: Record<Slope, number> = { normal: -1, steep: -2.2, flat: -0.42 };
const SUPPLY_SLOPE: Record<Slope, number> = { normal: 1, steep: 2.2, flat: 0.42 };
/** The quota as a share of the free-trade imports: a large effect is a tight quota. */
const SHARE: Record<SpecScene['size'], number> = { small: 0.62, normal: 0.5, large: 0.38 };
/** A quota raised or cut changes by this share of the free-trade imports. */
const CHANGE = 0.25;

const NO_NAME: BiText = { en: [], zh: [] };

/** The numbers a layout draws: the market, the quota before and after, the demand shift. */
export function quotaModel(scene: SpecScene, layout: QuotaLayout): { m: QuotaMarket; q: number; q2: number; h: number; sEnd: number } {
  const stage = isImportQuotaStage(scene.stage) ? scene.stage : 'none';
  const lines = stage === 'raised' || stage === 'lowered';
  const demand = stage === 'demandRise' || stage === 'demandFall';
  const dm = DEMAND_SLOPE[scene.demand] ?? -1;
  const sm = SUPPLY_SLOPE[scene.supply] ?? 1;
  const ad = Math.abs(dm);
  const { E, k } = layout;
  /** Quantity ticks and price ticks at least this far apart. */
  const gapQ = layout.tight ? 0.035 : 0.065;
  const gapP = layout.tight ? 0.04 : 0.055;
  // A demand shift moves the price by dP = h·|d|·s/(|d|+s), and both ends of the quota by dP/s: each clear of the last.
  const dP = Math.max(gapQ * sm, gapP);
  const h = demand ? (dP * (ad + sm)) / (ad * sm) : 0;
  // Pw below E: Q at Pw on S and on D inside the plot (D₂ too after a rise), the price ticks apart from the axis.
  const lead = stage === 'demandRise' ? h : 0;
  const a = Math.min(0.36, (E[0] - 0.06) * sm, (0.86 - lead - E[0]) * ad, E[1] - 0.14) * k;
  if (a < 0.08) throw new Error('no room below E');
  const m: QuotaMarket = { d: { m: dm, at: E }, s: { m: sm, at: E }, pw: E[1] - a };
  const m0 = freeImports(m);
  // The quota as a share f of the free-trade imports: the price with it is (1 − f)·a above Pw.
  const share = SHARE[scene.size] ?? 0.5;
  const lo = gapQ / m0;
  const clamp = (f: number, hi: number) => {
    const out = Math.min(Math.max(f, lo), hi);
    if (out < lo - 1e-9 || out > hi + 1e-9) throw new Error('no room for the quota');
    return out;
  };
  let q: number;
  let q2: number;
  if (lines) {
    // A change in the share of c moves the price by c·a, the quantities by c·a over each slope.
    const c = Math.max(CHANGE, Math.max(gapQ * Math.max(ad, sm), gapP) / a);
    const small = clamp(share - c / 2, 1 - gapP / a - c);
    [q, q2] = stage === 'raised' ? [small * m0, (small + c) * m0] : [(small + c) * m0, small * m0];
  } else if (demand) {
    // A fall keeps the price above Pw after it (the quota still binds).
    q = q2 = clamp(share, 1 - (stage === 'demandFall' ? dP + gapP : gapP) / a) * m0;
  } else {
    // Every quantity apart: the quota itself (Qs to Qd), and the price rise over the steeper slope (Qsw to Qs, Qd to Qdw).
    q = q2 = clamp(share, 1 - Math.max(gapQ * Math.max(ad, sm), gapP) / a) * m0;
  }
  // S reaches the highest price drawn (its moved copies past it are trimmed at the plot's edge).
  const top = Math.max(quotaPrice(m, Math.min(q, q2)), stage === 'demandRise' ? quotaPrice({ ...m, d: { ...m.d, at: [E[0] + h, E[1]] } }, q) : 0);
  const reach = E[0] + (top - E[1]) / sm + 0.08;
  return { m, q, q2, h, sEnd: Math.min(0.9, Math.max(0.9 - Math.max(q, q2), reach)) };
}

export function draftImportQuota(scene: SpecScene, name: (part: string) => BiText | undefined, tick: (part: string) => BiText | null | undefined, layout: QuotaLayout): Draft {
  const stage = isImportQuotaStage(scene.stage) ? scene.stage : 'none';
  const lines = stage === 'lowered' || stage === 'raised';
  const demand = stage === 'demandRise' || stage === 'demandFall';
  const hasS = drawn(scene, 'S');
  const hasSq = drawn(scene, 'Sq');
  const hasPw = drawn(scene, 'Pw');
  const { m, q, q2, h, sEnd } = quotaModel(scene, layout);
  const { E } = layout;
  const pwY = m.pw;
  const dx = stage === 'demandRise' ? h : stage === 'demandFall' ? -h : 0;

  // D from the price axis; with a demand rise it stops short so D₂ stays on the plot.
  const d = curve(lineAt(E, m.d.m, TOP, 0.12, 0.9 - Math.max(0, dx)), name('D'));
  // S up to the top, short of the right edge by the quota where it can be (its moved copy above Pw then stays on the plot).
  const sPts = lineAt(E, m.s.m, TOP, 0.02, sEnd);
  const s = curve(sPts, name('S') ?? NO_NAME);
  const pw = priceLine(pwY, name('Pw') ?? NO_NAME);
  const curves: DiagramCurve[] = [d];
  if (hasS) curves.push(s);
  if (hasPw) curves.push(pw);
  const sources = [s, pw];
  /** S with a quota: the relation on S at Pw when S is drawn; its points alone when the figure has no separate S (DSE2017). */
  const kinked = (by: number, label: BiText | undefined): DiagramCurve => {
    if (hasS) return derived({ kind: 'importQuota', of: s.id, price: hasPw ? cross(s, pw) : pwY, by }, sources, label ?? NO_NAME);
    const pts = importQuotaPoints(s.points, pwY, by);
    if (!pts) throw new Error('quota step off S');
    return curve(pts.map((p): Pair => [p.x, p.y]), label);
  };
  // The kinked supply is always worked out (it fixes the price); drawn only when the figure has it.
  const sq = kinked(q, name('Sq'));
  if (hasSq) curves.push(sq);
  const roles: Draft['curveRoles'] = { D: { curve: d, role: 'demand' } };
  if (hasS) roles.S = { curve: s, role: 'supply' };
  if (hasSq) roles.Sq = { curve: sq, role: 'supply' };
  if (hasPw) roles.Pw = { curve: pw, role: 'horizontal' };
  let sq2: DiagramCurve | null = null;
  let d2: DiagramCurve | null = null;
  if (lines) {
    sq2 = kinked(q2, name('Sq2'));
    if (hasSq) {
      curves.push(sq2);
      roles.Sq2 = { curve: sq2, role: 'supply' };
    }
  }
  if (demand) {
    d2 = shiftOf(d, dx, 0, name('D2'));
    curves.push(d2);
    roles.D2 = { curve: d2, role: 'demand' };
  }
  const points: DiagramPointMark[] = [];
  // The points resolve against every line, drawn or not (the kinked supply fixes the price even when the brace form leaves it off).
  const all = () => [d, s, pw, sq, ...(sq2 ? [sq2] : []), ...(d2 ? [d2] : []), ...points];
  const marks: Record<string, DiagramPointMark> = {};
  const add = (ref: DiagramAnchorRef, ticks: { x?: BiText | null; y?: BiText | null }, ids: string[]) => {
    const p = tickPoint(ref, all(), ticks);
    points.push(p);
    for (const id of ids) marks[id] = p;
    return p;
  };
  const yRef = (v: number): DiagramAnchorRef => ({ x: 0, y: v });
  const pwRef = (c: DiagramCurve): DiagramAnchorRef => (hasPw ? cross(c, pw) : { on: c.id, y: yRef(pwY) });

  // With the quota: where D meets the kinked supply; S at that price.
  const eq = add(cross(d, sq), { x: tick('Qd'), y: tick('Pq') }, ['Qd', 'Pq']);
  const qs = hasS ? add({ on: s.id, y: at(eq) }, { x: tick('Qs') }, ['Qs']) : null;
  // Free trade: S and D at the world price.
  const qsw = hasPw || hasSq ? add(hasS ? pwRef(s) : { on: sq.id, y: yRef(pwY) }, { x: tick('Qsw') }, ['Qsw']) : null;
  const qdw = hasPw || hasSq ? add(pwRef(d), { x: tick('Qdw') }, ['Qdw']) : null;
  if (hasS && (tick('Q0') !== undefined || tick('P0') !== undefined)) add(cross(d, s), { x: tick('Q0'), y: tick('P0') }, ['Q0', 'P0']);
  let eq2: DiagramPointMark | null = null;
  let qs2: DiagramPointMark | null = null;
  if (sq2 || d2) {
    eq2 = add(sq2 ? cross(d, sq2) : cross(d2!, sq), { x: tick('Qd2'), y: tick('Pq2') }, ['Qd2', 'Pq2']);
    if (hasS) qs2 = add({ on: s.id, y: at(eq2) }, { x: tick('Qs2') }, ['Qs2']);
  }
  // The price with the quota is above Pw (the quota binds): a layout where it does not is not this figure.
  const apart = layout.tight ? 0.035 : 0.05;
  if (eq.at.y < pwY + apart || (eq2 && eq2.at.y < pwY + apart)) throw new Error('quota does not bind');
  if (eq2 && Math.abs(eq2.at.y - eq.at.y) < apart) throw new Error('the two prices too close');

  // Brackets: the quota between S and D at each price (above the line), the flat step along Pw (below it).
  const spans: DiagramSpan[] = [];
  const bracketLabel = (part: string): BiText | null => {
    const label = name(part);
    if (!label) return null;
    const text = plainOf(label).trim();
    return /^(?:import\s+)?quota$|^進口配額$/i.test(text) ? phraseOf(QUOTA_WORDS.quota) : label;
  };
  const brace = bracketLabel('quota');
  if (brace && qs) spans.push(span(at(qs), at(eq), 'bracket', { offset: 0.04, label: brace }));
  const brace2 = bracketLabel('quota2');
  if (brace2 && qs2 && eq2) spans.push(span(at(qs2), at(eq2), 'bracket', { offset: 0.04, label: brace2 }));
  const step = bracketLabel('step');
  if (step && hasSq && qsw) spans.push(span(at(qsw), { on: sq.id, y: at(qsw), last: true }, 'doubleArrow', { offset: -0.04, label: step }));

  // A quota raised or cut: an arrow from S₁'s moved part to S₂'s, above both prices.
  const arrows: DiagramArrow[] = [];
  if (sq2 && hasSq) {
    const top = Math.max(eq.at.y, eq2!.at.y);
    // Just above the higher crossing (D is left of both there), clear of the names at the tops.
    const yA = Math.min(TOP - 0.16, top + 0.1);
    const xS = m.s.at[0] + (yA - m.s.at[1]) / m.s.m;
    const [x1, x2] = [xS + q, xS + q2];
    const inset = 0.2 * (x2 - x1);
    arrows.push(arrow([x1 + inset, yA], [x2 - inset, yA]));
  }

  // Regions (importQuota.ts says which the figure has).
  const regions: Record<string, Band> = {};
  const pwEdge = hasPw ? on(pw) : level(pwY);
  if (hasS && hasPw && qs && qsw && qdw) {
    if (!lines && !demand) {
      regions.psGain = band([pwEdge, level(at(eq))], 0, at(qs), on(s));
      regions.dwlProduction = band([on(s), pwEdge], at(qsw), at(qs));
      regions.rent = band([level(at(eq)), pwEdge], at(qs), at(eq));
      regions.dwlConsumption = band([on(d), pwEdge], at(eq), at(qdw));
      regions.csAfter = underFromAxis(d, level(at(eq)), at(eq));
      regions.psBefore = band([level(0), pwEdge], 0, at(qsw), on(s));
    } else if (lines && eq2 && qs2) {
      // The higher price is the smaller quota's.
      const [hiE, hiS, loE, loS] = stage === 'raised' ? [eq, qs, eq2, qs2] : [eq2, qs2, eq, qs];
      regions.rentKept = band([level(at(loE)), pwEdge], at(hiS), at(hiE));
      regions.rentHigh = band([level(at(hiE)), level(at(loE))], at(hiS), at(hiE));
      regions.rentLeft = band([level(at(loE)), pwEdge], at(loS), at(hiS));
      regions.rentRight = band([level(at(loE)), pwEdge], at(hiE), at(loE));
    } else if (demand && eq2 && qs2) {
      regions.rent = band([level(at(eq2)), pwEdge], at(qs2), at(eq2));
    }
  }

  const changeOf = stage === 'none' ? 'imposed' : stage;
  const states = quotaStates(changeOf, m, q, Math.abs(q2 - q), h);
  return {
    curves,
    points,
    arrows,
    ...(d2 ? { shifts: [{ source: d, copy: d2, by: { x: dx, y: 0 } }] } : {}),
    ...(spans.length ? { spans } : {}),
    x: phraseOf(AX.quantity),
    y: phraseOf(AX.price),
    regions,
    curveRoles: roles,
    levels: hasPw ? { Pw: { vertical: false, at: pwY } } : {},
    marks,
    stage: {
      before: states.before,
      after: states.after,
      variants: quotaVariants(changeOf),
      // A one-state figure: the question's words say what changes ("doubles the quota"; imposed when they say nothing).
      ...(stage === 'none' ? { changes: quotaChanges(m, q, CHANGE * freeImports(m), h) } : {}),
    },
  };
}
