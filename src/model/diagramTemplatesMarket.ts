import type { Diagram } from './diagram';
import { newPresetArea, PRESET_PATTERNS } from './diagramAreas';
import {
  AXIS,
  alongDemand,
  axes,
  band,
  bi,
  changeArrows,
  curve,
  label,
  mark,
  meet,
  newId,
  onCurve,
  point,
  priceLine,
  reading,
  shifted,
  arrow,
  sub,
  subPlus,
  sym,
  xOn,
  type DiagramTemplate,
  type Pair,
} from './diagramTemplateKit';

/**
 * Single-market templates: shifts, elasticity and revenue, price controls, quotas, tax
 * and subsidy. Traced from the scheme figures in `docs/Diagram_Requirements/` (§8,
 * groups A, B, E, F). Every equilibrium is computed from its curves, never typed.
 */

const D: Pair[] = [[0.06, 0.9], [0.74, 0.2]];
const S: Pair[] = [[0.06, 0.1], [0.7, 0.86]];

/** One shift of one curve against a fixed other: both equilibria, both change arrows. */
export function oneShift(which: 'demand' | 'supply'): Diagram {
  const moving = which === 'demand' ? D : S;
  const fixed = which === 'demand' ? S : D;
  const base = which === 'demand' ? 'D' : 'S';
  const other = which === 'demand' ? 'S' : 'D';
  const c0 = curve(moving, sub(base, '0'));
  const c1 = curve(shifted(moving, 0.18), sub(base, '1'));
  const k = curve(fixed, sym(other));
  // E₀'s right is where the shifted curve runs. When P rises, P₁'s drop runs just
  // above E₀, so its name takes the wedge left of S under P₀; else above D, left of S.
  const e0 = mark(meet(c0, k), '0', {}, {
    labelOffset: which === 'demand' ? { x: -0.08, y: -0.028 } : { x: -0.03, y: 0.085 },
  });
  const e1 = mark(meet(c1, k), '1');
  // Beside the curves' far ends, where the other curve is well away.
  const y = which === 'demand' ? 0.8 : 0.78;
  const x0 = xOn(moving, y);
  return axes(AXIS.quantity, AXIS.price, {
    curves: [c0, c1, k],
    points: [e0, e1],
    arrows: [arrow([x0 + 0.03, y], [x0 + 0.15, y]), ...changeArrows(e0.at, e1.at)],
  });
}

function simultaneous(): Diagram {
  const d0 = curve([[0.06, 0.78], [0.62, 0.16]], sub('D', '0'));
  const d1 = curve(shifted(d0.points.map((p) => [p.x, p.y] as Pair), 0.28), sub('D', '1'));
  const s0 = curve([[0.08, 0.1], [0.62, 0.8]], sub('S', '0'));
  const s1 = curve(shifted(s0.points.map((p) => [p.x, p.y] as Pair), 0.1), sub('S', '1'));
  // Above D₀, left of S₀: the one gap near E₀ with no line through it.
  const e0 = mark(meet(d0, s0), '0', {}, { labelOffset: { x: -0.03, y: 0.085 } });
  const e1 = mark(meet(d1, s1), '1');
  return axes(AXIS.quantity, AXIS.price, {
    curves: [d0, d1, s0, s1],
    points: [e0, e1],
    // The dominant shift is drawn visibly larger — the mark the schemes award for it.
    arrows: [
      arrow([0.15, 0.72], [0.38, 0.72]),
      arrow([0.165, 0.2], [0.25, 0.2]),
      ...changeArrows(e0.at, e1.at),
    ],
    labels: [label(0.28, 0.9, bi('shift of D > shift of S', 'D 的移動 > S 的移動'))],
  });
}

function fixedSupply(): Diagram {
  const s = curve([[0.46, 0.0], [0.46, 0.9]], sym('S'));
  const d0 = curve([[0.06, 0.66], [0.68, 0.1]], sub('D', '0'));
  const d1 = curve(shifted([[0.06, 0.66], [0.68, 0.1]], 0.22), sub('D', '1'));
  const e0 = mark(meet(d0, s), '0', {}, { labelSide: 'upRight' });
  const e1 = mark(meet(d1, s), '1', { q: '' }, { labelSide: 'right' });
  return axes(AXIS.quantity, AXIS.price, {
    curves: [s, d0, d1],
    points: [e0, e1],
    arrows: [arrow([0.13, 0.7], [0.29, 0.7]), ...changeArrows(e0.at, e1.at, ['y'])],
  });
}

