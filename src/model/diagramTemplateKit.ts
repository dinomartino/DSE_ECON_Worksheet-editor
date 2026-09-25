import { nanoid } from 'nanoid';
import type { BiText, InlineRun } from './types';
import type {
  Diagram,
  DiagramArea,
  DiagramAreaEdge,
  DiagramAreaX,
  DiagramArrow,
  DiagramCurve,
  DiagramLabel,
  DiagramPoint,
  DiagramPointMark,
} from './diagram';
import { curveCrossing, curveYAt, revenueArea } from './diagramAreas';
import { bi } from './text';

/**
 * The vocabulary the diagram templates are written in: labelled curves, equilibria with
 * drops and ticks, shift arrows. Pure; every call mints fresh ids, so two inserts of a
 * template never alias. Its own id source for the reason `diagramTemplates` gives.
 */

export const newId = () => nanoid(10);

/** Syllabus topics, in picker order. */
export type DiagramTemplateGroup =
  | 'supplyDemand'
  | 'controls'
  | 'taxSubsidy'
  | 'macro'
  | 'money'
  | 'trade'
  | 'electives'
  | 'data';

export interface DiagramTemplate {
  id: string;
  group: DiagramTemplateGroup;
  name: BiText;
  /** One-line note shown under the name in the picker. */
  hint: BiText;
  build: () => Diagram;
}

const same = (runs: InlineRun[]): BiText => ({ en: runs.map((r) => ({ ...r })), zh: runs.map((r) => ({ ...r })) });

/** Subscripted label: "E₀", "S₁" — the naming convention of every DSE diagram. */
export function sub(base: string, suffix: string): BiText {
  return same([{ text: base }, { text: suffix, vertAlign: 'subscript' }]);
}

/** "Pw + t": a subscripted base with trailing text back on the baseline. */
export function subPlus(base: string, suffix: string, tail: string): BiText {
  return same([{ text: base }, { text: suffix, vertAlign: 'subscript' }, { text: tail }]);
}

/** The same symbol in both languages: "D", "MR", "+". */
export const sym = (text: string): BiText => same([{ text }]);

export { bi };

export type Pair = [number, number];

export function curve(points: Pair[], label?: BiText, extra: Partial<DiagramCurve> = {}): DiagramCurve {
  return {
    id: newId(),
    points: points.map(([x, y]) => ({ x, y })),
    shape: 'straight',
    label,
    labelAt: 'end',
    ...extra,
  };
}

export function point(
  x: number,
  y: number,
  label?: BiText,
  extra: Partial<DiagramPointMark> = {},
): DiagramPointMark {
  return { id: newId(), at: { x, y }, label, labelSide: 'right', dot: true, ...extra };
}

export function label(x: number, y: number, text: BiText, extra: Partial<DiagramLabel> = {}): DiagramLabel {
  return { id: newId(), at: { x, y }, text, align: 'center', ...extra };
}

export function arrow(from: Pair, to: Pair, extra: Partial<DiagramArrow> = {}): DiagramArrow {
  return { id: newId(), from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] }, ...extra };
}

/** A straight line moved by (dx, dy): the parallel shift every template draws. */
export function shifted(points: Pair[], dx: number, dy = 0): Pair[] {
  return points.map(([x, y]) => [x + dx, y + dy]);
}

/** Where two curves cross. A template that asks for a missing crossing is a bug. */
export function meet(a: DiagramCurve, b: DiagramCurve): DiagramPoint {
  const at = curveCrossing(a, b);
  if (!at) throw new Error('template curves do not cross');
  return at;
}

/** The point on `curve` above or below `x`. */
export function onCurve(curve: DiagramCurve, x: number): DiagramPoint {
  const y = curveYAt(curve, x);
  if (y === null) throw new Error('template curve does not span x');
  return { x, y };
}

export interface MarkNames {
  /** Point name base, "E". Empty for an unnamed anchor. */
  e?: string;
  /** y tick base: "P", "W", "r". */
  p?: string;
  /** x tick base: "Q", "Y". */
  q?: string;
}

/**
 * An equilibrium at `at`: named E<n>, dashed drops to both axes, P<n> and Q<n> ticks.
 * `names` swaps the bases (W/Y/r); an empty string leaves that part off.
 */
export function mark(
  at: DiagramPoint,
  n: string,
  names: MarkNames = {},
  extra: Partial<DiagramPointMark> = {},
): DiagramPointMark {
  const { e = 'E', p = 'P', q = 'Q' } = names;
  const drops: Array<'x' | 'y'> = [];
  if (q) drops.push('x');
  if (p) drops.push('y');
  return point(at.x, at.y, e ? sub(e, n) : undefined, {
    dropTo: drops,
    xTickLabel: q ? sub(q, n) : undefined,
    yTickLabel: p ? sub(p, n) : undefined,
    ...extra,
  });
}

/** Clearance between a change arrow and the axis it runs beside, and its ends' inset. */
const ALONG = 0.035;
const INSET = 0.012;

