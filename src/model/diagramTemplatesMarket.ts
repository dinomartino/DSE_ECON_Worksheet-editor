import type { Diagram, DiagramCurve } from './diagram';
import { revenueArea } from './diagramAreas';
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
  eq,
  finish,
  lab,
  label,
  newId,
  pin,
  priceLine,
  reading,
  shade,
  shiftOf,
  span,
  sub,
  subBi,
  subPlus,
  sym,
  upright,
  xOn,
  type DiagramTemplate,
  type Pair,
} from './diagramTemplateKit';

/**
 * Single-market templates: shifts, elasticity and revenue, price controls, quotas, tax
 * and subsidy. Traced from the scheme figures in `docs/Diagram_Requirements/` (§8,
 * groups A, B, E, F). Equilibria are anchored to their crossings, shifted curves follow
 * their originals, and areas are Shade presets, so a drag keeps the scheme's marks.
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
  const c1 = shiftOf(c0, 0.18, 0, sub(base, '1'));
  const k = curve(fixed, sym(other));
  // E₀'s right is where the shifted curve runs. When P rises, P₁'s drop runs just
  // above E₀, so its name takes the wedge left of S under P₀; else above D, left of S.
  const e0 = eq(c0, k, '0', {}, {
    labelOffset: which === 'demand' ? { x: -0.08, y: -0.028 } : { x: -0.03, y: 0.085 },
  });
  const e1 = eq(c1, k, '1');
  // Beside the curves' far ends, where the other curve is well away.
  const y = which === 'demand' ? 0.8 : 0.78;
  const x0 = xOn(moving, y);
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [c0, c1, k],
      points: [e0, e1],
      arrows: [arrow([x0 + 0.03, y], [x0 + 0.15, y])],
      spans: axisArrows(e0, e1),
    }),
  );
}

function simultaneous(): Diagram {
  const d0 = curve([[0.06, 0.78], [0.62, 0.16]], sub('D', '0'));
  const d1 = shiftOf(d0, 0.28, 0, sub('D', '1'));
  const s0 = curve([[0.08, 0.1], [0.62, 0.8]], sub('S', '0'));
  const s1 = shiftOf(s0, 0.1, 0, sub('S', '1'));
  // Above D₀, left of S₀: the one gap near E₀ with no line through it.
  const e0 = eq(d0, s0, '0', {}, { labelOffset: { x: -0.03, y: 0.085 } });
  const e1 = eq(d1, s1, '1');
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d0, d1, s0, s1],
      points: [e0, e1],
      // The dominant shift is drawn visibly larger — the mark the schemes award for it.
      arrows: [arrow([0.15, 0.72], [0.38, 0.72]), arrow([0.165, 0.2], [0.25, 0.2])],
      spans: axisArrows(e0, e1),
      labels: [label(0.28, 0.9, bi('shift of D > shift of S', 'D 的移動 > S 的移動'))],
    }),
  );
}

/** The MCQ grid: D₀/D₁ against S₀/S₁, the four crossings lettered as the options. */
function doubleShiftGrid(): Diagram {
  const d0 = curve([[0.06, 0.8], [0.6, 0.16]], sub('D', '0'));
  const d1 = shiftOf(d0, 0.24, 0, sub('D', '1'));
  const s0 = curve([[0.1, 0.1], [0.62, 0.78]], sub('S', '0'));
  const s1 = shiftOf(s0, 0.24, 0, sub('S', '1'));
  const corner = (a: DiagramCurve, b: DiagramCurve, name: string, side: 'up' | 'down' | 'left' | 'right') =>
    pin(cross(a, b), [a, b], sym(name), { labelSide: side });
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d0, d1, s0, s1],
      points: [
        corner(d0, s0, 'W', 'left'),
        corner(d1, s0, 'X', 'up'),
        corner(d0, s1, 'Y', 'down'),
        corner(d1, s1, 'Z', 'right'),
      ],
    }),
  );
}