function ceiling(withDwl: boolean): Diagram {
  const d = curve([[0.08, 0.9], [0.84, 0.14]], withDwl ? bi('D = MB', 'D = MB') : sym('D'));
  const s = curve([[0.06, 0.1], [0.7, 0.86]], withDwl ? bi('S = MC', 'S = MC') : sym('S'));
  const pc = priceLine(0.24, sub('P', 'c'));
  const e = mark(meet(d, s), 'e', { e: 'E', p: 'P', q: 'Q' }, { label: sym('E') });
  const qs = reading(s, pc, withDwl ? sub('Q', 't') : sub('Q', 's'));
  const qd = reading(d, pc, sub('Q', 'd'));
  const diagram = axes(AXIS.quantity, AXIS.price, {
    curves: [d, s, pc],
    points: withDwl ? [e, qs] : [e, qs, qd],
    // Right of Qe's drop-line, where the gap under Pc is clear.
    labels: withDwl ? [] : [label((e.at.x + qd.at.x) / 2, 0.17, bi('shortage', '短缺'))],
  });
  if (!withDwl) return diagram;
  // Under a ceiling the DWL runs from the quantity sold (read off S) to Qe.
  return {
    ...diagram,
    areas: [
      band([{ curve: d.id }, { curve: s.id }], { point: qs.id }, { point: e.id }, {
        fill: 'hatch',
        pattern: PRESET_PATTERNS.deadweightLoss,
        label: sym('DWL'),
        // Pe's drop-line runs through the triangle, so the name goes out on a leader.
        labelPlacement: 'leader',
      }),
    ],
  };
}

function minimumWage(): Diagram {
  const d = curve([[0.08, 0.9], [0.84, 0.14]], sym('D'));
  const s = curve([[0.06, 0.1], [0.7, 0.86]], sym('S'));
  const w = priceLine(0.7, sym('W'));
  const e = mark(meet(d, s), 'e', { e: 'E', p: 'W', q: 'Q' }, { label: sym('E') });
  const qd = reading(d, w, sub('Q', 'd'));
  const qs = reading(s, w, sub('Q', 's'));
  return axes(AXIS.labour, AXIS.wage, {
    curves: [d, s, w],
    points: [e, qd, qs],
    // Back-to-back arrows bracket Qd–Qs above W; the words sit clear, right of S.
    arrows: [
      arrow([(qd.at.x + qs.at.x) / 2, 0.74], [qd.at.x + 0.01, 0.74]),
      arrow([(qd.at.x + qs.at.x) / 2, 0.74], [qs.at.x - 0.01, 0.74]),
    ],
    labels: [label(0.72, 0.8, bi('surplus\n(unemployment)', '過剩（失業）'), { align: 'left' })],
  });
}

function labourImport(): Diagram {
  const localPts: Pair[] = [[0.06, 0.12], [0.5, 0.84]];
  const d = curve([[0.1, 0.92], [0.64, 0.16]], sym('D'));
  const local = curve(localPts, bi('S (local)', 'S（本地）'));
  // S′ stops lower than S so the two names stack apart at the top right.
  const both = curve([[0.3, 0.12], [0.3 + xOn(localPts, 0.66) - 0.06, 0.66]], bi('S′ (local\n+ imported)', 'S′（本地\n＋輸入）'));
  const e0 = mark(meet(d, local), '0', { p: 'W' });
  const e1 = mark(meet(d, both), '1', { p: 'W' });
  // Local employment after importation is read off S (local) at the new wage.
  const localJobs = point(xOn(localPts, e1.at.y), e1.at.y, undefined, { dropTo: ['x'], xTickLabel: sub('Q', '2') });
  const y = 0.64;
  return axes(AXIS.labour, AXIS.wage, {
    curves: [d, local, both],
    points: [e0, e1, localJobs],
    arrows: [arrow([xOn(localPts, y) + 0.03, y], [xOn(localPts, y) + 0.21, y])],
  });
}

function surplus(): Diagram {
  const d = curve([[0.08, 0.9], [0.84, 0.14]], sym('D'));
  const s = curve([[0.06, 0.1], [0.7, 0.86]], sym('S'));
  const e = mark(meet(d, s), 'e', {}, { label: sym('E') });
  const market = { demand: d.id, supply: s.id };
  return axes(AXIS.quantity, AXIS.price, {
    curves: [d, s],
    points: [e],
    areas: [newPresetArea('consumerSurplus', market, newId())!, newPresetArea('producerSurplus', market, newId())!],
  });
}

