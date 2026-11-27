import type { SceneDef, ScenePartDef } from './sceneCatalogue';
import type { DiagramIssue, SolvedKey, SpecScene, SpecText, SpecTrade, SpecTradeCountry } from './types';

/**
 * The PPF / CPF trade scene (k-0589, audit k-0583 task C; Elective 2, 11 HKDSE Paper 2 questions):
 * one or two countries' production possibility frontiers (straight, or concave as a quarter
 * ellipse) with the question's own numbers on the axes, the world price (terms of trade), the
 * production point with trade (complete specialisation on a straight PPF; the tangency where the
 * PPF's slope equals the world price on a concave one), the CPF through it, the consumption point
 * by the question's rule, and the export and import brackets. The model gives the numbers the
 * question gives; the code works out everything that follows from them, so a CPF never has the
 * wrong slope and a country never exports the good it has no comparative advantage in.
 *
 * Pure numbers here (in the goods' own units) and the catalogue entry; `tradeDraft.ts` draws it.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface CountryNumbers {
  /** The part-id suffix: '' for the first country, '2' for the second, 'new' for the grown frontier. */
  suffix: string;
  spec: SpecTradeCountry;
  X: number;
  Y: number;
  /** The PPF's height at x (goods units). */
  ppfY: (x: number) => number;
  /** The no-trade point, when the question gives one. */
  e: Pt | null;
  /** The opportunity cost of X (Y per X) at the no-trade point (a straight PPF: everywhere). */
  cost: number | null;
  /** Production with trade, and the CPF's intercepts. */
  p: Pt | null;
  cpf: { x: number; y: number } | null;
  /** Consumption with trade. */
  c: Pt | null;
  /** The good it exports, and the volumes. */
  exportsGood: 'x' | 'y' | null;
  exports: number;
  imports: number;
  /** More Y than the PPF gives at the same X: the gain from trade (null when C is past the PPF's X). */
  gain: number | null;
}

export interface TradeNumbers {
  countries: CountryNumbers[];
  grown: CountryNumbers | null;
  errors: string[];
}

const EPS = 1e-6;
const ordinal = (i: number) => (i === 0 ? 'the first country' : 'the second country');

/** A concave PPF's point where its slope is −k·(Y/X)… in goods units: where the opportunity cost of X is `cost`. */
function concaveAtCost(X: number, Y: number, cost: number): Pt {
  const k = (cost * X) / Y;
  const r = Math.sqrt(1 + k * k);
  return { x: (X * k) / r, y: Y / r };
}

/** The opportunity cost of X at x on a concave PPF. */
export function concaveCost(X: number, Y: number, x: number): number {
  const u = Math.min(x / X, 1 - 1e-9);
  return ((Y / X) * u) / Math.sqrt(1 - u * u);
}

