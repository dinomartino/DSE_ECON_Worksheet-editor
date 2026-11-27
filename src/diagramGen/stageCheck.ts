import { tickKey } from './compile';
import { meetOf, stateFacts, type Lin, type SceneBuilt, type StateFacts } from './scene';
import { STAGE_PAIRS, stagePlan, type StagePlan } from './stageCatalogue';
import type { DiagramIssue, DiagramSpec, SolvedKey } from './types';

/**
 * Two-state control scenes against their question (k-0587, audit k-0583 task B).
 *
 * The statement check: HKDSE asks most two-line control questions as statements ("If the
 * government lowers the price ceiling from P1 to P2, the producer surplus will decrease"; 2015
 * P1 Q19, 2021 P1 Q17, 2020 P1 Q20, 2023 P1 Q17). The builder works the market out in both
 * states from the drawing (quantity, price, CS, PS, TSS, DWL, shortage, surplus); each option or
 * numbered statement it can read is true or false on that, and the key must be the true one.
 *
 * The words check: the stem's "lowers the price ceiling", "from P1 to P2", "shifts from S1 to
 * S2" must match the stage and which part carries which label.
 */

type Measure = 'quantity' | 'price' | 'cs' | 'ps' | 'tss' | 'dwl' | 'shortage' | 'surplus' | 'efficient';
type Change = 'up' | 'down' | 'same' | 'gone' | 'shortageToSurplus' | 'surplusToShortage';

