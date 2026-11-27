import { aiErrorInfo, mapThrown } from '@/ai/errors';
import type { ChatTurn, CompletionRequest, CompletionResult, JsonSchema } from '@/ai/types';
import type { DiagramBlock } from '@/model/types';
import { cellWidthPx } from '@/render/cellFit';
import { DEFAULT_PAGE_METRICS } from '@/render/ir';
import { describeDiagram } from './describe';
import { maxOutputTokens, systemPrompt } from './prompt';
import { blockOf, evaluateSpec, type Evaluated } from './run';
import { DIAGRAM_SPEC_SCHEMA, parseSpec } from './schema';
import type { DiagramGenDeps, DiagramGenInput, DiagramIssue, DiagramSpec, DiagramStatus, SolvedKey } from './types';

/**
 * Several figures for one question in ONE request (k-0545): a grid "(1)–(4)" in the stem, a
 * diagram under every option, or a stem figure and option figures together. The reply is a
 * list of today's specs, each with where it goes (`at`); each is compiled and checked as a
 * one-figure diagram is, then the set together: a grid of plain graphs is solved as "which of
 * (1)–(4) show X" (`solveSet`), and each graph's drawn shape must match the writer's note.
 * At most two requests: the repair turn re-asks only for the figures that failed.
 */

import { FIGURE_ATS, type FigureAsk, type FigureAt } from './figureAt';
export { FIGURE_ATS, type FigureAsk, type FigureAt };

/**
 * What a grid of plain graphs asks, so the key can be worked out from the drawings: which of
 * (1)–(4) show a progressive / proportional / regressive tax. 'none': nothing this reads.
 */
export const GRID_ASKS = ['none', 'progressiveTax', 'proportionalTax', 'regressiveTax'] as const;
export type GridAsk = (typeof GRID_ASKS)[number];

export interface DiagramSetInput extends Pick<DiagramGenInput, 'question' | 'key' | 'sides' | 'reference' | 'mcq'> {
  figures: FigureAsk[];
  /** The figures of the draft this one replaces, a starting point (Harder, Easier, Another). */
  bases?: Array<{ at: FigureAt; spec: DiagramSpec }>;
}

export interface SetFigure {
  at: FigureAt;
  status: DiagramStatus;
  /** The editable figure, sized for its place (a grid cell or an option: half the column); null when it failed. */
  block: DiagramBlock | null;
  spec: DiagramSpec;
  issues: DiagramIssue[];
}

export type DiagramSetOutcome =
  | {
      ok: true;
      figures: SetFigure[];
      /** Issues of the set as a whole (the key against the drawings). */
      issues: DiagramIssue[];
      /** The key as the drawings give it, when the set asks something `solveSet` reads. */
      solved: SolvedKey | null;
      gridAsks: GridAsk;
      attempt: 1 | 2;
      imageSkipped: boolean;
      model: string;
    }
  | { ok: false; error: ReturnType<typeof aiErrorInfo> };

// ---- the request ----

const SPEC_PROPS = DIAGRAM_SPEC_SCHEMA.properties as Record<string, unknown>;

export const DIAGRAM_SET_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    figures: {
      type: 'array',
      items: {
        type: 'object',
        properties: { at: { type: 'string', enum: [...FIGURE_ATS] }, ...SPEC_PROPS },
        required: ['at', ...(DIAGRAM_SPEC_SCHEMA.required as string[])],
        additionalProperties: false,
      },
    },
    gridAsks: { type: 'string', enum: [...GRID_ASKS] },
  },
  required: ['figures', 'gridAsks'],
  additionalProperties: false,
};

export const DIAGRAM_SET_SHAPE_HINT =
  'Reply with one JSON object only: {"figures": [...], "gridAsks": "..."}. Each entry of "figures" is one diagram object with "at" plus exactly the keys of the one-diagram shape (kind, reason, placement, template, title, xAxis, yAxis, curves, shifts, levels, points, gaps, shades, marks, changeArrows, asks, chart), every key present.';

