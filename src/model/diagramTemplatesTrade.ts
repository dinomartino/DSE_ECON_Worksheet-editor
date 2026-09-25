import type { Diagram, DiagramCurve } from './diagram';
import { PRESET_PATTERNS, revenueArea } from './diagramAreas';
import {
  AXIS,
  alongDemand,
  arrow,
  at,
  axes,
  axisArrows,
  band,
  bi,
  cross,
  curve,
  derived,
  eq,
  finish,
  lab,
  label,
  markAt,
  newId,
  pin,
  placeLabel,
  point,
  priceLine,
  reading,
  shade,
  shiftOf,
  span,
  sub,
  subPlus,
  sym,
  xOn,
  type DiagramTemplate,
  type Pair,
} from './diagramTemplateKit';

/**
 * Trade, exchange-rate and elective templates (groups D and F): revenue boxes, the
 * small-open-economy tariff and quota, the monopoly firm, PPF/CPF trade, the Lorenz
 * curve. Prices are level lines (Pw + t a shift of Pw), MR is derived from D, the CPF
 * is a tangent, and quantities are anchored where the scheme reads them.
 */

const GOOD = { x: bi('Good X', 'X 貨品'), y: bi('Good Y', 'Y 貨品') };

function fixedExportPrice(): Diagram {
  const p = priceLine(0.48, sym('P'));
  const d0 = curve([[0.06, 0.86], [0.6, 0.12]], sub('D', '0'));
  const d1 = shiftOf(d0, 0.22, 0, sub('D', '1'));
  const e0 = eq(d0, p, '0', { p: '' });
  const e1 = eq(d1, p, '1', { p: '' });
  return finish(
    axes(bi('Quantity\nof exports', '出口量'), bi('Price (Yen)', '價格（日圓）'), {
      curves: [p, d0, d1],
      points: [e0, e1],
      arrows: [arrow([0.13, 0.74], [0.31, 0.74])],
      spans: axisArrows(e0, e1, ['x']),
      areas: [{ ...revenueArea('revenueGain', { before: at(e0), after: at(e1) }, newId())!, label: sym('+') }],
    }),
  );
}

/** A demand fall from a substitute (CE1999 Q9): D₁ → D₂ on an upward S; P, Q and revenue fall. */
function substituteRevenue(): Diagram {
  const d1 = curve([[0.08, 0.9], [0.8, 0.18]], sub('D', '1'));
  const d2 = shiftOf(d1, -0.2, 0, sub('D', '2'));
  const s = curve([[0.06, 0.1], [0.72, 0.84]], sym('S'));
  const e1 = eq(d1, s, '1');
  const e2 = eq(d2, s, '2');
  return finish(
    axes(bi('Quantity\nof imports', '進口量'), bi('Price (HK$)', '價格（港元）'), {
      curves: [d1, d2, s],
      points: [e1, e2],
      arrows: [arrow([0.66, 0.36], [0.48, 0.36])],
      spans: axisArrows(e1, e2),
      areas: [{ ...revenueArea('revenueLoss', { before: at(e1), after: at(e2) }, newId())!, labelPlacement: 'leader' }],
    }),
  );
}

/** Pw and "Pw + t" as level lines, the tariff line moving one-for-one with Pw. */
function tariffLines(pwY: number, t: number, right = 0.9) {
  const pw = priceLine(pwY, sub('P', 'w'), right);
  const pt = shiftOf(pw, 0, t, subPlus('P', 'w', ' + t'), { labelAt: 'start', weight: 0.8 });
  return { pw, pt };
}

/** The DSE2025 tariff figure: Pw, "Pw + t", Q₁ and Q₂, imports QM, tariff revenue. */
function tariff(): Diagram {
  const d = curve([[0.06, 0.92], [0.88, 0.12]], sym('D'));
  const s = curve([[0.1, 0.06], [0.62, 0.94]], sym('S'));
  const { pw, pt } = tariffLines(0.32, 0.16);
  const q1 = reading(s, pt, sub('Q', '1'));
  const q2 = reading(d, pt, sub('Q', '2'));
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, s, pw, pt],
      points: [q1, q2],
      // Imports on the quantity axis, between the drops from Q₁ and Q₂.
      spans: [span(at(q1), at(q2), 'bracket', { along: 'x', label: sub('Q', 'M') })],
    }),
    (r) => shade(r, 'tariffRevenue', { demand: d.id, supply: s.id, world: { curve: pw.id }, raised: { curve: pt.id } }),
  );
}

