import type { Diagram, DiagramCurve } from '@/model/diagram';
import { curveXAt } from '@/model/diagramAnchors';
import { curveCrossing } from '@/model/diagramAreas';
import type { Side } from '@/model/textSlots';
import { DEMAND_LIKE, SUPPLY_LIKE, tickKey, type Compiled } from './compile';
import { labelBase, labelIndex, plainOf } from './text';
import type { DiagramIssue, DiagramSpec, SpecText } from './types';

/**
 * The checks a made diagram must pass before it is offered: axes labelled, curves named,
 * references real, and — the one that matters most — every shift the answer key states
 * drawn the same way. The key check reads the **compiled** diagram (labels and geometry),
 * not the spec, so it also covers a diagram built from a template.
 */

/** A market whose curve a key can say moves. `as` folds into `sras`. */
export type Market = 'demand' | 'supply' | 'ad' | 'sras' | 'lras' | 'ms' | 'md' | 'ppc';
export type Change = 'increase' | 'decrease';

export interface DiagramChange {
  market: Market;
  change: Change;
  /** The new curve's printed name, for messages. */
  label: string;
}

export interface KeyClaim {
  market: Market;
  change: Change;
  /** The words that said so. */
  quote: string;
}

const DEMAND_MARKETS = new Set<Market>(['demand', 'ad', 'md']);

/** The market a curve's printed name stands for; null for anything a key does not shift (MPC, MR, Pc…). */
export function marketOfLabel(label: DiagramCurve['label']): Market | null {
  const base = labelBase(label);
  const index = labelIndex(label);
  switch (base.toUpperCase()) {
    case 'D':
    case 'DD':
    case 'MB':
    case 'DEMAND':
      return 'demand';
    case 'S':
    case 'SS':
    case 'MC':
    case 'SUPPLY':
      return 'supply';
    case 'AD':
      return 'ad';
    case 'AS':
    case 'SRAS':
      return 'sras';
    case 'LRAS':
      return 'lras';
    case 'MS':
      return 'ms';
    case 'MD':
      return 'md';
    case 'M':
      // M_s / M_d, and the asset and transactions demand for money (M_a, M_t; k-0586).
      return index.startsWith('s') ? 'ms' : /^[dat]/i.test(index) ? 'md' : null;
    case 'PPC':
    case 'PPF':
    case 'PPB':
    case 'PPL':
      return 'ppc';
    default:
      return null;
  }
}

function changeOf(market: Market, dx: number, dy: number): Change | null {
  const eps = 0.015;
  if (market === 'ppc') {
    if (dx + dy > eps) return 'increase';
    if (dx + dy < -eps) return 'decrease';
    return null;
  }
  if (dx > eps) return 'increase';
  if (dx < -eps) return 'decrease';
  if (Math.abs(dy) <= eps) return null;
  // Up: more demanded at every quantity, or a higher cost of every unit supplied.
  const up = dy > 0;
  return DEMAND_MARKETS.has(market) === up ? 'increase' : 'decrease';
}

const centroid = (c: DiagramCurve) => ({
  x: c.points.reduce((t, p) => t + p.x, 0) / Math.max(1, c.points.length),
  y: c.points.reduce((t, p) => t + p.y, 0) / Math.max(1, c.points.length),
});

/** Where an x-span sits at a shared height, so a long and a trimmed copy compare fairly. */
function horizontalGap(a: DiagramCurve, b: DiagramCurve): number | null {
  const range = (c: DiagramCurve) => [Math.min(...c.points.map((p) => p.y)), Math.max(...c.points.map((p) => p.y))];
  const [alo, ahi] = range(a);
  const [blo, bhi] = range(b);
  const lo = Math.max(alo, blo);
  const hi = Math.min(ahi, bhi);
  if (hi - lo < 0.02) return null;
  const y = (lo + hi) / 2;
  const xa = curveXAt(a, y);
  const xb = curveXAt(b, y);
  return xa === null || xb === null ? null : xb - xa;
}