export interface SetPayload {
  task: 'diagram-set';
  languages: string[];
  question: string;
  key: string;
  figures: FigureAsk[];
  reference?: { description?: string; image?: 'attached' | 'not available' };
  previous?: Array<{ at: FigureAt; spec: DiagramSpec }>;
}

export function buildSetPayload(input: DiagramSetInput, imageAttached: boolean): SetPayload {
  const payload: SetPayload = {
    task: 'diagram-set',
    languages: input.sides.map((s) => (s === 'en' ? 'en' : 'zh')),
    question: input.question.trim(),
    key: input.key.trim(),
    figures: input.figures.map((f) => ({ at: f.at, note: f.note.trim().slice(0, 400) })),
  };
  if (input.bases?.length) payload.previous = input.bases;
  const ref = input.reference;
  if (ref && (ref.diagram || ref.image || ref.text?.trim())) {
    const description = [ref.diagram ? describeDiagram(ref.diagram) : '', ref.text?.trim() ?? ''].filter(Boolean).join('\n');
    payload.reference = {
      ...(description ? { description } : {}),
      ...(ref.image ? { image: imageAttached ? 'attached' : 'not available' } : {}),
    };
  }
  return payload;
}

/** About 1–1.5k tokens a figure: room for four, plus Gemini's thinking. */
function setOutputTokens(preset: DiagramGenDeps['preset'], count: number): number {
  return Math.min(preset.outputCap, maxOutputTokens(preset) + Math.max(0, count - 1) * 1600);
}

export function buildSetRequest(input: DiagramSetInput, preset: DiagramGenDeps['preset'], signal: AbortSignal, imageAttached: boolean): CompletionRequest {
  return {
    // The same fixed system prompt as one diagram (cached), whose SEVERAL FIGURES section covers this.
    system: systemPrompt(),
    turns: [{ role: 'user', content: JSON.stringify(buildSetPayload(input, imageAttached)) }],
    schema: DIAGRAM_SET_SCHEMA,
    shapeHint: DIAGRAM_SET_SHAPE_HINT,
    maxOutputTokens: setOutputTokens(preset, input.figures.length),
    feature: 'studio.diagram',
    signal,
  };
}

/** The repair turn: only the figures that failed (by `at`), or all when the set as a whole did. */
export function buildSetRepairRequest(first: CompletionRequest, reply: string, failed: ReadonlyArray<{ at: FigureAt | 'set'; issues: readonly DiagramIssue[] }>): CompletionRequest {
  const lines = failed.flatMap((f) => f.issues.filter((i) => i.level === 'error').map((i) => `- ${f.at === 'set' ? 'The set' : `Figure ${f.at}`}: ${i.text}`));
  const ats = failed.some((f) => f.at === 'set') ? 'every figure' : failed.map((f) => f.at).join(', ');
  const turns: ChatTurn[] = [
    ...first.turns,
    { role: 'assistant', content: reply },
    {
      role: 'user',
      content: `These figures have problems:\n${lines.join('\n')}\nReturn the same JSON shape with "figures" holding only the corrected ${ats} (each whole, every key present). Fix the drawings, not the question: its words and key are fixed.`,
    },
  ];
  return { ...first, turns };
}

// ---- reading the reply ----

export interface ParsedSet {
  entries: Array<{ at: FigureAt; spec: DiagramSpec; issues: DiagramIssue[] }>;
  gridAsks: GridAsk;
}

export function parseSet(reply: string): ParsedSet | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const list = Array.isArray(record.figures) ? record.figures : [];
  const entries: ParsedSet['entries'] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const at = String((item as Record<string, unknown>).at ?? '').trim() as FigureAt;
    if (!(FIGURE_ATS as readonly string[]).includes(at)) continue;
    const parsed = parseSpec(JSON.stringify(item));
    if (parsed) entries.push({ at, spec: parsed.spec, issues: parsed.issues });
  }
  const asks = String(record.gridAsks ?? 'none') as GridAsk;
  return { entries, gridAsks: (GRID_ASKS as readonly string[]).includes(asks) ? asks : 'none' };
}

// ---- checks ----

