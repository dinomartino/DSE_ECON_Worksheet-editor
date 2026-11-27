import type { Diagram, DiagramAnchorRef, DiagramArea, DiagramArrow, DiagramCurve, DiagramPointMark, DiagramSpan } from '@/model/diagram';
import { MAX_CHART_CATEGORIES, MAX_CHART_SERIES } from '@/model/diagram';
import { curveXAt, curveYAt, resolveAnchor } from '@/model/diagramAnchors';
import { curveCrossing, revenueArea } from '@/model/diagramAreas';
import { SHADE_PRESETS, type PresetRoles, type ShadePresetId } from '@/model/diagramPresets';
import {
  arrow,
  at,
  axes,
  axisArrows,
  cross,
  curve,
  derived,
  finish,
  frontier,
  newId,
  placeLabel,
  point,
  reading,
  shade,
  shiftArrow,
  span,
  sub,
  type Pair,
} from '@/model/diagramTemplateKit';
import { buildFromTemplate, getDiagramTemplate } from '@/model/diagramTemplates';
import { compileScene } from './scene';
import { compileFlow } from './flow';
import { phrase, plainOf, symbol, symbolRuns } from './text';
import {
  REVENUE_SHADES,
  type CurveRole,
  type DiagramIssue,
  type DiagramSpec,
  type Direction,
  type GraphRise,
  type GraphShape,
  type Place,
  type ShiftSize,
  type Slope,
  type SpecCurve,
  type SpecLevel,
  type SpecPoint,
  type SpecShift,
} from './types';

/**
 * Spec → editor diagram. Everything a scheme marks is a relation, as in the templates: a
 * shift is a `shift` copy of its curve (it follows a drag), an equilibrium is anchored to
 * its crossing, a gap is a bracket between two readings, a shade is the Shade menu's own
 * preset. What cannot be built is reported as an `error` issue and left out; the caller
 * decides whether the rest is worth showing.
 */

export interface Compiled {
  /** null: nothing drawable (kind 'none', or a broken spec). */
  diagram: Diagram | null;
  issues: DiagramIssue[];
  /** Spec id → the editor curve it became (for the key check and tests). */
  curveIds: Map<string, string>;
  /** Spec curve / shift id → its role, inherited down a shift chain. */
  roles: Map<string, CurveRole>;
  /** Spec level id → where it sits (y for a price, x for a quota), drawn as a line or not (a guide). */
  levels: Map<string, { vertical: boolean; at: number }>;
}

const DEMAND_LINES: Record<Slope, Pair[]> = {
  normal: [[0.06, 0.9], [0.74, 0.2]],
  steep: [[0.18, 0.92], [0.58, 0.1]],
  flat: [[0.04, 0.64], [0.86, 0.32]],
};
const SUPPLY_LINES: Record<Slope, Pair[]> = {
  normal: [[0.06, 0.1], [0.7, 0.86]],
  steep: [[0.28, 0.08], [0.56, 0.9]],
  flat: [[0.04, 0.3], [0.86, 0.62]],
};
const VERTICAL_X: Record<Place, number> = { low: 0.3, mid: 0.46, high: 0.62 };
const LEVEL_Y: Record<Place, number> = { low: 0.3, mid: 0.48, high: 0.66 };
const FRONTIER: Record<Place, Pair> = { low: [0.46, 0.5], mid: [0.6, 0.66], high: [0.76, 0.82] };
const LINE_STEP: Record<ShiftSize, number> = { small: 0.1, normal: 0.18, large: 0.28 };
/** Up / down is larger: against a steep (inelastic) curve a vertical shift moves Q little, and Q₀ Q₁ must not touch. */
const VERTICAL_STEP: Record<ShiftSize, number> = { small: 0.14, normal: 0.24, large: 0.32 };
/** Room for two frontier names side by side on the x-axis. */
const FRONTIER_STEP: Record<ShiftSize, number> = { small: 0.22, normal: 0.32, large: 0.44 };

/** How far a level sits from a crossing it is placed against, at least, and at most when it has one bound. */
const LEVEL_MARGIN = 0.06;
const LEVEL_REACH = 0.26;

/** A tick or label as a lookup key: "Q_1", "Q₁", "Q1", "q 1" → "Q1". */
export function tickKey(raw: string): string {
  return symbolRuns(raw)
    .map((r) => r.text)
    .join('')
    .replace(/[\s_{}]/g, '')
    .toUpperCase();
}

const pointName = (p: SpecPoint) => p.name || p.xTick || p.yTick || `${p.a}×${p.b}`;

function setLevel(line: DiagramCurve, vertical: boolean, at: number): void {
  if (vertical) {
    if (line.derive?.kind === 'vertical') line.derive = { ...line.derive, x: at };
    line.points = line.points.map((p) => ({ ...p, x: at }));
  } else {
    if (line.derive?.kind === 'level') line.derive = { ...line.derive, y: at };
    line.points = line.points.map((p) => ({ ...p, y: at }));
  }
}

export const DEMAND_LIKE: ReadonlySet<CurveRole> = new Set(['demand', 'ad']);
export const SUPPLY_LIKE: ReadonlySet<CurveRole> = new Set(['supply', 'sras', 'lras', 'vertical']);

const SHADE_IDS = new Set<string>(SHADE_PRESETS.map((p) => p.id));

