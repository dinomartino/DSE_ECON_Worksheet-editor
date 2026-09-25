import type { Diagram, DiagramCurve } from './diagram';
import {
  AXIS,
  arrow,
  at,
  axes,
  axisArrows,
  bi,
  cross,
  curve,
  derived,
  eq,
  finish,
  label,
  newId,
  onCurve,
  shiftOf,
  span,
  sub,
  subBi,
  sym,
  upright,
  xOn,
  type DiagramTemplate,
  type Pair,
} from './diagramTemplateKit';

/**
 * AD–AS and money-market templates, traced from the group C and F scheme figures:
 * "Price level" against "Real output", Y ticks, a vertical LRAS at Yf. Equilibria are
 * anchored, shifted curves follow their originals, gaps are spans to LRAS.
 */

const Y = { p: 'P', q: 'Y' };
const AD: Pair[] = [[0.06, 0.82], [0.8, 0.14]];
const SRAS: Pair[] = [[0.06, 0.14], [0.8, 0.82]];

const macro = (body: Partial<Diagram>) => axes(AXIS.realOutput, AXIS.priceLevel, body);

const lras = (x: number, name = sym('LRAS')) => upright(x, name);

const yf = (x: number) => ({ id: newId(), at: x, label: sub('Y', 'f') });

/** x of a straight two-point curve at height y. */
const xAt = (c: DiagramCurve, y: number) => xOn(c.points.map((p) => [p.x, p.y] as Pair), y);

/** A straight line of slope `k` through `at`, from height y0 to y1. */
function through(at: { x: number; y: number }, k: number, y0: number, y1: number): Pair[] {
  return [[at.x + (y0 - at.y) / k, y0], [at.x + (y1 - at.y) / k, y1]];
}

function adShift(): Diagram {
  const ad0 = curve(AD, sub('AD', '0'));
  const ad1 = shiftOf(ad0, 0.2, 0, sub('AD', '1'));
  const sras = curve(SRAS, sym('SRAS'));
  // P₁'s drop runs just above E₀: its name takes the wedge left of SRAS, under P₀.
  const e0 = eq(ad0, sras, '0', Y);
  const e1 = eq(ad1, sras, '1', Y);
  return finish(
    macro({
      curves: [ad0, ad1, sras],
      points: [e0, e1],
      arrows: [arrow([0.2, 0.72], [0.36, 0.72])],
      spans: axisArrows(e0, e1),
    }),
  );
}

function srasShift(): Diagram {
  const ad = curve(AD, sym('AD'));
  const base: Pair[] = [[0.24, 0.14], [0.86, 0.8]];
  const s0 = curve(base, sub('SRAS', '0'));
  // SRAS₁'s name sits left of its end, so the two names never meet at the top.
  const s1 = shiftOf(s0, -0.2, 0, sub('SRAS', '1'), { labelOffset: { x: -0.19, y: -0.01 } });
  const e0 = eq(ad, s0, '0', Y);
  const e1 = eq(ad, s1, '1', Y);
  const y = 0.6;
  return finish(
    macro({
      curves: [ad, s0, s1],
      points: [e0, e1],
      arrows: [arrow([xAt(s0, y) - 0.03, y], [xAt(s1, y) + 0.03, y])],
      spans: axisArrows(e0, e1),
    }),
  );
}

/** AD and SRAS both shift left: Y falls for certain, P depends on the sizes. */
function adSrasLeft(): Diagram {
  const ad0 = curve([[0.2, 0.84], [0.9, 0.2]], sub('AD', '0'));
  const ad1 = shiftOf(ad0, -0.16, 0, sub('AD', '1'));
  const s0 = curve([[0.3, 0.14], [0.9, 0.78]], sub('SRAS', '0'));
  const s1 = shiftOf(s0, -0.16, 0, sub('SRAS', '1'), { labelOffset: { x: -0.19, y: -0.01 } });
  const e0 = eq(ad0, s0, '0', Y);
  const e1 = eq(ad1, s1, '1', { p: '', q: 'Y' });
  return finish(
    macro({
      curves: [ad0, ad1, s0, s1],
      points: [e0, e1],
      arrows: [arrow([0.34, 0.72], [0.2, 0.72]), arrow([0.84, 0.66], [0.69, 0.66])],
      spans: axisArrows(e0, e1, ['x']),
      labels: [label(0.04, 0.95, bi('Y falls; P may rise or fall', 'Y 下降；P 可升可跌'), { align: 'left' })],
    }),
  );
}