/** The MCQ figure (DSE2014/P1/Q45): four quantities and the welfare areas a–d. */
function tariffWelfare(): Diagram {
  const d = curve([[0.06, 0.92], [0.88, 0.12]], sym('D'));
  const s = curve([[0.1, 0.06], [0.62, 0.94]], sym('S'));
  const { pw, pt } = tariffLines(0.3, 0.14, 0.92);
  const points = [
    reading(s, pw, sub('Q', '1')),
    reading(s, pt, sub('Q', '2')),
    reading(d, pt, sub('Q', '3')),
    reading(d, pw, sub('Q', '4')),
  ];
  const roles = { demand: d.id, supply: s.id, world: { curve: pw.id }, raised: { curve: pt.id } };
  // a: PS gain, left of S; b, d: the two DWL triangles; c: tariff revenue.
  return finish(axes(AXIS.quantity, bi('$', '$'), { curves: [d, s, pw, pt], points }), (r) => {
    const [b, dd] = shade(r, 'tariffDwl', roles);
    return [
      ...shade(r, 'tariffPsGain', roles, { label: sym('a') }),
      { ...b, label: sym('b') },
      ...shade(r, 'tariffRevenue', roles, { label: sym('c') }),
      { ...dd, label: sym('d') },
    ];
  });
}

/** "S with quota": S up to Pw, flat for the quota QA, then S shifted right by QA. */
function quotaSupply(sPts: Pair[], pwY: number, quota: number) {
  const kink = xOn(sPts, pwY);
  return {
    kink,
    curve: curve(
      [sPts[0], [kink, pwY], [kink + quota, pwY], [xOn(sPts, 0.9) + quota, 0.9]],
      bi('S with quota', '有配額的供應'),
    ),
  };
}

function importQuota(): Diagram {
  const sPts: Pair[] = [[0.1, 0.06], [0.6, 0.9]];
  const pwY = 0.3;
  const quota = 0.22;
  const s = curve(sPts, sym('S'));
  const pw = priceLine(pwY, sub('P', 'w'));
  const { kink, curve: withQuota } = quotaSupply(sPts, pwY, quota);
  const d = curve([[0.06, 0.9], [0.9, 0.12]], sym('D'));
  const ea = eq(d, withQuota, 'A', { p: 'P', q: '' }, { yTickLabel: sub('P', 'A') });
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [s, pw, withQuota, d],
      points: [ea],
      labels: [label(kink + quota / 2, pwY + 0.05, sub('Q', 'A'))],
    }),
  );
}

/** A demand rise under an import quota: D₀ → D₁ first, then the quota rent at the new price. */
function importQuotaDemand(): Diagram {
  const sPts: Pair[] = [[0.1, 0.06], [0.6, 0.9]];
  const pwY = 0.28;
  const s = curve(sPts, sym('S'));
  const pw = priceLine(pwY, sub('P', 'w'));
  const { curve: withQuota } = quotaSupply(sPts, pwY, 0.18);
  const d0 = curve([[0.06, 0.8], [0.8, 0.12]], sub('D', '0'));
  const d1 = shiftOf(d0, 0.14, 0, sub('D', '1'));
  const e0 = eq(d0, withQuota, '0', { p: '', q: '' });
  const e1 = eq(d1, withQuota, '1', { p: '', q: '' });
  // The domestic price with the quota, level with E₁ wherever D₁ and the quota put it.
  const p1 = derived({ kind: 'level', y: at(e1), from: 0, to: 0.9 }, [d1, withQuota, e1], sub('P', '1'), {
    labelAt: 'start',
    weight: 0.8,
    stroke: 'dashed',
  });
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [s, pw, withQuota, d0, d1, p1],
      points: [e0, e1],
      arrows: [arrow([0.2, 0.72], [0.34, 0.72])],
    }),
    (r) => shade(r, 'quotaRent', { demand: d1.id, supply: s.id, world: { curve: pw.id }, raised: { curve: p1.id } }),
  );
}