const SUBJECTS: Array<{ m: Measure; re: RegExp }> = [
  // k-0589: a monopoly's efficient (competitive) output, never its own output.
  { m: 'efficient', re: /(?:efficient|socially\s+(?:optimal|efficient)|competitive|allocatively\s+efficient)\s+(?:level\s+of\s+)?(?:output|quantity)|有效率的?(?:產量|產出)|社會最佳產量/i },
  { m: 'cs', re: /consumers?['’]?\s+surplus|消費者盈餘/i },
  { m: 'ps', re: /producers?['’]?\s+surplus|生產者盈餘/i },
  { m: 'tss', re: /(?:total\s+)?social\s+surplus|total\s+surplus|總社會盈餘|社會盈餘/i },
  { m: 'dwl', re: /deadweight\s+loss|efficiency\s+loss|效率損失|無謂損失/i },
  { m: 'shortage', re: /excess\s+demand|shortage|超額需求|短缺/i },
  { m: 'surplus', re: /excess\s+supply|unemployment|(?<!consumers?['’]?\s|producers?['’]?\s|social\s|total\s)\bsurplus\b|超額供應|(?<!盈)過剩|失業/i },
  { m: 'quantity', re: /quantity\s+(?:transacted|traded|sold|exchanged|bought)|(?:level\s+of\s+)?employment|output|成交量|交易量|銷售量|就業/i },
  { m: 'price', re: /(?:market|equilibrium|monopoly)\s+price|\bprice\s+(?:paid|of|charged)|\bwage\s+rate|成交價|市場價格|壟斷價格|售價/i },
];

const CHANGES: Array<{ c: Change; re: RegExp }> = [
  { c: 'shortageToSurplus', re: /excess\s+demand[^.。]*?(?:change|turn)s?\s+(?:in)?to\s+(?:an\s+)?excess\s+supply|shortage[^.。]*?(?:change|turn)s?\s+(?:in)?to\s+(?:a\s+)?surplus|超額需求[^。]*?(?:變成|轉為)超額供應|短缺[^。]*?(?:變成|轉為)過剩/i },
  { c: 'surplusToShortage', re: /excess\s+supply[^.。]*?(?:change|turn)s?\s+(?:in)?to\s+(?:an\s+)?excess\s+demand|surplus[^.。]*?(?:change|turn)s?\s+(?:in)?to\s+(?:a\s+)?shortage|超額供應[^。]*?(?:變成|轉為)超額需求|過剩[^。]*?(?:變成|轉為)短缺/i },
  { c: 'gone', re: /\b(?:be\s+eliminated|disappear|vanish|no\s+longer\s+exist|become\s+zero)|消失|被消除|不再存在/i },
  { c: 'same', re: /remain(?:s)?\s+(?:unchanged|the\s+same|constant)|stay(?:s)?\s+(?:unchanged|the\s+same)|\bnot\s+change|be\s+unchanged|不變|維持不變|保持不變/i },
  { c: 'up', re: /\b(?:increase|rise|go\s+up|be\s+larger|be\s+greater|become\s+larger|grow|expand)|增加|上升|上漲|擴大|提高/i },
  { c: 'down', re: /\b(?:decrease|fall|drop|decline|go\s+down|be\s+smaller|become\s+smaller|shrink)|減少|下降|下跌|縮小|降低/i },
];

/** One claim read from a sentence: a measure and how it changes, or null when it is not one plain claim. */
export function readClaim(sentence: string): { m: Measure; c: Change; at?: string } | null {
  const text = sentence.replace(/price\s+(?:ceiling|floor|control)s?|maximum\s+price|minimum\s+(?:price|wage)|價格上限|價格下限|最高價格|最低價格|最低工資/gi, ' ');
  // A negation reverses or blurs a claim: not read (except "not change", a claim of its own).
  if (/\b(?:no|never|neither|nor)\b|n['’]t\b|\bnot\b(?!\s+change)|沒有|並非|不會(?!改變)/i.test(text.replace(/\bnot\s+change/gi, ''))) return null;
  const changes = CHANGES.filter((x) => x.re.test(text));
  if (!changes.length) {
    // "quantity transacted will remain at Q1": the quantity in both states is that tick.
    const at = /remain(?:s)?\s+at\s+([A-Z][\w_{}′']*)|維持在\s*([A-Z][\w_{}′']*)/i.exec(text);
    if (at && /quantity|output|employment|成交量|交易量/i.test(text)) return { m: 'quantity', c: 'same', at: at[1] ?? at[2] };
    return null;
  }
  const change = changes[0].c;
  if (change === 'shortageToSurplus' || change === 'surplusToShortage') return { m: 'shortage', c: change };
  const subjects = SUBJECTS.filter((x) => x.re.test(text)).map((x) => x.m);
  // "the total social surplus" also matches "surplus": keep the most specific.
  const specific = subjects.filter((m) => !(m === 'surplus' && subjects.some((o) => o === 'cs' || o === 'ps' || o === 'tss')) && !(m === 'quantity' && subjects.includes('efficient')));
  if (specific.length !== 1 || changes.filter((x) => x.c !== change).some((x) => x.c === 'up' || x.c === 'down')) return null;
  return { m: specific[0], c: change };
}

const EPS = 1e-5;

/**
 * The same setup with other curves: every slope pair, shift size, control distance and (for a
 * control between the equilibria) place. A claim is true or false only when every one agrees:
 * whether consumer surplus rises when a ceiling starts to bind depends on the slopes, and HKDSE
 * keys such an option wrong ("not necessarily").
 */
export function stageVariants(plan: StagePlan): Array<{ before: StateFacts; after: StateFacts }> {
  const out: Array<{ before: StateFacts; after: StateFacts }> = [];
  const E: [number, number] = [0.5, 0.5];
  for (const dm of [-0.42, -1, -2.2])
    for (const sm of [0.42, 1, 2.2])
      for (const h of [0.1, 0.25])
        for (const c of [0.05, 0.12])
          for (const f of plan.place === 'between' ? [0.25, 0.5, 0.75] : [0.5]) {
            const D: Lin = { m: dm, at: E };
            const S: Lin = { m: sm, at: E };
            const dx = plan.shift === null ? 0 : plan.stage === 'demandRise' || plan.stage === 'supplyRise' ? h : -h;
            const D2: Lin = plan.shift === 'demand' ? { m: dm, at: [E[0] + dx, E[1]] } : D;
            const S2: Lin = plan.shift === 'supply' ? { m: sm, at: [E[0] + dx, E[1]] } : S;
            const E2 = meetOf(D2, S2);
            let c1: number;
            let c2: number;
            if (plan.control !== 'quota') {
              const sign = plan.control === 'ceiling' ? -1 : 1;
              if (plan.shift === null) {
                const near = (bind: boolean, far: boolean) => E[1] + (bind ? sign : -sign) * (far ? 2 * c : c);
                if (plan.binds === 'both') [c1, c2] = plan.tighten ? [near(true, false), near(true, true)] : [near(true, true), near(true, false)];
                else if (plan.binds === 'neither') [c1, c2] = plan.tighten ? [near(false, true), near(false, false)] : [near(false, false), near(false, true)];
                else [c1, c2] = plan.binds === 'after' ? [near(false, false), near(true, false)] : [near(true, false), near(false, false)];
              } else {
                const lo = Math.min(E[1], E2[1]);
                const hi = Math.max(E[1], E2[1]);
                c1 = c2 = plan.place === 'old' ? E[1] : plan.place === 'between' ? lo + (hi - lo) * f : plan.place === 'beyond' ? (sign < 0 ? lo - c : hi + c) : sign < 0 ? hi + c : lo - c;
              }
            } else if (plan.shift === null) [c1, c2] = plan.tighten ? [E[0] - c, E[0] - 2 * c] : [E[0] - 2 * c, E[0] - c];
            else {
              const lo = Math.min(E[0], E2[0]);
              const hi = Math.max(E[0], E2[0]);
              c1 = c2 = plan.place === 'old' ? E[0] : plan.place === 'between' ? lo + (hi - lo) * f : lo - c;
            }
            out.push({ before: stateFacts(plan, D, S, c1), after: stateFacts(plan, D2, S2, c2) });
          }
  return out;
}

/** A claim on the drawing: true, false, or null when the figure cannot say (a tick the scene does not print). */
function truth(claim: NonNullable<ReturnType<typeof readClaim>>, before: StateFacts, after: StateFacts, tickOf: (label: string) => number | null): boolean | null {
  if (claim.c === 'shortageToSurplus') return before.shortage > EPS && after.surplus > EPS;
  if (claim.c === 'surplusToShortage') return before.surplus > EPS && after.shortage > EPS;
  const a = before[claim.m];
  const b = after[claim.m];
  // A measure this figure does not work out (a control's efficient output): not read.
  if (a === undefined || b === undefined) return null;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-3);
  const d = (b - a) / scale;
  if (claim.at) {
    const x = tickOf(claim.at);
    if (x === null) return null;
    return Math.abs(before.quantity - x) < 2e-3 && Math.abs(after.quantity - x) < 2e-3;
  }
  switch (claim.c) {
    case 'up':
      return d > EPS;
    case 'down':
      return d < -EPS;
    case 'same':
      return Math.abs(d) <= EPS;
    case 'gone':
      return a > EPS && b <= EPS;
  }
  return null;
}

/** "(1) and (4) only", "(1), (2) and (3)" → the statement numbers; null when the option is not such a list. */
export function optionStatements(option: string): number[] | null {
  const bare = option.replace(/only|僅|只有/gi, '').trim();
  if (!/^(?:\(\d\)[\s,、及和與and]*)+$/i.test(bare)) return null;
  return [...bare.matchAll(/\((\d)\)/g)].map((m) => Number(m[1]));
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * The keyed option against the market worked out from the two states. Single claims are read
 * per option; a statement question ("(1) and (4) only") reads each statement and needs the key
 * to be exactly the true ones (unread statements are left to the reviewer).
 */
export function checkStageStatements(spec: DiagramSpec, built: SceneBuilt, mcq: { stem: string; statements: readonly string[]; options: readonly string[]; answer: number }): { issues: DiagramIssue[]; solved: SolvedKey | null } {
  const issues: DiagramIssue[] = [];
  const facts = built.stage;
  if (!facts || !built.diagram) return { issues, solved: null };
  const { before, after } = facts;
  const tickOf = (label: string): number | null => {
    const key = tickKey(label);
    for (const p of built.diagram!.points) {
      const t = p.xTickLabel;
      const text = t ? t.en.map((r) => (r.vertAlign === 'subscript' ? `_${r.text}` : r.text)).join('') : '';
      if (text && tickKey(text) === key) return p.at.x;
    }
    return null;
  };
  const describe = () =>
    `On the figure: quantity traded ${cmp(before.quantity, after.quantity)}, price ${cmp(before.price, after.price)}, consumer surplus ${cmp(before.cs, after.cs)}, producer surplus ${cmp(before.ps, after.ps)}, total social surplus ${cmp(before.tss, after.tss)}, deadweight loss ${cmp(before.dwl, after.dwl)}; before: ${gapWords(before)}, after: ${gapWords(after)}.`;
  const letter = (i: number) => 'ABCD'[i];
  const scene = spec.scene!;
  const plan = stagePlan(scene);
  const variants = facts.variants ?? (facts.plan ? stageVariants(facts.plan) : []);
  /** True or false when the drawing and every variant agree; 'depends' when the curves decide; null when not read. */
  const judge = (claim: ReturnType<typeof readClaim>): boolean | 'depends' | null => {
    if (!claim) return null;
    const own = truth(claim, before, after, tickOf);
    if (own === null || claim.at) return own;
    return variants.every((v) => truth(claim, v.before, v.after, tickOf) === own) ? own : 'depends';
  };
  const stageText = plan && !('error' in plan) ? `stage ${plan.stage}, binds ${plan.binds}` : `stage ${scene.stage ?? 'none'}`;

  const listed = mcq.options.map(optionStatements);
  if (mcq.statements.length && listed.some(Boolean)) {
    const verdicts = mcq.statements.map((st) => judge(readClaim(st)));
    const keyed = listed[mcq.answer];
    if (!keyed) return { issues, solved: null };
    const wrong = verdicts
      .map((v, i) => ({ v, n: i + 1 }))
      .filter(({ v, n }) => (v === 'depends' ? keyed.includes(n) : v !== null && v !== keyed.includes(n)));
    if (wrong.length) {
      issues.push({
        level: 'error',
        code: 'scene.statement',
        text: `The key is option ${letter(mcq.answer)} (${mcq.options[mcq.answer]}), but on the figure (${stageText}) ${wrong.map(({ v, n }) => `statement (${n}) is ${v === 'depends' ? 'true or false depending on the slopes (a key must hold for any curves)' : v ? 'true' : 'false'}`).join(', ')}. ${describe()} Choose the stage and binds that make the keyed statements true (where each control line sits against the equilibrium); the question's words are fixed.`,
      });
      return { issues, solved: null };
    }
    if (verdicts.every((v) => v !== null)) {
      const trueSet = verdicts.map((v, i) => (v === true ? i + 1 : 0)).filter(Boolean);
      const option = listed.findIndex((l) => l && same(l, trueSet));
      return { issues, solved: { labels: [], option, why: `statements ${trueSet.map((n) => `(${n})`).join(', ') || '(none)'} are true on the figure` } };
    }
    return { issues, solved: null };
  }

  const verdicts = mcq.options.map((o) => judge(readClaim(o)));
  const keyed = verdicts[mcq.answer];
  if (keyed === 'depends') {
    issues.push({
      level: 'error',
      code: 'scene.statement',
      text: `The key is option ${letter(mcq.answer)} ("${mcq.options[mcq.answer]}"), but whether it holds depends on the slopes of demand and supply: a key must hold for any curves. ${describe()} Key an option that is always true for this change, or change the stage.`,
    });
    return { issues, solved: null };
  }
  if (keyed === false) {
    issues.push({
      level: 'error',
      code: 'scene.statement',
      text: `The key is option ${letter(mcq.answer)} ("${mcq.options[mcq.answer]}"), but it is false on the figure (${stageText}). ${describe()} Choose the stage and binds that make it true; the question's words are fixed.`,
    });
    return { issues, solved: null };
  }
  if (keyed === true) {
    const twins = verdicts.map((v, i) => (v === true && i !== mcq.answer ? i : -1)).filter((i) => i >= 0);
    if (twins.length) issues.push({ level: 'error', code: 'scene.twoKeys', text: `Options ${[mcq.answer, ...twins].map(letter).join(' and ')} are both true on the figure. ${describe()}` });
    return { issues, solved: { labels: [], option: mcq.answer, why: describe() } };
  }
  return { issues, solved: null };
}

function cmp(a: number, b: number): string {
  const d = (b - a) / Math.max(Math.abs(a), Math.abs(b), 1e-3);
  return d > EPS ? 'rises' : d < -EPS ? 'falls' : 'unchanged';
}
function gapWords(s: StateFacts): string {
  return s.shortage > EPS ? 'a shortage' : s.surplus > EPS ? 'a surplus' : s.binds ? 'no gap' : 'the control does not bind';
}

// ---- the stem's words against the stage ----

const CONTROL_WORDS = {
  ceiling: /price\s+ceiling|maximum\s+price|ceiling\s+price|rent\s+(?:control|ceiling)|最高價格|價格上限|租金(?:上限|管制)/i,
  floor: /price\s+floor|minimum\s+(?:price|wage)|最低價格|價格下限|最低工資/i,
  quota: /(?<!import\s)\bquota\b|(?<!進口)配額/i,
};
const LOWER = /\b(?:lower|reduc|cut|decreas|tighten)\w*|降低|調低|下調|減少|削減|收緊/i;
const RAISE = /\b(?:rais|increas|lift|enlarg|relax|expand)\w*|提高|調高|上調|增加|放寬|擴大/i;
/** "from P_1 to P_2", "由 P1 調低至 P2", "從 S1 移至 S2". */
const FROM_TO = /\bfrom\s+([A-Za-z][\w{}′']{0,5})\s+to\s+([A-Za-z][\w{}′']{0,5})|(?:由|從)\s*([A-Za-z][\w{}′']{0,5})\s*(?:[^\sA-Za-z]{0,4})?(?:至|到)\s*([A-Za-z][\w{}′']{0,5})/g;

/** Stage and labels against the stem: the control's change, and which part each "from … to …" names. */
export function checkStageWords(spec: DiagramSpec, built: SceneBuilt, stem: string): DiagramIssue[] {
  const scene = spec.scene;
  if (!scene || !built.diagram) return [];
  const issues: DiagramIssue[] = [];
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const control = scene.type === 'priceCeiling' || scene.type === 'ceilingDemandRise' ? 'ceiling' : scene.type === 'priceFloor' ? 'floor' : scene.type === 'quota' ? 'quota' : null;
  if (!control) return [];
  const stage = scene.type === 'ceilingDemandRise' ? 'demandRise' : (scene.stage ?? 'none');
  // The control itself changed: "lowers the price ceiling", "reduction in quota", "調低最高價格".
  for (const sentence of stem.split(/(?<=[.。?？;；])\s*/)) {
    if (!CONTROL_WORDS[control].test(sentence)) continue;
    const near = new RegExp(String.raw`(?:${LOWER.source}|${RAISE.source})[^.。,，]{0,24}?(?:${CONTROL_WORDS[control].source})|(?:${CONTROL_WORDS[control].source})[^.。,，]{0,12}?(?:is|are|be|was)\s+(?:${LOWER.source}|${RAISE.source})`, 'i').exec(sentence);
    const changes = /\bchang\w*\s+(?:the\s+)?(?:price\s+(?:ceiling|floor)|minimum\s+wage|quota)[^.。]{0,30}from\b|(?:改變|調整)[^。]{0,10}(?:由|從)/i.test(sentence);
    if (!near && !changes) continue;
    const word = near ? (LOWER.test(near[0]) ? 'lowered' : 'raised') : null;
    if (stage !== 'lowered' && stage !== 'raised') {
      error('scene.stage', `The question changes the ${control}${word ? ` (${word})` : ''}: draw both control lines with stage "${word ?? 'lowered" or "raised'}" (and binds for where each line sits).`);
    } else if (word && word !== stage) {
      error('scene.stage', `The question says the ${control} is ${word}, but the scene has stage "${stage}".`);
    }
  }
  // "from X to Y": X is the before part of its pair, Y the after part.
  const labelOf = new Map<string, string>();
  for (const [part, label] of built.partLabels) if (label) labelOf.set(tickKey(label), part);
  for (const m of stem.matchAll(FROM_TO)) {
    const [a, b] = [m[1] ?? m[3], m[2] ?? m[4]];
    const pa = labelOf.get(tickKey(a));
    const pb = labelOf.get(tickKey(b));
    if (!pa || !pb) continue;
    const pair = STAGE_PAIRS.find(([x, y]) => (x === pa && y === pb) || (x === pb && y === pa));
    if (pair && pair[0] === pb) {
      error('scene.order', `The stem goes from ${a} to ${b}, but on the figure ${a} is ${pa} (the state after) and ${b} is ${pb} (the state before): give ${a} to ${pb} and ${b} to ${pa}${pa.startsWith('Pc') || pa.startsWith('Qq') ? ', or change the stage' : ''}.`);
    }
  }
  return issues;
}
