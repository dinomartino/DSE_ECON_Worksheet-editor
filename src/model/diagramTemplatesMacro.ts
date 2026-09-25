import type { Diagram, DiagramCurve } from './diagram';
import {
  AXIS,
  arrow,
  axes,
  bi,
  changeArrows,
  curve,
  label,
  mark,
  meet,
  newId,
  onCurve,
  shifted,
  sub,
  sym,
  xOn,
  type DiagramTemplate,
  type Pair,
} from './diagramTemplateKit';

/**
 * AD–AS and money-market templates, traced from the group C and F scheme figures:
 * "Price level" against "Real output", Y ticks, a vertical LRAS at Yf.
 */

const Y = { p: 'P', q: 'Y' };
/** Above the falling curve, left of the rising one: clear when a shifted twin runs just right. */
const UP_LEFT = { labelOffset: { x: -0.03, y: 0.085 } };
const AD: Pair[] = [[0.06, 0.82], [0.8, 0.14]];
const SRAS: Pair[] = [[0.06, 0.14], [0.8, 0.82]];

const macro = (body: Partial<Diagram>) => axes(AXIS.realOutput, AXIS.priceLevel, body);

const lras = (x: number, name = sym('LRAS')) => curve([[x, 0], [x, 0.92]], name);

const yf = (x: number) => ({ id: newId(), at: x, label: sub('Y', 'f') });

/** x of a straight two-point curve at height y. */
const xAt = (c: DiagramCurve, y: number) => xOn(c.points.map((p) => [p.x, p.y] as Pair), y);

/** A straight line of slope `k` through `at`, from height y0 to y1. */
function through(at: { x: number; y: number }, k: number, y0: number, y1: number): Pair[] {
  return [[at.x + (y0 - at.y) / k, y0], [at.x + (y1 - at.y) / k, y1]];
}

function adShift(): Diagram {
  const ad0 = curve(AD, sub('AD', '0'));
  const ad1 = curve(shifted(AD, 0.2), sub('AD', '1'));
  const sras = curve(SRAS, sym('SRAS'));
  // P₁'s drop runs just above E₀: its name takes the wedge left of SRAS, under P₀.
  const e0 = mark(meet(ad0, sras), '0', Y, { labelOffset: { x: -0.08, y: -0.028 } });
  const e1 = mark(meet(ad1, sras), '1', Y);
  return macro({
    curves: [ad0, ad1, sras],
    points: [e0, e1],
    arrows: [arrow([0.2, 0.72], [0.36, 0.72]), ...changeArrows(e0.at, e1.at)],
  });
}

function srasShift(): Diagram {
  const ad = curve(AD, sym('AD'));
  const base: Pair[] = [[0.24, 0.14], [0.86, 0.8]];
  const s0 = curve(base, sub('SRAS', '0'));
  // SRAS₁ stops lower, so the two names never meet at the top.
  const left = shifted(base, -0.2);
  const s1 = curve([left[0], [xOn(left, 0.68), 0.68]], sub('SRAS', '1'));
  const e0 = mark(meet(ad, s0), '0', Y);
  const e1 = mark(meet(ad, s1), '1', Y, UP_LEFT);
  const y = 0.6;
  return macro({
    curves: [ad, s0, s1],
    points: [e0, e1],
    arrows: [arrow([xAt(s0, y) - 0.03, y], [xAt(s1, y) + 0.03, y]), ...changeArrows(e0.at, e1.at)],
  });
}

/**
 * An output gap: AD–SRAS equilibrium off a vertical LRAS at Yf. SRAS starts above the
 * gap's label, which sits over back-to-back arrows standing in for the Y₀–Yf bracket.
 */
function gap(kind: 'deflationary' | 'inflationary'): Diagram {
  const deflation = kind === 'deflationary';
  const ad = curve(deflation ? [[0.04, 0.84], [0.9, 0.16]] : [[0.12, 0.9], [0.9, 0.315]], sym('AD'));
  const sras = curve(deflation ? [[0.04, 0.3], [0.48, 0.86]] : [[0.57, 0.3], [0.9, 0.63]], sym('SRAS'));
  const full = deflation ? 0.72 : 0.3;
  const e0 = mark(meet(ad, sras), '0', Y);
  const [lo, hi] = [Math.min(e0.at.x, full), Math.max(e0.at.x, full)];
  const mid = (lo + hi) / 2;
  const text = deflation ? bi('deflationary\ngap', '通縮缺口') : bi('inflationary\ngap', '通脹缺口');
  return macro({
    x: { title: AXIS.realOutput, ticks: [yf(full)] },
    curves: [ad, sras, lras(full)],
    points: [e0],
    arrows: [arrow([mid, 0.05], [lo + 0.012, 0.05]), arrow([mid, 0.05], [hi - 0.012, 0.05])],
    labels: [label(mid, 0.22, text)],
  });
}

