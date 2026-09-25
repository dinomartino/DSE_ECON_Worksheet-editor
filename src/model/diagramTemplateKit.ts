import { nanoid } from 'nanoid';
import type { BiText, InlineRun } from './types';
import type {
  Diagram,
  DiagramAnchorRef,
  DiagramArea,
  DiagramAreaEdge,
  DiagramAreaX,
  DiagramArrow,
  DiagramCurve,
  DiagramCurveDerive,
  DiagramLabel,
  DiagramPlace,
  DiagramPoint,
  DiagramPointMark,
  DiagramSpan,
  DiagramSpanStyle,
} from './diagram';
import { curveCrossing, curveYAt, revenueArea } from './diagramAreas';
import { resolveAnchor, resolveDiagram } from './diagramAnchors';
import { planPreset, shadePreset, type PresetRoles, type ShadePresetId } from './diagramPresets';
import { bi } from './text';

/**
 * The vocabulary the diagram templates are written in: labelled curves, equilibria with
 * drops and ticks, shift arrows — as relations (anchored points, derived curves, spans,
 * Shade presets), so a drag moves what the scheme marks. Pure; every call mints fresh
 * ids, so two inserts never alias. Its own id source for the reason `diagramTemplates` gives.
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

/** Plain and subscript pieces, the same in both languages: lab('S', ['0'], ' = MC', ['0']). */
export function lab(...parts: Array<string | [string]>): BiText {
  return same(parts.map((part) => (typeof part === 'string' ? { text: part } : { text: part[0], vertAlign: 'subscript' as const })));
}

