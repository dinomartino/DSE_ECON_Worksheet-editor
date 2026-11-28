import type { Diagram, DiagramCurve } from '@/model/diagram';
import { curveXAt, curveYAt } from '@/model/diagramAnchors';
import { curveCrossing } from '@/model/diagramAreas';
import { bandName, DEMAND_LIKE, SUPPLY_LIKE, type Compiled } from './compile';
import { cornerAreasIn, optionCorners, optionLetters, type McqWords } from './sceneCheck';
import { plainOf } from './text';
import { isAreaAsk, type AreaAsk, type DiagramIssue, type DiagramSpec, type SolvedKey, type SpecMarket } from './types';

/**
 * The area check for the general plan path (k-0596, the decision u-a587 "code"): a curves
 * figure whose options name areas runs only behind an answer worked out from the economics.
 *
 * The plan says which drawn lines are in force (`asks.markets`) and what the question asks
 * (`asks.what`: dwl, cs, ps, …; `asks.state`: before, after or change). Code works out the
 * market: the quantity traded (where demand meets supply, or what a binding control allows), the
 * price buyers pay and sellers keep (the wedge of a tax or subsidy is supply minus cost), the
 * efficient quantity (where the social benefit meets the social cost), and from them the area.
 * The AI's own bands only say where its letters go: they never decide what the deadweight loss
 * is. That was the independent review's condition (Outbox/k-0577/round3/FABLE-REVIEW.md §3): a
 * swapped-letter Q21 passed the plan path as "ok".
 *
 * Bands (`spec.bands`) are checked against their corner letters: the AI names the area by its
 * lines and stretch, code finds its outline, and the letters the question uses for it must
 * enclose exactly that outline.
 */

type Pt = { x: number; y: number };
/** At a quantity x, the stretches of price inside an area (empty = none). */
type Column = (x: number) => Array<[number, number]>;

const EPS = 0.012;
const GRID = 180;

export const MEASURE_WORDS: Record<AreaAsk, string> = {
  dwl: 'the deadweight loss',
  cs: 'the consumer surplus',
  ps: 'the producer surplus',
  taxRevenue: 'the tax revenue (or the subsidy spending)',
  consumerBurden: "the consumers' share of the tax",
  producerBurden: "the producers' share of the tax",
  spending: "buyers' total spending",
};

interface State {
  D: DiagramCurve;
  S: DiagramCurve;
  C: DiagramCurve;
  B: DiagramCurve;
  SC: DiagramCurve;
  control?: { kind: 'ceiling' | 'floor' | 'quota'; at: number; name: string };
  names: Record<'D' | 'S' | 'C' | 'B' | 'SC', string>;
}

export interface MarketFacts {
  /** The quantity traded, and why. */
  qt: number;
  /** The efficient quantity (benefit = social cost); null when they do not cross. */
  qStar: number | null;
  /** Price buyers pay; price sellers keep (buyers' price less the tax, plus the subsidy). */
  pb: number;
  ps: number;
  /** The price with no tax or subsidy (demand × cost), for the burdens. */
  p0: number;
  why: string;
  state: State;
}

const labelOf = (spec: DiagramSpec, id: string) =>
  spec.curves.find((c) => c.id === id)?.label || spec.shifts.find((s) => s.id === id)?.label || spec.levels.find((l) => l.id === id)?.label || id;

/** A base curve's last shift (itself when it never moves). */
function lastOf(spec: DiagramSpec, id: string): string {
  let at = id;
  for (let i = 0; i < 12; i += 1) {
    const next = spec.shifts.find((s) => s.of === at);
    if (!next) break;
    at = next.id;
  }
  return at;
}