function fixedSupply(): Diagram {
  const s = upright(0.46, sym('S'), 0.9);
  const d0 = curve([[0.06, 0.66], [0.68, 0.1]], sub('D', '0'));
  const d1 = shiftOf(d0, 0.22, 0, sub('D', '1'));
  const e0 = eq(d0, s, '0', {}, { labelSide: 'upRight' });
  const e1 = eq(d1, s, '1', { q: '' }, { labelSide: 'right' });
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [s, d0, d1],
      points: [e0, e1],
      arrows: [arrow([0.13, 0.7], [0.29, 0.7])],
      spans: axisArrows(e0, e1, ['y']),
    }),
  );
}

const MB_D = () => curve([[0.08, 0.9], [0.84, 0.14]], bi('D = MB', 'D = MB'));
const MC_S = () => curve([[0.06, 0.1], [0.7, 0.86]], bi('S = MC', 'S = MC'));
const plainD = () => curve([[0.08, 0.9], [0.84, 0.14]], sym('D'));
const plainS = () => curve([[0.06, 0.1], [0.7, 0.86]], sym('S'));

function ceiling(withDwl: boolean): Diagram {
  const d = withDwl ? MB_D() : plainD();
  const s = withDwl ? MC_S() : plainS();
  const pc = priceLine(0.24, sub('P', 'c'));
  const e = eq(d, s, 'e', { e: 'E', p: 'P', q: 'Q' }, { label: sym('E') });
  const qs = reading(s, pc, withDwl ? sub('Q', 't') : sub('Q', 's'));
  const qd = reading(d, pc, sub('Q', 'd'));
  const body = axes(AXIS.quantity, AXIS.price, {
    curves: [d, s, pc],
    points: withDwl ? [e, qs] : [e, qs, qd],
    // Under Pc; the word sits right of Qe's drop-line, where the gap is clear.
    spans: withDwl
      ? []
      : [span(at(qs), at(qd), 'bracket', { offset: -0.05, label: bi('shortage', '短缺'), labelOffset: { x: 0.13, y: 0 } })],
  });
  if (!withDwl) return finish(body);
  // Under a ceiling the DWL runs from the quantity sold (read off S) to Qe; Pe's
  // drop-line runs through the triangle, so the name goes out on a leader.
  return finish(body, (r) =>
    shade(r, 'controlDwl', { demand: d.id, supply: s.id, control: { curve: pc.id } }, {
      label: sym('DWL'),
      labelPlacement: 'leader',
    }),
  );
}

/** A demand rise under a ceiling: the shortage before and after, bracketed and compared. */
function shortageChange(): Diagram {
  const d0 = curve([[0.08, 0.8], [0.6, 0.21]], sub('D', '0'));
  const d1 = shiftOf(d0, 0.16, 0, sub('D', '1'));
  const s = plainS();
  const pc = priceLine(0.4, sub('P', 'c'));
  const qs = reading(s, pc, sub('Q', 's'));
  const qd0 = reading(d0, pc, sub('Q', 'd0'));
  const qd1 = reading(d1, pc, sub('Q', 'd1'));
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d0, d1, s, pc],
      points: [
        eq(d0, s, '0', { p: '', q: '' }, { labelSide: 'left' }),
        eq(d1, s, '1', { p: '', q: '' }, { labelSide: 'left' }),
        qs,
        qd0,
        qd1,
      ],
      arrows: [arrow([0.2, 0.74], [0.34, 0.74])],
      spans: [
        // shortage₀'s name sits left of S, clear of shortage₁ below it.
        span(at(qs), at(qd0), 'bracket', { offset: -0.05, label: subBi('shortage', '短缺', '0'), labelOffset: { x: -0.23, y: 0.02 } }),
        span(at(qs), at(qd1), 'bracket', { along: 'x', offset: 0.05, label: subBi('shortage', '短缺', '1') }),
      ],
    }),
  );
}