/** A quota's supply: S up to the quota, then vertical there. */
const quotaCurve = (s: Pair[], q: number, name: ReturnType<typeof sub>) => {
  const [[x0, y0], [x1, y1]] = s;
  const y = y0 + ((q - x0) * (y1 - y0)) / (x1 - x0);
  return curve([[x0, y0], [q, y], [q, 0.9]], name);
};

function domesticQuota(): Diagram {
  const d = curve(D, sym('D'));
  const s0 = curve(S, sub('S', '0'));
  const s1 = quotaCurve(S, 0.3, sub('S', '1'));
  const e0 = mark(meet(d, s0), '0');
  const e1 = mark(onCurve(d, 0.3), '1', {}, { labelSide: 'right' });
  return axes(AXIS.quantity, AXIS.price, {
    curves: [d, s0, s1],
    points: [e0, e1],
    arrows: changeArrows(e0.at, e1.at),
  });
}

function quotaEnlarged(): Diagram {
  const d = curve(D, sym('D'));
  const s = curve(S, sym('S'));
  const s1 = quotaCurve(S, 0.22, sub('S', '1'));
  const s2 = quotaCurve(S, 0.34, sub('S', '2'));
  const e1 = mark(onCurve(d, 0.22), '1');
  const e2 = mark(onCurve(d, 0.34), '2');
  return axes(AXIS.quantity, AXIS.price, {
    curves: [d, s, s1, s2],
    points: [e1, e2],
    arrows: [arrow([0.24, 0.84], [0.32, 0.84]), ...changeArrows(e1.at, e2.at)],
  });
}

/** A per-unit tax (up by t) or subsidy (down by s): the burden or benefit strips. */
function perUnit(kind: 'tax' | 'subsidy'): Diagram {
  const tax = kind === 'tax';
  const d = curve([[0.08, 0.9], [0.84, 0.14]], sym('D'));
  // Two parallel supply curves 0.26 apart: the tax (or subsidy) per unit.
  const lower: Pair[] = [[0.06, 0.08], [0.7, 0.78]];
  const upper: Pair[] = [[0.06, 0.34], [xOn(lower, 0.93 - 0.26), 0.93]];
  const base = tax ? lower : upper;
  const moved = tax ? upper : lower;
  const s0 = curve(base, sub('S', '0'));
  const s1 = curve(moved, sub('S', '1'));
  const e0 = mark(meet(d, s0), '0', { q: 'Q' }, { labelSide: tax ? 'right' : 'up' });
  const e1 = mark(meet(d, s1), '1', {}, { labelSide: tax ? 'upRight' : 'right' });
  // The sellers' price under a tax (P₁ − t), or the price sellers receive under a subsidy (P₁ + s).
  const other = onCurve(s0, e1.at.x);
  const kept = point(other.x, other.y, undefined, {
    dot: false,
    dropTo: ['y'],
    yTickLabel: subPlus('P', '1', tax ? ' − t' : ' + s'),
  });
  const strip = (hi: { point: string }, lo: { point: string }, text: ReturnType<typeof bi>, pattern: 'diagonal' | 'reverse') =>
    band([{ level: hi }, { level: lo }], 0, { point: e1.id }, {
      fill: 'hatch',
      pattern,
      label: text,
      // Left of the centroid, clear of the new supply curve crossing the strip.
      labelOffset: { x: -0.09, y: 0 },
    });
  const areas = tax
    ? [
        // Letters inside the thin strips, named in a key where the plot is empty.
        strip({ point: e1.id }, { point: e0.id }, sym('a'), 'diagonal'),
        strip({ point: e0.id }, { point: kept.id }, sym('b'), 'reverse'),
      ]
    : [
        strip({ point: e0.id }, { point: e1.id }, sym('CB'), 'diagonal'),
        strip({ point: kept.id }, { point: e0.id }, sym('PB'), 'reverse'),
      ];
  const x = 0.56;
  const from = onCurve(s0, x);
  const to = onCurve(s1, x);
  return axes(AXIS.quantity, AXIS.price, {
    curves: [d, s0, s1],
    points: [e0, e1, kept],
    arrows: [
      arrow([x, from.y + (tax ? 0.02 : -0.02)], [x, to.y - (tax ? 0.02 : -0.02)], {
        label: sym(tax ? 't' : 's'),
        labelOffset: { x: 0.03, y: -0.02 },
      }),
    ],
    areas,
    labels: tax
      ? [label(0.68, 0.46, bi("a: buyers' burden\nb: sellers' burden", 'a：買家負擔\nb：賣家負擔'), { align: 'left' })]
      : [],
  });
}