/** The market states the ask reads: the plan's own, else the first demand and supply before, their last shifts after. */
export function marketsOf(spec: DiagramSpec): SpecMarket[] {
  const given = spec.asks.markets ?? [];
  if (given.length) return given;
  const demand = spec.curves.find((c) => DEMAND_LIKE.has(c.role))?.id ?? '';
  const supply = spec.curves.find((c) => SUPPLY_LIKE.has(c.role))?.id ?? '';
  const control = spec.levels.find((l) => l.kind === 'ceiling' || l.kind === 'floor' || l.kind === 'quota')?.id ?? '';
  const before = { demand, supply, cost: '', benefit: '', socialCost: '', control };
  const after = { ...before, demand: demand && lastOf(spec, demand), supply: supply && lastOf(spec, supply) };
  return [before, after];
}

function resolveState(spec: DiagramSpec, compiled: Compiled, diagram: Diagram, m: SpecMarket): State | string {
  const curveOf = (id: string) => diagram.curves.find((c) => c.id === compiled.curveIds.get(id));
  const pick = (id: string, what: string): DiagramCurve | string => {
    const c = id ? curveOf(id) : undefined;
    return c ?? (id ? `markets names "${id}" as the ${what}, which is not a drawn curve` : `markets has no ${what}`);
  };
  const D = pick(m.demand, 'demand');
  const S = pick(m.supply, 'supply');
  const C = m.cost ? pick(m.cost, 'cost') : S;
  const B = m.benefit ? pick(m.benefit, 'benefit') : D;
  const SC = m.socialCost ? pick(m.socialCost, 'social cost') : C;
  for (const c of [D, S, C, B, SC]) if (typeof c === 'string') return c;
  let control: State['control'];
  if (m.control) {
    const level = spec.levels.find((l) => l.id === m.control);
    const place = compiled.levels.get(m.control);
    if (!level || !place || !(level.kind === 'ceiling' || level.kind === 'floor' || level.kind === 'quota')) return `markets names "${m.control}" as the control, which is not a ceiling, floor or quota of the figure`;
    control = { kind: level.kind, at: place.at, name: level.label || level.id };
  }
  const name = (id: string, fallback: string) => (id ? labelOf(spec, id) : fallback);
  const names = { D: name(m.demand, ''), S: name(m.supply, ''), C: name(m.cost, name(m.supply, '')), B: name(m.benefit, name(m.demand, '')), SC: name(m.socialCost, name(m.cost, name(m.supply, ''))) };
  return { D: D as DiagramCurve, S: S as DiagramCurve, C: C as DiagramCurve, B: B as DiagramCurve, SC: SC as DiagramCurve, ...(control ? { control } : {}), names };
}

/** The market worked out from the lines in force. */
export function solveMarket(spec: DiagramSpec, compiled: Compiled, diagram: Diagram, m: SpecMarket): MarketFacts | string {
  const state = resolveState(spec, compiled, diagram, m);
  if (typeof state === 'string') return state;
  const { D, S, C, B, SC, control, names } = state;
  const E = curveCrossing(D, S);
  if (!E) return `${names.D} and ${names.S} do not cross`;
  let qt = E.x;
  let pb = E.y;
  let why = `${names.D} meets ${names.S}`;
  if (control && control.kind !== 'quota') {
    const binds = control.kind === 'ceiling' ? control.at < E.y - EPS : control.at > E.y + EPS;
    if (binds) {
      const qd = curveXAt(D, control.at);
      const qs = curveXAt(S, control.at);
      if (qd === null || qs === null) return `${names.D} or ${names.S} does not reach the ${control.kind} ${control.name}`;
      qt = Math.min(qd, qs);
      pb = control.at;
      why = `the ${control.kind} ${control.name} binds, so the quantity traded is the ${qs < qd ? 'quantity supplied' : 'quantity demanded'} there`;
    } else why = `the ${control.kind} ${control.name} does not bind, so ${why}`;
  } else if (control) {
    if (control.at < E.x - EPS) {
      qt = control.at;
      const y = curveYAt(D, qt);
      if (y === null) return `${names.D} does not reach the quota ${control.name}`;
      pb = y;
      why = `the quota ${control.name} binds, so the quantity traded is the quota and buyers pay the price on ${names.D} there`;
    } else why = `the quota ${control.name} does not bind, so ${why}`;
  }
  const sAt = curveYAt(S, qt);
  const cAt = curveYAt(C, qt);
  if (sAt === null || cAt === null) return `${names.S} or ${names.C} does not reach the quantity traded`;
  // Buyers' price less the wedge (supply minus cost: a tax is positive, a subsidy negative).
  const ps = pb - (sAt - cAt);
  const free = curveCrossing(D, C);
  const p0 = free ? free.y : pb;
  const best = curveCrossing(B, SC);
  return { qt, qStar: best ? best.x : null, pb, ps, p0, why, state };
}