/**
 * The "P₀ → P₁" and "Q₀ → Q₁" arrows the schemes award: short shafts just inside the
 * axes, between the two drop-lines. Skips a direction that barely moves.
 */
export function changeArrows(
  from: DiagramPoint,
  to: DiagramPoint,
  axes: Array<'x' | 'y'> = ['x', 'y'],
): DiagramArrow[] {
  const out: DiagramArrow[] = [];
  const dir = (a: number, b: number) => Math.sign(b - a);
  if (axes.includes('y') && Math.abs(to.y - from.y) > 0.04) {
    const s = dir(from.y, to.y);
    out.push(arrow([ALONG, from.y + s * INSET], [ALONG, to.y - s * INSET]));
  }
  if (axes.includes('x') && Math.abs(to.x - from.x) > 0.04) {
    const s = dir(from.x, to.x);
    out.push(arrow([from.x + s * INSET, ALONG], [to.x - s * INSET, ALONG]));
  }
  return out;
}

/** A shaded band between two edges across an x-range (how every preset is stored). */
export function band(
  edges: [DiagramAreaEdge, DiagramAreaEdge],
  from: DiagramAreaX,
  to: DiagramAreaX,
  extra: Partial<DiagramArea> = {},
): DiagramArea {
  return { id: newId(), band: { edges, from, to }, ...extra };
}

/** A diagram's common frame: axes, origin, empty lists to fill. */
export function axes(x: BiText, y: BiText, body: Partial<Diagram>): Diagram {
  return {
    x: { title: x },
    y: { title: y },
    curves: [],
    points: [],
    labels: [],
    arrows: [],
    showOrigin: true,
    ...body,
  };
}

export const AXIS = {
  price: bi('Price', '價格'),
  quantity: bi('Quantity', '數量'),
  wage: bi('Wage rate', '工資率'),
  // Two lines: one would take the plot's width for its reserved room.
  labour: bi('Quantity\nof labour', '勞工數量'),
  priceLevel: bi('Price level', '價格水平'),
  realOutput: bi('Real output', '實質產出'),
  interest: bi('Nominal interest rate', '名義利率'),
  money: bi('Quantity\nof money', '貨幣數量'),
};

/** x on a straight two-point line at height y. */
export function xOn([[x0, y0], [x1, y1]]: Pair[], y: number): number {
  return x0 + ((y - y0) * (x1 - x0)) / (y1 - y0);
}

/** A horizontal price line whose name sits on the y-axis, as a tick would. */
export function priceLine(y: number, name: BiText, right = 0.9): DiagramCurve {
  return curve([[0, y], [right, y]], name, { labelAt: 'start', weight: 0.8 });
}

/** A quantity read off `a` where it meets `line`: no dot, a drop to the x-axis, a tick. */
export function reading(a: DiagramCurve, line: DiagramCurve, tick?: BiText): DiagramPointMark {
  const at = meet(a, line);
  return point(at.x, at.y, undefined, { dot: false, dropTo: ['x'], xTickLabel: tick });
}

/**
 * Nudge a curve's label to sit at (x, y) in unit space. Approximate: the renderer's
 * 10px push off the end is taken as ~0.04 unit, which is all a template needs.
 */
export function placeLabel(c: DiagramCurve, x: number, y: number): DiagramCurve {
  const pts = c.points;
  const atEnd = (c.labelAt ?? 'end') === 'end';
  const end = atEnd ? pts[pts.length - 1] : pts[0];
  const prev = atEnd ? pts[pts.length - 2] : pts[1];
  const len = Math.hypot(end.x - prev.x, end.y - prev.y) || 1;
  const push = 0.04;
  return {
    ...c,
    labelOffset: {
      x: x - (end.x + ((end.x - prev.x) / len) * push),
      y: y - (end.y + ((end.y - prev.y) / len) * push),
    },
  };
}

/**
 * A price change along one straight D, from p1 to p2: E₁, E₂ with drops, P and Q
 * arrows, and the revenue gain (+) and loss (−) between them.
 */
export function alongDemand(
  line: Pair[],
  p1: number,
  p2: number,
  axisTitles: { x: BiText; y: BiText } = { x: AXIS.quantity, y: AXIS.price },
): Diagram {
  const d = curve(line, sym('D'));
  const e1 = mark({ x: xOn(line, p1), y: p1 }, '1', {}, { labelSide: 'upRight' });
  const e2 = mark({ x: xOn(line, p2), y: p2 }, '2', {}, { labelSide: 'upRight' });
  const points = { before: { point: e1.id }, after: { point: e2.id } };
  return axes(axisTitles.x, axisTitles.y, {
    curves: [d],
    points: [e1, e2],
    arrows: changeArrows(e1.at, e2.at),
    areas: [
      { ...revenueArea('revenueGain', points, newId())!, label: sym('+') },
      // A thin "−" is lost in the cross-hatch; it reads on a leader.
      { ...revenueArea('revenueLoss', points, newId())!, label: sym('−'), labelPlacement: 'leader' },
    ],
  });
}