/** Lowering a ceiling from Pc₀ to Pc₁: the DWL and, shaded apart, its increase. */
function ceilingLowered(): Diagram {
  const d = MB_D();
  const s = MC_S();
  const pc0 = priceLine(0.4, sub('P', 'c0'));
  const pc1 = priceLine(0.24, sub('P', 'c1'));
  const q0 = reading(s, pc0, sub('Q', '0'));
  const q1 = reading(s, pc1, sub('Q', '1'));
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, s, pc0, pc1],
      points: [eq(d, s, 'e', {}, { label: sym('E') }), q0, q1],
      arrows: [arrow([0.84, 0.38], [0.84, 0.26])],
      areas: [
        band([{ curve: d.id }, { curve: s.id }], at(q1), at(q0), {
          fill: 'hatch',
          pattern: 'horizontal',
          label: bi('increase\nin DWL', '無謂損失\n增加'),
          labelOffset: { x: -0.14, y: 0.24 },
          labelPlacement: 'leader',
        }),
      ],
    }),
    (r) =>
      shade(r, 'controlDwl', { demand: d.id, supply: s.id, control: { curve: pc0.id } }, {
        label: sub('DWL', '0'),
        labelOffset: { x: 0.3, y: 0 },
        labelPlacement: 'leader',
      }),
  );
}

/** A ceiling above equilibrium fixes nothing: Q stays at Qe. */
function ineffectiveCeiling(): Diagram {
  const d = plainD();
  const s = plainS();
  const pc = priceLine(0.7, sub('P', 'c'));
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, s, pc],
      points: [eq(d, s, 'e', {}, { label: sym('E') })],
      labels: [label(0.72, 0.82, lab('ineffective:\nP', ['c'], ' above P', ['e']), { align: 'left' })],
    }),
  );
}

/** The CS change under a ceiling: + (the price fall on units still bought), − (units lost). */
function ceilingCsChange(): Diagram {
  const d = plainD();
  const s = plainS();
  const pc = priceLine(0.3, sub('P', 'c'));
  const qs = reading(s, pc, sub('Q', 's'));
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, s, pc],
      points: [eq(d, s, 'e', {}, { label: sym('E') }), qs],
    }),
    (r) => {
      const roles = { demand: d.id, supply: s.id, control: { curve: pc.id } };
      return [...shade(r, 'ceilingCsGain', roles), ...shade(r, 'ceilingCsLoss', roles, { labelPlacement: 'leader' })];
    },
  );
}

/** Revenue at a fixed price: P × the short side (read off S under a ceiling). */
function fixedPriceRevenue(): Diagram {
  const d = plainD();
  const s = plainS();
  const pc = priceLine(0.3, sym('P'));
  const qs = reading(s, pc, sub('Q', 's'));
  const qd = reading(d, pc, sub('Q', 'd'));
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, s, pc],
      points: [eq(d, s, 'e', {}, { label: sym('E') }), qs, qd],
      spans: [span(at(qs), at(qd), 'bracket', { offset: -0.05, label: bi('shortage', '短缺'), labelOffset: { x: 0.13, y: 0 } })],
    }),
    (r) => shade(r, 'controlRevenue', { demand: d.id, supply: s.id, control: { curve: pc.id } }, { labelOffset: { x: 0.04, y: -0.08 } }),
  );
}

function minimumWage(): Diagram {
  const d = plainD();
  const s = plainS();
  const w = priceLine(0.7, sym('W'));
  const e = eq(d, s, 'e', { e: 'E', p: 'W', q: 'Q' }, { label: sym('E') });
  const qd = reading(d, w, sub('Q', 'd'));
  const qs = reading(s, w, sub('Q', 's'));
  return finish(
    axes(AXIS.labour, AXIS.wage, {
      curves: [d, s, w],
      points: [e, qd, qs],
      // Above W, between D and S: the surplus of labour.
      spans: [span(at(qd), at(qs), 'bracket', { offset: 0.04, label: bi('surplus\n(unemployment)', '過剩（失業）') })],
    }),
  );
}

/** The wage bill under a minimum wage: G (the higher wage on jobs kept), L (jobs lost). */
function minimumWageBill(): Diagram {
  const d = plainD();
  const s = plainS();
  const w = priceLine(0.72, sym('W'));
  const e = eq(d, s, 'e', { e: 'E', p: 'W', q: 'Q' }, { label: sym('E') });
  const qd = reading(d, w, sub('Q', 'd'));
  const points = { before: at(e), after: at(qd) };
  return finish(
    axes(AXIS.labour, AXIS.wage, {
      curves: [d, s, w],
      points: [e, qd],
      areas: [
        { ...revenueArea('revenueGain', points, newId())!, label: sym('G') },
        { ...revenueArea('revenueLoss', points, newId())!, label: sym('L') },
      ],
    }),
  );
}