const between = (a: number, b: number): Array<[number, number]> => [[Math.min(a, b), Math.max(a, b)]];

/** One state's area, as price stretches at each quantity. */
function columnOf(what: AreaAsk, f: MarketFacts): Column | string {
  const { qt, qStar, pb, ps, p0, state } = f;
  const upto = (x: number) => x >= 0 && x <= qt;
  switch (what) {
    case 'dwl': {
      if (qStar === null) return `${state.names.B} and ${state.names.SC} do not cross, so there is no efficient quantity`;
      const [lo, hi] = [Math.min(qt, qStar), Math.max(qt, qStar)];
      return (x) => {
        if (x < lo || x > hi) return [];
        const b = curveYAt(state.B, x);
        const c = curveYAt(state.SC, x);
        return b === null || c === null ? [] : between(b, c);
      };
    }
    case 'cs':
      return (x) => {
        const d = curveYAt(state.D, x);
        return upto(x) && d !== null && d > pb ? [[pb, d]] : [];
      };
    case 'ps':
      return (x) => {
        const c = curveYAt(state.C, x);
        return upto(x) && c !== null && c < ps ? [[Math.max(0, c), ps]] : [];
      };
    case 'taxRevenue':
      return (x) => (upto(x) ? between(ps, pb) : []);
    case 'consumerBurden':
      return (x) => (upto(x) ? between(p0, pb) : []);
    case 'producerBurden':
      return (x) => (upto(x) ? between(ps, p0) : []);
    case 'spending':
      return (x) => (upto(x) ? [[0, pb]] : []);
  }
}

const inColumn = (stretches: Array<[number, number]>, y: number) => stretches.some(([a, b]) => y >= a && y <= b);

/** The asked area on this drawing, as a test of a point, with the words saying why. */
export function measureOf(spec: DiagramSpec, compiled: Compiled, diagram: Diagram): { inside: (p: Pt) => boolean; why: string; facts: MarketFacts[] } | string {
  const what = spec.asks.what;
  if (!isAreaAsk(what)) return `asks.what "${what}" is not an area`;
  const markets = marketsOf(spec);
  const states = spec.asks.state === 'change' ? [0, 1] : [spec.asks.state === 'after' ? markets.length - 1 : 0];
  if (spec.asks.state === 'change' && markets.length < 2) return 'state "change" needs two markets (before, after)';
  const facts: MarketFacts[] = [];
  const columns: Column[] = [];
  for (const i of states) {
    const f = solveMarket(spec, compiled, diagram, markets[i]);
    if (typeof f === 'string') return f;
    const col = columnOf(what, f);
    if (typeof col === 'string') return col;
    facts.push(f);
    columns.push(col);
  }
  // The grid asks each column many times: its stretches are worked out once.
  const cache = new Map<number, Array<Array<[number, number]>>>();
  const inside = (p: Pt) => {
    let s = cache.get(p.x);
    if (!s) {
      s = columns.map((c) => c(p.x));
      cache.set(p.x, s);
    }
    const hits = s.map((st) => inColumn(st, p.y));
    // A change is what lies in one state's area and not the other's.
    return hits.length === 2 ? hits[0] !== hits[1] : hits[0];
  };
  const words = (f: MarketFacts, i: number) => {
    const n = f.state.names;
    const lines = `demand ${n.D}, supply ${n.S}${n.C !== n.S ? `, cost ${n.C} (the wedge between them is the tax or subsidy)` : ''}${n.B !== n.D || n.SC !== n.C ? `, social benefit ${n.B}, social cost ${n.SC}` : ''}${f.state.control ? `, ${f.state.control.kind} ${f.state.control.name}` : ''}`;
    const best = what === 'dwl' ? `; the efficient quantity is where ${n.B} meets ${n.SC}` : '';
    return `${states.length === 2 ? (i === 0 ? 'before: ' : 'after: ') : ''}with ${lines}, ${f.why}${best}`;
  };
  const why = `${spec.asks.state === 'change' ? 'the change in ' : ''}${MEASURE_WORDS[what]}${spec.asks.state === 'change' ? '' : ` (${spec.asks.state})`}: ${facts.map(words).join('; ')}`;
  return { inside, why, facts };
}

