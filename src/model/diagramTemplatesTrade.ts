import type { Diagram, DiagramCurve } from './diagram';
import { PRESET_PATTERNS, revenueArea } from './diagramAreas';
import {
  AXIS,
  alongDemand,
  arrow,
  axes,
  band,
  bi,
  curve,
  label,
  mark,
  meet,
  newId,
  placeLabel,
  point,
  priceLine,
  reading,
  shifted,
  sub,
  subPlus,
  sym,
  xOn,
  type DiagramTemplate,
  type Pair,
} from './diagramTemplateKit';

/**
 * Trade, exchange-rate and elective templates (groups D and F): revenue boxes, the
 * small-open-economy tariff and quota, the monopoly firm, PPF/CPF trade, the Lorenz curve.
 */

const GOOD = { x: bi('Good X', 'X 貨品'), y: bi('Good Y', 'Y 貨品') };

function fixedExportPrice(): Diagram {
  const p = priceLine(0.48, sym('P'));
  const base: Pair[] = [[0.06, 0.86], [0.6, 0.12]];
  const d0 = curve(base, sub('D', '0'));
  const d1 = curve(shifted(base, 0.22), sub('D', '1'));
  const e0 = mark(meet(d0, p), '0', { p: '' }, { labelSide: 'downLeft' });
  const e1 = mark(meet(d1, p), '1', { p: '' }, { labelSide: 'upRight' });
  return axes(bi('Quantity\nof exports', '出口量'), bi('Price (Yen)', '價格（日圓）'), {
    curves: [p, d0, d1],
    points: [e0, e1],
    arrows: [arrow([0.13, 0.74], [0.31, 0.74])],
    areas: [{ ...revenueArea('revenueGain', { before: { point: e0.id }, after: { point: e1.id } }, newId())!, label: sym('+') }],
  });
}

/** The DSE2025 tariff figure: Pw, "Pw + t", Q₁ and Q₂, imports QM, tariff revenue. */
function tariff(): Diagram {
  const d = curve([[0.06, 0.92], [0.88, 0.12]], sym('D'));
  const s = curve([[0.1, 0.06], [0.62, 0.94]], sym('S'));
  const pw = priceLine(0.32, sub('P', 'w'));
  const pt = priceLine(0.48, subPlus('P', 'w', ' + t'));
  const q1 = reading(s, pt, sub('Q', '1'));
  const q2 = reading(d, pt, sub('Q', '2'));
  const mid = (q1.at.x + q2.at.x) / 2;
  const y = 0.24;
  return axes(AXIS.quantity, AXIS.price, {
    curves: [d, s, pw, pt],
    points: [q1, q2],
    // Back-to-back arrows stand in for the imports bracket, below Pw where it is clear.
    arrows: [arrow([mid, y], [q1.at.x + 0.01, y]), arrow([mid, y], [q2.at.x - 0.01, y])],
    labels: [label(mid, y - 0.07, sub('Q', 'M'))],
    areas: [
      band([{ level: { cross: [pt.id, s.id] } }, { level: { cross: [pw.id, s.id] } }], { point: q1.id }, { point: q2.id }, {
        fill: 'hatch',
        pattern: PRESET_PATTERNS.taxRevenue,
        label: bi('Tariff revenue', '關稅收入'),
      }),
    ],
  });
}

/** The MCQ figure (DSE2014/P1/Q45): four quantities and the welfare letters a–d. */
function tariffWelfare(): Diagram {
  const d = curve([[0.06, 0.92], [0.88, 0.12]], sym('D'));
  const s = curve([[0.1, 0.06], [0.62, 0.94]], sym('S'));
  const pw = priceLine(0.3, sub('P', 'w'), 0.92);
  const pt = priceLine(0.44, subPlus('P', 'w', ' + t'), 0.92);
  const [q1, q2, q3, q4] = [
    reading(s, pw, sub('Q', '1')),
    reading(s, pt, sub('Q', '2')),
    reading(d, pt, sub('Q', '3')),
    reading(d, pw, sub('Q', '4')),
  ];
  const y = (0.3 + 0.44) / 2;
  const [x1, x2, x3, x4] = [q1, q2, q3, q4].map((q) => q.at.x);
  // a: PS gain, left of S; b, d: the two DWL triangles; c: tariff revenue.
  return axes(AXIS.quantity, bi('$', '$'), {
    curves: [d, s, pw, pt],
    points: [q1, q2, q3, q4],
    labels: [
      label(x1 / 2, y, sym('a')),
      label((x1 + 2 * x2) / 3, (0.3 * 2 + 0.44) / 3, sym('b')),
      label((x2 + x3) / 2, y, sym('c')),
      label((2 * x3 + x4) / 3, (0.3 * 2 + 0.44) / 3, sym('d')),
    ],
  });
}