const errors = (issues: readonly DiagramIssue[]) => issues.filter((i) => i.level === 'error').length;

type ShapeWord = { shape?: Exclude<NonNullable<DiagramSpec['curves'][number]['shape']>, 'none'>; rise?: 'rising' | 'falling' };

/** What a writer's note says a graph's line looks like; empty when it says nothing this reads. */
export function noteShape(note: string): ShapeWord {
  // The axes are named, not described (k-0554): "Axes: vertical 'Average Tax Rate', horizontal
  // 'Income'" once read as a horizontal line.
  const n = note
    .toLowerCase()
    .replace(/\baxes\b[^.]*\./g, ' ')
    .replace(/\b(vertical|horizontal|x|y)[- ]?(axis)?\s*(['"‘“][^'"’”]*['"’”])/g, ' ');
  const out: ShapeWord = {};
  // k-0554: a broken line first: "zero up to an income level, then rising", "then becoming horizontal".
  // Before, "horizontally along the axis at zero … then rising" read as "flat", and four different
  // tax graphs were all drawn as one level line and passed.
  const zeroFirst = /\b(at|of) zero\b[^.;]*\b(then|before|until|up to)\b|\balong the (horizontal|x)[- ]axis\b|\bzero (up )?(to|until)\b|tax[- ]free (allowance|threshold)|\ballowance\b|免稅額|為零/.test(n);
  const levelLast = /\bthen (becom(es|ing) |turn(s|ing) |stay(s|ing) |level(s|ling)? off|runs? )?(horizontal|flat|constant|level)\b|\b(becom(es|ing)|turn(s|ing)) (horizontal|flat|constant)\b|\blevels? off\b|\bcapped\b|\bstandard rate\b|then horizontal|之後.*水平|標準稅率/.test(n) && !/\bno standard rate\b|\bwithout (a |any )?(cap|standard rate)/.test(n);
  const fromAxisValue = /\b(positive|non-?zero) (value|intercept|y-intercept|average tax rate|rate)\b[^.;]*\b(on|at) the (vertical|y)[- ]axis|\bstart(s|ing)? (at|from) a positive\b/.test(n);
  if (zeroFirst && levelLast) return { shape: 'zeroRisingFlat', rise: 'rising' };
  if (zeroFirst && /\b(then|before)\b[^.;]*\b(ris|slop|increas|upward)/.test(n)) return { shape: 'zeroThenRising', rise: 'rising' };
  if (levelLast && /\b(ris|slop|increas|upward)/.test(n)) return { shape: fromAxisValue ? 'linearThenFlat' : 'risingThenFlat', rise: 'rising' };
  if (/\bconvex\b|increasing rate|rising (ever )?faster|bends? up|向上彎|遞增的速度/.test(n)) out.shape = 'convex';
  else if (/\bconcave\b|decreasing rate|rising (ever )?(more )?slowly|bends? down|向下彎|遞減的速度/.test(n)) out.shape = 'concave';
  else if (/\bhorizontal\b(?![- ]axis)|\bflat\b|\bconstant\b|水平/.test(n)) out.shape = 'flat';
  else if (/(straight|linear)[^.;]*\b(from|through) the origin\b|原點/.test(n)) out.shape = 'origin';
  if (/\b(falling|downward[- ]sloping|declining|decreases with)\b|下降|遞減/.test(n) && !/decreasing rate/.test(n)) out.rise = 'falling';
  else if (/\b(rising|upward[- ]sloping|increases with)\b|上升/.test(n)) out.rise = 'rising';
  return out;
}

/** A graph figure's drawn line against what the writer's note asked for (k-0545). */
export function checkGraphNote(spec: DiagramSpec, note: string): DiagramIssue[] {
  const graphs = spec.curves.filter((c) => c.role === 'graph');
  if (graphs.length !== 1) return [];
  const want = noteShape(note);
  const line = graphs[0];
  const issues: DiagramIssue[] = [];
  if (want.shape && line.shape !== want.shape && !(want.shape === 'origin' && line.shape === 'linear')) {
    issues.push({ level: 'error', code: 'graph.shape', text: `The note asks for a line that is ${want.shape}, but it is drawn ${line.shape ?? 'origin'}.` });
  }
  if (want.rise && line.shape !== 'flat' && line.rise !== want.rise) {
    issues.push({ level: 'error', code: 'graph.rise', text: `The note asks for a ${want.rise} line, but it is drawn ${line.rise ?? 'rising'}.` });
  }
  return issues;
}