/** A line shift's vector in unit space. */
export function shiftVector(direction: Direction, size: ShiftSize): { x: number; y: number } {
  const s = LINE_STEP[size];
  switch (direction) {
    case 'right':
    case 'out':
      return { x: s, y: 0 };
    case 'left':
    case 'in':
      return { x: -s, y: 0 };
    case 'up':
      return { x: 0, y: VERTICAL_STEP[size] };
    case 'down':
      return { x: 0, y: -VERTICAL_STEP[size] };
  }
}

function baseCurve(spec: SpecCurve): { curve: DiagramCurve; frontier?: Pair } {
  const name = symbol(spec.label);
  switch (spec.role) {
    case 'demand':
    case 'ad':
      return { curve: curve(DEMAND_LINES[spec.slope] ?? DEMAND_LINES.normal, name) };
    case 'supply':
    case 'sras':
      return { curve: curve(SUPPLY_LINES[spec.slope] ?? SUPPLY_LINES.normal, name) };
    case 'lras':
    case 'vertical':
      return { curve: derived({ kind: 'vertical', x: VERTICAL_X[spec.place] ?? 0.46, from: 0, to: 0.9 }, [], name) };
    case 'horizontal':
      return { curve: derived({ kind: 'level', y: LEVEL_Y[spec.place] ?? 0.48, from: 0, to: 0.9 }, [], name) };
    case 'frontier': {
      const ab = FRONTIER[spec.place] ?? FRONTIER.mid;
      return { curve: frontierCurve(ab, name), frontier: ab };
    }
    case 'graph':
      return { curve: graphCurve(spec.shape ?? 'none', spec.rise ?? 'rising', name) };
  }
}

/**
 * A plain graph's line (k-0545), drawn as the HKDSE papers sketch them: a straight line from
 * the origin, a straight line from a point on the y-axis, a curve bending up (convex) or
 * down (concave), or a horizontal line. 'none' reads as straight from the origin.
 */
export const GRAPH_LINES: Record<Exclude<GraphShape, 'none'>, Record<GraphRise, Pair[]>> = {
  origin: { rising: [[0, 0], [0.85, 0.72]], falling: [[0.04, 0.82], [0.86, 0.04]] },
  linear: { rising: [[0, 0.24], [0.85, 0.74]], falling: [[0, 0.78], [0.85, 0.24]] },
  convex: { rising: [[0, 0], [0.45, 0.16], [0.68, 0.38], [0.86, 0.76]], falling: [[0.08, 0.84], [0.22, 0.4], [0.48, 0.2], [0.86, 0.12]] },
  concave: { rising: [[0, 0], [0.18, 0.38], [0.42, 0.6], [0.86, 0.76]], falling: [[0.02, 0.76], [0.4, 0.68], [0.62, 0.5], [0.8, 0.1]] },
  flat: { rising: [[0, 0.45], [0.86, 0.45]], falling: [[0, 0.45], [0.86, 0.45]] },
  // k-0554: broken lines (always rising, then level): an allowance, a cap, or both.
  zeroThenRising: { rising: [[0, 0], [0.3, 0], [0.86, 0.72]], falling: [[0, 0], [0.3, 0], [0.86, 0.72]] },
  risingThenFlat: { rising: [[0, 0], [0.5, 0.56], [0.86, 0.56]], falling: [[0, 0], [0.5, 0.56], [0.86, 0.56]] },
  linearThenFlat: { rising: [[0, 0.24], [0.55, 0.58], [0.86, 0.58]], falling: [[0, 0.24], [0.55, 0.58], [0.86, 0.58]] },
  zeroRisingFlat: { rising: [[0, 0], [0.26, 0], [0.52, 0.6], [0.86, 0.6]], falling: [[0, 0], [0.26, 0], [0.52, 0.6], [0.86, 0.6]] },
};

function graphCurve(shape: GraphShape, rise: GraphRise, name: DiagramCurve['label']): DiagramCurve {
  const lines = GRAPH_LINES[shape === 'none' ? 'origin' : shape];
  const bent = shape === 'convex' || shape === 'concave';
  return curve(lines[rise] ?? lines.rising, name, bent ? { shape: 'curved' } : {});
}

/**
 * A frontier, named just outside its top: at the x-axis an inner frontier's name would sit
 * across the outer one, and up here the gap between two frontiers is widest.
 */
function frontierCurve([a, b]: Pair, name: DiagramCurve['label']): DiagramCurve {
  const t = (75 * Math.PI) / 180;
  return placeLabel(curve(frontier(a, b), name, { shape: 'curved' }), a * Math.cos(t) + 0.08, b * Math.sin(t) + 0.03);
}

/** x on a straight resolved curve at height y; the curve's own x when it is vertical. */
function xAt(c: DiagramCurve, y: number): number | null {
  return curveXAt(c, y);
}

/** What a shift arrow must keep clear of: every other line, and the marked points. */
interface Clearance {
  curves: readonly DiagramCurve[];
  points: readonly DiagramPointMark[];
  /** The source and its copy: the arrow runs between them. */
  keep: readonly string[];
}

/** Distance from point p to segment ab, in unit space. */
function toSegment(p: { x: number; y: number }, a: Pair, b: Pair): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len));
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
}

const ARROW_ROOM = 0.045;
/** Where lettered points sit on a frontier (degrees from the x-axis). */
const MARK_DEG = 55;