function selfAdjust(): Diagram {
  const full = 0.62;
  const ad = curve([[0.04, 0.82], [0.86, 0.12]], sym('AD'));
  // SRAS₀ ends left of LRAS so its name clears the vertical line.
  const base: Pair[] = [[0.06, 0.2], [0.06 + 0.42 / 1.222, 0.62]];
  const s0 = curve(base, sub('SRAS', '0'));
  const target = onCurve(ad, full);
  const s1 = curve(shifted(base, full - xAt(s0, target.y)), sub('SRAS', '1'));
  const e0 = mark(meet(ad, s0), '0', Y, UP_LEFT);
  const e1 = mark(meet(ad, s1), '1', { p: 'P', q: '' });
  const y = 0.25;
  return macro({
    x: { title: AXIS.realOutput, ticks: [yf(full)] },
    curves: [ad, s0, s1, lras(full)],
    points: [e0, e1],
    arrows: [arrow([xAt(s0, y) + 0.03, y], [xAt(s1, y) - 0.03, y]), ...changeArrows(e0.at, e1.at, ['y'])],
  });
}

/** A supply shock and the recovery, arrows numbered 1 and 2 (DSE2013 Q4). */
function shockRecovery(): Diagram {
  const full = 0.5;
  const ad = curve([[0.06, 0.84], [0.86, 0.12]], sym('AD'));
  const target = onCurve(ad, full);
  const k = 0.9722;
  // SRAS₀ through AD ∩ LRAS, so E₀ is the long-run equilibrium; SRAS₁ stops lower.
  const s0 = curve(through(target, k, 0.12, 0.8), sub('SRAS', '0'));
  const s1 = curve(through({ x: target.x - 0.2, y: target.y }, k, 0.16, 0.68), sub('SRAS', '1'));
  const e0 = mark(meet(ad, s0), '0', { p: 'P', q: '' });
  const e1 = mark(meet(ad, s1), '1', Y, UP_LEFT);
  // Both arrows below the equilibria, where the two SRAS lines run clear of labels.
  const hi = 0.36;
  const lo = 0.24;
  return macro({
    x: { title: AXIS.realOutput, ticks: [yf(full)] },
    curves: [ad, s0, s1, lras(full)],
    points: [e0, e1],
    arrows: [
      arrow([xAt(s0, hi) - 0.02, hi], [xAt(s1, hi) + 0.02, hi], { label: sym('1'), labelOffset: { x: 0.03, y: 0 } }),
      arrow([xAt(s1, lo) + 0.02, lo], [xAt(s0, lo) - 0.02, lo], { label: sym('2') }),
    ],
  });
}

function lrasGrowth(): Diagram {
  const base: Pair[] = [[0.06, 0.74], [0.66, 0.1]];
  const ad0 = curve(base, sub('AD', '0'));
  const ad1 = curve(shifted(base, 0.22), sub('AD', '1'));
  const l0 = lras(0.32, sub('LRAS', '0'));
  const l1 = lras(0.62, sub('LRAS', '1'));
  const e0 = mark(meet(ad0, l0), '0', Y, { labelSide: 'upRight' });
  const e1 = mark(meet(ad1, l1), '1', Y);
  // The AD arrow fits between the two LRAS lines: the LRAS shift is the larger.
  const y = 0.74 - (0.35 - 0.06) * (0.64 / 0.6);
  return macro({
    curves: [ad0, ad1, l0, l1],
    points: [e0, e1],
    arrows: [arrow([0.35, 0.86], [0.59, 0.86]), arrow([0.365, y], [0.555, y]), ...changeArrows(e0.at, e1.at)],
  });
}

const moneyAxes = (body: Partial<Diagram>) => axes(AXIS.money, AXIS.interest, body);
const R = { p: 'r', q: '' };