function labourImport(): Diagram {
  // S (local) stops at 0.74, so its name ends before S′ (its copy) reaches that height.
  const localPts: Pair[] = [[0.06, 0.12], [0.06 + (0.62 * 0.44) / 0.72, 0.74]];
  const d = curve([[0.1, 0.92], [0.64, 0.16]], sym('D'));
  const local = curve(localPts, bi('S (local)', 'S（本地）'));
  const both = shiftOf(local, 0.24, 0, bi('S′ (local\n+ imported)', 'S′（本地\n＋輸入）'));
  const e0 = eq(d, local, '0', { p: 'W' });
  const e1 = eq(d, both, '1', { p: 'W' });
  // Local employment after importation is read off S (local) at the new wage.
  const localJobs = pin({ on: local.id, y: at(e1) }, [local, e1], undefined, {
    dropTo: ['x'],
    xTickLabel: sub('Q', '2'),
  });
  const y = 0.64;
  return finish(
    axes(AXIS.labour, AXIS.wage, {
      curves: [d, local, both],
      points: [e0, e1, localJobs],
      arrows: [arrow([xOn(localPts, y) + 0.03, y], [xOn(localPts, y) + 0.21, y])],
    }),
  );
}

function surplus(): Diagram {
  const d = plainD();
  const s = plainS();
  const e = eq(d, s, 'e', {}, { label: sym('E') });
  return finish(axes(AXIS.quantity, AXIS.price, { curves: [d, s], points: [e] }), (r) => [
    ...shade(r, 'consumerSurplus', { demand: d.id, supply: s.id }),
    ...shade(r, 'producerSurplus', { demand: d.id, supply: s.id }),
  ]);
}

/** MC rises (S = MC shifts up): the TSS loss is the band between MC₀ and MC₁ up to D. */
function mcRiseTss(): Diagram {
  const d = plainD();
  const s0 = curve([[0.06, 0.08], [0.6, 0.64]], lab('S', ['0'], ' = MC', ['0']));
  const s1 = shiftOf(s0, 0, 0.22, lab('S', ['1'], ' = MC', ['1']));
  const e0 = eq(d, s0, '0', {}, { labelSide: 'right' });
  const e1 = eq(d, s1, '1', {}, { labelSide: 'upRight' });
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, s0, s1],
      points: [e0, e1],
      arrows: [arrow([0.56, 0.62], [0.56, 0.8])],
      spans: axisArrows(e0, e1),
    }),
    (r) => shade(r, 'tssLoss', { demand: d.id, supply: s0.id, shifted: s1.id }),
  );
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
  const e0 = eq(d, s0, '0');
  const e1 = eq(d, s1, '1', {}, { labelSide: 'right' });
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, s0, s1],
      points: [e0, e1],
      spans: axisArrows(e0, e1),
    }),
  );
}

/** A quota's effect on total expenditure: G (price rise on the quota) against L (units lost). */
function quotaRevenue(): Diagram {
  const d = curve(D, sym('D'));
  const s0 = curve(S, sub('S', '0'));
  const s1 = quotaCurve(S, 0.3, sub('S', '1'));
  const e0 = eq(d, s0, '0');
  const e1 = eq(d, s1, '1', {}, { labelSide: 'right' });
  const points = { before: at(e0), after: at(e1) };
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, s0, s1],
      points: [e0, e1],
      areas: [
        { ...revenueArea('revenueGain', points, newId())!, label: sym('G') },
        { ...revenueArea('revenueLoss', points, newId())!, label: sym('L') },
      ],
    }),
  );
}