// ---- shapes on the figure ----

function hull(points: Pt[]): Pt[] {
  const ps = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (ps.length < 3) return ps;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 1e-12) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(ps), ...half([...ps].reverse())];
}

export function inPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether two shapes are one area, sampled on the unit square: they may differ by 3% of the larger. Empty never matches. */
export function sameShape(a: (p: Pt) => boolean, b: (p: Pt) => boolean): boolean {
  let na = 0;
  let nb = 0;
  let differ = 0;
  for (let i = 0; i < GRID; i += 1) {
    const x = (i + 0.5) / GRID;
    for (let j = 0; j < GRID; j += 1) {
      const p = { x, y: (j + 0.5) / GRID };
      const ia = a(p);
      const ib = b(p);
      if (ia) na += 1;
      if (ib) nb += 1;
      if (ia !== ib) differ += 1;
    }
  }
  return na > 0 && nb > 0 && differ <= 0.03 * Math.max(na, nb);
}

const isEmpty = (a: (p: Pt) => boolean) => !sameShape(a, a);

/** Where each one-letter point name sits on the figure. */
export function letterPlaces(diagram: Diagram): Map<string, Pt> {
  const out = new Map<string, Pt>();
  for (const p of diagram.points) {
    const l = plainOf(p.label ?? { en: [], zh: [] }).trim();
    if (/^[A-Za-z]$/.test(l) && !out.has(l)) out.set(l, p.at);
  }
  return out;
}

type Shape = { name: string; inside: (p: Pt) => boolean };

const AREA_LETTERS_EN = /\b(?:[Aa]reas?|[Rr]egions?)\s+([A-H](?:\s*(?:\+|,|and|&)\s*[A-H])*)(?![A-Za-z])/g;
const AREA_LETTERS_ZH = /(?:面積|區域)\s*([A-H](?:\s*(?:\+|＋|、|及|和|與)\s*[A-H])*)(?![A-Za-z])/g;

/** The one lettered area a sentence names ("the deadweight loss increases by area A", "areas A and B"); null when none or several. */
export function areaLettersIn(text: string): string[] | null {
  const found = [...text.matchAll(AREA_LETTERS_EN), ...text.matchAll(AREA_LETTERS_ZH)].map((m) => m[1].match(/[A-H]/g) ?? []);
  return found.length === 1 ? found[0] : null;
}

