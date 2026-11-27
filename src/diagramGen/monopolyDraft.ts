import type { DiagramAnchorRef, DiagramCurve, DiagramPointMark } from '@/model/diagram';
import { cross, curve, derived, placeLabel, shiftOf, type Pair } from '@/model/diagramTemplateKit';
import type { BiText } from '@/model/types';
import { isMonopolyStage, mcFunction, monopolyPoint, monopolyStates, monopolyVariants, type MonoModel } from './monopoly';
import { AX, at, band, level, on, phraseOf, tickPoint, TOP, underFromAxis, type Band, type Draft } from './sceneKit';
import type { McShape, Slope, SpecScene } from './types';

/**
 * Draws the monopoly scene (k-0589): D from the price axis, MR derived from it, MC of the
 * question's shape, Qm and Pm at MR = MC, the efficient output where D meets MC, and for a change
 * MC₂ as a shifted copy of MC (so dragging MC₁ carries it). Every point is anchored to its
 * crossing and every region is a band between the curves, as the other scenes are.
 */

export interface MonoLayout {
  /** D's intercept on the price axis. */
  a: number;
  /** Which MC level to try (index into the shape's list). */
  lift: number;
  /** How much of the MC change's size to use. */
  k: number;
}
export const MONO_LAYOUTS: MonoLayout[] = [0.9, 0.84].flatMap((a) => [0, 1, 2, 3].flatMap((lift) => [1, 0.8, 0.62].map((k) => ({ a, lift, k }))));

/** D's slope (the fall in price per unit of quantity). */
const DEMAND_B: Record<Slope, number> = { normal: 0.89, steep: 1.5, flat: 0.55 };
/** A rising MC's slope, and a U-shaped one's curvature, from the scene's `supply` choice. */
const MC_SLOPE: Record<Slope, number> = { normal: 0.9, steep: 1.8, flat: 0.45 };
const MC_BEND: Record<Slope, number> = { normal: 2.5, steep: 4, flat: 1.6 };
/** MC's level (a flat MC) or start (rising, U-shaped), per layout `lift`. */
const MC_LEVEL: Record<McShape, number[]> = {
  flat: [0.3, 0.25, 0.35, 0.2],
  rising: [0.1, 0.14, 0.06, 0.18],
  zero: [0, 0, 0, 0],
  uShaped: [0.25, 0.22, 0.28, 0.2],
};
/** The MC change, as a vertical distance. */
const MC_SHIFT: Record<SpecScene['size'], number> = { small: 0.1, normal: 0.14, large: 0.18 };
const U_MIN = 0.28;

/** The model behind a layout: what `monopolyFacts` reads and what is drawn. */
export function monoModel(scene: SpecScene, layout: MonoLayout): { m: MonoModel; shape: McShape; c: number; s: number; t: number } {
  const shape = scene.mc ?? 'flat';
  const stage = isMonopolyStage(scene.stage) ? scene.stage : 'none';
  // MC = 0: demand must reach the quantity axis on the plot (the efficient output is its intercept).
  const b = shape === 'zero' ? Math.max(DEMAND_B[scene.demand] ?? 0.89, layout.a / 0.88) : (DEMAND_B[scene.demand] ?? 0.89);
  const s = shape === 'uShaped' ? (MC_BEND[scene.supply] ?? 2.5) : shape === 'rising' ? (MC_SLOPE[scene.supply] ?? 0.9) : 0;
  // A sloped MC moves the output by t / (2b + s): enough of a move that Q₁ and Q₂ stand apart.
  const t = Math.max((MC_SHIFT[scene.size] ?? 0.14) * layout.k, shape === 'rising' || shape === 'uShaped' ? 0.085 * (2 * b + (shape === 'rising' ? s : 0.6)) : 0);
  // A fall starts from the higher MC, so the lower one stays above the axis.
  const base = MC_LEVEL[shape][layout.lift] ?? MC_LEVEL[shape][0];
  const c = stage === 'mcFall' || stage === 'mcFallKept' ? base + t : base;
  return { m: { a: layout.a, b, mc: mcFunction(shape, c, s, U_MIN) }, shape, c, s, t };
}

/** MC drawn as the function it stands for, from the price axis to the top or right of the plot. */
function mcPoints(shape: McShape, f: (x: number) => number, top = TOP): Pair[] {
  if (shape === 'zero') return [[0, 0], [0.9, 0]];
  if (shape === 'flat') return [[0, f(0)], [0.9, f(0)]];
  const xEnd = (() => {
    let x = 0.9;
    while (x > 0.1 && f(x) > top) x -= 0.005;
    return x;
  })();
  if (shape === 'rising') return [[0, f(0)], [xEnd, f(xEnd)]];
  // U-shaped: sampled densely and drawn curved, so the spline is the function.
  const x0 = 0.04;
  const n = 10;
  return Array.from({ length: n + 1 }, (_, i): Pair => {
    const x = x0 + ((xEnd - x0) * i) / n;
    return [x, f(x)];
  });
}

