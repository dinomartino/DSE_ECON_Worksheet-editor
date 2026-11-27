import type { SceneDef, ScenePartDef, ScenePointDef, SceneRegionDef } from './sceneCatalogue';
import { WORDS, type StateFacts } from './sceneKit';
import { MONOPOLY_STAGES, type McShape, type MonopolyStage, type SceneAsk, type SpecScene, type SpecText } from './types';

/**
 * The monopoly scene (k-0589, audit k-0583 task C; Elective 1, 10 HKDSE Paper 2 questions): the
 * firm's D, MR derived from D (same intercept, twice the slope: the editor's `marginalRevenue`
 * relation, so a teacher's drag keeps it right), an MC of the shape the question gives, the
 * profit-maximising point (Qm where MR = MC, Pm read up to D), the efficient output where D meets
 * MC, and the deadweight loss between them. A second state: MC rises or falls (MC₁ → MC₂), falls
 * while the firm keeps its price and output (DSE2016), rises to the old price (DSE2025), or a
 * lump-sum tax (DSE2015, DSE2020: nothing on the figure moves).
 *
 * Pure data and economics: the catalogue entry (parts, regions as a partition, asks, points), and
 * each state's market worked out from the curves (`monopolyFacts`), with the same change on other
 * slopes and sizes for the statement check. `monopolyDraft.ts` draws it.
 */

export const isMonopolyStage = (stage: string | undefined): stage is MonopolyStage => (MONOPOLY_STAGES as readonly string[]).includes(stage ?? '');

/** The scene's stage, or why it cannot be drawn. */
export function monopolyError(scene: Pick<SpecScene, 'type' | 'stage' | 'mc'>): string | null {
  const stage = scene.stage ?? 'none';
  if (scene.type !== 'monopoly') return isMonopolyStage(stage) ? `stage "${stage}" is for a monopoly scene; scene ${scene.type} takes stage "none" or a control stage.` : null;
  if (stage !== 'none' && !isMonopolyStage(stage)) return `stage "${stage}" is for a price control; a monopoly takes stage "none", ${MONOPOLY_STAGES.join(', ')}.`;
  if ((scene.mc ?? 'flat') === 'zero' && stage !== 'none' && stage !== 'lumpSumTax') return `MC = 0 cannot ${stage === 'mcRise' || stage === 'mcRiseToPrice' ? 'rise' : 'fall'} on this figure: give the MC a shape (mc "flat" for a constant MC, "rising" for an upward one).`;
  return null;
}

const curve = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'curve', label, what, place });
const y = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'yTick', label, what, place });
const x = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'xTick', label, what, place });
const w = (en: string, zh: string): SpecText => ({ en, zh });

const MC_WHAT: Record<McShape, string> = {
  flat: 'horizontal (constant MC = AC)',
  rising: 'upward-sloping',
  zero: 'zero, along the quantity axis',
  uShaped: 'U-shaped, MR cuts its rising part',
};

/** Changes with two MC curves; the others draw one. */
const twoMc = (stage: string) => stage === 'mcRise' || stage === 'mcFall' || stage === 'mcFallKept' || stage === 'mcRiseToPrice';
/** Changes with a new monopoly price and output. */
const moves = (stage: string) => stage === 'mcRise' || stage === 'mcFall' || stage === 'mcRiseToPrice';