function moneySupplyShift(): Diagram {
  const ms0 = curve([[0.38, 0], [0.38, 0.9]], sub('Ms', '0'));
  const ms1 = curve([[0.6, 0], [0.6, 0.9]], sub('Ms', '1'));
  const md = curve([[0.06, 0.8], [0.9, 0.16]], sym('Md'));
  const e0 = mark(meet(md, ms0), '0', R);
  const e1 = mark(meet(md, ms1), '1', R);
  return moneyAxes({
    curves: [ms0, ms1, md],
    points: [e0, e1],
    arrows: [arrow([0.41, 0.82], [0.57, 0.82]), ...changeArrows(e0.at, e1.at, ['y'])],
  });
}

function moneyDemandShift(): Diagram {
  const base: Pair[] = [[0.06, 0.68], [0.8, 0.1]];
  const ms = curve([[0.5, 0], [0.5, 0.9]], sym('Ms'));
  const md0 = curve(base, sub('Md', '0'));
  const md1 = curve(shifted(base, 0.2), sub('Md', '1'));
  const e0 = mark(meet(md0, ms), '0', R, { labelSide: 'downLeft' });
  const e1 = mark(meet(md1, ms), '1', R);
  const y = 0.6;
  return moneyAxes({
    curves: [ms, md0, md1],
    points: [e0, e1],
    arrows: [arrow([xAt(md0, y) + 0.03, y], [xAt(md1, y) - 0.03, y]), ...changeArrows(e0.at, e1.at, ['y'])],
  });
}

export const MACRO_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'ad-shift',
    group: 'macro',
    name: bi('AD shift', '總需求變動'),
    hint: bi('AD₀ → AD₁ on an upward SRAS, with P and Y arrows.', 'AD₀ → AD₁，附價格及產出箭嘴。'),
    build: adShift,
  },
  {
    id: 'sras-shift',
    group: 'macro',
    name: bi('SRAS shift', '短期總供應變動'),
    hint: bi('A cost shock: SRAS shifts left, P rises, Y falls.', '成本衝擊：SRAS 左移，價格上升，產出下降。'),
    build: srasShift,
  },
  {
    id: 'deflationary-gap',
    group: 'macro',
    name: bi('Deflationary gap', '通縮缺口'),
    hint: bi('Equilibrium left of LRAS at Yf; the gap marked on the axis.', '均衡點在 Yf 的 LRAS 左方，缺口標於軸上。'),
    build: () => gap('deflationary'),
  },
  {
    id: 'inflationary-gap',
    group: 'macro',
    name: bi('Inflationary gap', '通脹缺口'),
    hint: bi('Equilibrium right of LRAS at Yf; the gap marked on the axis.', '均衡點在 Yf 的 LRAS 右方，缺口標於軸上。'),
    build: () => gap('inflationary'),
  },
  {
    id: 'self-adjustment',
    group: 'macro',
    name: bi('Long-run self-adjustment', '長期自我調節'),
    hint: bi('SRAS shifts right to close the gap; AD does not move.', 'SRAS 右移收窄缺口；AD 不變。'),
    build: selfAdjust,
  },
  {
    id: 'shock-recovery',
    group: 'macro',
    name: bi('Supply shock and recovery', '供應衝擊及復元'),
    hint: bi('SRAS shifts left (1), then back (2); P returns to P₀.', 'SRAS 先左移 (1) 再回復 (2)；價格回到 P₀。'),
    build: shockRecovery,
  },
  {
    id: 'lras-growth',
    group: 'macro',
    name: bi('Economic growth: LRAS shift', '經濟增長：LRAS 變動'),
    hint: bi('LRAS₀ → LRAS₁ and AD₀ → AD₁, with Y₁ > Y₀.', 'LRAS₀ → LRAS₁ 及 AD₀ → AD₁，Y₁ > Y₀。'),
    build: lrasGrowth,
  },
  {
    id: 'money-supply-shift',
    group: 'money',
    name: bi('Money supply shift', '貨幣供應變動'),
    hint: bi('Ms₀ → Ms₁ against Md: the interest rate falls.', 'Ms₀ → Ms₁：利率下降。'),
    build: moneySupplyShift,
  },
  {
    id: 'money-demand-shift',
    group: 'money',
    name: bi('Money demand shift', '貨幣需求變動'),
    hint: bi('Md₀ → Md₁ against a vertical Ms: the interest rate rises.', 'Md₀ → Md₁：利率上升。'),
    build: moneyDemandShift,
  },
];