export function draftMonopoly(scene: SpecScene, name: (part: string) => BiText | undefined, tick: (part: string) => BiText | null | undefined, layout: MonoLayout): Draft {
  const stage = isMonopolyStage(scene.stage) ? scene.stage : 'none';
  const { m, shape, t } = monoModel(scene, layout);
  const zero = shape === 'zero';
  // D from the price axis down to the plot's floor (MC = 0: to the quantity axis).
  const floor = zero ? 0 : 0.04;
  const xEnd = Math.min(0.9, (m.a - floor) / m.b);
  const dLine = curve([[0, m.a], [xEnd, m.a - m.b * xEnd]], name('D'));
  // MC = 0: D ends on the axis, so its name sits beside it a little above (as the template places it), MR's left of its foot, clear of the loss.
  const d = zero ? placeLabel(dLine, (m.a - 0.2) / m.b + 0.05, 0.22) : dLine;
  // MR's name just above where it reaches the axis, clear of the quantity ticks (as the templates place it).
  const mrBase = derived({ kind: 'marginalRevenue', of: d.id }, [d], name('MR'), { labelOffset: { x: 0.01, y: 0.08 } });
  const mr = zero ? placeLabel(mrBase, m.a / (2 * m.b) - 0.11, 0.09) : mrBase;
  // A change in MC: MC₂ a copy of MC moved up or down (to the old price for mcRiseToPrice).
  const two = stage === 'mcRise' || stage === 'mcFall' || stage === 'mcFallKept' || stage === 'mcRiseToPrice';
  let dy = 0;
  if (stage === 'mcRiseToPrice') {
    const p = monopolyPoint(m);
    dy = p.pm - m.mc(p.qm);
  } else if (two) dy = stage === 'mcRise' ? t : -t;
  // A rise leaves room above MC₁ for MC₂ inside the plot.
  const mc = curve(mcPoints(shape, m.mc, TOP - Math.max(0, dy)), name('MC'), shape === 'uShaped' ? { shape: 'curved' } : zero ? { labelOffset: { x: 0, y: 0.05 } } : {});
  const curves: DiagramCurve[] = [d, mr, mc];
  const roles: Draft['curveRoles'] = { D: { curve: d, role: 'demand' }, MR: { curve: mr, role: 'demand' }, MC: { curve: mc, role: shape === 'flat' || zero ? 'horizontal' : 'supply' } };
  let mc2: DiagramCurve | null = null;
  if (two) {
    mc2 = shiftOf(mc, 0, dy, name('MC2'));
    curves.push(mc2);
    roles.MC2 = { curve: mc2, role: shape === 'flat' ? 'horizontal' : 'supply' };
  }
  const parts = () => [...curves, ...points];
  const points: DiagramPointMark[] = [];
  const marks: Record<string, DiagramPointMark> = {};

  // The profit-maximising point: on D above MR = MC (MC = 0: above where MR reaches the axis).
  const mrMeets = (c: DiagramCurve | null): DiagramAnchorRef => (c ? cross(mr, c) : { on: mr.id, y: 0 });
  const pm = tickPoint({ on: d.id, x: mrMeets(zero ? null : mc) }, parts(), { x: tick('Qm'), y: tick('Pm') });
  points.push(pm);
  Object.assign(marks, { Qm: pm, Pm: pm });
  // The efficient output: D meets MC (MC = 0: D's own intercept).
  const pc = tickPoint(zero ? { on: d.id, y: 0 } : cross(d, mc), parts(), zero ? { x: tick('Qc') } : { x: tick('Qc'), y: tick('Pc') });
  points.push(pc);
  Object.assign(marks, { Qc: pc, Pc: pc });
  let pm2: DiagramPointMark | null = null;
  let pc2: DiagramPointMark | null = null;
  if (mc2 && stage !== 'mcFallKept') {
    pm2 = tickPoint({ on: d.id, x: mrMeets(mc2) }, parts(), { x: tick('Qm2'), y: tick('Pm2') });
    points.push(pm2);
    Object.assign(marks, { Qm2: pm2, Pm2: pm2 });
  }
  if (mc2 && stage !== 'mcRiseToPrice') {
    pc2 = tickPoint(cross(d, mc2), parts(), { x: tick('Qc2'), y: tick('Pc2') });
    points.push(pc2);
    Object.assign(marks, { Qc2: pc2, Pc2: pc2 });
  }

  // Regions (monopoly.ts says which a stage has).
  const regions: Record<string, Band> = {};
  if (!mc2) {
    if (shape !== 'uShaped') {
      regions.cs = underFromAxis(d, level(at(pm)), at(pm));
      regions.ps = zero ? band([level(0), level(at(pm))], 0, at(pm)) : band([level(0), level(at(pm))], 0, at(pm), on(mc));
    }
    regions.dwl = band([on(d), zero ? level(0) : on(mc)], at(pm), at(pc));
  } else if (stage === 'mcFall') {
    regions.dwlKept = band([on(d), on(mc)], at(pm2!), at(pc));
    regions.dwlRemoved = band([on(d), on(mc)], at(pm), at(pm2!));
    regions.dwlAdded = band([on(mc), on(mc2)], at(pm2!), at(pc2!), on(d));
  } else if (stage === 'mcRise') {
    regions.dwlKept = band([on(d), on(mc2)], at(pm), at(pc2!));
    regions.dwlAdded = band([on(d), on(mc2)], at(pm2!), at(pm));
    regions.dwlRemoved = band([on(mc2), on(mc)], at(pm), at(pc), on(d));
  } else if (stage === 'mcFallKept') {
    regions.dwlKept = band([on(d), on(mc)], at(pm), at(pc));
    regions.dwlAdded = band([on(mc), on(mc2)], at(pm), at(pc2!), on(d));
  } else {
    regions.dwlRemoved = band([on(d), on(mc)], at(pm), at(pc));
    regions.dwlAdded = band([on(d), on(mc2)], at(pm2!), at(pm));
  }

  const states = monopolyStates(stage, m, t);
  return {
    curves,
    points,
    arrows: [],
    ...(mc2 ? { shifts: [{ source: mc, copy: mc2, by: { x: 0, y: dy } }] } : {}),
    x: phraseOf(AX.quantity),
    y: phraseOf(AX.price),
    regions,
    curveRoles: roles,
    levels: {},
    marks,
    ...(stage !== 'none' ? { stage: { before: states.before, after: states.after, variants: monopolyVariants(stage, shape) } } : {}),
  };
}