function country(spec: SpecTradeCountry, tot: number, suffix: string, who: string, errors: string[]): CountryNumbers {
  const { x: X, y: Y } = spec;
  const linear = spec.shape !== 'concave';
  const ppfY = (x: number) => (x < 0 || x > X + EPS ? NaN : linear ? Y * (1 - x / X) : Y * Math.sqrt(Math.max(0, 1 - (x / X) ** 2)));
  const out: CountryNumbers = { suffix, spec, X, Y, ppfY, e: null, cost: linear ? Y / X : null, p: null, cpf: null, c: null, exportsGood: null, exports: 0, imports: 0, gain: null };
  // The no-trade point.
  if (linear && spec.noTradeCost > 0 && Math.abs(spec.noTradeCost - Y / X) > 1e-3 * Math.max(1, Y / X)) {
    errors.push(`${who}: a straight PPF from ${fmt(Y)} Y to ${fmt(X)} X has an opportunity cost of ${fmt(Y / X)} Y per X everywhere, not ${fmt(spec.noTradeCost)}: check the intercepts, or make the PPF concave.`);
  }
  if (!linear && spec.noTradeCost > 0) {
    out.e = concaveAtCost(X, Y, spec.noTradeCost);
    out.cost = spec.noTradeCost;
  } else if (spec.noTradeX > 0) {
    if (spec.noTradeX >= X) errors.push(`${who}: the no-trade point's X (${fmt(spec.noTradeX)}) must be less than the PPF's X intercept (${fmt(X)}).`);
    else {
      out.e = { x: spec.noTradeX, y: ppfY(spec.noTradeX) };
      if (!linear) out.cost = concaveCost(X, Y, spec.noTradeX);
    }
  }
  if (!spec.trade) return out;
  // Production with trade.
  if (linear) {
    const cost = Y / X;
    if (Math.abs(tot - cost) <= 1e-3 * Math.max(1, cost)) {
      errors.push(`${who}: the world price (1X = ${fmt(tot)}Y) equals its opportunity cost of X (${fmt(cost)}Y), so it gains nothing from trade and does not specialise: check the numbers.`);
      return out;
    }
    out.p = tot > cost ? { x: X, y: 0 } : { x: 0, y: Y };
  } else {
    if (out.cost !== null && Math.abs(tot - out.cost) <= 1e-3 * Math.max(1, out.cost)) {
      errors.push(`${who}: the world price (1X = ${fmt(tot)}Y) equals the PPF's slope at the no-trade point, so production does not move and there is no gain: check the numbers.`);
      return out;
    }
    out.p = concaveAtCost(X, Y, tot);
  }
  const p = out.p;
  out.cpf = { x: p.x + p.y / tot, y: p.y + tot * p.x };
  const cpfY = (x: number) => out.cpf!.y - tot * x;
  // Consumption with trade.
  let cx: number | null = null;
  switch (spec.consume) {
    case 'sameX':
      if (!out.e) errors.push(`${who}: consume "sameX" (the same X as before trade) needs the no-trade point (noTradeX or noTradeCost).`);
      else cx = out.e.x;
      break;
    case 'equal':
      cx = out.cpf.y / (1 + tot);
      break;
    case 'x':
      cx = spec.amount;
      break;
    case 'tradedX': {
      // X exported when it specialises in X (production right of where it consumes), imported otherwise.
      if (!linear && !out.e) {
        errors.push(`${who}: consume "tradedX" on a concave PPF needs the no-trade point, to know which good it exports.`);
        break;
      }
      const exportsX = linear ? p.y === 0 : p.x > out.e!.x;
      cx = exportsX ? p.x - spec.amount : p.x + spec.amount;
      break;
    }
    case 'none':
      break;
  }
  if (cx !== null) {
    const cy = cpfY(cx);
    if (!(cx >= -EPS && cy >= -EPS)) errors.push(`${who}: the consumption point (X = ${fmt(cx)}) is off the CPF from (0, ${fmt(out.cpf.y)}) to (${fmt(out.cpf.x)}, 0): check the amount.`);
    else if (Math.abs(cx - p.x) < EPS) errors.push(`${who}: the consumption point is the production point: it would not trade. Check the amount.`);
    else {
      out.c = { x: Math.max(0, cx), y: Math.max(0, cy) };
      const c = out.c;
      if (c.x < p.x) [out.exportsGood, out.exports, out.imports] = ['x', p.x - c.x, c.y - p.y];
      else [out.exportsGood, out.exports, out.imports] = ['y', p.y - c.y, c.x - p.x];
      out.gain = c.x <= X + EPS ? c.y - ppfY(c.x) : null;
    }
  }
  return out;
}