/** "S with quota": S up to Pw, flat for the quota QA, then S shifted right by QA. */
function importQuota(): Diagram {
  const sPts: Pair[] = [[0.1, 0.06], [0.6, 0.9]];
  const pwY = 0.3;
  const quota = 0.22;
  const kink = xOn(sPts, pwY);
  const s = curve(sPts, sym('S'));
  const pw = priceLine(pwY, sub('P', 'w'));
  const withQuota = curve(
    [sPts[0], [kink, pwY], [kink + quota, pwY], [xOn(sPts, 0.9) + quota, 0.9]],
    bi('S with quota', '有配額的供應'),
  );
  const d = curve([[0.06, 0.9], [0.9, 0.12]], sym('D'));
  const ea = mark(meet(d, withQuota), 'A', { p: 'P', q: '' }, { label: sub('E', 'A'), yTickLabel: sub('P', 'A') });
  return axes(AXIS.quantity, AXIS.price, {
    curves: [s, pw, withQuota, d],
    points: [ea],
    labels: [label(kink + quota / 2, pwY + 0.05, sub('Q', 'A'))],
  });
}

/** The earlier quota figure (DSE2017/P1/Q42): a kinked S₁ shifting to S₂. */
function importQuotaIncrease(): Diagram {
  return axes(bi('Quantity of Good X', 'X 貨品數量'), AXIS.price, {
    curves: [
      curve([[0.06, 0.9], [0.86, 0.26]], sym('D')),
      curve([[0.06, 0.14], [0.22, 0.4], [0.44, 0.4], [0.66, 0.82]], sub('S', '1')),
      curve([[0.24, 0.14], [0.4, 0.4], [0.62, 0.4], [0.84, 0.82]], sub('S', '2')),
    ],
    arrows: [arrow([0.5, 0.6], [0.66, 0.6])],
  });
}

/** D from (0, a) to (xEnd, yEnd), and MR from the same intercept at twice the slope. */
function demandAndMr(a: number, xEnd: number, yEnd: number, mrEnd: number) {
  const slope = (a - yEnd) / xEnd;
  const d = curve([[0, a], [xEnd, yEnd]], sym('D'));
  const mr = curve([[0, a], [(a - mrEnd) / (2 * slope), mrEnd]], sym('MR'));
  return { d, mr };
}

function monopoly(): Diagram {
  const { d, mr } = demandAndMr(0.9, 0.9, 0.1, 0.12);
  const mc = curve([[0, 0.3], [0.9, 0.3]], sym('MC'));
  const qm = meet(mr, mc);
  const pm = mark({ x: qm.x, y: meet(d, curve([[qm.x, 0], [qm.x, 1]])).y }, 'm', { e: '' });
  const qc = mark(meet(d, mc), 'c', { e: '' }, { dot: true });
  return axes(AXIS.quantity, AXIS.price, {
    curves: [d, mr, mc],
    points: [pm, point(qm.x, qm.y), qc],
    areas: [dwl(d, mc, pm.id)],
  });
}

const dwl = (d: DiagramCurve, mc: DiagramCurve, from: string, text = sym('DWL'), pattern = PRESET_PATTERNS.deadweightLoss) =>
  band([{ curve: d.id }, { curve: mc.id }], { point: from }, { cross: [d.id, mc.id] }, { fill: 'hatch', pattern, label: text });

/** MC = 0: MR meets the axis at the midpoint of D's quantity intercept. */
function monopolyMcZero(): Diagram {
  const d = placeLabel(curve([[0, 0.88], [0.84, 0]], bi('D = MB', 'D = MB')), 0.73, 0.2);
  const mr = placeLabel(curve([[0, 0.88], [0.42, 0]], sym('MR')), 0.3, 0.3);
  const pm = mark({ x: 0.42, y: 0.44 }, 'M', { e: '' });
  const qe = point(0.84, 0, undefined, { dot: false, xTickLabel: sub('Q', 'E') });
  return axes(AXIS.quantity, AXIS.price, {
    curves: [d, mr],
    points: [pm, qe],
    labels: [label(0.93, 0.05, bi('MC = 0', 'MC = 0'))],
    areas: [
      band([{ curve: d.id }, { level: 0 }], { point: pm.id }, { point: qe.id }, {
        fill: 'hatch',
        pattern: PRESET_PATTERNS.deadweightLoss,
        label: sym('DWL'),
      }),
    ],
  });
}