/** What kind of tax a plain graph shows, read from its axes and its line; null when it is not a tax graph. */
export function taxKind(spec: DiagramSpec): 'progressive' | 'proportional' | 'regressive' | null {
  const graphs = spec.curves.filter((c) => c.role === 'graph');
  if (spec.kind !== 'curves' || graphs.length !== 1) return null;
  const y = `${spec.yAxis.en} ${spec.yAxis.zh}`.toLowerCase();
  const x = `${spec.xAxis.en} ${spec.xAxis.zh}`.toLowerCase();
  if (!/income|收入|入息/.test(x) || !/tax|稅/.test(y)) return null;
  const { shape = 'origin', rise = 'rising' } = graphs[0];
  // A line that rises then levels off is progressive then proportional: not one kind (k-0554).
  if (shape === 'risingThenFlat' || shape === 'linearThenFlat' || shape === 'zeroRisingFlat') return null;
  if (/rate|率/.test(y)) {
    // An average or marginal rate: rising = progressive, constant = proportional, falling = regressive.
    if (shape === 'flat') return 'proportional';
    if (shape === 'zeroThenRising') return 'progressive';
    return rise === 'rising' ? 'progressive' : 'regressive';
  }
  // Tax payment against income.
  if (rise === 'falling') return null;
  if (shape === 'origin') return 'proportional';
  // Nothing up to an allowance, then a straight line: the average rate rises.
  if (shape === 'zeroThenRising') return 'progressive';
  if (shape === 'convex') return 'progressive';
  // Concave, a lump sum (flat) or a line from a positive value: the average rate falls.
  return 'regressive';
}

/**
 * Two figures of one set drawn alike (k-0554): option diagrams, or grid cells, are there to be
 * told apart, so a set whose A–D or (1)–(4) repeat a drawing cannot be answered. Compared on what
 * is drawn: the curves (role, slope, place, shape, rise) and their shifts, levels and points.
 */
export function sameFigures(figures: ReadonlyArray<{ at: FigureAt; spec: DiagramSpec }>): DiagramIssue[] {
  const groups = [figures.filter((f) => /^[A-D]$/.test(f.at)), figures.filter((f) => /^\([1-4]\)$/.test(f.at))];
  const issues: DiagramIssue[] = [];
  for (const group of groups) {
    const seen = new Map<string, FigureAt>();
    for (const f of group) {
      if (f.spec.kind !== 'curves') continue;
      const drawn = JSON.stringify({
        curves: f.spec.curves.map((c) => [c.role, c.slope, c.place, c.shape, c.rise]),
        shifts: f.spec.shifts,
        levels: f.spec.levels,
        points: f.spec.points,
        y: f.spec.yAxis.en || f.spec.yAxis.zh,
        x: f.spec.xAxis.en || f.spec.xAxis.zh,
      });
      const twin = seen.get(drawn);
      if (twin) issues.push({ level: 'error', code: 'set.same', at: [twin, f.at], text: `The figures for ${twin} and ${f.at} are drawn the same; each must show a different line, as its note says.` });
      else seen.set(drawn, f.at);
    }
  }
  return issues;
}

/** The "(1)", "(2)" an option names, as a set key ("1,3"); '' when it names none. */
function namedCells(option: string): string {
  const found = [...option.matchAll(/[(（]\s*([1-4])\s*[)）]/g)].map((m) => m[1]);
  return [...new Set(found)].sort().join(',');
}

/**
 * The key from a grid of plain graphs (k-0545): which of (1)–(4) show the tax the question
 * asks about, then the option naming exactly those. Null when the set asks nothing this reads.
 */