/** Every number of the figure, worked out from the question's; `errors` say why a choice cannot be drawn. */
export function tradeNumbers(trade: SpecTrade): TradeNumbers {
  const errors: string[] = [];
  if (!(trade.tot > 0)) errors.push('trade.tot is the world price as Y per 1 X ("1X = 2Y" is 2): give a positive number.');
  const list = trade.countries.slice(0, 2);
  if (!list.length) errors.push('trade.countries is empty: give each country\'s PPF (its intercepts x and y).');
  if (trade.countries.length > 2) errors.push('A figure holds at most two countries.');
  list.forEach((c, i) => {
    if (!(c.x > 0 && c.y > 0)) errors.push(`${ordinal(i)}: the PPF's intercepts x and y must be positive numbers (goods units).`);
  });
  if (errors.length) return { countries: [], grown: null, errors };
  const tot = trade.tot;
  const countries = list.map((c, i) => country(c, tot, i === 0 ? '' : '2', list.length > 1 ? `Country ${c.name || i + 1}` : 'The country', errors));
  const g = trade.grow;
  const grown = g > 0 && Math.abs(g - 1) > EPS ? country({ ...list[0], x: list[0].x * g, y: list[0].y * g, noTradeX: 0, noTradeCost: 0, consume: 'none', brackets: false, gain: false }, tot, 'new', 'The grown PPF', errors) : null;
  return { countries, grown, errors };
}

/** A number as a teacher writes it: 20, 7.5, 1.25. */
export function fmt(v: number): string {
  return String(Math.round(v * 100) / 100);
}
/** A number worth printing on an axis: a whole number or a half. */
export const nice = (v: number) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-6;

// ---- the catalogue entry ----

const curve = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'curve', label, what, place });
const tick = (id: string, kind: 'xTick' | 'yTick', value: number, of: string, what: string): ScenePartDef => ({ id, kind, label: fmt(value), what, place: `${fmt(value)} on the ${kind === 'xTick' ? 'X' : 'Y'} axis`, of });
const point = (id: string, label: string, what: string, place: string): ScenePartDef => ({ id, kind: 'point', label, what, place });
const bracket = (id: string, what: string, place: string): ScenePartDef => ({ id, kind: 'bracket', label: '', what, place });

const sub = (base: string, name: string) => (name ? `${base}_${name}` : base);

/**
 * The parts a trade figure has, worked out from its numbers. Each axis number is a part of its own
 * (PPFx = the PPF's X intercept) whose `of` is the curve or point it belongs to; a value already on
 * the axis is printed once (the CPF's X intercept at a country's specialisation point is its PPF's).
 */
