import type { Diagram, DiagramArea, DiagramArrow, DiagramCurve, DiagramPointMark, DiagramSpan } from '@/model/diagram';
import { MAX_CHART_CATEGORIES, MAX_CHART_SERIES } from '@/model/diagram';
import { curveXAt, curveYAt } from '@/model/diagramAnchors';
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
import { phrase, plainOf, symbol } from './text';
import {
  REVENUE_SHADES,
  type CurveRole,
  type DiagramIssue,
  type DiagramSpec,
  type Direction,
  type Place,
  type ShiftSize,
  type Slope,
  type SpecCurve,
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
  }
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

/** Where a shift arrow fits: a short arrow beside the source, pointing the way of the shift. */
function shiftArrowPlace(source: DiagramCurve, by: { x: number; y: number }): [Pair, Pair] | null {
  const ys = source.points.map((p) => p.y);
  const xs = source.points.map((p) => p.x);
  const [ylo, yhi] = [Math.min(...ys), Math.max(...ys)];
  const [xlo, xhi] = [Math.min(...xs), Math.max(...xs)];
  if (Math.abs(by.x) > 1e-6) {
    const sign = Math.sign(by.x);
    const len = Math.abs(by.x);
    for (const f of [0.8, 0.6, 0.4]) {
      const y = Math.min(0.86, ylo + f * (yhi - ylo));
      const x0 = xAt(source, y);
      if (x0 === null) continue;
      const from: Pair = [x0 + sign * 0.03, y];
      const to: Pair = [x0 + sign * Math.max(len - 0.03, 0.05), y];
      if (to[0] > 0.02 && to[0] < 0.98) return [from, to];
    }
    return null;
  }
  const sign = Math.sign(by.y);
  const len = Math.abs(by.y);
  for (const f of [0.85, 0.5, 0.15]) {
    const x = xlo + f * (xhi - xlo);
    const y0 = curveYAt(source, x);
    if (y0 === null) continue;
    const from: Pair = [x, y0 + sign * 0.03];
    const to: Pair = [x, y0 + sign * Math.max(len - 0.03, 0.05)];
    if (to[1] > 0.04 && to[1] < 0.96) return [from, to];
  }
  return null;
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

export function compileSpec(spec: DiagramSpec): Compiled {
  const issues: DiagramIssue[] = [];
  const curveIds = new Map<string, string>();
  const roles = new Map<string, CurveRole>();
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const look = (code: string, text: string) => issues.push({ level: 'look', code, text });

  if (spec.kind === 'none') return { diagram: null, issues, curveIds, roles };

  if (spec.kind === 'template') {
    const template = getDiagramTemplate(spec.template);
    if (!template || spec.template === 'blank') {
      error('template.unknown', `"${spec.template}" is not one of the editor's diagram templates.`);
      return { diagram: null, issues, curveIds, roles };
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
    return { diagram, issues, curveIds, roles };
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
    return { diagram, issues, curveIds, roles };
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
      const deg = s.direction === 'right' || s.direction === 'left' ? 25 : s.direction === 'up' || s.direction === 'down' ? 65 : 45;
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
    const place = shiftArrowPlace(source, by);
    if (place) {
      try {
        arrows.push(shiftArrow(source, copy, place[0], place[1]));
      } catch {
        look('shift.arrow', `No room for the arrow of "${s.id}".`);
      }
    } else look('shift.arrow', `No room for the arrow of "${s.id}".`);
  }

  // ---- price lines ----
  const firstMarket = (): { x: number; y: number } | null => {
    const demand = spec.curves.find((c) => DEMAND_LIKE.has(c.role));
    const supply = spec.curves.find((c) => SUPPLY_LIKE.has(c.role));
    const d = demand && bySpecId.get(demand.id);
    const s = supply && bySpecId.get(supply.id);
    return d && s ? curveCrossing(d, s) : null;
  };
  const levelKinds = new Map<string, string>();
  const levelOrder: string[] = [];
  for (const level of spec.levels) {
    const market = firstMarket();
    const y0 = market?.y ?? 0.5;
    const offset = level.side === 'below' ? -0.17 : 0.17;
    const y = Math.max(0.1, Math.min(0.88, y0 + offset));
    try {
      const line = derived({ kind: 'level', y, from: 0, to: 0.9 }, [], symbol(level.label), { labelAt: 'start', weight: 0.8 });
      add(level.id, line, 'horizontal');
      levelKinds.set(level.id, level.kind);
      levelOrder.push(level.id);
    } catch {
      error('level.build', `Price line "${level.id}" could not be drawn.`);
    }
    if (!market && (level.kind === 'ceiling' || level.kind === 'floor')) {
      error('level.market', `A ${level.kind} needs a demand and a supply curve to sit against.`);
    }
  }

  // ---- equilibria ----
  const equilibriumMarks: DiagramPointMark[] = [];
  for (const e of spec.equilibria) {
    const a = bySpecId.get(e.a);
    const b = bySpecId.get(e.b);
    if (!a || !b) {
      error('eq.ref', `Equilibrium ${e.name || `${e.a}×${e.b}`} names a curve that is not drawn.`);
      continue;
    }
    const p = curveCrossing(a, b);
    if (!p) {
      error('eq.cross', `"${e.a}" and "${e.b}" do not cross inside the plot.`);
      continue;
    }
    const drops: Array<'x' | 'y'> = [];
    if (e.xTick.trim()) drops.push('x');
    if (e.yTick.trim()) drops.push('y');
    const mark = point(p.x, p.y, symbol(e.name), {
      anchor: cross(a, b),
      dropTo: drops,
      xTickLabel: symbol(e.xTick),
      yTickLabel: symbol(e.yTick),
      labelSide: 'upRight',
    });
    equilibriumMarks.push(mark);
    points.push(mark);
    parts.push(mark);
  }
  if (spec.changeArrows && equilibriumMarks.length >= 2) {
    spans.push(...axisArrows(equilibriumMarks[0], equilibriumMarks[1]));
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
      const [x, y] = onFrontier(ab, 45);
      p = m.where === 'on' ? [x, y] : m.where === 'inside' ? [x * 0.62, y * 0.62] : [Math.min(x * 1.3, 0.95), Math.min(y * 1.3, 0.95)];
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
  const control = levelOrder.find((id) => levelKinds.get(id) === 'ceiling' || levelKinds.get(id) === 'floor');
  if (control) presetRoles.control = { curve: bySpecId.get(control)!.id };
  const worlds = levelOrder.filter((id) => levelKinds.get(id) === 'world' || levelKinds.get(id) === 'fixed');
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
    return { diagram: null, issues, curveIds, roles };
  }
  return { diagram, issues, curveIds, roles };
}