function quotaEnlarged(): Diagram {
  const d = curve(D, sym('D'));
  const s = curve(S, sym('S'));
  const s1 = quotaCurve(S, 0.22, sub('S', '1'));
  const s2 = quotaCurve(S, 0.34, sub('S', '2'));
  const e1 = eq(d, s1, '1');
  const e2 = eq(d, s2, '2');
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, s, s1, s2],
      points: [e1, e2],
      arrows: [arrow([0.24, 0.84], [0.32, 0.84])],
      spans: axisArrows(e1, e2),
      // The DWL the bigger quota removes: between D and S from Q₁ to Q₂.
      areas: [
        band([{ curve: d.id }, { curve: s.id }], at(e1), at(e2), {
          fill: 'hatch',
          pattern: 'cross',
          label: bi('DWL falls', '無謂損失減少'),
          labelPlacement: 'leader',
        }),
      ],
    }),
  );
}

/** A demand rise under a fixed quota: Q stays at the quota, the efficient Q rises, DWL grows. */
function quotaDemandIncrease(): Diagram {
  const d0 = curve([[0.06, 0.78], [0.64, 0.14]], sub('D', '0'));
  const d1 = shiftOf(d0, 0.16, 0, sub('D', '1'));
  const s = curve(S, bi('S = MC', 'S = MC'));
  const sq = quotaCurve(S, 0.24, bi('S (quota)', 'S（配額）'));
  const e0 = eq(d0, sq, '0', { q: 'Q' }, { labelSide: 'downLeft' });
  const e1 = eq(d1, sq, '1', { q: '' }, { labelSide: 'upRight' });
  const f0 = pin(cross(d0, s), [d0, s], undefined, { dot: false, dropTo: ['x'], xTickLabel: sub('Q', 'e0') });
  const f1 = pin(cross(d1, s), [d1, s], undefined, { dot: false, dropTo: ['x'], xTickLabel: sub('Q', 'e1') });
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d0, d1, s, sq],
      points: [e0, e1, f0, f1],
      arrows: [arrow([0.6, 0.2], [0.73, 0.2])],
      spans: axisArrows(e0, e1, ['y']),
      areas: [
        band([{ curve: d0.id }, { curve: s.id }], at(e0), at(f0), {
          fill: 'hatch',
          pattern: 'cross',
          label: sub('DWL', '0'),
          labelOffset: { x: -0.16, y: -0.12 },
          labelPlacement: 'leader',
        }),
        // The increase: D₁ down to D₀, or to S past D₀'s efficient quantity.
        {
          id: newId(),
          band: { edges: [{ curve: d0.id }, { curve: d1.id }], from: at(e0), to: at(f1), cap: { curve: s.id } },
          fill: 'hatch',
          pattern: 'horizontal',
          label: bi('increase\nin DWL', '無謂損失\n增加'),
          labelOffset: { x: 0.29, y: 0.02 },
          labelPlacement: 'leader',
        },
      ],
    }),
  );
}

/** A per-unit tax (up by t) or subsidy (down by s): the burden or benefit strips. */
function perUnit(kind: 'tax' | 'subsidy'): Diagram {
  const tax = kind === 'tax';
  const d = plainD();
  // The subsidised S₁ (or the untaxed S₀) ends at 0.67; its twin 0.26 above, at 0.93.
  const lower: Pair[] = [[0.06, 0.08], [0.7, 0.78]];
  const low: Pair[] = [lower[0], [xOn(lower, 0.67), 0.67]];
  const high: Pair[] = [[0.06, 0.34], [xOn(lower, 0.67), 0.93]];
  const s0 = curve(tax ? low : high, sub('S', '0'));
  const s1 = shiftOf(s0, 0, tax ? 0.26 : -0.26, sub('S', '1'));
  const e0 = eq(d, s0, '0', { q: 'Q' }, { labelSide: tax ? 'right' : 'up' });
  const e1 = eq(d, s1, '1', {}, { labelSide: tax ? 'upRight' : 'right' });
  // The sellers' price under a tax (P₁ − t), or the price sellers receive under a subsidy (P₁ + s).
  const kept = pin({ on: s0.id, x: at(e1) }, [s0, e1], undefined, {
    dot: false,
    dropTo: ['y'],
    yTickLabel: subPlus('P', '1', tax ? ' − t' : ' + s'),
  });
  // Under a subsidy E₀ sits inside the hatched strips: its name goes above them.
  if (!tax) e0.labelOffset = { x: 0.02, y: kept.at.y - e0.at.y + 0.05 };
  // The wedge, measured between the two supply curves where they run clear, right of E₀.
  const x = { x: 0.56, y: 0 };
  const [upper, under] = tax ? [s1, s0] : [s0, s1];
  const wedge = span({ on: upper.id, x }, { on: under.id, x }, 'dimension', {
    label: sym(tax ? 't' : 's'),
    labelOffset: { x: 0, y: -0.02 },
  });
  // Letters inside the thin strips, left of the new supply curve crossing them.
  const strip = { labelOffset: { x: -0.09, y: 0 } };
  const roles = { demand: d.id, supply: s0.id, shifted: s1.id };
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, s0, s1],
      points: [e0, e1, kept],
      spans: [wedge, ...axisArrows(e0, e1)],
      labels: tax
        ? [label(0.68, 0.53, bi("a: buyers' burden\nb: sellers' burden", 'a：買家負擔\nb：賣家負擔'), { align: 'left' })]
        : [],
    }),
    (r) =>
      tax
        ? [
            ...shade(r, 'buyersBurden', roles, { ...strip, label: sym('a') }),
            ...shade(r, 'sellersBurden', roles, { ...strip, label: sym('b') }),
          ]
        : [
            ...shade(r, 'consumerBenefit', roles, { ...strip, label: sym('CB') }),
            ...shade(r, 'producerBenefit', roles, { ...strip, label: sym('PB') }),
          ],
  );
}