/** The monopoly's catalogue entry for its MC shape and stage. */
export function monopolyDef(scene: Pick<SpecScene, 'stage' | 'mc'>): SceneDef {
  const mc = scene.mc ?? 'flat';
  const stage = isMonopolyStage(scene.stage) ? scene.stage : 'none';
  const two = twoMc(stage);
  const move = moves(stage);
  const lump = stage === 'lumpSumTax';
  const zero = mc === 'zero';
  const parts: ScenePartDef[] = [
    curve('D', 'D', 'demand (= AR; "D = MB" when the question says so)', 'downward-sloping'),
    curve('MR', 'MR', 'marginal revenue: drawn by the editor from D (same intercept, twice as steep)', 'from where {D} starts on the price axis, twice as steep as {D}'),
    curve('MC', zero ? 'MC = 0' : two ? 'MC_1' : 'MC', `marginal cost${two ? ' before' : ''}: ${MC_WHAT[mc]}`, zero ? 'along the quantity axis' : MC_WHAT[mc]),
  ];
  if (two) {
    const up = stage === 'mcRise' || stage === 'mcRiseToPrice';
    parts.push(curve('MC2', 'MC_2', `marginal cost after (MC moved ${up ? 'up' : 'down'}${stage === 'mcRiseToPrice' ? ' to the old monopoly price' : ''})`, `{MC} shifted ${up ? 'upward' : 'downward'}${stage === 'mcRiseToPrice' ? ', through the point on {D} above {Qm}' : ''}`));
  }
  const tag = (base: string, n: string) => (two ? `${base}_${n}` : lump ? `${base}_1 = ${base}_2` : `${base}_m`);
  parts.push(
    y('Pm', tag('P', '1'), `monopoly price${two ? ' before' : ''}: on D above Qm`, `on {D} directly above {Qm}`),
    x('Qm', tag('Q', '1'), `monopoly output${two ? ' before' : ''}: where MR = MC`, zero ? 'where {MR} meets the quantity axis' : 'where {MR} meets {MC}'),
  );
  if (!zero) parts.push(y('Pc', two ? 'P_c1' : 'P_c', `efficient (competitive) price${two ? ' before' : ''}: where D meets MC`, 'where {D} meets {MC}'));
  parts.push(x('Qc', two ? 'Q_c1' : 'Q_c', `efficient (competitive) output${two ? ' before' : ''}: where D (= MB) meets MC`, zero ? 'where {D} meets the quantity axis' : 'where {D} meets {MC}'));
  if (move) {
    parts.push(y('Pm2', 'P_2', 'monopoly price after: on D above Qm2', 'on {D} directly above {Qm2}'), x('Qm2', 'Q_2', 'monopoly output after: where MR = MC2', 'where {MR} meets {MC2}'));
  }
  if (two && stage !== 'mcRiseToPrice') {
    parts.push(y('Pc2', 'P_c2', 'efficient price after: where D meets MC2', 'where {D} meets {MC2}'), x('Qc2', 'Q_c2', 'efficient output after: where D meets MC2', 'where {D} meets {MC2}'));
  }

  // Regions: a partition. One state: CS, the monopoly's surplus, the DWL. Two MCs: the DWL kept, added, removed.
  const regions: SceneRegionDef[] = [];
  const measures: SceneDef['measures'] = {};
  const measureWords: SceneDef['measureWords'] = { dwl: WORDS.dwl };
  if (!two) {
    if (mc !== 'uShaped') {
      regions.push(
        { id: 'cs', what: 'CS: under D above Pm, 0 to Qm', words: WORDS.cs, shape: 'the area under {D} and above the {Pm} line, from 0 to {Qm}' },
        { id: 'ps', what: zero ? "the monopoly's surplus (its revenue): under Pm, 0 to Qm" : "the monopoly's surplus: below Pm above MC, 0 to Qm", words: WORDS.ps, shape: zero ? 'the rectangle under the {Pm} line, from 0 to {Qm}' : 'the area below the {Pm} line and above {MC}, from 0 to {Qm}' },
      );
    }
    regions.push({ id: 'dwl', what: zero ? 'DWL: under D, Qm to Qc' : 'DWL: between D and MC, Qm to Qc', words: WORDS.dwl, shape: zero ? 'the triangle under {D}, from {Qm} to {Qc}' : 'the triangle between {D} and {MC}, from {Qm} to {Qc}' });
    measures.dwl = ['dwl'];
    if (mc !== 'uShaped') Object.assign(measures, { cs: ['cs'], ps: ['ps'], tss: ['cs', 'ps'] });
    measureWords.tss = WORDS.tss;
  } else {
    const ids = stage === 'mcRiseToPrice' ? ['dwlRemoved', 'dwlAdded'] : stage === 'mcFallKept' ? ['dwlKept', 'dwlAdded'] : ['dwlKept', 'dwlAdded', 'dwlRemoved'];
    const text: Record<string, Omit<SceneRegionDef, 'id' | 'words'>> = {
      dwlKept:
        stage === 'mcFallKept'
          ? { what: 'DWL before: between D and MC, Qm to Qc', shape: 'the triangle between {D} and {MC}, from {Qm} to {Qc}' }
          : stage === 'mcFall'
            ? { what: 'DWL in both states: between D and MC, Qm2 to Qc', shape: 'the area between {D} and {MC}, from {Qm2} to {Qc}' }
            : { what: 'DWL in both states: between D and MC2, Qm to Qc2', shape: 'the area between {D} and {MC2}, from {Qm} to {Qc2}' },
      dwlAdded:
        stage === 'mcRiseToPrice'
          ? { what: 'DWL after: between D and MC2, Qm2 to Qm', shape: 'the triangle between {D} and {MC2}, from {Qm2} to {Qm}' }
          : stage === 'mcRise'
            ? { what: 'DWL only after: between D and MC2, Qm2 to Qm', shape: 'the area between {D} and {MC2}, from {Qm2} to {Qm}' }
            : { what: 'DWL only after: between MC and MC2 (under D), from Qm2 (Qm if kept) to Qc2', shape: `the band between {MC} and {MC2}, under {D}, from ${stage === 'mcFallKept' ? '{Qm}' : '{Qm2}'} to {Qc2}` },
      dwlRemoved:
        stage === 'mcRiseToPrice'
          ? { what: 'DWL before: between D and MC, Qm to Qc', shape: 'the triangle between {D} and {MC}, from {Qm} to {Qc}' }
          : stage === 'mcRise'
            ? { what: 'DWL only before: between MC2 and MC (under D), Qm to Qc', shape: 'the band between {MC2} and {MC}, under {D}, from {Qm} to {Qc}' }
            : { what: 'DWL only before: between D and MC, Qm to Qm2', shape: 'the area between {D} and {MC}, from {Qm} to {Qm2}' },
    };
    for (const id of ids) regions.push({ id, words: null, ...text[id] });
    const has = (id: string) => ids.includes(id);
    measures.dwlBefore = ['dwlKept', 'dwlRemoved'].filter(has);
    measures.dwlAfter = ['dwlKept', 'dwlAdded'].filter(has);
    measures.dwl = measures.dwlAfter;
    measures.dwlChange = ['dwlAdded', 'dwlRemoved'].filter((id) => has(id) && stage !== 'mcRiseToPrice');
    if (!measures.dwlChange.length) delete measures.dwlChange;
    Object.assign(measureWords, {
      dwlBefore: w('Original deadweight loss', '原先的效率損失'),
      dwlAfter: w('New deadweight loss', '新的效率損失'),
      dwlChange: stage === 'mcRise' ? w('Change in deadweight loss', '效率損失的變化') : w('Increase in deadweight loss', '效率損失增加'),
    });
  }

  // Ticks the asks read.
  const ticks: Partial<Record<SceneAsk, string[]>> = { priceBefore: ['Pm'], quantityBefore: ['Qm'], marketQuantity: [move ? 'Qm2' : 'Qm'], efficientQuantity: [two ? (stage === 'mcRiseToPrice' ? 'Qm' : 'Qc2') : 'Qc'] };
  ticks.priceAfter = [move ? 'Pm2' : 'Pm'];
  ticks.quantityAfter = [move ? 'Qm2' : 'Qm'];
  ticks.misallocation = two ? (stage === 'mcRiseToPrice' ? ['Qm2', 'Qm'] : [move ? 'Qm2' : 'Qm', 'Qc2']) : ['Qm', 'Qc'];

  // Points a question may letter: crossings of two curves, a curve above a quantity tick.
  const curves = parts.filter((p) => p.kind === 'curve' && !(zero && p.id === 'MC')).map((p) => p.id);
  const small = (id: string) => (id === 'MR' ? 'mr' : id === 'MC' ? 'mc' : id === 'MC2' ? 'mc2' : id.toLowerCase());
  const points: ScenePointDef[] = [];
  for (let i = 0; i < curves.length; i += 1) for (let j = i + 1; j < curves.length; j += 1) if (!(curves[i] === 'MC' && curves[j] === 'MC2')) points.push({ id: `${small(curves[i])}At${curves[j]}`, on: curves[i], at: curves[j] });
  // MR above a tick: only where MR = MC (mrAtMC); further right it runs under the axis.
  for (const c of curves.filter((id) => id !== 'MR')) for (const q of parts.filter((p) => p.kind === 'xTick')) points.push({ id: `${small(c)}At${q.id}`, on: c, at: q.id });

  return {
    type: 'monopoly',
    when: `a monopoly firm: D, MR derived from D, MC ${MC_WHAT[mc]}${stage !== 'none' ? `, stage ${stage}` : ''}`,
    parts,
    regions,
    measures,
    measureWords,
    ticks,
    // Printed by default: the monopoly price and output (each state's); Qc / Pc only when the question labels them.
    shown: ['Pm', 'Qm', ...(move ? ['Pm2', 'Qm2'] : [])],
    // The quantity drops that bound the DWL regions on their left.
    edges: ['Qm', ...(move ? ['Qm2'] : []), ...(zero ? ['Qc'] : [])],
    points,
  };
}