/** A bilingual word with a subscript: "shortage₀" / "短缺₀". */
export function subBi(en: string, zh: string, suffix: string): BiText {
  const tail: InlineRun = { text: suffix, vertAlign: 'subscript' };
  return { en: [{ text: en }, { ...tail }], zh: [{ text: zh }, { ...tail }] };
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

type Part = DiagramCurve | DiagramPointMark;

const scratch = (parts: Part[]): Diagram => ({
  x: {},
  y: {},
  curves: parts.filter((p): p is DiagramCurve => 'points' in p),
  points: parts.filter((p): p is DiagramPointMark => 'at' in p),
  labels: [],
  arrows: [],
});

/** Where `ref` sits among `parts`. A template asking for a place that is not there is a bug. */
export function where(ref: DiagramAnchorRef, parts: Part[]): DiagramPoint {
  const at = resolveAnchor(scratch(parts), ref);
  if (!at) throw new Error('template anchor does not resolve');
  return at;
}

export const cross = (a: DiagramCurve, b: DiagramCurve): DiagramAnchorRef => ({ cross: [a.id, b.id] });
export const at = (p: DiagramPointMark): DiagramAnchorRef => ({ point: p.id });

/** A curve defined by a relation, its points resolved now from the `parts` it reads. */
export function derived(
  rule: DiagramCurveDerive,
  parts: Part[],
  name?: BiText,
  extra: Partial<DiagramCurve> = {},
): DiagramCurve {
  const c: DiagramCurve = { ...curve([], name, extra), derive: rule };
  const resolved = resolveDiagram(scratch([...parts, c])).curves.find((k) => k.id === c.id)!;
  if (resolved.points.length < 2) throw new Error('template curve does not resolve');
  return resolved;
}

/** A copy of `c` moved by (dx, dy) that keeps following it: D₁, S₁ = S + t. */
export function shiftOf(c: DiagramCurve, dx: number, dy: number, name?: BiText, extra: Partial<DiagramCurve> = {}): DiagramCurve {
  return derived({ kind: 'shift', of: c.id, by: { x: dx, y: dy } }, [c], name, extra);
}

/** A vertical line at x (LRAS, fixed S, Ms), 0 up to `top`. */
export function upright(x: number, name?: BiText, top = 0.92): DiagramCurve {
  return derived({ kind: 'vertical', x, from: 0, to: top }, [], name);
}

/** A marked point that follows `ref`. */
export function pin(ref: DiagramAnchorRef, parts: Part[], name?: BiText, extra: Partial<DiagramPointMark> = {}): DiagramPointMark {
  const p = where(ref, parts);
  return point(p.x, p.y, name, { ...extra, anchor: ref });
}

export interface MarkNames {
  /** y tick base: "P", "W", "r". */
  p?: string;
  /** x tick base: "Q", "Y". */
  q?: string;
}

/**
 * An equilibrium at `at`: dashed drops to both axes, P<n> and Q<n> ticks, and no name
 * (E₀ is opt-in from the point inspector). `names` swaps the bases (W/Y/r); an empty
 * string leaves that part off.
 */
export function mark(
  at: DiagramPoint,
  n: string,
  names: MarkNames = {},
  extra: Partial<DiagramPointMark> = {},
): DiagramPointMark {
  const { p = 'P', q = 'Q' } = names;
  const drops: Array<'x' | 'y'> = [];
  if (q) drops.push('x');
  if (p) drops.push('y');
  return point(at.x, at.y, undefined, {
    dropTo: drops,
    xTickLabel: q ? sub(q, n) : undefined,
    yTickLabel: p ? sub(p, n) : undefined,
    ...extra,
  });
}

/** An equilibrium (ticks numbered `n`) where `a` meets `b`, anchored there. */
export function eq(
  a: DiagramCurve,
  b: DiagramCurve,
  n: string,
  names: MarkNames = {},
  extra: Partial<DiagramPointMark> = {},
): DiagramPointMark {
  return mark(meet(a, b), n, names, { ...extra, anchor: cross(a, b) });
}

/** An equilibrium (ticks numbered `n`) at `ref`, resolved among `parts`. */
export function markAt(
  ref: DiagramAnchorRef,
  parts: Part[],
  n: string,
  names: MarkNames = {},
  extra: Partial<DiagramPointMark> = {},
): DiagramPointMark {
  return mark(where(ref, parts), n, names, { ...extra, anchor: ref });
}

export function span(
  from: DiagramPlace,
  to: DiagramPlace,
  style: DiagramSpanStyle,
  extra: Partial<DiagramSpan> = {},
): DiagramSpan {
  return { id: newId(), from, to, style, ...extra };
}

/**
 * The "P₀ → P₁" and "Q₀ → Q₁" arrows the schemes award, as spans on the axes between
 * the two points, so they follow both; they rest outside the axes, past the tick labels.
 * Skips a direction that barely moves.
 */
export function axisArrows(
  from: DiagramPointMark,
  to: DiagramPointMark,
  axes: Array<'x' | 'y'> = ['x', 'y'],
): DiagramSpan[] {
  const out: DiagramSpan[] = [];
  for (const along of ['y', 'x'] as const) {
    if (axes.includes(along) && Math.abs(to.at[along] - from.at[along]) > 0.04) {
      out.push(span(at(from), at(to), 'arrow', { along }));
    }
  }
  return out;
}

/** A Shade-menu preset exactly as the menu adds it, roles named; `extra` overrides (a letter). */
export function shade(d: Diagram, id: ShadePresetId, roles: PresetRoles, extra: Partial<DiagramArea> = {}): DiagramArea[] {
  const plan = planPreset(d, shadePreset(id), roles, newId);
  if ('why' in plan) throw new Error(`template preset ${id}: ${plan.why}`);
  return plan.areas.map((area) => ({ ...area, ...extra }));
}

/**
 * The template as shipped: every relation resolved into `at` / `points` (older builds
 * draw those), then the Shade presets `shades` adds against that geometry.
 */
export function finish(d: Diagram, shades?: (resolved: Diagram) => DiagramArea[]): Diagram {
  const resolved = resolveDiagram(d);
  if (!shades) return resolved;
  return { ...resolved, areas: [...(resolved.areas ?? []), ...shades(resolved)] };
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

/** A horizontal price line whose name sits on the y-axis, as a tick would; drags by its number. */
export function priceLine(y: number, name: BiText, right = 0.9): DiagramCurve {
  return derived({ kind: 'level', y, from: 0, to: right }, [], name, { labelAt: 'start', weight: 0.8 });
}

/** A quantity read off `a` where it meets `line`: no dot, a drop to the x-axis, a tick. Follows both. */
export function reading(a: DiagramCurve, line: DiagramCurve, tick?: BiText): DiagramPointMark {
  const p = meet(a, line);
  return point(p.x, p.y, undefined, { dot: false, dropTo: ['x'], xTickLabel: tick, anchor: cross(a, line) });
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
  // Each price is fixed; dragging D slides both points along it at those prices.
  const e1 = markAt({ on: d.id, y: p1 }, [d], '1');
  const e2 = markAt({ on: d.id, y: p2 }, [d], '2');
  const points = { before: at(e1), after: at(e2) };
  return finish(axes(axisTitles.x, axisTitles.y, {
    curves: [d],
    points: [e1, e2],
    spans: axisArrows(e1, e2),
    areas: [
      { ...revenueArea('revenueGain', points, newId())!, label: sym('+') },
      // A thin "−" is lost in the cross-hatch; it reads on a leader.
      { ...revenueArea('revenueLoss', points, newId())!, label: sym('−'), labelPlacement: 'leader' },
    ],
  }));
}