export function tradeParts(scene: Pick<SpecScene, 'trade'>, nums: TradeNumbers): { parts: ScenePartDef[]; drops: Map<string, string> } {
  const parts: ScenePartDef[] = [];
  /** Tick parts dropped as a value already printed: part id → the part that prints it. */
  const drops = new Map<string, string>();
  const seen: Record<'xTick' | 'yTick', Map<string, string>> = { xTick: new Map(), yTick: new Map() };
  const addTick = (id: string, kind: 'xTick' | 'yTick', value: number, of: string, what: string) => {
    const key = fmt(value);
    const first = seen[kind].get(key);
    if (first) {
      drops.set(id, first);
      return;
    }
    seen[kind].set(key, id);
    parts.push(tick(id, kind, value, of, what));
  };
  const two = nums.countries.length > 1;
  const grow = Boolean(nums.grown);
  const all = [...nums.countries, ...(nums.grown ? [nums.grown] : [])];
  for (const n of all) {
    const s = n.suffix;
    const name = s === 'new' ? '1' : two ? n.spec.name || (s ? 'B' : 'A') : grow ? '0' : '';
    const who = two ? `country ${n.spec.name || (s ? 'B' : 'A')}'s ` : s === 'new' ? 'the grown ' : '';
    parts.push(curve(`PPF${s}`, sub('PPF', name), `${who}PPF (${n.spec.shape === 'concave' ? 'concave' : 'straight'}), ${fmt(n.Y)} Y to ${fmt(n.X)} X`, `from ${fmt(n.Y)} on the Y axis to ${fmt(n.X)} on the X axis${n.spec.shape === 'concave' ? ', bowed out' : ''}`));
    if (n.cpf) parts.push(curve(`CPF${s}`, sub('CPF', name), `${who}CPF: through its production point with trade, slope = the world price`, `a straight line from ${fmt(n.cpf.y)} on the Y axis to ${fmt(n.cpf.x)} on the X axis`));
  }
  if (scene.trade?.totLine) parts.push(curve('TOT', 'TOT', 'the world price (terms of trade) line, dotted, parallel to the CPF', `a dotted line with slope −${fmt(scene.trade.tot)}`));
  for (const n of all) {
    const s = n.suffix;
    const name = two ? n.spec.name || (s ? 'B' : 'A') : '';
    const linear = n.spec.shape !== 'concave';
    addTick(`PPF${s}x`, 'xTick', n.X, `PPF${s}`, 'the PPF\'s X intercept');
    addTick(`PPF${s}y`, 'yTick', n.Y, `PPF${s}`, 'the PPF\'s Y intercept');
    if (n.e) {
      parts.push(point(`E${s}`, s === 'new' ? 'E_1' : sub('E', name), 'the no-trade point (production = consumption)', `on the PPF at X = ${fmt(n.e.x)}`));
      if (linear && nice(n.e.x) && nice(n.e.y)) {
        addTick(`E${s}x`, 'xTick', n.e.x, `E${s}`, 'the no-trade point\'s X');
        addTick(`E${s}y`, 'yTick', n.e.y, `E${s}`, 'the no-trade point\'s Y');
      }
    }
    if (n.p) parts.push(point(`P${s}`, s === 'new' ? 'P_1' : sub('P', name), 'production with trade', linear ? `at ${n.p.x ? `${fmt(n.p.x)} on the X axis` : `${fmt(n.p.y)} on the Y axis`} (complete specialisation)` : 'where the PPF touches the CPF'));
    // A CPF's intercepts when they are numbers a student writes (a tangent to a concave PPF meets the axes at 64.03: not printed).
    if (n.cpf && nice(n.cpf.x)) addTick(`CPF${s}x`, 'xTick', n.cpf.x, `CPF${s}`, 'the CPF\'s X intercept');
    if (n.cpf && nice(n.cpf.y)) addTick(`CPF${s}y`, 'yTick', n.cpf.y, `CPF${s}`, 'the CPF\'s Y intercept');
    if (n.c) {
      parts.push(point(`C${s}`, sub('C', name), 'consumption with trade, on the CPF', `on the CPF at X = ${fmt(n.c.x)}`));
      if (linear && nice(n.c.x) && nice(n.c.y)) {
        addTick(`C${s}x`, 'xTick', n.c.x, `C${s}`, 'the consumption point\'s X');
        addTick(`C${s}y`, 'yTick', n.c.y, `C${s}`, 'the consumption point\'s Y');
      }
      if (n.spec.brackets && n.exportsGood) {
        parts.push(bracket(`X${s}`, `exports (${fmt(n.exports)} units of ${n.exportsGood === 'x' ? 'X' : 'Y'})`, `along the ${n.exportsGood === 'x' ? 'X' : 'Y'} axis between the production and consumption points`));
        parts.push(bracket(`M${s}`, `imports (${fmt(n.imports)} units of ${n.exportsGood === 'x' ? 'Y' : 'X'})`, `along the ${n.exportsGood === 'x' ? 'Y' : 'X'} axis between the production and consumption points`));
      }
      if (n.spec.gain && n.gain !== null) parts.push(bracket(`G${s}`, `the gain from trade (${fmt(n.gain)} units of Y at the same X)`, 'from the consumption point down to the PPF'));
    }
  }
  return { parts, drops };
}

/** The trade catalogue entry: parts only (no regions, no corner points); the asks are numbers (`checkTrade`). */
export function tradeDef(scene: Pick<SpecScene, 'trade'>): SceneDef {
  const nums = scene.trade ? tradeNumbers(scene.trade) : { countries: [], grown: null, errors: [] };
  const { parts } = tradeParts(scene, nums);
  return {
    type: 'ppfTrade',
    when: 'production possibility frontiers with trade',
    parts,
    regions: [],
    measures: {},
    measureWords: {},
    ticks: {},
    // Every number and point the figure works out is printed unless the model blanks it ("").
    shown: parts.filter((p) => p.kind !== 'curve').map((p) => p.id),
    edges: [],
    points: [],
  };
}