/** Every curve move the diagram draws: `shift` copies, and numbered pairs (D₀ → D₁, PPF₀ → PPF₁). */
export function diagramChanges(diagram: Diagram): DiagramChange[] {
  const out: DiagramChange[] = [];
  const byId = new Map(diagram.curves.map((c) => [c.id, c]));
  const counted = new Set<string>();
  for (const c of diagram.curves) {
    if (c.derive?.kind !== 'shift') continue;
    const source = byId.get(c.derive.of);
    const market = marketOfLabel(c.label) ?? marketOfLabel(source?.label);
    if (!market) continue;
    const change = changeOf(market, c.derive.by.x, c.derive.by.y);
    if (change) out.push({ market, change, label: plainOf(c.label) });
    counted.add(c.id);
  }
  // Numbered pairs drawn as separate curves: compare each to the one before it.
  const groups = new Map<string, DiagramCurve[]>();
  for (const c of diagram.curves) {
    if (counted.has(c.id) || c.derive) continue;
    const market = marketOfLabel(c.label);
    if (!market) continue;
    const key = `${market}:${labelBase(c.label)}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const rank = (c: DiagramCurve) => {
    const index = labelIndex(c.label);
    if (/^\d+$/.test(index)) return Number(index);
    return index ? 100 + index.length : -1;
  };
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const market = key.split(':')[0] as Market;
    const sorted = [...list].sort((a, b) => rank(a) - rank(b));
    for (let i = 1; i < sorted.length; i += 1) {
      const a = sorted[i - 1];
      const b = sorted[i];
      if (rank(a) === rank(b)) continue;
      let dx: number;
      let dy: number;
      if (market === 'ppc') {
        dx = Math.max(...b.points.map((p) => p.x)) - Math.max(...a.points.map((p) => p.x));
        dy = Math.max(...b.points.map((p) => p.y)) - Math.max(...a.points.map((p) => p.y));
      } else {
        const gap = horizontalGap(a, b);
        const ca = centroid(a);
        const cb = centroid(b);
        dx = gap ?? cb.x - ca.x;
        dy = gap === null ? cb.y - ca.y : 0;
      }
      const change = changeOf(market, dx, dy);
      if (change) out.push({ market, change, label: plainOf(b.label) });
    }
  }
  return out;
}

// ---- the answer key's claims ----

/** Market names in a key, longest first. Abbreviations are case-sensitive ("AS" is not "as"). */
const EN_MARKETS: Array<[RegExp, Market | 'DS']> = [
  [/short[- ]run aggregate supply/iy, 'sras'],
  [/long[- ]run aggregate supply/iy, 'lras'],
  [/aggregate demand/iy, 'ad'],
  [/aggregate supply/iy, 'sras'],
  [/money supply|supply of money/iy, 'ms'],
  [/money demand|demand for money/iy, 'md'],
  [/production possibilit(?:y|ies) (?:curve|frontier|boundary)/iy, 'ppc'],
  [/PP[CFB]\b/y, 'ppc'],
  [/SRAS\b/y, 'sras'],
  [/LRAS\b/y, 'lras'],
  [/AD\b/y, 'ad'],
  [/AS\b/y, 'sras'],
  [/demand\b/iy, 'demand'],
  [/supply\b/iy, 'supply'],
  // "D shifts to the right", "S₁ shifts left": a bare curve letter.
  [/[DS](?:\s?[₀-₉0-9])?(?=\s)/y, 'DS'],
];

const UP = /^(increases?|increased|rises?|rose|risen|grows?|grew|expands?|expanded)\b/;
const DOWN = /^(decreases?|decreased|falls?|fell|fallen|drops?|dropped|declines?|declined|reduces?|reduced|contracts?|contracted)\b/;
const SHIFT = /^(?:will |would )?shifts?\s+(?:to\s+the\s+)?(right|left|rightwards?|leftwards?|upwards?|downwards?|up|down|outwards?|inwards?)\b/;

/** "increase in demand" — the noun before the market. */
const NOUN_BEFORE = /(increase|rise|growth|expansion|decrease|fall|drop|decline|reduction|contraction)s?\s+in\s+(?:the\s+)?(?:market\s+|total\s+|overall\s+)?$/;

/** Words that make a sentence about what does not happen (an MCQ's wrong option). */
const NEGATED_EN = /\b(not|no longer|never|wrong|incorrect|instead of|rather than|unchanged|remains? the same|constant)\b|n't\b/i;
const NEGATED_ZH = /不會|不變|並非|而非|不是|錯誤|錯|沒有|未有|不正確|維持不變/;

function directionChange(market: Market, word: string): Change | null {
  if (/^(right|rightwards?|outwards?)$/.test(word)) return 'increase';
  if (/^(left|leftwards?|inwards?)$/.test(word)) return 'decrease';
  if (/^(up|upwards?)$/.test(word)) return DEMAND_MARKETS.has(market) ? 'increase' : 'decrease';
  if (/^(down|downwards?)$/.test(word)) return DEMAND_MARKETS.has(market) ? 'decrease' : 'increase';
  return null;
}

function englishClaims(sentence: string): KeyClaim[] {
  const out: KeyClaim[] = [];
  let skipTo = 0;
  for (let i = 0; i < sentence.length; i += 1) {
    if (i < skipTo || (i > 0 && /[A-Za-z]/.test(sentence[i - 1]))) continue;
    for (const [pattern, found] of EN_MARKETS) {
      pattern.lastIndex = i;
      const m = pattern.exec(sentence);
      if (!m) continue;
      const market: Market = found === 'DS' ? (m[0][0] === 'D' ? 'demand' : 'supply') : found;
      // "aggregate supply" is one market, not also "supply".
      skipTo = i + m[0].length;
      const before = sentence.slice(0, i).toLowerCase();
      // Not the market's curve: excess demand, quantity demanded / supplied.
      if (/(excess|quantity)\s+$/.test(before)) break;
      let rest = sentence.slice(i + m[0].length).toLowerCase();
      // "demand for imported cars", "the supply curve of rice".
      rest = rest.replace(/^\s+(?:curve\s+)?(?:for|of)\s+[^,;.]{1,40}?(?=\s+(?:will\s+|would\s+)?(?:increase|decrease|rise|fall|drop|decline|shift|grow|expand|contract|reduce))/, '');
      rest = rest.replace(/^\s+curves?/, '').replace(/^\s+(?:will|would|may|should)\s+/, ' ').trimStart();
      let change: Change | null = null;
      if (UP.test(rest)) change = 'increase';
      else if (DOWN.test(rest)) change = 'decrease';
      else {
        const shift = SHIFT.exec(rest);
        if (shift) change = directionChange(market, shift[1]);
      }
      if (!change && found !== 'DS') {
        const noun = NOUN_BEFORE.exec(before);
        if (noun) change = /^(increase|rise|growth|expansion)/.test(noun[1]) ? 'increase' : 'decrease';
      }
      if (change) out.push({ market, change, quote: sentence.trim().slice(0, 160) });
      break;
    }
  }
  return out;
}

const ZH_MARKETS: Array<[string, Market]> = [
  ['短期總供應', 'sras'],
  ['長期總供應', 'lras'],
  ['總需求', 'ad'],
  ['總供應', 'sras'],
  ['貨幣供應', 'ms'],
  ['貨幣需求', 'md'],
  ['生產可能曲線', 'ppc'],
  ['生產可能性曲線', 'ppc'],
  ['生產可能邊界', 'ppc'],
  ['需求', 'demand'],
  ['供應', 'supply'],
];
const ZH_AFTER = /^(?:曲線)?(?:會|將|便|就|亦|也)?(?:因而|因此)?(?:向)?(增加|上升|上漲|擴大|右移|左移|外移|內移|減少|下降|下跌|收縮|上移|下移|[右左外內上下]移)/;
const ZH_BEFORE = /(增加|上升|減少|下降)(?:了)?(?:對[^，。；]{0,12}的)?$/;

function chineseClaims(sentence: string): KeyClaim[] {
  const out: KeyClaim[] = [];
  let i = 0;
  while (i < sentence.length) {
    const hit = ZH_MARKETS.find(([word]) => sentence.startsWith(word, i));
    if (!hit) {
      i += 1;
      continue;
    }
    const [word, market] = hit;
    const before = sentence.slice(0, i);
    const after = sentence.slice(i + word.length);
    i += word.length;
    if (/^量/.test(after) || /超額$/.test(before)) continue;
    let change: Change | null = null;
    const m = ZH_AFTER.exec(after);
    if (m) {
      const verb = m[1];
      if (/增加|上升|上漲|擴大|右移|外移/.test(verb)) change = 'increase';
      else if (/減少|下降|下跌|收縮|左移|內移/.test(verb)) change = 'decrease';
      else if (verb === '上移') change = DEMAND_MARKETS.has(market) ? 'increase' : 'decrease';
      else if (verb === '下移') change = DEMAND_MARKETS.has(market) ? 'decrease' : 'increase';
    } else {
      const b = ZH_BEFORE.exec(before);
      if (b) change = /增加|上升/.test(b[1]) ? 'increase' : 'decrease';
    }
    if (change) out.push({ market, change, quote: sentence.trim().slice(0, 80) });
  }
  return out;
}

/**
 * The curve moves an answer key states, sentence by sentence; a sentence saying what does
 * *not* happen (an MCQ's wrong option, "remains unchanged") says nothing here.
 */
export function keyClaims(key: string): KeyClaim[] {
  const out: KeyClaim[] = [];
  for (const sentence of key.split(/[.;!?]\s+|[。；！？\n]/)) {
    if (!sentence.trim()) continue;
    if (NEGATED_EN.test(sentence) || NEGATED_ZH.test(sentence)) continue;
    out.push(...englishClaims(sentence), ...chineseClaims(sentence));
  }
  return out;
}

const MARKET_NAME: Record<Market, string> = {
  demand: 'demand',
  supply: 'supply',
  ad: 'AD',
  sras: 'SRAS',
  lras: 'LRAS',
  ms: 'money supply',
  md: 'money demand',
  ppc: 'the PPC',
};

/** The diagram against the key: an opposite shift fails; a missing or extra one is a look. */
export function checkAgainstKey(diagram: Diagram, key: string): DiagramIssue[] {
  const issues: DiagramIssue[] = [];
  const claims = keyClaims(key);
  if (!claims.length) return issues;
  const changes = diagramChanges(diagram);
  const claimed = new Map<Market, Set<Change>>();
  for (const c of claims) claimed.set(c.market, new Set([...(claimed.get(c.market) ?? []), c.change]));
  for (const [market, said] of claimed) {
    const drawn = changes.filter((c) => c.market === market);
    if (said.size === 1) {
      const [change] = said;
      const wrong = drawn.find((d) => d.change !== change);
      if (wrong && !drawn.some((d) => d.change === change)) {
        const quote = claims.find((c) => c.market === market)!.quote;
        issues.push({
          level: 'error',
          code: 'key.opposite',
          text: `The key says ${MARKET_NAME[market]} ${change === 'increase' ? 'increases' : 'decreases'} ("${quote}"), but the diagram draws ${wrong.label || MARKET_NAME[market]} as ${wrong.change === 'increase' ? 'an increase' : 'a decrease'}.`,
        });
        continue;
      }
    }
    if (!drawn.length && diagram.curves.length) {
      issues.push({ level: 'look', code: 'key.missing', text: `The key says ${MARKET_NAME[market]} changes; the diagram draws no shift of it.` });
    }
  }
  for (const d of changes) {
    if (!claimed.has(d.market)) {
      issues.push({ level: 'look', code: 'key.extra', text: `The diagram shifts ${d.label || MARKET_NAME[d.market]}; the key does not say ${MARKET_NAME[d.market]} changes.` });
    }
  }
  return issues;
}

// ---- the drawing itself ----

const blank = (t: SpecText, side: Side) => !(t[side] ?? '').trim();
const SHORTAGE = /shortage|excess demand|短缺|超額需求/i;
const SURPLUS = /surplus|excess supply|過剩|盈餘|超額供應/i;
const INEFFECTIVE = /ineffective|not binding|non-binding|no effect|不生效|無效|沒有約束|不具約束/i;

/** Labels, references and economics the spec gets wrong, on the compiled diagram. */
export function checkDiagram(spec: DiagramSpec, compiled: Compiled, sides: readonly Side[], key: string): DiagramIssue[] {
  const issues: DiagramIssue[] = [];
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const look = (code: string, text: string) => issues.push({ level: 'look', code, text });
  const diagram = compiled.diagram;
  if (!diagram) return issues;

  if (spec.kind === 'curves') {
    for (const side of sides) {
      const which = side === 'en' ? 'English' : 'Chinese';
      const other: Side = side === 'en' ? 'zh' : 'en';
      if (blank(spec.xAxis, side) && blank(spec.xAxis, other)) error('axes.x', 'The x-axis has no title.');
      else if (blank(spec.xAxis, side)) look('axes.side', `The x-axis title has no ${which}.`);
      if (blank(spec.yAxis, side) && blank(spec.yAxis, other)) error('axes.y', 'The y-axis has no title.');
      else if (blank(spec.yAxis, side)) look('axes.side', `The y-axis title has no ${which}.`);
    }
    // A plain graph's line may go unnamed (k-0545: the axes say what it is).
    const graphIds = new Set(spec.curves.filter((c) => c.role === 'graph').map((c) => compiled.curveIds.get(c.id)));
    for (const c of diagram.curves) {
      if (!plainOf(c.label).trim() && !graphIds.has(c.id)) error('curve.unnamed', 'A curve has no name.');
    }
    const names = diagram.curves.map((c) => plainOf(c.label).trim()).filter(Boolean);
    const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    for (const name of dupes) error('curve.duplicate', `Two curves are both named "${name}".`);
    if (!diagram.curves.length) error('curve.none', 'The diagram has no curves.');

    // A price control on the wrong side of equilibrium does nothing.
    const demand = spec.curves.find((c) => DEMAND_LIKE.has(c.role));
    const supply = spec.curves.find((c) => SUPPLY_LIKE.has(c.role));
    const d = demand && diagram.curves.find((c) => c.id === compiled.curveIds.get(demand.id));
    const s = supply && diagram.curves.find((c) => c.id === compiled.curveIds.get(supply.id));
    const market = d && s ? curveCrossing(d, s) : null;
    for (const level of spec.levels) {
      const binding = level.kind === 'ceiling' ? level.side === 'below' : level.kind === 'floor' ? level.side === 'above' : true;
      if (!binding && !INEFFECTIVE.test(key)) {
        look('level.nonbinding', `The ${level.kind} "${level.label}" is ${level.side} equilibrium, where it has no effect.`);
      }
    }
    for (const gap of spec.gaps) {
      const line = diagram.curves.find((c) => c.id === compiled.curveIds.get(gap.level));
      if (!line || !d || !s || !market) continue;
      const qd = curveCrossing(d, line);
      const qs = curveCrossing(s, line);
      if (!qd || !qs) continue;
      const isShortage = qd.x > qs.x;
      const words = `${gap.label.en} ${gap.label.zh}`;
      if (isShortage && SURPLUS.test(words) && !SHORTAGE.test(words)) {
        error('gap.kind', `At "${gap.level}" quantity demanded exceeds quantity supplied: that is a shortage, not "${gap.label.en || gap.label.zh}".`);
      } else if (!isShortage && SHORTAGE.test(words) && !SURPLUS.test(words)) {
        error('gap.kind', `At "${gap.level}" quantity supplied exceeds quantity demanded: that is a surplus, not "${gap.label.en || gap.label.zh}".`);
      }
    }
    if (d && s && !spec.points.length && !spec.levels.length) {
      look('eq.none', 'Demand and supply are drawn, but no equilibrium is marked.');
    }
  }
  if (spec.kind === 'chart' && spec.chart.type !== 'pie') {
    for (const side of sides) {
      if (blank(spec.chart.yTitle, side) && blank(spec.chart.yTitle, side === 'en' ? 'zh' : 'en')) {
        look('chart.unit', 'The chart has no unit above its y-axis.');
        break;
      }
    }
  }
  issues.push(...checkAgainstKey(diagram, key));
  return issues;
}

// ---- the stem against the drawing (k-0534) ----

const CONTROL_WORDS: Array<{ kind: 'ceiling' | 'floor' | 'quota'; re: RegExp }> = [
  { kind: 'ceiling', re: /price ceiling|maximum price|rent control|最高價格|價格上限|租金管制/i },
  { kind: 'floor', re: /price floor|minimum price|minimum wage|最低價格|價格下限|最低工資/i },
  { kind: 'quota', re: /\bquota\b|配額/i },
];
const TAX = /\b(?:unit|per[- ]unit|specific|sales|commodity) tax\b|\btax(?:es)? (?:of|on)\b|從量稅|徵收.{0,8}稅|稅款/i;
const SUBSIDY = /\bsubsid(?:y|ies|ise|ize)\b|津貼|補貼|資助/i;
/** "from S1 to S2", "S₁ to S₂", "由 S1 移至 S2", "S1 → S2". */
const FROM_TO = /([A-Z]{1,4}(?:_\{?[0-9a-z]{1,2}\}?|[₀-₉]|[0-9]))\s*(?:to|→|->|至|移至|轉移至|移到|變為)\s*([A-Z]{1,4}(?:_\{?[0-9a-z]{1,2}\}?|[₀-₉]|[0-9]))/g;

/**
 * What the question's own words say about the drawing must be true of it: a ceiling in
 * the stem is a ceiling on the figure (not a floor), a tax moves supply up, "from S₁ to S₂"
 * is a shift drawn that way, and any curve move the stem states goes the stated way.
 * The stem names the policy; it never describes the figure (that is `shape.narrates`).
 */
export function checkStem(spec: DiagramSpec, compiled: Compiled, stem: string): DiagramIssue[] {
  const issues: DiagramIssue[] = [];
  const diagram = compiled.diagram;
  if (!diagram || spec.kind !== 'curves' || !stem.trim()) return issues;
  const kinds = new Set(spec.levels.map((l) => l.kind));
  // An import quota drawn as a bracket at the world price (k-0586 recipe) is a quota on the figure.
  const quotaBracket = [...spec.gaps.map((g) => g.label), ...(spec.brackets ?? []).map((b) => b.label)].some((t) => /quota|配額/i.test(`${t.en} ${t.zh}`));
  for (const { kind, re } of CONTROL_WORDS) {
    if (!re.test(stem) || kinds.has(kind) || (kind === 'quota' && quotaBracket)) continue;
    const drawn = [...kinds].filter((k) => k === 'ceiling' || k === 'floor' || k === 'quota');
    issues.push({
      level: 'error',
      code: 'stem.control',
      text: `The question sets a ${kind === 'quota' ? 'quota' : `price ${kind}`}, but the diagram ${drawn.length ? `draws a ${drawn.join(' and a ')} instead` : 'draws none'}.`,
    });
  }
  const supplyShifts = spec.shifts.filter((sh) => {
    const role = compiled.roles.get(sh.id);
    return role && SUPPLY_LIKE.has(role);
  });
  if (TAX.test(stem) && !SUBSIDY.test(stem) && !supplyShifts.some((sh) => sh.direction === 'up' || sh.direction === 'left') && spec.asks.what !== 'none') {
    issues.push({ level: 'error', code: 'stem.tax', text: 'The question has a tax, but the diagram does not move supply up by it.' });
  }
  if (SUBSIDY.test(stem) && !TAX.test(stem) && !supplyShifts.some((sh) => sh.direction === 'down' || sh.direction === 'right') && spec.asks.what !== 'none') {
    issues.push({ level: 'error', code: 'stem.subsidy', text: 'The question has a subsidy, but the diagram does not move supply down by it.' });
  }
  const byLabel = new Map<string, string>();
  for (const c of spec.curves) byLabel.set(tickKey(c.label), c.id);
  for (const sh of spec.shifts) byLabel.set(tickKey(sh.label), sh.id);
  for (const m of stem.matchAll(FROM_TO)) {
    const from = byLabel.get(tickKey(m[1]));
    const to = byLabel.get(tickKey(m[2]));
    if (!from || !to) continue; // a missing label is label.missing's to report
    let at: string | undefined = to;
    const seen = new Set<string>();
    while (at && at !== from && !seen.has(at)) {
      seen.add(at);
      at = spec.shifts.find((sh) => sh.id === at)?.of;
    }
    if (at !== from) issues.push({ level: 'error', code: 'stem.shift', text: `The question says ${m[1]} moves to ${m[2]}, but the diagram does not draw ${m[2]} as a shift of ${m[1]}.` });
  }
  for (const issue of checkAgainstKey(diagram, stem)) {
    if (issue.level === 'error') issues.push({ ...issue, code: 'stem.opposite', text: issue.text.replace(/^The key says/, 'The question says') });
  }
  return issues;
}