export const MARKET_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'supply-shift',
    group: 'supplyDemand',
    name: bi('Supply shift', '供應變動'),
    hint: bi('S shifts right: two equilibria, P and Q arrows.', '供應右移：兩個均衡點及價格、數量箭嘴。'),
    build: () => oneShift('supply'),
  },
  {
    id: 'simultaneous-shifts',
    group: 'supplyDemand',
    name: bi('D and S both shift', '供求同時變動'),
    hint: bi('The larger shift drawn larger: shift of D > shift of S.', '較大的移動畫得較大：D 的移動 > S 的移動。'),
    build: simultaneous,
  },
  {
    id: 'elastic-revenue',
    group: 'supplyDemand',
    name: bi('Elastic demand: revenue', '富彈性需求：收益'),
    hint: bi('A price rise along a flat D: gain (+) < loss (−).', '沿平坦需求曲線加價：收益增加 (+) < 減少 (−)。'),
    build: () => alongDemand([[0.06, 0.64], [0.9, 0.34]], 0.38, 0.52),
  },
  {
    id: 'inelastic-revenue',
    group: 'supplyDemand',
    name: bi('Inelastic demand: revenue', '缺乏彈性需求：收益'),
    hint: bi('A price rise along a steep D: gain (+) > loss (−).', '沿陡峭需求曲線加價：收益增加 (+) > 減少 (−)。'),
    build: () => alongDemand([[0.3, 0.92], [0.62, 0.1]], 0.3, 0.56),
  },
  {
    id: 'fixed-supply',
    group: 'supplyDemand',
    name: bi('Fixed supply', '固定供應'),
    hint: bi('A vertical S — shares, licences, seats — with a demand shift.', '垂直供應曲線（股票、牌照、座位）及需求變動。'),
    build: fixedSupply,
  },
  {
    id: 'labour-importation',
    group: 'supplyDemand',
    name: bi('Labour importation', '輸入勞工'),
    hint: bi('S (local) and S′ (local + imported); local jobs read off S (local).', 'S（本地）及 S′（本地＋輸入）；本地就業從 S（本地）讀取。'),
    build: labourImport,
  },
  {
    id: 'surplus',
    group: 'supplyDemand',
    name: bi('Consumer and producer surplus', '消費者及生產者盈餘'),
    hint: bi('One equilibrium with CS and PS shaded.', '一個均衡點，附消費者及生產者盈餘。'),
    build: surplus,
  },
  {
    id: 'price-ceiling',
    group: 'controls',
    name: bi('Price ceiling', '價格上限'),
    hint: bi('Pc below Pe: Qs and Qd, and the shortage between them.', '低於均衡價格的上限：Qs、Qd 及其間的短缺。'),
    build: () => ceiling(false),
  },
  {
    id: 'price-control-dwl',
    group: 'controls',
    name: bi('Price ceiling: deadweight loss', '價格上限：無謂損失'),
    hint: bi('D = MB, S = MC; DWL from the quantity sold to Qe.', 'D = MB，S = MC；由成交量至 Qe 的無謂損失。'),
    build: () => ceiling(true),
  },
  {
    id: 'minimum-wage',
    group: 'controls',
    name: bi('Minimum wage', '最低工資'),
    hint: bi('W above We: employment read off D, the surplus of labour.', '高於均衡工資的 W：就業由需求決定，勞工過剩。'),
    build: minimumWage,
  },
  {
    id: 'domestic-quota',
    group: 'controls',
    name: bi('Quota', '配額'),
    hint: bi('S up to the quota, then vertical: P rises, Q falls to the quota.', '供應至配額後垂直：價格上升，數量減至配額。'),
    build: domesticQuota,
  },
  {
    id: 'quota-enlarged',
    group: 'controls',
    name: bi('Quota enlarged', '配額增加'),
    hint: bi('The vertical segment moves right: P falls, Q rises.', '垂直部分右移：價格下降，數量上升。'),
    build: quotaEnlarged,
  },
  {
    id: 'per-unit-tax',
    group: 'taxSubsidy',
    name: bi('Per-unit tax', '從量稅'),
    hint: bi("S shifts up by t: buyers' and sellers' burdens.", '供應上移 t：買家及賣家負擔。'),
    build: () => perUnit('tax'),
  },
  {
    id: 'per-unit-subsidy',
    group: 'taxSubsidy',
    name: bi('Per-unit subsidy', '從量津貼'),
    hint: bi('S shifts down by s: consumer (CB) and producer (PB) benefits.', '供應下移 s：消費者 (CB) 及生產者 (PB) 得益。'),
    build: () => perUnit('subsidy'),
  },
];