/** The earlier quota figure (DSE2017/P1/Q42): a kinked S₁ shifting to S₂. */
function importQuotaIncrease(): Diagram {
  const s1 = curve([[0.06, 0.14], [0.22, 0.4], [0.44, 0.4], [0.66, 0.82]], sub('S', '1'));
  return finish(
    axes(bi('Quantity of Good X', 'X 貨品數量'), AXIS.price, {
      curves: [curve([[0.06, 0.9], [0.86, 0.26]], sym('D')), s1, shiftOf(s1, 0.18, 0, sub('S', '2'))],
      arrows: [arrow([0.5, 0.6], [0.66, 0.6])],
    }),
  );
}

/** D from (0, a) to (xEnd, yEnd), and MR derived from it: same intercept, twice the slope. */
function demandAndMr(a: number, xEnd: number, yEnd: number) {
  const d = curve([[0, a], [xEnd, yEnd]], sym('D'));
  // MR's name sits just above the axis it reaches, clear of the quantity ticks.
  const mr = derived({ kind: 'marginalRevenue', of: d.id }, [d], sym('MR'), { labelOffset: { x: 0.01, y: 0.08 } });
  return { d, mr };
}

/** A horizontal MC that drags by its number. */
const flatMc = (y: number, name: ReturnType<typeof sym>) => derived({ kind: 'level', y, from: 0, to: 0.9 }, [], name);

/** Q where MR = MC, and P read up to D: the point on D above MR ∩ MC. */
const monopolyPoint = (d: DiagramCurve, mr: DiagramCurve, mc: DiagramCurve, n: string, extra = {}) =>
  markAt({ on: d.id, x: cross(mr, mc) }, [d, mr, mc], n, {}, extra);

function monopoly(lumpSum = false): Diagram {
  const { d, mr } = demandAndMr(0.9, 0.9, 0.1);
  const mc = flatMc(0.3, sym('MC'));
  const pm = monopolyPoint(
    d,
    mr,
    mc,
    'm',
    lumpSum ? { xTickLabel: lab('Q', ['t'], ' = Q', ['m']), yTickLabel: lab('P', ['t'], ' = P', ['m']) } : {},
  );
  const qc = eq(d, mc, 'c', {}, { dot: true });
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, mr, mc],
      points: [pm, pin(cross(mr, mc), [mr, mc]), qc],
    }),
    (r) =>
      shade(r, 'monopolyDwl', { demand: d.id, mr: mr.id, mc: mc.id }, {
        label: lumpSum ? lab('DL', ['0'], ' = DL', ['1']) : sym('DWL'),
      }),
  );
}

/** Upward MC (DSE2014): Qm, Pm at MR = MC; Qc, Pc where D meets MC; the DWL between. */
function monopolyRisingMc(): Diagram {
  const { d, mr } = demandAndMr(0.9, 0.9, 0.1);
  const mc = curve([[0.08, 0.1], [0.8, 0.82]], sym('MC'));
  const pm = monopolyPoint(d, mr, mc, 'm');
  const pc = eq(d, mc, 'c');
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, mr, mc],
      points: [pm, pin(cross(mr, mc), [mr, mc]), pc],
    }),
    (r) => shade(r, 'monopolyDwl', { demand: d.id, mr: mr.id, mc: mc.id }, { labelPlacement: 'leader' }),
  );
}

/** MC rises MC₁ → MC₂ (DSE2018): Q₂ < QM, P₂ > PM, and the DWL at MC₂. */
function monopolyMcRises(): Diagram {
  const { d, mr } = demandAndMr(0.9, 0.9, 0.1);
  const mc1 = curve([[0.1, 0.12], [0.8, 0.68]], sub('MC', '1'));
  const mc2 = shiftOf(mc1, 0, 0.26, sub('MC', '2'));
  const m = monopolyPoint(d, mr, mc1, 'M');
  const e2 = monopolyPoint(d, mr, mc2, '2');
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, mr, mc1, mc2],
      points: [m, e2],
      arrows: [arrow([0.7, 0.64], [0.7, 0.82])],
    }),
    (r) => shade(r, 'monopolyDwl', { demand: d.id, mr: mr.id, mc: mc2.id }, { labelPlacement: 'leader' }),
  );
}

/**
 * MC falls but the firm keeps Q and P (DSE2016): DL₀ between D and MC₀, and the
 * increase in DL — the band between MC₀ and MC₁ (capped by D) from Qm on.
 */