/** True when the arrow from–to touches no other line and no marked point. */
function clearOf(from: Pair, to: Pair, room: Clearance | undefined): boolean {
  if (!room) return true;
  const probe = curve([[from[0], from[1]], [to[0], to[1]]]);
  // The arrow, fattened by ARROW_ROOM: two parallel probes either side catch a near miss.
  const offsets = from[1] === to[1] ? [[0, ARROW_ROOM], [0, -ARROW_ROOM]] : [[ARROW_ROOM, 0], [-ARROW_ROOM, 0]];
  for (const c of room.curves) {
    if (room.keep.includes(c.id)) continue;
    if (curveCrossing(probe, c)) return false;
    for (const [ox, oy] of offsets) {
      if (curveCrossing(curve([[from[0] + ox, from[1] + oy], [to[0] + ox, to[1] + oy]]), c)) return false;
    }
  }
  return !room.points.some((p) => toSegment(p.at, from, to) < ARROW_ROOM + 0.01);
}

/** Where a shift arrow fits: a short arrow beside the source, pointing the way of the shift, clear of everything else. */
export function shiftArrowPlace(source: DiagramCurve, by: { x: number; y: number }, room?: Clearance): [Pair, Pair] | null {
  const ys = source.points.map((p) => p.y);
  const xs = source.points.map((p) => p.x);
  const [ylo, yhi] = [Math.min(...ys), Math.max(...ys)];
  const [xlo, xhi] = [Math.min(...xs), Math.max(...xs)];
  const fits: Array<[Pair, Pair]> = [];
  if (Math.abs(by.x) > 1e-6) {
    const sign = Math.sign(by.x);
    const len = Math.abs(by.x);
    for (const f of [0.8, 0.7, 0.6, 0.9, 0.5, 0.4, 0.3, 0.2]) {
      const y = Math.min(0.86, ylo + f * (yhi - ylo));
      const x0 = xAt(source, y);
      if (x0 === null) continue;
      const from: Pair = [x0 + sign * 0.03, y];
      const to: Pair = [x0 + sign * Math.max(len - 0.03, 0.05), y];
      if (to[0] > 0.02 && to[0] < 0.98) fits.push([from, to]);
    }
  } else {
    const sign = Math.sign(by.y);
    const len = Math.abs(by.y);
    for (const f of [0.85, 0.7, 0.5, 0.3, 0.15]) {
      const x = xlo + f * (xhi - xlo);
      const y0 = curveYAt(source, x);
      if (y0 === null) continue;
      const from: Pair = [x, y0 + sign * 0.03];
      const to: Pair = [x, y0 + sign * Math.max(len - 0.03, 0.05)];
      if (to[1] > 0.04 && to[1] < 0.96) fits.push([from, to]);
    }
  }
  return fits.find(([from, to]) => clearOf(from, to, room)) ?? fits[0] ?? null;
}

function frontierShift(ab: Pair, direction: Direction, size: ShiftSize): Pair {
  const s = FRONTIER_STEP[size];
  const grow = (v: number, up: boolean) => Math.max(0.15, Math.min(0.95, v * (up ? 1 + s : 1 - s)));
  const [a, b] = ab;
  switch (direction) {
    case 'out':
      return [grow(a, true), grow(b, true)];
    case 'in':
      return [grow(a, false), grow(b, false)];
    case 'right':
      return [grow(a, true), b];
    case 'left':
      return [grow(a, false), b];
    case 'up':
      return [a, grow(b, true)];
    case 'down':
      return [a, grow(b, false)];
  }
}

/** The point of a frontier at angle `deg` (0 = x-intercept). */
const onFrontier = ([a, b]: Pair, deg: number): Pair => {
  const t = (deg * Math.PI) / 180;
  return [a * Math.cos(t), b * Math.sin(t)];
};

/**
 * Two long names side by side ("SRAS₁ SRAS₀") touch after a sideways shift: the left
 * curve's name moves off its end, up for a name at the top, down for one at the bottom.
 */
function staggerNames(source: DiagramCurve, copy: DiagramCurve, by: { x: number; y: number }): void {
  if (Math.abs(by.x) < 1e-6) return;
  const long = (c: DiagramCurve) => plainOf(c.label).length >= 4;
  if (!long(source) && !long(copy)) return;
  const left = by.x < 0 ? copy : source;
  const pts = left.points;
  if (pts.length < 2) return;
  const end = (left.labelAt ?? 'end') === 'end' ? pts[pts.length - 1] : pts[0];
  const other = (left.labelAt ?? 'end') === 'end' ? pts[0] : pts[pts.length - 1];
  left.labelOffset = { x: -0.02, y: end.y >= other.y ? 0.07 : -0.07 };
}

/**
 * A level held between two crossings needs room: the shifts those crossings use are drawn
 * large, so the four readings of an HKDSE figure (Qs, Qd at the price, the equilibria)
 * stand apart. The returned spec is the one drawn; the model's own is left as it was.
 */
function roomForLevels(spec: DiagramSpec): DiagramSpec {
  const between = spec.levels.filter((l) => l.above.length === 2 && l.below.length === 2);
  if (!between.length) return spec;
  const ids = new Set(between.flatMap((l) => [...l.above, ...l.below]));
  if (!spec.shifts.some((s) => ids.has(s.id) && s.size !== 'large')) return spec;
  return { ...spec, shifts: spec.shifts.map((s) => (ids.has(s.id) ? { ...s, size: 'large' as const } : s)) };
}