/** The prompt's one-line entry (the TRADE block explains the numbers). */
export const TRADE_MENU_DEF: SceneDef = {
  type: 'ppfTrade',
  when: 'PPF / CPF trade (Elective 2): one or two countries\' PPFs, straight or concave, with the question\'s numbers; the world price, production with trade, CPF, consumption, export and import brackets, growth. All numbers go in scene.trade (TRADE, below)',
  parts: [
    curve('PPF', 'PPF', 'the PPF (PPF2 the second country\'s, PPFnew after growth)', ''),
    curve('CPF', 'CPF', 'the CPF through production with trade', ''),
    curve('TOT', 'TOT', 'a dotted world price line apart from the CPF', ''),
    point('E', 'E', 'no-trade point', ''),
    point('P', 'P', 'production with trade', ''),
    point('C', 'C', 'consumption with trade', ''),
    bracket('X', 'exports', ''),
    bracket('M', 'imports', ''),
    bracket('G', 'gain from trade', ''),
  ],
  regions: [],
  measures: {},
  measureWords: {},
  ticks: {},
  shown: [],
  edges: [],
  points: [],
};

export const TRADE_WORDS = {
  x: { en: 'Good X', zh: '物品X' } as SpecText,
  y: { en: 'Good Y', zh: '物品Y' } as SpecText,
  exports: { en: 'Exports', zh: '出口量' } as SpecText,
  imports: { en: 'Imports', zh: '進口量' } as SpecText,
  gain: { en: 'Gain from\ntrade', zh: '貿易得益' } as SpecText,
};

// ---- the question against the figure ----


const NUM = String.raw`(\d+(?:\.\d+)?)`;
const UNITS = String.raw`\s*(?:units?\s+of\s+)?(?:good\s+)?`;
const WORLD = /world\s+price|terms\s+of\s+trade|\bTOT\b|國際價格|世界價格|貿易條件/i;
/** "1X = 2Y", "1 unit of X = 2 units of Y", "1X : 2Y", "2Y = 1X", "1Y = 0.5X": Y per X. */
export function ratiosIn(text: string): number[] {
  const out: number[] = [];
  const xy = new RegExp(String.raw`\b1${UNITS}X\s*(?:=|:|＝)\s*${NUM}${UNITS}Y\b`, 'gi');
  const yx = new RegExp(String.raw`\b${NUM}${UNITS}Y\s*(?:=|:|＝)\s*1${UNITS}X\b`, 'gi');
  const y1 = new RegExp(String.raw`\b1${UNITS}Y\s*(?:=|:|＝)\s*${NUM}${UNITS}X\b`, 'gi');
  for (const m of text.matchAll(xy)) out.push(Number(m[1]));
  for (const m of text.matchAll(yx)) out.push(Number(m[1]));
  for (const m of text.matchAll(y1)) if (Number(m[1]) > 0) out.push(1 / Number(m[1]));
  return out;
}
/** "20X or 30Y", "30 units of Y or 20 units of X": a PPF's intercepts. */
export function interceptsIn(text: string): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const m of text.matchAll(new RegExp(String.raw`\b${NUM}${UNITS}X\s+or\s+${NUM}${UNITS}Y\b`, 'gi'))) out.push({ x: Number(m[1]), y: Number(m[2]) });
  for (const m of text.matchAll(new RegExp(String.raw`\b${NUM}${UNITS}Y\s+or\s+${NUM}${UNITS}X\b`, 'gi'))) out.push({ x: Number(m[2]), y: Number(m[1]) });
  return out;
}

const close = (a: number, b: number) => Math.abs(a - b) <= 1e-3 * Math.max(1, Math.abs(a), Math.abs(b));