function monopolySameOutput(): Diagram {
  const { d, mr } = demandAndMr(0.9, 0.9, 0.1);
  const mc0 = curve([[0.1, 0.24], [0.8, 0.84]], sub('MC', '0'));
  const mc1 = shiftOf(mc0, 0, -0.16, sub('MC', '1'));
  const pm = monopolyPoint(d, mr, mc0, 'm');
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, mr, mc0, mc1],
      points: [pm],
      arrows: [arrow([0.72, 0.8], [0.72, 0.66])],
      areas: [
        {
          id: newId(),
          band: { edges: [{ curve: mc0.id }, { curve: mc1.id }], from: cross(mr, mc0), to: cross(d, mc1), cap: { curve: d.id } },
          fill: 'hatch',
          pattern: 'horizontal',
          label: bi('increase in DL', '無謂損失增加'),
          labelPlacement: 'leader',
        },
      ],
    }),
    (r) => shade(r, 'monopolyDwl', { demand: d.id, mr: mr.id, mc: mc0.id }, { label: sub('DL', '0'), labelPlacement: 'leader' }),
  );
}

/** MC = 0: MR meets the axis at the midpoint of D's quantity intercept. */
function monopolyMcZero(): Diagram {
  const d = placeLabel(curve([[0, 0.88], [0.84, 0]], bi('D = MB', 'D = MB')), 0.73, 0.2);
  const mr = placeLabel(derived({ kind: 'marginalRevenue', of: d.id }, [d], sym('MR')), 0.3, 0.3);
  // QM where MR reaches zero, PM on D above it; QE at D's own intercept.
  const pm = markAt({ on: d.id, x: { on: mr.id, y: 0 } }, [d, mr], 'M');
  const qe = pin({ on: d.id, y: 0 }, [d], undefined, { dot: false, xTickLabel: sub('Q', 'E') });
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, mr],
      points: [pm, qe],
      labels: [label(0.93, 0.05, bi('MC = 0', 'MC = 0'))],
      // No MC curve to name (it lies on the axis), so the DWL is a band to the axis.
      areas: [
        band([{ curve: d.id }, { level: 0 }], at(pm), at(qe), {
          fill: 'hatch',
          pattern: PRESET_PATTERNS.deadweightLoss,
          label: sym('DWL'),
        }),
      ],
    }),
  );
}

function monopolyCostFall(): Diagram {
  const { d, mr } = demandAndMr(0.9, 0.9, 0.1);
  const mc1 = flatMc(0.42, sub('MC', '1'));
  const mc2 = flatMc(0.24, sub('MC', '2'));
  const e1 = monopolyPoint(d, mr, mc1, '1');
  const e2 = monopolyPoint(d, mr, mc2, '2');
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, mr, mc1, mc2],
      points: [e1, e2],
      arrows: [arrow([0.84, 0.4], [0.84, 0.26])],
    }),
    // The two DWLs overlap, so they keep two patterns rather than the preset's one.
    (r) => [
      ...shade(r, 'monopolyDwl', { demand: d.id, mr: mr.id, mc: mc1.id }, { label: sub('DWL', '1'), pattern: 'diagonal' }),
      // Nudged down, between MC₁ and MC₂, clear of the MC₁ line.
      ...shade(r, 'monopolyDwl', { demand: d.id, mr: mr.id, mc: mc2.id }, {
        label: sub('DWL', '2'),
        pattern: 'reverse',
        labelOffset: { x: 0.04, y: -0.05 },
      }),
    ],
  );
}

function ppfLinearTrade(): Diagram {
  const ppf = placeLabel(curve([[0, 0.5], [0.6, 0]], sym('PPF')), 0.1, 0.34);
  const cpf = placeLabel(curve([[0, 0.9], [0.6, 0]], sym('CPF')), 0.1, 0.83);
  // Production at PPF's X intercept; consumption on the CPF (slope = TOT), outside the PPF.
  const b = pin({ on: ppf.id, y: 0 }, [ppf], sym('B'), { labelSide: 'upRight' });
  const c = pin({ on: cpf.id, x: { x: 0.25, y: 0 } }, [cpf], sym('C'), { labelSide: 'upRight', dropTo: ['x', 'y'] });
  return finish(
    axes(GOOD.x, GOOD.y, {
      curves: [ppf, cpf],
      points: [pin({ on: ppf.id, x: { x: 0.36, y: 0 } }, [ppf], sym('A'), { labelSide: 'upRight' }), b, c],
      // Export and import volumes as brackets outside the axes, clear of the frontiers.
      spans: [
        span(at(c), at(b), 'bracket', { along: 'x', label: bi('exports', '出口') }),
        span(at(b), at(c), 'bracket', { along: 'y', label: bi('imports', '進口') }),
      ],
    }),
  );
}