export function solveSet(figures: ReadonlyArray<{ at: FigureAt; spec: DiagramSpec }>, gridAsks: GridAsk, mcq: DiagramSetInput['mcq']): { solved: SolvedKey | null; issues: DiagramIssue[] } {
  if (gridAsks === 'none' || !mcq) return { solved: null, issues: [] };
  const want = gridAsks === 'progressiveTax' ? 'progressive' : gridAsks === 'proportionalTax' ? 'proportional' : 'regressive';
  const cells = figures.filter((f) => /^\([1-4]\)$/.test(f.at));
  const kinds = cells.map((f) => ({ at: f.at, kind: taxKind(f.spec) }));
  const unread = kinds.filter((k) => !k.kind);
  if (!cells.length || unread.length) return { solved: null, issues: [] };
  const showing = kinds.filter((k) => k.kind === want).map((k) => k.at);
  const key = showing.map((at) => at.slice(1, 2)).sort().join(',');
  const option = mcq.options.findIndex((o) => namedCells(o) === key && key !== '');
  const why = `${kinds.map((k) => `${k.at} shows a ${k.kind} tax`).join('; ')}; so ${showing.length ? showing.join(' and ') : 'none'} show a ${want} tax`;
  const solved: SolvedKey = { labels: showing, option, why };
  const issues: DiagramIssue[] = [];
  if (option !== mcq.answer) {
    const letter = 'ABCD'[mcq.answer] ?? '?';
    issues.push({
      level: 'error',
      code: 'key.geometry',
      text: `The key is option ${letter}, but in the drawings ${why}${option >= 0 ? `, which is option ${'ABCD'[option]}` : ', which no option says'}. Redraw the graphs so that the key is right.`,
    });
  }
  return { solved, issues };
}

// ---- the run ----

/** One figure of the set checked on its own: a question's grid cell or option is never solved alone. */
function evaluateFigure(at: FigureAt, spec: DiagramSpec, parseIssues: DiagramIssue[], input: DiagramSetInput, note: string): Evaluated {
  const keyed = at === 'stem' || at === 'ABCD'[input.mcq?.answer ?? -1];
  // The key's claims ("demand increases") describe the stem's figure and the keyed option's only.
  const widthPx = widthFor(at, input.figures.filter((a) => a.at.startsWith('(')).length);
  const evaluated = evaluateSpec(spec, { sides: input.sides, key: keyed ? input.key : '', ...(widthPx ? { widthPx } : {}) }, parseIssues);
  // Option figures compare shifts and print no equilibrium marks (HKDSE 2024 Q11): no "mark one" look there.
  const option = /^[A-D]$/.test(at);
  const issues = evaluated.issues.filter((i) => !(option && i.code === 'eq.none'));
  return { ...evaluated, issues: [...issues, ...checkGraphNote(spec, note)] };
}

/** A grid cell or an option's figure is half the text column wide; the stem's is full width. */
function widthFor(at: FigureAt, count: number): number | undefined {
  if (at === 'stem') return undefined;
  const perRow = at.startsWith('(') && count <= 2 ? count : 2;
  return Math.min(cellWidthPx(DEFAULT_PAGE_METRICS.textWidth, perRow), 300);
}