/** The one-state entry the prompt's scene list prints (the MC shapes and stages are described beside it). */
export const MONOPOLY_MENU_DEF: SceneDef = {
  ...monopolyDef({ stage: 'none', mc: 'flat' }),
  when: 'a monopoly firm (Elective 1): D, MR (the editor derives it from D), MC; the monopoly output Qm where MR = MC and price Pm read up to D, the efficient output Qc where D meets MC, the deadweight loss. mc: flat | rising | zero | uShaped; stage for a change in MC or a lump-sum tax (below)',
};

// ---- the economics, in unit space ----

/** A monopoly as numbers: demand y = a − b·x, MR y = a − 2b·x, MC a function of x. */
export interface MonoModel {
  a: number;
  b: number;
  mc: (x: number) => number;
}

const integrate = (f: (x: number) => number, lo: number, hi: number) => {
  if (hi <= lo) return 0;
  const n = 200;
  const h = (hi - lo) / n;
  let sum = f(lo) + f(hi);
  for (let i = 1; i < n; i += 1) sum += (i % 2 ? 4 : 2) * f(lo + i * h);
  return (sum * h) / 3;
};

/** Where g changes sign from + to −, from lo to hi (bisection); hi when it never does. */
function root(g: (x: number) => number, lo: number, hi: number): number {
  // Scan for the first sign change so a U-shaped MC's falling part is passed over.
  const steps = 400;
  let a = lo;
  for (let i = 1; i <= steps; i += 1) {
    const b = lo + ((hi - lo) * i) / steps;
    if (g(a) > 0 && g(b) <= 0) {
      let [l, r] = [a, b];
      for (let k = 0; k < 50; k += 1) {
        const m = (l + r) / 2;
        if (g(m) > 0) l = m;
        else r = m;
      }
      return (l + r) / 2;
    }
    a = b;
  }
  return hi;
}