/** A concave frontier: a quarter-ellipse through (0, b) and (a, 0). */
function frontier(a: number, b: number): Pair[] {
  return [90, 75, 60, 45, 30, 15, 0].map((deg) => {
    const t = (deg * Math.PI) / 180;
    return [a * Math.cos(t), b * Math.sin(t)];
  });
}

/**
 * Concave PPF with trade: the CPF is the tangent at production B, so it follows B along
 * the frontier; the TOT guide is parallel to it; consumption C stays on the CPF.
 */
function ppfConcaveTrade(): Diagram {
  const a = 0.72;
  const b = 0.78;
  const onFrontier = (deg: number) => ({ x: a * Math.cos((deg * Math.PI) / 180), y: b * Math.sin((deg * Math.PI) / 180) });
  const home = onFrontier(62);
  // Between the frontier's vertices, so pressing B grabs the point, not the curve's handle.
  const prod = onFrontier(37);
  const ppf = placeLabel(curve(frontier(a, b), sym('PPF'), { shape: 'curved' }), 0.1, 0.7);
  const pb = point(prod.x, prod.y, sym('B'), { labelSide: 'left' });
  const cpf = derived({ kind: 'tangent', to: ppf.id, at: at(pb) }, [ppf, pb], sym('CPF'), { labelAt: 'start' });
  const tot = derived({ kind: 'parallel', to: cpf.id, through: { x: 0.03, y: 0.44 }, ys: [0.14, 0.44] }, [cpf], sym('TOT'), {
    stroke: 'dashed',
    weight: 0.8,
  });
  const pc = pin({ on: cpf.id, x: { x: home.x + 0.07, y: 0 } }, [cpf], sym('C'), { labelSide: 'upRight' });
  return finish(
    axes(GOOD.x, GOOD.y, {
      curves: [ppf, cpf, tot],
      points: [point(home.x, home.y, sym('A'), { labelSide: 'downLeft' }), pb, pc],
      spans: [
        span(at(pc), at(pb), 'bracket', { along: 'x', label: bi('exports', '出口') }),
        span(at(pb), at(pc), 'bracket', { along: 'y', label: bi('imports', '進口') }),
      ],
    }),
  );
}

/**
 * Two countries on one figure (DSEPP): each specialises at an intercept, and the CPFs are
 * parallel at the one TOT. For the countries side by side, insert the template twice.
 */
function ppfTwoCountries(): Diagram {
  const ppfA = placeLabel(curve([[0, 0.4], [0.8, 0]], sub('PPF', 'A')), 0.2, 0.22);
  const ppfB = placeLabel(curve([[0, 0.9], [0.45, 0]], sub('PPF', 'B')), 0.36, 0.3);
  const cpfA = placeLabel(curve([[0, 0.8], [0.8, 0]], sub('CPF', 'A')), 0.36, 0.475);
  const pa = pin({ on: ppfA.id, y: 0 }, [ppfA], lab('A′'), { labelSide: 'down' });
  const pb = pin({ on: ppfB.id, x: { x: 0, y: 0 } }, [ppfB], lab('B′'), { labelSide: 'upRight' });
  const cpfB = placeLabel(derived({ kind: 'parallel', to: cpfA.id, through: at(pb) }, [cpfA, pb], sub('CPF', 'B')), 0.56, 0.44);
  return finish({
    ...axes(GOOD.x, GOOD.y, { curves: [ppfA, ppfB, cpfA, cpfB], points: [pa, pb] }),
    x: { title: GOOD.x, max: 100 },
    y: { title: GOOD.y, max: 100 },
  });
}

function ppfShift(): Diagram {
  const p0 = placeLabel(curve(frontier(0.52, 0.56), sub('PPF', '0'), { shape: 'curved' }), 0.55, 0.07);
  const p1 = placeLabel(curve(frontier(0.8, 0.86), sub('PPF', '1'), { shape: 'curved' }), 0.83, 0.07);
  return axes(GOOD.x, GOOD.y, {
    curves: [p0, p1],
    arrows: [arrow([0.4, 0.43], [0.55, 0.6])],
  });
}