/** A subsidy overproduces: at Q₁, MC (on S₀) is above MB (on D); the DWL between. */
function subsidyEfficiency(): Diagram {
  const d = MB_D();
  const s0 = curve([[0.06, 0.34], [0.58, 0.9]], lab('S', ['0'], ' = MC'));
  const s1 = shiftOf(s0, 0, -0.26, sub('S', 's'));
  const e0 = eq(d, s0, '0', {}, { labelOffset: { x: -0.015, y: 0.075 } });
  const e1 = eq(d, s1, '1', { p: '' }, { label: sym('MB'), labelSide: 'right' });
  const mc = pin({ on: s0.id, x: at(e1) }, [s0, e1], sym('MC'), { labelSide: 'right' });
  return finish(
    axes(AXIS.quantity, AXIS.price, {
      curves: [d, s0, s1],
      points: [e0, e1, mc],
      arrows: [arrow([0.2, 0.46], [0.2, 0.27])],
      labels: [label(0.1, 0.97, lab('at Q', ['1'], ': MC > MB'), { align: 'left' })],
    }),
    (r) => shade(r, 'subsidyDwl', { demand: d.id, supply: s0.id, shifted: s1.id }),
  );
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
    id: 'double-shift-grid',
    group: 'supplyDemand',
    name: bi('Double-shift grid (MCQ)', '供求雙移格（選擇題）'),
    hint: bi('D₀/D₁ against S₀/S₁: four crossings lettered W–Z as the options.', 'D₀/D₁ 與 S₀/S₁：四個交點 W–Z 作選項。'),
    build: doubleShiftGrid,
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
    id: 'mc-rise-tss',
    group: 'supplyDemand',
    name: bi('MC rises: TSS loss', '邊際成本上升：總盈餘損失'),
    hint: bi('S = MC shifts up; the TSS loss is the band between MC₀ and MC₁.', 'S = MC 上移；總盈餘損失為 MC₀ 與 MC₁ 之間的帶。'),
    build: mcRiseTss,
  },
  {
    id: 'price-ceiling',
    group: 'controls',
    name: bi('Price ceiling', '價格上限'),
    hint: bi('Pc below Pe: Qs and Qd, and the shortage between them.', '低於均衡價格的上限：Qs、Qd 及其間的短缺。'),
    build: () => ceiling(false),
  },
  {
    id: 'shortage-change',
    group: 'controls',
    name: bi('Ceiling: shortage after a change', '價格上限：變動後的短缺'),
    hint: bi('D rises under Pc: shortage₀ and a larger shortage₁, both bracketed.', '上限下需求上升：短缺₀ 及較大的短缺₁。'),
    build: shortageChange,
  },
  {
    id: 'price-control-dwl',
    group: 'controls',
    name: bi('Price ceiling: deadweight loss', '價格上限：無謂損失'),
    hint: bi('D = MB, S = MC; DWL from the quantity sold to Qe.', 'D = MB，S = MC；由成交量至 Qe 的無謂損失。'),
    build: () => ceiling(true),
  },
  {
    id: 'ceiling-lowered',
    group: 'controls',
    name: bi('Ceiling lowered: more DWL', '上限下調：無謂損失增加'),
    hint: bi('Pc₀ → Pc₁: DWL₀ and the increase in DWL, shaded apart.', 'Pc₀ → Pc₁：DWL₀ 及無謂損失的增加。'),
    build: ceilingLowered,
  },
  {
    id: 'ceiling-cs-change',
    group: 'controls',
    name: bi('Ceiling: change in CS', '價格上限：消費者盈餘變動'),
    hint: bi('+ for the lower price on units still bought, − for units no longer bought.', '+：仍購買單位的減價；−：不再購買的單位。'),
    build: ceilingCsChange,
  },
  {
    id: 'ineffective-ceiling',
    group: 'controls',
    name: bi('Ineffective ceiling', '無效的價格上限'),
    hint: bi('Pc above Pe: the market stays at E.', '上限高於均衡價格：市場維持在 E。'),
    build: ineffectiveCeiling,
  },
  {
    id: 'fixed-price-revenue',
    group: 'controls',
    name: bi('Revenue at a fixed price', '固定價格下的收益'),
    hint: bi('TR = P × the short side (Qs under a ceiling), with the shortage.', '總收益 = P × 較少一方（上限下為 Qs），附短缺。'),
    build: fixedPriceRevenue,
  },
  {
    id: 'minimum-wage',
    group: 'controls',
    name: bi('Minimum wage', '最低工資'),
    hint: bi('W above We: employment read off D, the surplus of labour.', '高於均衡工資的 W：就業由需求決定，勞工過剩。'),
    build: minimumWage,
  },
  {
    id: 'minimum-wage-bill',
    group: 'controls',
    name: bi('Minimum wage: wage bill', '最低工資：工資總額'),
    hint: bi('The wage bill gains G (higher W on jobs kept) and loses L (jobs lost).', '工資總額增加 G（保留職位的較高工資），減少 L（失去的職位）。'),
    build: minimumWageBill,
  },
  {
    id: 'domestic-quota',
    group: 'controls',
    name: bi('Quota', '配額'),
    hint: bi('S up to the quota, then vertical: P rises, Q falls to the quota.', '供應至配額後垂直：價格上升，數量減至配額。'),
    build: domesticQuota,
  },
  {
    id: 'quota-revenue',
    group: 'controls',
    name: bi('Quota: total expenditure', '配額：總開支'),
    hint: bi('G (higher P on the quota) against L (units cut): L > G if D is elastic.', 'G（配額內的較高價格）對 L（減少的單位）：需求富彈性則 L > G。'),
    build: quotaRevenue,
  },
  {
    id: 'quota-enlarged',
    group: 'controls',
    name: bi('Quota enlarged', '配額增加'),
    hint: bi('The vertical segment moves right: P falls, Q rises, DWL falls.', '垂直部分右移：價格下降，數量上升，無謂損失減少。'),
    build: quotaEnlarged,
  },
  {
    id: 'quota-demand-increase',
    group: 'controls',
    name: bi('Quota: demand rises', '配額：需求上升'),
    hint: bi('D₀ → D₁ at a fixed quota: Q stays, the efficient Q rises, DWL grows.', '配額不變下 D₀ → D₁：數量不變，有效率數量上升，無謂損失增加。'),
    build: quotaDemandIncrease,
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
  {
    id: 'subsidy-efficiency',
    group: 'taxSubsidy',
    name: bi('Subsidy: overproduction', '津貼：生產過多'),
    hint: bi('At Q₁, MC on S₀ is above MB on D; the DWL between them.', '在 Q₁，S₀ 上的 MC 高於 D 上的 MB；其間為無謂損失。'),
    build: subsidyEfficiency,
  },
];