export function monopolyPoint(m: MonoModel): { qm: number; pm: number; qc: number; pc: number } {
  const D = (q: number) => m.a - m.b * q;
  const qm = root((q) => m.a - 2 * m.b * q - m.mc(q), 0, m.a / (2 * m.b));
  const qc = root((q) => D(q) - m.mc(q), 0, m.a / m.b);
  return { qm, pm: D(qm), qc, pc: D(qc) };
}

/** One state's market. `keep`: the firm keeps this output (DSE2016's MC fall with the same price and output). */
export function monopolyFacts(m: MonoModel, keep?: number): StateFacts {
  const D = (q: number) => m.a - m.b * q;
  const own = monopolyPoint(m);
  const quantity = keep ?? own.qm;
  const price = D(quantity);
  const cs = integrate((q) => D(q) - price, 0, quantity);
  const ps = integrate((q) => price - m.mc(q), 0, quantity);
  const dwl = integrate((q) => D(q) - m.mc(q), quantity, own.qc);
  return { binds: false, quantity, price, cs, ps, tss: cs + ps, dwl, shortage: 0, surplus: 0, efficient: own.qc };
}

/** MC as a function for a shape and its parameters (also what the drafter draws). */
export function mcFunction(shape: McShape, c: number, s: number, x0 = 0.28): (x: number) => number {
  if (shape === 'zero') return () => 0;
  if (shape === 'flat') return () => c;
  if (shape === 'rising') return (x) => c + s * x;
  return (x) => c + s * (x - x0) * (x - x0);
}