/** The stem's numbers and words against the trade figure: the world price, each PPF's intercepts, straight or concave. */
export function tradeWords(scene: Pick<SpecScene, 'type' | 'trade'>, stem: string): DiagramIssue[] {
  const issues: DiagramIssue[] = [];
  const t = scene.trade;
  if (scene.type !== 'ppfTrade' || !t) return issues;
  const error = (text: string) => issues.push({ level: 'error', code: 'scene.trade', text });
  // Sentences end at a full stop before a space ("1.5Y" is one number).
  for (const sentence of stem.split(/(?<=[.;])\s+|(?<=[。；])/)) {
    if (!WORLD.test(sentence)) continue;
    const r = ratiosIn(sentence);
    if (r.length === 1 && !close(r[0], t.tot)) error(`The question's world price is 1X = ${fmt(r[0])}Y, but trade.tot is ${fmt(t.tot)}: set tot to ${fmt(r[0])} (Y per 1 X).`);
  }
  for (const p of interceptsIn(stem)) {
    if (!t.countries.some((c) => close(c.x, p.x) && close(c.y, p.y))) error(`The question gives a PPF of ${fmt(p.x)}X or ${fmt(p.y)}Y, but no country on the figure has those intercepts: set its x and y.`);
  }
  if (/constant\s+opportunity\s+cost|straight[- ]line\s+PPF|linear\s+PPF|固定的?機會成本|直線/i.test(stem) && t.countries.some((c) => c.shape === 'concave')) error('The question says the opportunity cost is constant (a straight-line PPF), but a PPF on the figure is concave.');
  if (/increasing\s+opportunity\s+cost|concave|bowed[- ]out|機會成本遞增|向外凸/i.test(stem) && !t.countries.some((c) => c.shape === 'concave')) error('The question says the opportunity cost increases (a concave PPF), but every PPF on the figure is straight.');
  return issues;
}

/** An MCQ asking for a number of the first country (its exports, imports or gain from trade): the keyed option must be it. */
export function tradeKey(scene: Pick<SpecScene, 'ask'>, nums: TradeNumbers, mcq: { options: readonly string[]; answer: number }): { issues: DiagramIssue[]; solved: SolvedKey | null } {
  const issues: DiagramIssue[] = [];
  const ask = scene.ask;
  if (ask !== 'exports' && ask !== 'imports' && ask !== 'gainFromTrade') {
    if (ask !== 'none') issues.push({ level: 'error', code: 'scene.ask', text: `A trade figure answers exports, imports or gainFromTrade (numbers of the first country), not "${ask}".` });
    return { issues, solved: null };
  }
  const n = nums.countries[0];
  const value = !n?.c ? null : ask === 'exports' ? n.exports : ask === 'imports' ? n.imports : n.gain;
  if (value === null || value === undefined) {
    issues.push({ level: 'error', code: 'scene.ask', text: `The question asks for ${ask}, but the first country has no consumption point with trade: give consume (and amount).` });
    return { issues, solved: null };
  }
  const good = ask === 'gainFromTrade' ? 'Y' : (ask === 'exports') === (n.exportsGood === 'x') ? 'X' : 'Y';
  const numberOf = (o: string) => {
    const m = /-?\d+(?:\.\d+)?/.exec(o);
    return m ? Number(m[0]) : null;
  };
  const values = mcq.options.map(numberOf);
  const option = values.findIndex((v) => v !== null && close(v, value));
  const why = `${ask} of the first country is ${fmt(value)} units of ${good} (production ${n.p ? `(${fmt(n.p.x)}, ${fmt(n.p.y)})` : '-'}, consumption (${fmt(n.c!.x)}, ${fmt(n.c!.y)}))`;
  const keyed = values[mcq.answer];
  if (keyed !== null && keyed !== undefined && !close(keyed, value)) issues.push({ level: 'error', code: 'scene.key', text: `On the figure ${why}, but the key is option ${'ABCD'[mcq.answer]} (${mcq.options[mcq.answer]}). Give the numbers the question gives (intercepts, world price, what it consumes); the question's words are fixed.` });
  const twins = values.map((v, i) => (v !== null && i !== option && close(v, value) ? i : -1)).filter((i) => i >= 0);
  if (option >= 0 && twins.length) issues.push({ level: 'error', code: 'scene.twoKeys', text: `Options ${[option, ...twins].map((i) => 'ABCD'[i]).join(' and ')} both read ${fmt(value)}.` });
  return { issues, solved: { labels: [fmt(value)], option, why } };
}