export async function generateDiagrams(input: DiagramSetInput, deps: DiagramGenDeps, signal: AbortSignal): Promise<DiagramSetOutcome> {
  const provider = deps.preset.id;
  const image = input.reference?.image;
  const withImages = image && deps.completeWithImages ? deps.completeWithImages : null;
  const send = (req: CompletionRequest): Promise<CompletionResult> => (withImages && image ? withImages(req, [image]) : deps.client.complete(req));
  const ask = async (req: CompletionRequest) => {
    try {
      const res = await send(req);
      if (res.finish === 'length') return { error: aiErrorInfo('truncated', provider) } as const;
      if (res.finish === 'safety') return { error: aiErrorInfo('safety', provider) } as const;
      return { text: res.text, model: res.model } as const;
    } catch (error) {
      return { error: mapThrown(provider, error, signal.aborted ? 'user' : null) } as const;
    }
  };

  const asked = input.figures;
  const noteOf = (at: FigureAt) => asked.find((f) => f.at === at)?.note ?? '';
  const first = buildSetRequest(input, deps.preset, signal, Boolean(withImages));
  const reply = await ask(first);
  if ('error' in reply) return { ok: false, error: reply.error! };
  if (signal.aborted) return { ok: false, error: aiErrorInfo('cancelled', provider) };
  let model = reply.model;
  const parsed = parseSet(reply.text);
  let gridAsks: GridAsk = parsed?.gridAsks ?? 'none';

  const best = new Map<FigureAt, Evaluated>();
  const take = (entries: ParsedSet['entries']) => {
    for (const e of entries) {
      if (!asked.some((f) => f.at === e.at)) continue;
      const next = evaluateFigure(e.at, e.spec, e.issues, input, noteOf(e.at));
      const now = best.get(e.at);
      if (!now || errors(next.issues) < errors(now.issues)) best.set(e.at, next);
    }
  };
  take(parsed?.entries ?? []);

  const setCheck = () => {
    const drawn = asked.map((f) => best.get(f.at)).flatMap((e, i) => (e ? [{ at: asked[i].at, spec: e.spec }] : []));
    const solved = solveSet(drawn, gridAsks, input.mcq);
    return { ...solved, issues: [...solved.issues, ...sameFigures(drawn)] };
  };
  const missing = (at: FigureAt): DiagramIssue[] => [{ level: 'error', code: 'set.missing', text: `There is no figure for ${at}.` }];
  const failedNow = () => {
    const failed: Array<{ at: FigureAt | 'set'; issues: DiagramIssue[] }> = asked.flatMap((f) => {
      const e = best.get(f.at);
      if (!e) return [{ at: f.at, issues: missing(f.at) }];
      return errors(e.issues) ? [{ at: f.at, issues: e.issues }] : [];
    });
    const set = setCheck();
    if (errors(set.issues)) failed.push({ at: 'set', issues: set.issues });
    return failed;
  };

  let attempt: 1 | 2 = 1;
  const failed = parsed ? failedNow() : [{ at: 'set' as const, issues: [{ level: 'error' as const, code: 'spec.json', text: 'The reply was not the JSON object asked for.' }] }];
  if (failed.length) {
    const second = await ask(buildSetRepairRequest(first, reply.text, failed));
    if (signal.aborted) return { ok: false, error: aiErrorInfo('cancelled', provider) };
    if (!('error' in second)) {
      const again = parseSet(second.text);
      if (again) {
        const before = failedNow().reduce((n, f) => n + errors(f.issues), 0);
        const kept = new Map(best);
        take(again.entries);
        if (again.gridAsks !== 'none' && gridAsks === 'none') gridAsks = again.gridAsks;
        const after = failedNow().reduce((n, f) => n + errors(f.issues), 0);
        if (after < before || !parsed) {
          model = second.model;
          attempt = 2;
        } else {
          best.clear();
          for (const [k, v] of kept) best.set(k, v);
        }
      }
    } else if (!parsed) {
      return { ok: false, error: second.error! };
    }
  }
  if (!best.size) return { ok: false, error: aiErrorInfo('badOutput', provider) };

  const set = setCheck();
  const figures: SetFigure[] = asked.map((f) => {
    const e = best.get(f.at);
    if (!e) return { at: f.at, status: 'failed', block: null, spec: { ...emptyFor() }, issues: missing(f.at) };
    const failedFigure = errors(e.issues) > 0;
    return {
      at: f.at,
      status: failedFigure ? 'failed' : e.issues.length ? 'look' : 'ok',
      block: failedFigure ? null : blockOf(e, input.sides, widthFor(f.at, asked.filter((a) => a.at.startsWith('(')).length)),
      spec: e.spec,
      issues: e.issues,
    };
  });
  return { ok: true, figures, issues: set.issues, solved: set.solved, gridAsks, attempt, imageSkipped: Boolean(image && !withImages), model };
}

function emptyFor(): DiagramSpec {
  return parseSpec('{"kind":"none"}')!.spec;
}