/** Both states of a stage on one model; `t` the MC's vertical move (ignored by mcRiseToPrice and lumpSumTax). */
export function monopolyStates(stage: MonopolyStage | 'none', m: MonoModel, t: number): { before: StateFacts; after: StateFacts; t: number } {
  const before = monopolyFacts(m);
  if (stage === 'none' || stage === 'lumpSumTax') return { before, after: before, t: 0 };
  let dy = stage === 'mcRise' ? t : -t;
  if (stage === 'mcRiseToPrice') {
    const p = monopolyPoint(m);
    dy = p.pm - m.mc(p.qm);
  }
  const m2: MonoModel = { ...m, mc: (q) => m.mc(q) + dy };
  const after = stage === 'mcFallKept' ? monopolyFacts(m2, before.quantity) : monopolyFacts(m2);
  return { before, after, t: Math.abs(dy) };
}

/** The same change on other demand slopes, MC levels, slopes and sizes: a statement holds only when all agree. */
const VARIANTS = new Map<string, Array<{ before: StateFacts; after: StateFacts }>>();
export function monopolyVariants(stage: MonopolyStage | 'none', shape: McShape): Array<{ before: StateFacts; after: StateFacts }> {
  const key = `${stage}:${shape}`;
  const cached = VARIANTS.get(key);
  if (cached) return cached;
  const out: Array<{ before: StateFacts; after: StateFacts }> = [];
  const a = 0.9;
  for (const b of [0.5, 0.89, 1.5]) {
    const mcs: Array<(x: number) => number> = [];
    if (shape === 'zero') mcs.push(mcFunction('zero', 0, 0));
    if (shape === 'flat') for (const c of [0.2, 0.3, 0.45]) mcs.push(mcFunction('flat', c, 0));
    if (shape === 'rising') for (const c of [0.12, 0.2]) for (const s of [0.45, 0.9, 1.8]) mcs.push(mcFunction('rising', c, s));
    if (shape === 'uShaped') for (const c of [0.2, 0.3]) for (const s of [1.5, 3]) mcs.push(mcFunction('uShaped', c, s, 0.2));
    for (const mc of mcs)
      for (const t of [0.05, 0.1]) {
        const m: MonoModel = { a, b, mc };
        const p = monopolyPoint(m);
        // A fall that takes MC below the axis where the firm produces is not this figure.
        if ((stage === 'mcFall' || stage === 'mcFallKept') && mc(p.qm) - t < 0.02) continue;
        out.push(monopolyStates(stage, m, t));
      }
  }
  VARIANTS.set(key, out);
  return out;
}