/**
 * An output gap: AD–SRAS equilibrium off a vertical LRAS at Yf. The gap is a double
 * arrow on the output axis from Y₀ to LRAS, so it follows AD, SRAS and LRAS.
 */
function gap(kind: 'deflationary' | 'inflationary'): Diagram {
  const deflation = kind === 'deflationary';
  const ad = curve(deflation ? [[0.04, 0.84], [0.9, 0.16]] : [[0.12, 0.9], [0.9, 0.315]], sym('AD'));
  const sras = curve(deflation ? [[0.04, 0.3], [0.48, 0.86]] : [[0.57, 0.3], [0.9, 0.63]], sym('SRAS'));
  const full = deflation ? 0.72 : 0.3;
  const l = lras(full);
  const e0 = eq(ad, sras, '0', Y);
  const text = deflation ? bi('deflationary\ngap', '通縮缺口') : bi('inflationary\ngap', '通脹缺口');
  return finish(
    macro({
      x: { title: AXIS.realOutput, ticks: [yf(full)] },
      curves: [ad, sras, l],
      points: [e0],
      spans: [span(at(e0), { on: l.id, y: 0 }, 'doubleArrow', { along: 'x', label: text })],
    }),
  );
}

/** AD rises toward Yf: gap₀ and the narrower gap₁, both on the output axis. */
function gapNarrows(): Diagram {
  const full = 0.74;
  const l = lras(full);
  // AD₀ is named at its top, so its name stays clear of the gap arrows below.
  const ad0 = curve([[0.04, 0.7], [0.6, 0.176]], sub('AD', '0'), { labelAt: 'start', labelOffset: { x: 0.07, y: 0.03 } });
  const ad1 = shiftOf(ad0, 0.18, 0, sub('AD', '1'));
  const sras = curve([[0.08, 0.2], [0.52, 0.74]], sym('SRAS'));
  const e0 = eq(ad0, sras, '0', Y);
  // Each gap ends on LRAS at the axis, whichever AD is drawn.
  const yf0 = { on: l.id, y: 0 };
  const e1 = eq(ad1, sras, '1', Y);
  return finish(
    macro({
      x: { title: AXIS.realOutput, ticks: [yf(full)] },
      curves: [ad0, ad1, sras, l],
      points: [e0, e1],
      arrows: [arrow([0.16, 0.66], [0.32, 0.66])],
      spans: [
        span(at(e0), yf0, 'doubleArrow', { along: 'x', offset: 0.12, label: subBi('gap', '缺口', '0') }),
        span(at(e1), yf0, 'doubleArrow', { along: 'x', label: subBi('gap', '缺口', '1') }),
      ],
    }),
  );
}

/**
 * Long-run self-adjustment: SRAS₁ is drawn through AD ∩ LRAS and parallel to SRAS₀,
 * so the new equilibrium stays on LRAS whatever is dragged. AD does not move.
 */