/** The area an option names on this figure: corner letters' outline, or the union of lettered bands; null when it names none. */
function shapeOfOption(option: string, diagram: Diagram, compiled: Compiled): Shape | string | null {
  const curveNames = new Set(diagram.curves.map((c) => plainOf(c.label).replace(/\s+/g, '')));
  const corners = optionCorners(option);
  if (corners && !curveNames.has(corners)) {
    const at = letterPlaces(diagram);
    const pts = [...corners].map((l) => at.get(l));
    if (pts.some((p) => !p)) return `area ${corners}: ${[...corners].filter((l) => !at.has(l)).join(', ')} not lettered on the figure`;
    const shape = hull(pts as Pt[]);
    if (shape.length < 3) return `area ${corners}: its letters do not enclose an area`;
    return { name: `area ${corners}`, inside: (p) => inPolygon(p, shape) };
  }
  const letters = optionLetters(option) ?? areaLettersIn(option);
  const bands = compiled.bands ?? [];
  const lettered = new Map(bands.filter((b) => b.band.label && b.polygon).map((b) => [b.band.label, b.polygon!]));
  if (letters && (/area|region|面積|區域/i.test(option) || letters.every((l) => lettered.has(l)))) {
    const missing = letters.filter((l) => !lettered.has(l));
    if (missing.length) return `${option.trim()}: no band is lettered ${missing.join(', ')}`;
    const polys = letters.map((l) => lettered.get(l)!);
    return { name: letters.length > 1 ? `areas ${letters.join(' + ')}` : `area ${letters[0]}`, inside: (p) => polys.some((poly) => inPolygon(p, poly)) };
  }
  return null;
}

/** The lettered points on an area's edge (in, with a neighbour out), for the repair text. */
function lettersOnEdge(diagram: Diagram, inside: (p: Pt) => boolean): string[] {
  const out: string[] = [];
  for (const [l, p] of letterPlaces(diagram)) {
    const around = [0.012, 0.03].flatMap((d) => Array.from({ length: 24 }, (_, k) => inside({ x: p.x + d * Math.cos((k * Math.PI) / 12), y: p.y + d * Math.sin((k * Math.PI) / 12) })));
    if (around.some(Boolean) && around.some((x) => !x)) out.push(l);
  }
  return out;
}

const AREA_WORD = /\b(?:the\s+)?(?:areas?|regions?|triangles?)\b|面積|區域/gi;

/**
 * The plan path's area checks: each band against its corner letters, two bands on one spot,
 * and the keyed option's area against the asked measure of the market (k-0596).
 */