// Chinese on one line: a bilingual title may take three lines under the axis, not four.
const POPULATION = bi('Cumulative %\nof population', '人口累積百分比');

function lorenz(): Diagram {
  const hundred = (at: number) => ({ id: newId(), at, label: bi('100%', '100%') });
  const equality = curve([[0, 0], [0.9, 0.9]]);
  const before = placeLabel(
    curve([[0, 0], [0.3, 0.07], [0.6, 0.25], [0.8, 0.5], [0.9, 0.9]], sym('A'), { shape: 'curved' }),
    0.66,
    0.24,
  );
  const after = placeLabel(
    curve([[0, 0], [0.3, 0.15], [0.6, 0.39], [0.8, 0.62], [0.9, 0.9]], sym('B'), { shape: 'curved' }),
    0.5,
    0.39,
  );
  return {
    ...axes(POPULATION, bi('Cumulative % of income', '收入累積百分比'), {
      curves: [equality, before, after],
      labels: [
        // Above-left of the diagonal it names; the key below it, left of the diagonal.
        label(0.74, 0.84, bi('Line of equality', '絕對平均線'), { align: 'right' }),
        label(0.03, 0.64, bi('A: before tax\nB: after tax', 'A：稅前\nB：稅後'), { align: 'left' }),
      ],
    }),
    x: { title: POPULATION, ticks: [hundred(0.9)] },
    y: { title: bi('Cumulative % of income', '收入累積百分比'), ticks: [hundred(0.9)] },
  };
}