function selfAdjust(kind: 'deflationary' | 'inflationary'): Diagram {
  const deflation = kind === 'deflationary';
  const full = deflation ? 0.62 : 0.4;
  const l = lras(full);
  const ad = curve([[0.04, 0.82], [0.86, 0.12]], sym('AD'));
  // SRAS₀ ends short of LRAS (or starts past it), so its name clears the vertical line.
  const base: Pair[] = deflation ? [[0.06, 0.2], [0.06 + 0.42 / 1.222, 0.62]] : [[0.36, 0.14], [0.36 + 0.6 / 1.222, 0.74]];
  const s0 = curve(base, sub('SRAS', '0'));
  const ys: [number, number] = deflation ? [0.2, 0.62] : [0.3, 0.9];
  const s1 = derived({ kind: 'parallel', to: s0.id, through: cross(ad, l), ys }, [s0, ad, l], sub('SRAS', '1'));
  const e0 = eq(ad, s0, '0', Y);
  const e1 = eq(ad, s1, '1', { p: 'P', q: '' });
  const y = deflation ? 0.25 : 0.7;
  const [from, to] = deflation ? [xAt(s0, y) + 0.03, xAt(s1, y) - 0.03] : [xAt(s0, y) - 0.03, xAt(s1, y) + 0.03];
  return finish(
    macro({
      x: { title: AXIS.realOutput, ticks: [yf(full)] },
      curves: [ad, s0, s1, l],
      points: [e0, e1],
      arrows: [arrow([from, y], [to, y])],
      spans: axisArrows(e0, e1, ['y']),
    }),
  );
}

/** A supply shock and the recovery, arrows numbered 1 and 2 (DSE2013 Q4). */
function shockRecovery(): Diagram {
  const full = 0.5;
  const l = lras(full);
  const ad = curve([[0.06, 0.84], [0.86, 0.12]], sym('AD'));
  const target = onCurve(ad, full);
  const k = 0.9722;
  // SRAS₀ through AD ∩ LRAS, so E₀ is the long-run equilibrium; SRAS₁ is it shifted
  // left, its name moved left of its end so the two never meet.
  const s0 = curve(through(target, k, 0.12, 0.8), sub('SRAS', '0'));
  const s1 = shiftOf(s0, -0.2, 0, sub('SRAS', '1'), { labelOffset: { x: -0.19, y: -0.01 } });
  const e0 = eq(ad, s0, '0', { p: 'P', q: '' });
  const e1 = eq(ad, s1, '1', Y);
  // Both arrows below the equilibria, where the two SRAS lines run clear of labels.
  const hi = 0.36;
  const lo = 0.24;
  return finish(
    macro({
      x: { title: AXIS.realOutput, ticks: [yf(full)] },
      curves: [ad, s0, s1, l],
      points: [e0, e1],
      arrows: [
        arrow([xAt(s0, hi) - 0.02, hi], [xAt(s1, hi) + 0.02, hi], { label: sym('1'), labelOffset: { x: 0.03, y: 0 } }),
        arrow([xAt(s1, lo) + 0.02, lo], [xAt(s0, lo) - 0.02, lo], { label: sym('2') }),
      ],
    }),
  );
}

/** Demand grows but capacity does not: on a vertical LRAS, AD shifts right and only P rises. */
function adShiftAtCapacity(): Diagram {
  const full = 0.5;
  const l = lras(full);
  const ad0 = curve([[0.06, 0.8], [0.72, 0.12]], sub('AD', '0'));
  const ad1 = shiftOf(ad0, 0.2, 0, sub('AD', '1'));
  const e0 = eq(ad0, l, '0', { p: 'P', q: '' });
  const e1 = eq(ad1, l, '1', { p: 'P', q: '' });
  return finish(
    macro({
      x: { title: AXIS.realOutput, ticks: [yf(full)] },
      curves: [ad0, ad1, l],
      points: [e0, e1],
      arrows: [arrow([0.17, 0.72], [0.32, 0.72])],
      spans: axisArrows(e0, e1, ['y']),
    }),
  );
}

function lrasGrowth(): Diagram {
  const base: Pair[] = [[0.06, 0.74], [0.66, 0.1]];
  const ad0 = curve(base, sub('AD', '0'));
  const ad1 = shiftOf(ad0, 0.22, 0, sub('AD', '1'));
  const l0 = lras(0.32, sub('LRAS', '0'));
  const l1 = shiftOf(l0, 0.3, 0, sub('LRAS', '1'));
  const e0 = eq(ad0, l0, '0', Y);
  const e1 = eq(ad1, l1, '1', Y);
  // The AD arrow fits between the two LRAS lines: the LRAS shift is the larger.
  const y = 0.74 - (0.35 - 0.06) * (0.64 / 0.6);
  return finish(
    macro({
      curves: [ad0, ad1, l0, l1],
      points: [e0, e1],
      arrows: [arrow([0.35, 0.86], [0.59, 0.86]), arrow([0.365, y], [0.555, y])],
      spans: axisArrows(e0, e1),
    }),
  );
}

