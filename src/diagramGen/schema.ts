import type { JsonSchema } from '@/ai/types';
import {
  ASKS,
  CURVE_ROLES,
  LEVEL_STYLES,
  DIRECTIONS,
  GRAPH_RISES,
  GRAPH_SHAPES,
  GRAPH_POINTS,
  LEVEL_KINDS,
  PLACES,
  SIZES,
  SLOPES,
  SPEC_KINDS,
  SCENE_TYPES,
  SCENE_MARKETS,
  EXTERNALITIES,
  SCENE_ASKS,
  LORENZ_INEQUALITY,
  type SpecLorenz,
  type SpecScene,
  type DiagramIssue,
  type DiagramSpec,
  type SpecText,
} from './types';

/**
 * The reply's shape. Every property required and no unions, so it fits OpenAI strict mode,
 * Anthropic's and Gemini's subsets (as `ai/schema.ts:ITEMS_SCHEMA`). Enums are fine there
 * (`importCheck/ai.ts` uses them); everything is still re-checked by `parseSpec`.
 */
const TEXT: JsonSchema = {
  type: 'object',
  properties: { en: { type: 'string' }, zh: { type: 'string' } },
  required: ['en', 'zh'],
  additionalProperties: false,
};
const str = { type: 'string' } as const;
const obj = (properties: Record<string, unknown>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const list = (items: JsonSchema): JsonSchema => ({ type: 'array', items });

export const DIAGRAM_SPEC_SCHEMA: JsonSchema = obj({
  kind: { type: 'string', enum: [...SPEC_KINDS] },
  reason: str,
  placement: { type: 'string', enum: ['question', 'answer'] },
  template: str,
  title: TEXT,
  xAxis: TEXT,
  yAxis: TEXT,
  curves: list(
    obj({
      id: str,
      role: { type: 'string', enum: [...CURVE_ROLES] },
      slope: { type: 'string', enum: [...SLOPES] },
      place: { type: 'string', enum: [...PLACES] },
      label: str,
      shape: { type: 'string', enum: [...GRAPH_SHAPES] },
      rise: { type: 'string', enum: [...GRAPH_RISES] },
      start: { type: 'string', enum: [...GRAPH_POINTS] },
      cap: { type: 'string', enum: [...GRAPH_POINTS] },
      through: list(str),
    }),
  ),
  shifts: list(
    obj({
      of: str,
      id: str,
      direction: { type: 'string', enum: [...DIRECTIONS] },
      size: { type: 'string', enum: [...SIZES] },
      label: str,
      through: list(str),
    }),
  ),
  levels: list(
    obj({
      id: str,
      kind: { type: 'string', enum: [...LEVEL_KINDS] },
      above: list(str),
      below: list(str),
      side: { type: 'string', enum: ['below', 'above'] },
      style: { type: 'string', enum: [...LEVEL_STYLES] },
      label: str,
      through: list(str),
    }),
  ),
  points: list(obj({ a: str, b: str, name: str, yTick: str, xTick: str, dot: { type: 'boolean' } })),
  gaps: list(obj({ level: str, label: TEXT })),
  brackets: list(obj({ from: str, to: str, label: TEXT })),
  shades: list(obj({ preset: str, label: TEXT })),
  marks: list(obj({ of: str, where: { type: 'string', enum: ['inside', 'on', 'outside'] }, label: str })),
  changeArrows: { type: 'boolean' },
  asks: obj({ what: { type: 'string', enum: [...ASKS] }, state: { type: 'string', enum: ['before', 'after'] } }),
  chart: obj({
    type: { type: 'string', enum: ['bar', 'line', 'pie'] },
    categories: list(TEXT),
    series: list(obj({ label: TEXT, values: list({ type: 'number' }) })),
    yTitle: TEXT,
    xTitle: TEXT,
  }),
  lorenz: obj({
    panels: list(
      obj({
        title: TEXT,
        curves: list(obj({ label: str, name: TEXT, inequality: { type: 'string', enum: [...LORENZ_INEQUALITY] }, style: { type: 'string', enum: ['solid', 'dashed'] } })),
      }),
    ),
    equality: { type: 'boolean' },
    grid: { type: 'boolean' },
    axes: { type: 'string', enum: ['percent', 'cumulative'] },
  }),
  scene: obj({
    type: { type: 'string', enum: [...SCENE_TYPES] },
    market: { type: 'string', enum: [...SCENE_MARKETS] },
    externality: { type: 'string', enum: [...EXTERNALITIES] },
    demand: { type: 'string', enum: [...SLOPES] },
    supply: { type: 'string', enum: [...SLOPES] },
    size: { type: 'string', enum: [...SIZES] },
    labels: list(obj({ part: str, label: str })),
    areas: list(obj({ region: str, label: TEXT })),
    points: list(obj({ point: str, label: str })),
    ask: { type: 'string', enum: [...SCENE_ASKS] },
    gap: { type: 'boolean' },
  }),
});

/** An edit's reply (k-0534): the whole edited spec, and what the question's words must change ('' = nothing). */
export const DIAGRAM_EDIT_SCHEMA: JsonSchema = {
  ...DIAGRAM_SPEC_SCHEMA,
  properties: { ...(DIAGRAM_SPEC_SCHEMA.properties as Record<string, unknown>), questionChange: str },
  required: [...(DIAGRAM_SPEC_SCHEMA.required as string[]), 'questionChange'],
};

/** For the rungs that do not enforce the schema (json_object, prompt). */
export const DIAGRAM_SHAPE_HINT =
  'Reply with one JSON object only, with exactly these keys: kind, reason, placement, template, title, xAxis, yAxis, curves, shifts, levels, points, gaps, brackets, shades, marks, changeArrows, asks, chart, scene, lorenz (see the shape described above). Every key is always present; use "" or [] for unused ones.';

export const EDIT_SHAPE_HINT = DIAGRAM_SHAPE_HINT.replace('changeArrows, asks, chart, scene, lorenz', 'changeArrows, asks, chart, scene, lorenz, questionChange');

const EMPTY_TEXT: SpecText = { en: '', zh: '' };

export function emptyScene(): SpecScene {
  return { type: 'none', market: 'goods', externality: 'none', demand: 'normal', supply: 'normal', size: 'normal', labels: [], areas: [], points: [], ask: 'none', gap: false };
}

export function emptySpec(kind: DiagramSpec['kind'] = 'none'): DiagramSpec {
  return {
    kind,
    reason: '',
    placement: 'question',
    template: '',
    title: { ...EMPTY_TEXT },
    xAxis: { ...EMPTY_TEXT },
    yAxis: { ...EMPTY_TEXT },
    curves: [],
    shifts: [],
    levels: [],
    points: [],
    gaps: [],
    brackets: [],
    shades: [],
    marks: [],
    changeArrows: false,
    asks: { what: 'none', state: 'after' },
    chart: { type: 'bar', categories: [], series: [], yTitle: { ...EMPTY_TEXT }, xTitle: { ...EMPTY_TEXT } },
    scene: emptyScene(),
    lorenz: emptyLorenz(),
  };
}

export function emptyLorenz(): SpecLorenz {
  return { panels: [], equality: true, grid: false, axes: 'percent' };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

const s = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const text = (v: unknown): SpecText => (isRecord(v) ? { en: s(v.en), zh: s(v.zh) } : typeof v === 'string' ? { en: v, zh: '' } : { ...EMPTY_TEXT });
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A crossing named by two ids: ["D1","S1"], or "D1×S1" / "D1 x S1" / "D1,S1" from a looser reply. */
function crossingRef(v: unknown): string[] {
  const ids = Array.isArray(v) ? v.map(s) : typeof v === 'string' ? v.split(/\s*(?:×|\*|,|\/|&|\band\b|\s[xX]\s)\s*/) : [];
  const clean = ids.map((x) => x.trim()).filter(Boolean);
  return clean.length === 2 ? clean : [];
}

/**
 * The model's reply → a spec, never throwing. Takes the outermost braces (a ```json fence
 * falls away). An unknown enum value is replaced by the default and reported, so one slip
 * costs a `look`, not the diagram. null when the reply is not a JSON object.
 */
export function parseSpec(reply: string): { spec: DiagramSpec; issues: DiagramIssue[] } | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const issues: DiagramIssue[] = [];
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T, where: string): T => {
    if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
    if (v !== undefined && v !== '') issues.push({ level: 'look', code: 'spec.value', text: `${where}: "${s(v)}" is not one of ${allowed.join(', ')}; used ${fallback}.` });
    return fallback;
  };
  const spec = emptySpec(pick(raw.kind, SPEC_KINDS, 'none', 'kind'));
  spec.reason = s(raw.reason);
  spec.placement = pick(raw.placement, ['question', 'answer'] as const, 'question', 'placement');
  spec.template = s(raw.template).trim();
  spec.title = text(raw.title);
  spec.xAxis = text(raw.xAxis);
  spec.yAxis = text(raw.yAxis);
  spec.curves = arr(raw.curves).filter(isRecord).map((c, i) => {
    const role = pick(c.role, CURVE_ROLES, 'demand', `curve ${s(c.id)} role`);
    const curve: DiagramSpec['curves'][number] = {
      id: s(c.id).trim() || `c${i + 1}`,
      role,
      slope: pick(c.slope, SLOPES, 'normal', `curve ${s(c.id)} slope`),
      place: pick(c.place, PLACES, 'mid', `curve ${s(c.id)} place`),
      label: s(c.label),
      through: crossingRef(c.through),
    };
    // A graph line's shape (k-0545); other roles carry none, and an older spec has neither key.
    if (role === 'graph') {
      curve.shape = pick(c.shape, GRAPH_SHAPES, 'origin', `curve ${s(c.id)} shape`);
      if (curve.shape === 'none') curve.shape = 'origin';
      curve.rise = pick(c.rise, GRAPH_RISES, 'rising', `curve ${s(c.id)} rise`);
      curve.start = pick(c.start, GRAPH_POINTS, 'none', `curve ${s(c.id)} start`);
      curve.cap = pick(c.cap, GRAPH_POINTS, 'none', `curve ${s(c.id)} cap`);
    }
    return curve;
  });
  spec.shifts = arr(raw.shifts).filter(isRecord).map((c, i) => ({
    of: s(c.of).trim(),
    id: s(c.id).trim() || `shift${i + 1}`,
    direction: pick(c.direction, DIRECTIONS, 'right', `shift ${s(c.id)} direction`),
    size: pick(c.size, SIZES, 'normal', `shift ${s(c.id)} size`),
    label: s(c.label),
    through: crossingRef(c.through),
  }));
  spec.levels = arr(raw.levels).filter(isRecord).map((c, i) => {
    const kind = pick(c.kind, LEVEL_KINDS, 'fixed', `level ${s(c.id)} kind`);
    return {
      id: s(c.id).trim() || `level${i + 1}`,
      kind,
      above: crossingRef(c.above),
      below: crossingRef(c.below),
      // A ceiling binds below equilibrium, a floor above: the natural default when unsaid.
      side: pick(c.side, ['below', 'above'] as const, kind === 'floor' ? 'above' : 'below', `level ${s(c.id)} side`),
      style: pick(c.style, LEVEL_STYLES, 'line', `level ${s(c.id)} style`),
      label: s(c.label),
      through: crossingRef(c.through),
    };
  });
  // `equilibria` is the name before k-0534; a reply (or a saved spec) using it still reads.
  spec.points = arr(raw.points ?? raw.equilibria).filter(isRecord).map((c) => ({
    a: s(c.a).trim(),
    b: s(c.b).trim(),
    name: s(c.name),
    yTick: s(c.yTick),
    xTick: s(c.xTick),
    dot: typeof c.dot === 'boolean' ? c.dot : Boolean(s(c.name).trim()),
  }));
  spec.gaps = arr(raw.gaps).filter(isRecord).map((c) => ({ level: s(c.level).trim(), label: text(c.label) }));
  spec.brackets = arr(raw.brackets).filter(isRecord).map((c) => ({ from: s(c.from).trim(), to: s(c.to).trim(), label: text(c.label) }));
  spec.shades = arr(raw.shades).filter(isRecord).map((c) => ({ preset: s(c.preset).trim(), label: text(c.label) }));
  spec.marks = arr(raw.marks).filter(isRecord).map((c) => ({
    of: s(c.of).trim(),
    where: pick(c.where, ['inside', 'on', 'outside'] as const, 'on', `mark ${s(c.label)} where`),
    label: s(c.label),
  }));
  spec.changeArrows = raw.changeArrows === true;
  if (isRecord(raw.asks)) {
    spec.asks = {
      what: pick(raw.asks.what, ASKS, 'none', 'asks what'),
      state: pick(raw.asks.state, ['before', 'after'] as const, 'after', 'asks state'),
    };
  }
  if (isRecord(raw.chart)) {
    const c = raw.chart;
    spec.chart = {
      type: pick(c.type, ['bar', 'line', 'pie'] as const, 'bar', 'chart type'),
      categories: arr(c.categories).map(text),
      series: arr(c.series).filter(isRecord).map((x) => ({
        label: text(x.label),
        values: arr(x.values).map((v) => (typeof v === 'number' ? v : Number(v))),
      })),
      yTitle: text(c.yTitle),
      xTitle: text(c.xTitle),
    };
  }
  if (isRecord(raw.lorenz)) {
    const c = raw.lorenz;
    spec.lorenz = {
      panels: arr(c.panels)
        .filter(isRecord)
        .map((p) => ({
          title: text(p.title),
          curves: arr(p.curves)
            .filter(isRecord)
            .map((k) => ({
              label: s(k.label).trim(),
              name: text(k.name),
              inequality: pick(k.inequality, LORENZ_INEQUALITY, 'moderate', 'lorenz inequality'),
              style: pick(k.style, ['solid', 'dashed'] as const, 'solid', 'lorenz style'),
            })),
        })),
      equality: c.equality !== false,
      grid: c.grid === true,
      axes: pick(c.axes, ['percent', 'cumulative'] as const, 'percent', 'lorenz axes'),
    };
  }
  if (isRecord(raw.scene)) {
    const c = raw.scene;
    spec.scene = {
      type: pick(c.type, SCENE_TYPES, 'none', 'scene type'),
      market: pick(c.market, SCENE_MARKETS, 'goods', 'scene market'),
      externality: pick(c.externality, EXTERNALITIES, 'none', 'scene externality'),
      demand: pick(c.demand, SLOPES, 'normal', 'scene demand'),
      supply: pick(c.supply, SLOPES, 'normal', 'scene supply'),
      size: pick(c.size, SIZES, 'normal', 'scene size'),
      labels: arr(c.labels).filter(isRecord).map((l) => ({ part: s(l.part).trim(), label: s(l.label) })),
      areas: arr(c.areas).filter(isRecord).map((a) => ({ region: s(a.region).trim(), label: text(a.label) })),
      points: arr(c.points).filter(isRecord).map((p) => ({ point: s(p.point).trim(), label: s(p.label).trim() })),
      ask: pick(c.ask, SCENE_ASKS, 'none', 'scene ask'),
      gap: c.gap === true,
    };
  }
  return { spec, issues };
}