export function compileSpec(given: DiagramSpec): Compiled {
  const spec = roomForLevels(given);
  const issues: DiagramIssue[] = [];
  const curveIds = new Map<string, string>();
  const roles = new Map<string, CurveRole>();
  const levelAt = new Map<string, { vertical: boolean; at: number }>();
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const look = (code: string, text: string) => issues.push({ level: 'look', code, text });

  if (spec.kind === 'none') return { diagram: null, issues, curveIds, roles, levels: levelAt };
  if (spec.kind === 'scene') return compileScene(spec);
  if (spec.kind === 'flow') return compileFlow(spec);

  if (spec.kind === 'template') {
    const template = getDiagramTemplate(spec.template);
    if (!template || spec.template === 'blank') {
      error('template.unknown', `"${spec.template}" is not one of the editor's diagram templates.`);
      return { diagram: null, issues, curveIds, roles, levels: levelAt };
    }
    const built = buildFromTemplate(spec.template);
    const title = phrase(spec.title);
    const x = phrase(spec.xAxis);
    const y = phrase(spec.yAxis);
    const diagram: Diagram = {
      ...built,
      ...(title ? { title } : {}),
      x: x && !built.chart ? { ...built.x, title: x } : built.x,
      y: y && !built.chart ? { ...built.y, title: y } : built.y,
    };
    return { diagram, issues, curveIds, roles, levels: levelAt };
  }

  if (spec.kind === 'chart') {
    const chart = spec.chart;
    const categories = chart.categories.map((c) => phrase(c) ?? { en: [{ text: '' }], zh: [{ text: '' }] });
    if (!categories.length) error('chart.empty', 'The chart has no categories.');
    if (categories.length > MAX_CHART_CATEGORIES) error('chart.categories', `A chart holds at most ${MAX_CHART_CATEGORIES} categories.`);
    if (!chart.series.length) error('chart.series', 'The chart has no data series.');
    if (chart.series.length > MAX_CHART_SERIES) error('chart.series', `A chart holds at most ${MAX_CHART_SERIES} series.`);
    const series = chart.series.slice(0, MAX_CHART_SERIES).map((s, i) => {
      if (s.values.length !== categories.length) {
        error('chart.values', `Series ${i + 1} has ${s.values.length} values for ${categories.length} categories.`);
      }
      const values = categories.map((_, k) => (Number.isFinite(s.values[k]) ? s.values[k] : null));
      return { id: newId(), label: phrase(s.label) ?? { en: [{ text: `Series ${i + 1}` }], zh: [{ text: `系列${i + 1}` }] }, values };
    });
    if (series.length > 1 && series.some((s) => !plainOf(s.label).trim())) look('chart.legend', 'A series has no legend label.');
    const yTitle = phrase(chart.yTitle);
    const xTitle = phrase(chart.xTitle);
    const title = phrase(spec.title);
    const diagram: Diagram = {
      x: {},
      y: {},
      curves: [],
      points: [],
      labels: [],
      arrows: [],
      ...(title ? { title } : {}),
      chart: {
        kind: chart.type === 'line' ? 'line' : 'bar',
        categories: categories.slice(0, MAX_CHART_CATEGORIES),
        series,
        ...(yTitle ? { yTitle } : {}),
        ...(xTitle ? { xTitle } : {}),
      },
    };
    return { diagram, issues, curveIds, roles, levels: levelAt };
  }

  // ---- curves ----
  const parts: Array<DiagramCurve | DiagramPointMark> = [];
  const curves: DiagramCurve[] = [];
  const bySpecId = new Map<string, DiagramCurve>();
  const frontiers = new Map<string, Pair>();
  const arrows: DiagramArrow[] = [];
  const spans: DiagramSpan[] = [];
  const points: DiagramPointMark[] = [];

  const add = (id: string, c: DiagramCurve, role: CurveRole) => {
    if (bySpecId.has(id)) {
      error('id.duplicate', `The id "${id}" is used twice.`);
      return;
    }
    bySpecId.set(id, c);
    curveIds.set(id, c.id);
    roles.set(id, role);
    curves.push(c);
    parts.push(c);
  };

  for (const spec_ of spec.curves) {
    try {
      const built = baseCurve(spec_);
      add(spec_.id, built.curve, spec_.role);
      if (built.frontier) frontiers.set(spec_.id, built.frontier);
    } catch {
      error('curve.build', `Curve "${spec_.id}" could not be drawn.`);
    }
  }

  /** Shift arrows are placed last, clear of the price lines and points (k-0534: one sat on P₁). */
  const pendingArrows: Array<{ id: string; source: DiagramCurve; copy: DiagramCurve; by: { x: number; y: number } }> = [];
  for (const s of spec.shifts) compileShift(s);

  function compileShift(s: SpecShift): void {
    const source = bySpecId.get(s.of);
    const role = roles.get(s.of);
    if (!source || !role) {
      error('shift.of', `Shift "${s.id}" is of "${s.of}", which is not a curve drawn before it.`);
      return;
    }
    const name = symbol(s.label);
    const ab = frontiers.get(s.of);
    if (ab) {
      const next = frontierShift(ab, s.direction, s.size);
      const copy = frontierCurve(next, name);
      add(s.id, copy, role);
      frontiers.set(s.id, next);
      // Lettered points sit at 55° (below): an outward arrow then runs low, at 25°, clear of them.
      const marked = spec.marks.some((m) => m.of === s.of);
      const deg = s.direction === 'right' || s.direction === 'left' ? 25 : s.direction === 'up' || s.direction === 'down' ? 65 : marked ? 25 : 45;
      const [fx, fy] = onFrontier(ab, deg);
      const [tx, ty] = onFrontier(next, deg);
      const k = 0.18;
      arrows.push(arrow([fx + (tx - fx) * k, fy + (ty - fy) * k], [tx - (tx - fx) * k, ty - (ty - fy) * k]));
      return;
    }
    const by = shiftVector(s.direction, s.size);
    if (role === 'horizontal' && by.x !== 0) look('shift.flatSideways', `"${s.id}" moves a horizontal line sideways, which changes nothing.`);
    if ((role === 'lras' || role === 'vertical') && by.y !== 0) look('shift.uprightUp', `"${s.id}" moves a vertical line up or down, which changes nothing.`);
    let copy: DiagramCurve;
    try {
      copy = derived({ kind: 'shift', of: source.id, by }, parts, name);
    } catch {
      error('shift.build', `Shift "${s.id}" moves "${s.of}" off the plot.`);
      return;
    }
    add(s.id, copy, role);
    staggerNames(source, copy, by);
    pendingArrows.push({ id: s.id, source, copy, by });
  }

  // ---- levels: price lines and quotas, placed against named crossings (k-0534) ----
  const levelKinds = new Map<string, string>();
  const levelOrder: string[] = [];
  const crossingOf = (ids: readonly string[]): { x: number; y: number } | null => {
    const a = bySpecId.get(ids[0] ?? '');
    const b = bySpecId.get(ids[1] ?? '');
    return a && b ? curveCrossing(a, b) : null;
  };
  const firstMarket = (): { x: number; y: number } | null => {
    const demand = spec.curves.find((c) => DEMAND_LIKE.has(c.role));
    const supply = spec.curves.find((c) => SUPPLY_LIKE.has(c.role));
    return demand && supply ? crossingOf([demand.id, supply.id]) : null;
  };
  /** The band a level may sit in, on its own axis (y for a price, x for a quota); null when its bounds contradict. */
  const bandOf = (level: SpecLevel): { lo: number; hi: number; free: boolean } | null => {
    const vertical = level.kind === 'quota';
    const coord = (p: { x: number; y: number }) => (vertical ? p.x : p.y);
    const named = (ids: string[], side: string) => {
      if (!ids.length) return undefined;
      const p = crossingOf(ids);
      if (!p) error('level.ref', `"${level.id}" is placed ${side} ${ids.join('×')}, but those two do not cross on the diagram.`);
      return p ? coord(p) : null;
    };
    const above = named(level.above, vertical ? 'right of' : 'above');
    const below = named(level.below, vertical ? 'left of' : 'below');
    if (above === null || below === null) return { lo: 0.4, hi: 0.4, free: false };
    const max = 0.86;
    if (above !== undefined && below !== undefined) {
      if (above >= below - 0.02) {
        error(
          'level.band',
          `"${level.id}" cannot be ${vertical ? 'right of' : 'above'} ${level.above.join('×')} and ${vertical ? 'left of' : 'below'} ${level.below.join('×')}: ${level.below.join('×')} is ${vertical ? 'left of' : 'lower than'} ${level.above.join('×')} on this diagram, not ${vertical ? 'right of' : 'higher than'} it.`,
        );
        return null;
      }
      const margin = Math.min(LEVEL_MARGIN, (below - above) / 3);
      return { lo: above + margin, hi: below - margin, free: true };
    }
    if (above !== undefined) return { lo: Math.min(above + LEVEL_MARGIN, max), hi: Math.min(above + LEVEL_REACH, max), free: true };
    if (below !== undefined) return { lo: Math.max(below - LEVEL_REACH, 0.08), hi: Math.max(below - LEVEL_MARGIN, 0.08), free: true };
    const market = firstMarket();
    const at0 = market ? coord(market) : 0.5;
    const y = Math.max(0.1, Math.min(0.88, at0 + (level.side === 'below' ? -0.17 : 0.17)));
    return { lo: y, hi: y, free: false };
  };
  /**
   * A guide is drawn the HKDSE way: no line of its own; the furthest point on it carries
   * the dashed line to the axis and its tick, and the other points on it follow that
   * point's height (drag it and P₁ moves for all). It needs a line after all when a gap
   * or a shade reads it, or when no point sits on it.
   */
  const isGuide = (level: SpecLevel) =>
    level.style === 'guide' &&
    spec.points.some((p) => p.a === level.id || p.b === level.id) &&
    !spec.gaps.some((g) => g.level === level.id) &&
    !((level.kind === 'ceiling' || level.kind === 'floor' || level.kind === 'world' || level.kind === 'fixed') && spec.shades.length);
  const levelLine = (level: SpecLevel, at: number): DiagramCurve => {
    const name = symbol(level.label);
    return level.kind === 'quota'
      ? derived({ kind: 'vertical', x: at, from: 0, to: 0.9 }, [], name, { labelAt: 'end', weight: 0.8 })
      : derived({ kind: 'level', y: at, from: 0, to: 0.9 }, [], name, { labelAt: 'start', weight: 0.8 });
  };
  const bands = new Map<string, { lo: number; hi: number; free: boolean }>();
  const guides = new Map<string, SpecLevel>();
  const placeLevel = (level: SpecLevel, at: number) => {
    const vertical = level.kind === 'quota';
    levelAt.set(level.id, { vertical, at });
    const line = bySpecId.get(level.id);
    if (line) setLevel(line, vertical, at);
  };
  for (const level of spec.levels) {
    const band = bandOf(level);
    if (!band) continue;
    bands.set(level.id, band);
    const at = (band.lo + band.hi) / 2;
    levelKinds.set(level.id, level.kind);
    levelOrder.push(level.id);
    levelAt.set(level.id, { vertical: level.kind === 'quota', at });
    roles.set(level.id, level.kind === 'quota' ? 'vertical' : 'horizontal');
    if (isGuide(level)) guides.set(level.id, level);
    else {
      try {
        add(level.id, levelLine(level, at), level.kind === 'quota' ? 'vertical' : 'horizontal');
      } catch {
        error('level.build', `Price line "${level.id}" could not be drawn.`);
      }
    }
    if (!firstMarket() && (level.kind === 'ceiling' || level.kind === 'floor')) {
      error('level.market', `A ${level.kind} needs a demand and a supply curve to sit against.`);
    }
  }

  // ---- points ----
  /** A point's two references → where it is and the anchor that keeps it there; a tick name refers to an earlier point. */
  type Placed = { at: { x: number; y: number }; anchor: DiagramAnchorRef; guide?: string };
  const marksByTick = new Map<string, DiagramPointMark>();
  const placePoint = (p: SpecPoint, scratch: Array<DiagramCurve | DiagramPointMark>): Placed | string => {
    // A guide level holds no line: the point is on the other curve at the guide's height.
    const guideId = guides.has(p.b) ? p.b : guides.has(p.a) ? p.a : '';
    if (guideId) {
      const other = bySpecId.get(guideId === p.b ? p.a : p.b);
      const place = levelAt.get(guideId)!;
      if (!other) return `Point ${pointName(p)} names "${guideId === p.b ? p.a : p.b}", which is not drawn.`;
      if (place.vertical) {
        const y = curveYAt(other, place.at);
        if (y === null) return `"${other === bySpecId.get(p.a) ? p.a : p.b}" does not reach the quota "${guideId}".`;
        return { at: { x: place.at, y }, anchor: { on: other.id, x: { x: place.at, y: 0 } }, guide: guideId };
      }
      const x = curveXAt(other, place.at);
      if (x === null) return `"${guideId === p.b ? p.a : p.b}" does not reach the price line "${guideId}".`;
      return { at: { x, y: place.at }, anchor: { on: other.id, y: place.at }, guide: guideId };
    }
    const a = bySpecId.get(p.a);
    if (!a) return `Point ${pointName(p)} names "${p.a}", which is not drawn.`;
    const b = bySpecId.get(p.b);
    if (b) {
      const hit = curveCrossing(a, b);
      if (!hit) return `"${p.a}" and "${p.b}" do not cross inside the plot.`;
      return { at: hit, anchor: cross(a, b) };
    }
    const ref = marksByTick.get(`x:${tickKey(p.b)}`) ?? marksByTick.get(`y:${tickKey(p.b)}`);
    if (!ref) return `Point ${pointName(p)} names "${p.b}", which is neither a drawn line nor an earlier point's tick.`;
    const byX = marksByTick.get(`x:${tickKey(p.b)}`) === ref;
    const anchor: DiagramAnchorRef = byX ? { on: a.id, x: { point: ref.id } } : { on: a.id, y: { point: ref.id } };
    const at = resolveAnchor({ x: {}, y: {}, curves: scratch.filter((k): k is DiagramCurve => 'points' in k), points: scratch.filter((k): k is DiagramPointMark => 'at' in k), labels: [], arrows: [] }, anchor);
    if (!at) return `Point ${pointName(p)}: "${p.a}" does not reach ${byX ? 'that quantity' : 'that price'}.`;
    return { at, anchor };
  };

  /** How far apart the closest two different ticks on one axis would be, with the levels where they are now: the layout search reads this. */
  const tickSpread = (): number => {
    marksByTick.clear();
    const scratch: Array<DiagramCurve | DiagramPointMark> = [...parts];
    const xs: Array<[number, string]> = [];
    const ys: Array<[number, string]> = [];
    for (const lv of spec.levels) {
      const place = levelAt.get(lv.id);
      if (!place || !lv.label.trim()) continue;
      (place.vertical ? xs : ys).push([place.at, tickKey(lv.label)]);
    }
    for (const p of spec.points) {
      const placed = placePoint(p, scratch);
      if (typeof placed === 'string') continue;
      const mark = point(placed.at.x, placed.at.y, undefined, { anchor: placed.anchor });
      scratch.push(mark);
      if (p.xTick.trim()) {
        xs.push([placed.at.x, tickKey(p.xTick)]);
        marksByTick.set(`x:${tickKey(p.xTick)}`, mark);
      }
      if (p.yTick.trim()) {
        ys.push([placed.at.y, tickKey(p.yTick)]);
        marksByTick.set(`y:${tickKey(p.yTick)}`, mark);
      }
    }
    const gap = (list: Array<[number, string]>) => {
      let min = 1;
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          if (list[i][1] === list[j][1]) continue;
          min = Math.min(min, Math.abs(list[i][0] - list[j][0]));
        }
      }
      return min;
    };
    return Math.min(gap(xs), gap(ys));
  };

  // Each free level slides inside its band to where the ticks are furthest apart (labels never touch).
  for (const level of spec.levels) {
    const band = bands.get(level.id);
    if (!band || !band.free || band.hi - band.lo < 0.01) continue;
    let best = { at: (band.lo + band.hi) / 2, score: -1 };
    for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
      const at = band.lo + f * (band.hi - band.lo);
      placeLevel(level, at);
      const score = tickSpread();
      if (score > best.score + 0.004) best = { at, score };
    }
    placeLevel(level, best.at);
  }
  marksByTick.clear();

  const equilibriumMarks: DiagramPointMark[] = [];
  const onGuide = new Map<string, DiagramPointMark[]>();
  for (const e of spec.points) {
    const placed = placePoint(e, parts);
    if (typeof placed === 'string') {
      error(bySpecId.get(e.a) && (bySpecId.get(e.b) || guides.has(e.b) || !e.b) ? 'eq.cross' : 'eq.ref', placed);
      continue;
    }
    // A guide's own tick is printed once, by its furthest point (below).
    const guide = placed.guide ? guides.get(placed.guide) : undefined;
    const sameTick = (tick: string) => guide && tickKey(tick) === tickKey(guide.label);
    const yTick = guide && guide.kind !== 'quota' && sameTick(e.yTick) ? '' : e.yTick;
    const xTick = guide && guide.kind === 'quota' && sameTick(e.xTick) ? '' : e.xTick;
    const byTick = !bySpecId.has(e.b) && !guides.has(e.b);
    const drops: Array<'x' | 'y'> = [];
    // A point read off a tick ("S₀ above Q₁") carries that tick's line on up to it, untagged.
    if (xTick.trim() || (byTick && marksByTick.has(`x:${tickKey(e.b)}`))) drops.push('x');
    if (yTick.trim() || (byTick && marksByTick.has(`y:${tickKey(e.b)}`))) drops.push('y');
    const mark = point(placed.at.x, placed.at.y, symbol(e.name), {
      anchor: placed.anchor,
      dot: e.dot,
      dropTo: drops,
      xTickLabel: symbol(xTick),
      yTickLabel: symbol(yTick),
      labelSide: 'upRight',
    });
    if (e.xTick.trim()) marksByTick.set(`x:${tickKey(e.xTick)}`, mark);
    if (e.yTick.trim()) marksByTick.set(`y:${tickKey(e.yTick)}`, mark);
    if (guide) onGuide.set(guide.id, [...(onGuide.get(guide.id) ?? []), mark]);
    // Equilibria (two curves, not a level) are what the change arrows run between.
    if (!levelAt.has(e.a) && !levelAt.has(e.b) && bySpecId.has(e.b)) equilibriumMarks.push(mark);
    points.push(mark);
    parts.push(mark);
  }
  if (spec.changeArrows && equilibriumMarks.length >= 2) {
    spans.push(...axisArrows(equilibriumMarks[0], equilibriumMarks[1]));
  }

  // The furthest point on a guide draws "P₁ - - - -" to the axis; the rest follow its height.
  for (const [id, guide] of guides) {
    const marks = onGuide.get(id) ?? [];
    if (!marks.length) continue;
    const vertical = guide.kind === 'quota';
    const head = marks.reduce((far, m) => ((vertical ? m.at.y > far.at.y : m.at.x > far.at.x) ? m : far));
    const axis: 'x' | 'y' = vertical ? 'x' : 'y';
    if (guide.label.trim()) {
      head.dropTo = [...new Set([...(head.dropTo ?? []), axis])];
      if (vertical) head.xTickLabel = symbol(guide.label);
      else head.yTickLabel = symbol(guide.label);
    }
    for (const m of marks) {
      if (m === head || !m.anchor || !('on' in m.anchor)) continue;
      m.anchor = vertical ? { on: m.anchor.on, x: { point: head.id } } : { on: m.anchor.on, y: { point: head.id } };
    }
  }

  // ---- gaps at a price line ----
  const demandOf = () => spec.curves.find((c) => DEMAND_LIKE.has(c.role));
  const supplyOf = () => spec.curves.find((c) => SUPPLY_LIKE.has(c.role));
  for (const gap of spec.gaps) {
    const line = bySpecId.get(gap.level);
    const dSpec = demandOf();
    const sSpec = supplyOf();
    const d = dSpec && bySpecId.get(dSpec.id);
    const s = sSpec && bySpecId.get(sSpec.id);
    if (!line || !d || !s) {
      error('gap.ref', `The gap at "${gap.level}" needs that price line and a demand and a supply curve.`);
      continue;
    }
    if (!curveCrossing(d, line) || !curveCrossing(s, line)) {
      error('gap.cross', `The price line "${gap.level}" does not meet both demand and supply.`);
      continue;
    }
    const qd = reading(d, line, sub('Q', 'd'));
    const qs = reading(s, line, sub('Q', 's'));
    const shortage = qd.at.x > qs.at.x;
    const [from, to] = shortage ? [qs, qd] : [qd, qs];
    points.push(qs, qd);
    parts.push(qs, qd);
    spans.push(
      span(at(from), at(to), 'bracket', {
        offset: line.points[0].y < 0.5 ? -0.05 : 0.04,
        label: phrase(gap.label),
      }),
    );
  }

  // ---- marks against a curve ----
  for (const m of spec.marks) {
    const c = bySpecId.get(m.of);
    if (!c) {
      error('mark.ref', `Point ${m.label} is placed against "${m.of}", which is not drawn.`);
      continue;
    }
    const ab = frontiers.get(m.of);
    let p: Pair;
    if (ab) {
      const [x, y] = onFrontier(ab, MARK_DEG);
      // Outside a frontier that later moves out: halfway to the new one, never on it (k-0534:
      // at ×1.3 a point C sat on PPC₁, and "attainable after the growth?" had no clear answer).
      const grown = spec.shifts
        .filter((sh) => sh.of === m.of && frontiers.has(sh.id))
        .map((sh) => Math.min(frontiers.get(sh.id)![0] / ab[0], frontiers.get(sh.id)![1] / ab[1]))
        .filter((r) => r > 1.05);
      const out = grown.length ? 1 + (Math.min(...grown) - 1) / 2 : 1.3;
      p = m.where === 'on' ? [x, y] : m.where === 'inside' ? [x * 0.62, y * 0.62] : [Math.min(x * out, 0.95), Math.min(y * out, 0.95)];
    } else {
      const mid = c.points[Math.floor((c.points.length - 1) / 2)];
      const end = c.points[c.points.length - 1];
      const on: Pair = [(mid.x + end.x) / 2, (mid.y + end.y) / 2];
      p = m.where === 'on' ? on : m.where === 'inside' ? [on[0] * 0.7, on[1] * 0.7] : [Math.min(on[0] * 1.25, 0.95), Math.min(on[1] * 1.25, 0.95)];
    }
    const mark = point(p[0], p[1], symbol(m.label), { labelSide: 'upRight' });
    points.push(mark);
    parts.push(mark);
  }

  for (const pending of pendingArrows) {
    const place = shiftArrowPlace(pending.source, pending.by, { curves, points, keep: [pending.source.id, pending.copy.id] });
    if (place) {
      try {
        arrows.push(shiftArrow(pending.source, pending.copy, place[0], place[1]));
      } catch {
        look('shift.arrow', `No room for the arrow of "${pending.id}".`);
      }
    } else look('shift.arrow', `No room for the arrow of "${pending.id}".`);
  }

  const title = phrase(spec.title);
  const body = axes(phrase(spec.xAxis) ?? { en: [], zh: [] }, phrase(spec.yAxis) ?? { en: [], zh: [] }, {
    curves,
    points,
    arrows,
    spans,
    ...(title ? { title } : {}),
  });

  // ---- shades ----
  const roleOf = (want: (role: CurveRole) => boolean, shifted = false) =>
    [...spec.curves.map((c) => c.id), ...spec.shifts.map((s) => s.id)].find((id) => {
      const role = roles.get(id);
      const isShift = spec.shifts.some((s) => s.id === id);
      return role && want(role) && isShift === shifted && bySpecId.has(id);
    });
  const presetRoles: PresetRoles = {};
  const demandId = roleOf((r) => DEMAND_LIKE.has(r));
  const supplyId = roleOf((r) => SUPPLY_LIKE.has(r));
  const shiftedId = roleOf((r) => SUPPLY_LIKE.has(r), true);
  if (demandId) presetRoles.demand = bySpecId.get(demandId)!.id;
  if (supplyId) presetRoles.supply = bySpecId.get(supplyId)!.id;
  if (shiftedId) presetRoles.shifted = bySpecId.get(shiftedId)!.id;
  const control = levelOrder.find((id) => (levelKinds.get(id) === 'ceiling' || levelKinds.get(id) === 'floor') && bySpecId.has(id));
  if (control) presetRoles.control = { curve: bySpecId.get(control)!.id };
  const worlds = levelOrder.filter((id) => (levelKinds.get(id) === 'world' || levelKinds.get(id) === 'fixed') && bySpecId.has(id));
  if (worlds[0]) presetRoles.world = { curve: bySpecId.get(worlds[0])!.id };
  if (worlds[1]) presetRoles.raised = { curve: bySpecId.get(worlds[1])!.id };

  let diagram: Diagram;
  try {
    diagram = finish(body, (resolved) => {
      const areas: DiagramArea[] = [];
      for (const s of spec.shades) {
        const label = phrase(s.label);
        const extra: Partial<DiagramArea> = label ? { label } : {};
        if ((REVENUE_SHADES as readonly string[]).includes(s.preset)) {
          if (equilibriumMarks.length < 2) {
            error('shade.revenue', `${s.preset} needs two equilibria.`);
            continue;
          }
          const area = revenueArea(
            s.preset as 'revenueGain' | 'revenueLoss',
            { before: at(equilibriumMarks[0]), after: at(equilibriumMarks[1]) },
            newId(),
          );
          if (area) areas.push({ ...area, ...extra });
          continue;
        }
        if (!SHADE_IDS.has(s.preset)) {
          error('shade.unknown', `"${s.preset}" is not a Shade preset.`);
          continue;
        }
        try {
          areas.push(...shade(resolved, s.preset as ShadePresetId, presetRoles, extra));
        } catch (cause) {
          const why = cause instanceof Error ? cause.message.replace(/^template preset /, '') : 'cannot be drawn';
          error('shade.build', `Shade ${why}.`);
        }
      }
      return areas;
    });
  } catch {
    error('diagram.resolve', 'The diagram could not be resolved.');
    return { diagram: null, issues, curveIds, roles, levels: levelAt };
  }
  return { diagram, issues, curveIds, roles, levels: levelAt };
}