const moneyAxes = (body: Partial<Diagram>) => axes(AXIS.money, AXIS.interest, body);
const R = { p: 'r', q: '' };

function moneySupplyShift(): Diagram {
  const ms0 = upright(0.38, sub('Ms', '0'), 0.9);
  const ms1 = shiftOf(ms0, 0.22, 0, sub('Ms', '1'));
  const md = curve([[0.06, 0.8], [0.9, 0.16]], sym('Md'));
  const e0 = eq(md, ms0, '0', R);
  const e1 = eq(md, ms1, '1', R);
  return finish(
    moneyAxes({
      curves: [ms0, ms1, md],
      points: [e0, e1],
      arrows: [arrow([0.41, 0.82], [0.57, 0.82])],
      spans: axisArrows(e0, e1, ['y']),
    }),
  );
}

function moneyDemandShift(): Diagram {
  const base: Pair[] = [[0.06, 0.68], [0.8, 0.1]];
  const ms = upright(0.5, sym('Ms'), 0.9);
  const md0 = curve(base, sub('Md', '0'));
  const md1 = shiftOf(md0, 0.2, 0, sub('Md', '1'));
  const e0 = eq(md0, ms, '0', R);
  const e1 = eq(md1, ms, '1', R);
  const y = 0.6;
  return finish(
    moneyAxes({
      curves: [ms, md0, md1],
      points: [e0, e1],
      arrows: [arrow([xAt(md0, y) + 0.03, y], [xAt(md1, y) - 0.03, y])],
      spans: axisArrows(e0, e1, ['y']),
    }),
  );
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
    id: 'ad-sras-left',
    group: 'macro',
    name: bi('AD and SRAS both shift left', 'AD 及 SRAS 同時左移'),
    hint: bi('Only Y is determinate: it falls; P depends on the two shifts.', '只有 Y 可確定（下降）；P 視乎兩者移動的大小。'),
    build: adSrasLeft,
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
    id: 'gap-narrows',
    group: 'macro',
    name: bi('Gap narrows: gap₀ and gap₁', '缺口收窄：缺口₀ 及缺口₁'),
    hint: bi('AD₀ → AD₁ toward Yf: the new gap is visibly narrower.', 'AD₀ → AD₁ 趨向 Yf：新缺口明顯較窄。'),
    build: gapNarrows,
  },
  {
    id: 'self-adjustment',
    group: 'macro',
    name: bi('Long-run self-adjustment', '長期自我調節'),
    hint: bi('SRAS shifts right to close the gap; AD does not move.', 'SRAS 右移收窄缺口；AD 不變。'),
    build: () => selfAdjust('deflationary'),
  },
  {
    id: 'self-adjustment-inflationary',
    group: 'macro',
    name: bi('Self-adjustment: inflationary gap', '自我調節：通脹缺口'),
    hint: bi('SRAS shifts left back to Yf; P rises, AD does not move.', 'SRAS 左移回到 Yf；價格上升，AD 不變。'),
    build: () => selfAdjust('inflationary'),
  },
  {
    id: 'shock-recovery',
    group: 'macro',
    name: bi('Supply shock and recovery', '供應衝擊及復元'),
    hint: bi('SRAS shifts left (1), then back (2); P returns to P₀.', 'SRAS 先左移 (1) 再回復 (2)；價格回到 P₀。'),
    build: shockRecovery,
  },
  {
    id: 'ad-shift-at-capacity',
    group: 'macro',
    name: bi('AD shift at full capacity', '全民就業下的總需求變動'),
    hint: bi('AD₀ → AD₁ on a vertical LRAS: P rises, Y stays at Yf.', '垂直 LRAS 上 AD₀ → AD₁：價格上升，產出維持在 Yf。'),
    build: adShiftAtCapacity,
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