export const TRADE_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'exchange-rate-revenue',
    group: 'trade',
    name: bi('Exchange rate: import value', '匯率：進口值'),
    hint: bi('Price in HK$ rises along D: gain (+) and loss (−) rectangles.', '以港元計價格沿 D 上升：收益增加 (+) 及減少 (−)。'),
    build: () =>
      alongDemand([[0.06, 0.72], [0.9, 0.3]], 0.4, 0.54, {
        x: bi('Quantity of imports', '進口量'),
        y: bi('Price (HK$)', '價格（港元）'),
      }),
  },
  {
    id: 'fixed-export-price',
    group: 'trade',
    name: bi('Fixed exporter price', '出口商定價不變'),
    hint: bi("Price fixed in the seller's currency: D₀ → D₁, gain P × ΔQ.", '以賣方貨幣定價：D₀ → D₁，收益增加 P × ΔQ。'),
    build: fixedExportPrice,
  },
  {
    id: 'substitute-revenue',
    group: 'trade',
    name: bi('Exchange rate: substitute good', '匯率：替代品'),
    hint: bi('D₁ → D₂ on an upward S: P, Q and the import value fall.', 'D₁ → D₂（供應向上傾斜）：價格、數量及進口值下降。'),
    build: substituteRevenue,
  },
  {
    id: 'tariff-welfare',
    group: 'trade',
    name: bi('Tariff: welfare areas', '關稅：福利面積'),
    hint: bi('Pw and Pw + t, four quantities, areas a–d for MCQs.', 'Pw 及 Pw + t，四個數量，選擇題用面積 a–d。'),
    build: tariffWelfare,
  },
  {
    id: 'import-quota-demand',
    group: 'trade',
    name: bi('Import quota: demand rises', '進口配額：需求上升'),
    hint: bi('D₀ → D₁ with the quota fixed: the price rises, the quota rent at P₁.', '配額不變下 D₀ → D₁：價格上升，P₁ 的配額租金。'),
    build: importQuotaDemand,
  },
  {
    id: 'import-quota-increase',
    group: 'trade',
    name: bi('Import quota increase', '進口配額增加'),
    hint: bi('A kinked supply curve shifting outwards.', '有拗折的供應曲線向外移。'),
    build: importQuotaIncrease,
  },
  {
    id: 'monopoly',
    group: 'electives',
    name: bi('Monopoly', '壟斷'),
    hint: bi('D, MR at twice the slope, constant MC: Qm, Pm, Qc and the DWL.', 'D、斜率加倍的 MR、固定 MC：Qm、Pm、Qc 及無謂損失。'),
    build: () => monopoly(),
  },
  {
    id: 'monopoly-rising-mc',
    group: 'electives',
    name: bi('Monopoly with rising MC', '邊際成本上升的壟斷'),
    hint: bi('Upward MC: Qm, Pm at MR = MC; Qc, Pc where D meets MC.', '向上傾斜的 MC：MR = MC 的 Qm、Pm；D 與 MC 相交的 Qc、Pc。'),
    build: monopolyRisingMc,
  },
  {
    id: 'monopoly-mc-zero',
    group: 'electives',
    name: bi('Monopoly with MC = 0', '邊際成本為零的壟斷'),
    hint: bi('QM at the midpoint, QE at D’s intercept, the DWL between.', 'QM 在中點，QE 在需求截距，其間為無謂損失。'),
    build: monopolyMcZero,
  },
  {
    id: 'monopoly-cost-fall',
    group: 'electives',
    name: bi('Monopoly: MC falls', '壟斷：邊際成本下降'),
    hint: bi('MC₁ → MC₂: Q rises, P falls, old and new DWL.', 'MC₁ → MC₂：數量上升、價格下降，新舊無謂損失。'),
    build: monopolyCostFall,
  },
  {
    id: 'monopoly-mc-rises',
    group: 'electives',
    name: bi('Monopoly: MC rises', '壟斷：邊際成本上升'),
    hint: bi('MC₁ → MC₂: Q₂ < QM, P₂ > PM, the DWL at MC₂.', 'MC₁ → MC₂：Q₂ < QM，P₂ > PM，MC₂ 的無謂損失。'),
    build: monopolyMcRises,
  },
  {
    id: 'monopoly-same-output',
    group: 'electives',
    name: bi('Monopoly: MC falls, same P and Q', '壟斷：MC 下降但價量不變'),
    hint: bi('MC₀ → MC₁ with Qm and Pm kept: DL₀ and the increase in DL.', 'MC₀ → MC₁ 而 Qm、Pm 不變：DL₀ 及無謂損失的增加。'),
    build: monopolySameOutput,
  },
  {
    id: 'monopoly-lump-sum',
    group: 'electives',
    name: bi('Monopoly: lump-sum tax', '壟斷：定額稅'),
    hint: bi('MC and MR unchanged: Qt = Qm, Pt = Pm, DL₀ = DL₁.', 'MC 及 MR 不變：Qt = Qm，Pt = Pm，DL₀ = DL₁。'),
    build: () => monopoly(true),
  },
  {
    id: 'ppf-linear-trade',
    group: 'electives',
    name: bi('Linear PPF with trade', '直線 PPF 與貿易'),
    hint: bi('Specialise at an intercept; CPF at the TOT; exports and imports.', '在截距專門生產；CPF 斜率為貿易條件；出口及進口。'),
    build: ppfLinearTrade,
  },
  {
    id: 'ppf-two-countries',
    group: 'electives',
    name: bi('Two countries: PPFs and CPFs', '兩國：PPF 及 CPF'),
    hint: bi('Both PPFs on one figure, each specialising; parallel CPFs at the TOT.', '兩國 PPF 同圖，各自專門生產；貿易條件下平行的 CPF。'),
    build: ppfTwoCountries,
  },
  {
    id: 'ppf-concave-trade',
    group: 'electives',
    name: bi('Concave PPF with trade', '凹向原點 PPF 與貿易'),
    hint: bi('CPF tangent at production B, parallel to TOT; consumption C.', 'CPF 在生產點 B 相切並與貿易條件平行；消費點 C。'),
    build: ppfConcaveTrade,
  },
  {
    id: 'ppf-shift',
    group: 'electives',
    name: bi('PPF shifts outward', 'PPF 向外移'),
    hint: bi('PPF₀ → PPF₁: both intercepts rise.', 'PPF₀ → PPF₁：兩個截距上升。'),
    build: ppfShift,
  },
  {
    id: 'lorenz',
    group: 'taxSubsidy',
    name: bi('Lorenz curve', '洛倫茲曲線'),
    hint: bi('Line of equality, a before-tax curve and a flatter after-tax one.', '絕對平均線、稅前曲線及較接近對角線的稅後曲線。'),
    build: lorenz,
  },
];

export { tariff as buildTariff, importQuota as buildImportQuota };