export function checkPlanAreas(spec: DiagramSpec, compiled: Compiled, mcq: McqWords | undefined): { issues: DiagramIssue[]; solved: SolvedKey | null } {
  const issues: DiagramIssue[] = [];
  const diagram = compiled.diagram;
  if (spec.kind !== 'curves' || !diagram) return { issues, solved: null };
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const bands = compiled.bands ?? [];
  const at = letterPlaces(diagram);

  // Each band against the corner letters the question names it by: the letters enclose exactly its outline.
  for (const { band, polygon } of bands) {
    if (!band.corners || !polygon) continue;
    const pts = [...band.corners].map((l) => at.get(l));
    const missing = [...band.corners].filter((l) => !at.has(l));
    if (missing.length) {
      error('band.cornerMissing', `Band ${bandName(band)} is named by corners ${band.corners}, but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} on no point. Name a point at each corner of the band.`);
      continue;
    }
    const shape = hull(pts as Pt[]);
    if (shape.length < 3 || !sameShape((p) => inPolygon(p, shape), (p) => inPolygon(p, polygon))) {
      const onEdge = lettersOnEdge(diagram, (p) => inPolygon(p, polygon));
      error(
        'band.corners',
        `Band ${bandName(band)} is the area between ${band.top} and ${band.bottom || 'the x-axis'}${band.from || band.to ? ` from ${band.from || 'the y-axis'} to ${band.to || 'where they meet'}` : ''}, but the letters ${[...band.corners].join(', ')} enclose another shape${onEdge.length ? ` (the letters on its edge are ${onEdge.join(', ')})` : ''}. Put the letters on the band's corners, or fix the band's lines and ends so it is the area the question means.`,
      );
    }
  }
  // Two bands on one spot read as one area.
  for (let i = 0; i < bands.length; i += 1) {
    for (let j = i + 1; j < bands.length; j += 1) {
      const [a, b] = [bands[i].polygon, bands[j].polygon];
      if (a && b && sameShape((p) => inPolygon(p, a), (p) => inPolygon(p, b))) error('same.area', `Bands ${bandName(bands[i].band)} and ${bandName(bands[j].band)} are the same area.`);
    }
  }

  if (!mcq || spec.placement !== 'question') return { issues, solved: null };
  const shapes = mcq.options.map((o) => shapeOfOption(o, diagram, compiled));
  const keyed = shapes[mcq.answer];
  if (keyed === null || keyed === undefined) return { issues, solved: null };
  const LETTERS = 'ABCD';
  // The gate: options that name areas need an area the code works out.
  if (!isAreaAsk(spec.asks.what)) {
    error(
      'area.unchecked',
      `The options name areas, but asks.what is "${spec.asks.what}", so the answer cannot be worked out from the drawing. Set asks.what to the area asked (dwl | cs | ps | taxRevenue | consumerBurden | producerBurden | spending), asks.state (before | after | change) and asks.markets (which demand, supply, cost, social curves and control are in force). A question about an area none of these is cannot be drawn with kind "curves": use a scene.`,
    );
    return { issues, solved: null };
  }
  if (typeof keyed === 'string') {
    error('area.option', `The key is option ${LETTERS[mcq.answer]}, but ${keyed}.`);
    return { issues, solved: null };
  }
  const measure = measureOf(spec, compiled, diagram);
  if (typeof measure === 'string') {
    error('area.market', `The question asks for ${MEASURE_WORDS[spec.asks.what as AreaAsk]}, but on this drawing ${measure}. Fix asks.markets or the drawing.`);
    return { issues, solved: null };
  }
  const wedgeHint =
    spec.shifts.some((sh) => SUPPLY_LIKE.has(compiled.roles.get(sh.id) ?? 'graph')) && measure.facts.every((f) => f.state.names.C === f.state.names.S)
      ? ' If a supply drawn here includes a tax or subsidy, name the supply without it as cost in asks.markets.'
      : '';
  if (isEmpty(measure.inside)) {
    error('area.empty', `On this drawing ${measure.why}: that area is empty, so no option can be it.${wedgeHint}`);
    return { issues, solved: null };
  }
  const right = sameShape(keyed.inside, measure.inside);
  const solved: SolvedKey = { labels: [keyed.name], option: right ? mcq.answer : -1, why: measure.why };
  if (!right) {
    const edge = lettersOnEdge(diagram, measure.inside);
    const other = shapes.findIndex((s) => s && typeof s !== 'string' && sameShape(s.inside, measure.inside));
    if (other >= 0) solved.option = other;
    error(
      'area.key',
      `The key is option ${LETTERS[mcq.answer]} (${keyed.name}), but on this drawing ${measure.why}, and ${keyed.name} is not that area${other >= 0 ? `; option ${LETTERS[other]} is` : ''}.${edge.length ? ` The lettered points on its edge are ${edge.join(', ')}.` : ''} Put the letters (or bands) where the explanation's geometry puts them, or fix asks.markets; the question's words are fixed.${wedgeHint}`,
    );
    return { issues, solved };
  }
  // Two options naming one area are twins only when nothing else tells them apart (HKDSE 2023 P1 Q21).
  const rest = (o: string) => {
    let out = o.replace(AREA_WORD, ' ');
    for (const a of cornerAreasIn(o)) out = out.replace(new RegExp(String.raw`(?<![A-Za-z])${a}(?![A-Za-z])`, 'g'), ' ');
    return out.replace(/\b[A-H](?:\s*\+\s*[A-H])*\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
  };
  const twins = shapes
    .map((s, i) => (i !== mcq.answer && s && typeof s !== 'string' && rest(mcq.options[i]) === rest(mcq.options[mcq.answer]) && sameShape(s.inside, measure.inside) ? i : -1))
    .filter((i) => i >= 0);
  if (twins.length) error('area.twoKeys', `Options ${[mcq.answer, ...twins].map((i) => LETTERS[i]).join(' and ')} both name ${MEASURE_WORDS[spec.asks.what as AreaAsk]}.`);
  return { issues, solved };
}