function monopolyCostFall(): Diagram {
  const { d, mr } = demandAndMr(0.9, 0.9, 0.1, 0.12);
  const mc1 = curve([[0, 0.42], [0.9, 0.42]], sub('MC', '1'));
  const mc2 = curve([[0, 0.24], [0.9, 0.24]], sub('MC', '2'));
  const at = (mc: DiagramCurve) => {
    const q = meet(mr, mc);
    return { x: q.x, y: meet(d, curve([[q.x, 0], [q.x, 1]])).y };
  };
  const e1 = mark(at(mc1), '1', { e: '' });
  const e2 = mark(at(mc2), '2', { e: '' });
  return axes(AXIS.quantity, AXIS.price, {
    curves: [d, mr, mc1, mc2],
    points: [e1, e2],
    arrows: [arrow([0.84, 0.4], [0.84, 0.26])],
    areas: [
      dwl(d, mc1, e1.id, sub('DWL', '1'), 'diagonal'),
      // Nudged down, between MC₁ and MC₂, clear of the MC₁ line.
      { ...dwl(d, mc2, e2.id, sub('DWL', '2'), 'reverse'), labelOffset: { x: 0.04, y: -0.05 } },
    ],
  });
}

function ppfLinearTrade(): Diagram {
  const ppf = placeLabel(curve([[0, 0.5], [0.6, 0]], sym('PPF')), 0.1, 0.34);
  const cpf = placeLabel(curve([[0, 0.9], [0.6, 0]], sym('CPF')), 0.1, 0.83);
  // Consumption on the CPF (slope = TOT), outside the PPF.
  const c = { x: 0.25, y: 0.525 };
  return axes(GOOD.x, GOOD.y, {
    curves: [
      ppf,
      cpf,
      // Export and import volumes, as dashed runs along the axes.
      curve([[c.x, 0.025], [0.6, 0.025]], undefined, { stroke: 'dashed', weight: 0.7 }),
      curve([[0.025, 0], [0.025, c.y]], undefined, { stroke: 'dashed', weight: 0.7 }),
    ],
    points: [
      point(0.36, 0.2, sym('A'), { labelSide: 'upRight' }),
      point(0.6, 0, sym('B'), { labelSide: 'upRight' }),
      point(c.x, c.y, sym('C'), { labelSide: 'upRight', dropTo: ['x', 'y'] }),
    ],
    labels: [
      label(c.x + 0.09, 0.13, bi('exports', '出口')),
      label(0.05, 0.22, bi('imports', '進口'), { align: 'left' }),
    ],
  });
}

/** A concave frontier: a quarter-ellipse through (0, b) and (a, 0). */
function frontier(a: number, b: number): Pair[] {
  return [90, 75, 60, 45, 30, 15, 0].map((deg) => {
    const t = (deg * Math.PI) / 180;
    return [a * Math.cos(t), b * Math.sin(t)];
  });
}

function ppfConcaveTrade(): Diagram {
  const a = 0.72;
  const b = 0.78;
  const at = (deg: number) => ({ x: a * Math.cos((deg * Math.PI) / 180), y: b * Math.sin((deg * Math.PI) / 180) });
  const home = at(60);
  const prod = at(30);
  const tot = (b / a) / Math.tan(Math.PI / 6);
  const yAt = (x: number) => prod.y - tot * (x - prod.x);
  const xAt = (y: number) => prod.x + (prod.y - y) / tot;
  const ppf = placeLabel(curve(frontier(a, b), sym('PPF'), { shape: 'curved' }), 0.1, 0.7);
  const cpf = curve([[xAt(0.92), 0.92], [xAt(0.1), 0.1]], sym('CPF'));
  const cx = home.x + 0.07;
  return axes(GOOD.x, GOOD.y, {
    curves: [
      ppf,
      cpf,
      curve([[0.03, 0.44], [0.03 + 0.3 / tot, 0.14]], sym('TOT'), { stroke: 'dashed', weight: 0.8 }),
    ],
    points: [
      point(home.x, home.y, sym('A'), { labelSide: 'downLeft' }),
      point(prod.x, prod.y, sym('B'), { labelSide: 'left' }),
      point(cx, yAt(cx), sym('C'), { labelSide: 'upRight' }),
    ],
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
    id: 'tariff-welfare',
    group: 'trade',
    name: bi('Tariff: welfare areas', '關稅：福利面積'),
    hint: bi('Pw and Pw + t, four quantities, areas a–d for MCQs.', 'Pw 及 Pw + t，四個數量，選擇題用面積 a–d。'),
    build: tariffWelfare,
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
    build: monopoly,
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
    id: 'ppf-linear-trade',
    group: 'electives',
    name: bi('Linear PPF with trade', '直線 PPF 與貿易'),
    hint: bi('Specialise at an intercept; CPF at the TOT; exports and imports.', '在截距專門生產；CPF 斜率為貿易條件；出口及進口。'),
    build: ppfLinearTrade,
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
