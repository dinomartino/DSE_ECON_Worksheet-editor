import type { Compiled } from './compile';
import { claimShape, marketsFor, measureOf, sameShape, sameSize, MEASURE_WORDS } from './market';
import { optionStatements } from './stageCheck';
import { cornerAreasIn, type McqWords } from './sceneCheck';
import type { AreaAsk, DiagramIssue, DiagramSpec } from './types';

/**
 * What the words say an area is (k-0600 follow-up): "Area 0abc represents the increase in
 * producer surplus", "(2) The decrease in total social surplus is area 0abc". Each claim is
 * worked out on the drawing with the market solver (`market.ts`, the plan path's measures) and
 * the area's corner letters. The studio review's draft keyed B rightly, but its explanation called
 * area 0abc the increase in producer surplus: with a subsidy and perfectly elastic demand it is
 * that increase less the deadweight loss. A wrong explanation is now sent back to the writer.
 *
 * A claim is read only when it is plain: one area, one measure, a linking word between them, no
 * "not" or "rather than" before the measure. Anything else is left alone (null, never a guess).
 */

export interface AreaClaim {
  /** The area as written ("area 0abc"). */
  area: string;
  what: AreaAsk;
  state: 'after' | 'change';
  /** The measure's words as written ("the increase in producer surplus"). */
  words: string;
}

type Measure = { re: RegExp; what: AreaAsk; state: 'after' | 'change' };

const CHANGE_EN = String.raw`(?:increase|decrease|rise|fall|gain|loss|change|reduction|drop)`;
const MEASURES: Measure[] = [
  { re: /\b(?:the\s+)?(?:deadweight|dead-weight|efficiency|welfare)\s+loss(?:es)?\b/gi, what: 'dwl', state: 'after' },
  { re: new RegExp(String.raw`\b(?:the\s+)?${CHANGE_EN}\s+(?:in|of)\s+(?:the\s+)?total\s+(?:social\s+)?surplus\b`, 'gi'), what: 'dwl', state: 'after' },
  { re: new RegExp(String.raw`\b(?:the\s+)?${CHANGE_EN}\s+(?:in|of)\s+(?:the\s+)?producers?(?:'s?)?\s+surplus\b`, 'gi'), what: 'ps', state: 'change' },
  { re: new RegExp(String.raw`\b(?:the\s+)?${CHANGE_EN}\s+(?:in|of)\s+(?:the\s+)?consumers?(?:'s?)?\s+surplus\b`, 'gi'), what: 'cs', state: 'change' },
  {
    re: /\b(?:the\s+)?(?:tax\s+revenue|government(?:'s)?\s+(?:subsidy\s+)?(?:expenditure|spending)(?:\s+on\s+the\s+subsidy)?|(?:total\s+)?subsidy\s+(?:expenditure|spending|payments?)|cost\s+of\s+the\s+subsidy)\b/gi,
    what: 'taxRevenue',
    state: 'after',
  },
  { re: /效率損失|無謂損失|總社會(?:盈餘|剩餘)的?(?:減少|下降|損失|變化)/g, what: 'dwl', state: 'after' },
  { re: /生產者(?:盈餘|剩餘)的?(?:增加|減少|上升|下降|變化)/g, what: 'ps', state: 'change' },
  { re: /消費者(?:盈餘|剩餘)的?(?:增加|減少|上升|下降|變化)/g, what: 'cs', state: 'change' },
  { re: /稅收|(?:政府的?)?津貼開支/g, what: 'taxRevenue', state: 'after' },
];

/** "area 0abc", "面積 0abc", "area A": where each sits in the text. */
const AREA_AT = /\b(?:[Aa]reas?|[Rr]egions?)\s+((?:[a-z0]{3,6}|[A-Z]{3,6})|[A-H](?![A-Za-z]))|(?:面積|區域)\s*((?:[a-z0]{3,6}|[A-Z]{3,6})|[A-H](?![A-Za-z]))/g;
/** A linking word between an area and its measure. */
const LINK = /\b(?:is|are|was|represents?|equals?|shows?|measures?|stands?\s+for|gives?|becomes?|will\s+be|would\s+be|by)\b|=|是|為|代表|等於|即/i;
/** Before a measure, these make it something the area is not. */
const NOT = /\b(?:not|n't|rather\s+than|instead\s+of|than)\b|不是|並非|而非/i;
/** A clause about a claim ("(2) says …", "… is wrong") makes none itself. */
const ABOUT = /\b(?:says?|claims?|states?|suggests?|incorrect|wrong|false|mistaken|untrue)\b|錯|不正確|不對/i;

/** The claims a text makes, plain ones only. */
export function areaClaimsIn(text: string): AreaClaim[] {
  const out: AreaClaim[] = [];
  const clauses = text.split(/(?<!\d)[.;!?。；！？](?!\d)|,\s*(?=(?:so|hence|thus|therefore|while|whereas|but|and so)\b)|，/);
  for (const clause of clauses) {
    if (ABOUT.test(clause)) continue;
    const areas = [...clause.matchAll(AREA_AT)].map((m) => ({ at: m.index!, end: m.index! + m[0].length, text: m[0], token: m[1] ?? m[2] }));
    const real = areas.filter((a) => a.token.length === 1 || cornerAreasIn(a.text).length === 1);
    if (real.length !== 1) continue;
    const area = real[0];
    const measures = MEASURES.flatMap((m) => [...clause.matchAll(m.re)].map((x) => ({ at: x.index!, end: x.index! + x[0].length, words: x[0].trim(), what: m.what, state: m.state })));
    const linked = measures.filter((m) => {
      const between = m.at >= area.end ? clause.slice(area.end, m.at) : clause.slice(m.end, area.at);
      if (between.length > 60 || !LINK.test(between) || NOT.test(between)) return false;
      // "the increase in producer surplus rather than …": a measure after "rather than" is not the claim.
      const before = clause.slice(Math.max(0, m.at - 16), m.at);
      return !NOT.test(before);
    });
    if (!linked.length) continue;
    const nearest = linked.reduce((a, b) => (Math.abs(a.at - area.at) <= Math.abs(b.at - area.at) ? a : b));
    out.push({ area: area.text.trim(), what: nearest.what, state: nearest.state, words: nearest.words });
  }
  return out;
}

/** True or false on this drawing; null when the drawing cannot say (a letter missing, no market). */
function judge(claim: AreaClaim, spec: DiagramSpec, compiled: Compiled, words: string): { truth: boolean; why: string } | null {
  const diagram = compiled.diagram;
  if (!diagram) return null;
  const shape = claimShape(claim.area, diagram, compiled);
  if (!shape || typeof shape === 'string') return null;
  const asked: DiagramSpec = { ...spec, asks: { what: claim.what, state: claim.state, markets: marketsFor(spec, words) } };
  const measure = measureOf(asked, compiled, diagram);
  if (typeof measure === 'string') return null;
  return { truth: sameShape(shape.inside, measure.inside) || sameSize(shape.inside, measure.inside), why: measure.why };
}

/**
 * The explanation's claims and the statements' claims against the drawing. Look-level issues:
 * the figure is right, the words are not, so the diagram maker is not asked to redraw; the studio
 * has the writer rewrite the draft (`area.claim`, `area.statement`).
 */
export function checkAreaClaims(spec: DiagramSpec, compiled: Compiled, mcq: McqWords, explanation: string): DiagramIssue[] {
  if (spec.kind !== 'curves' || !compiled.diagram) return [];
  const issues: DiagramIssue[] = [];
  const words = [mcq.stem, ...mcq.statements, explanation].join('\n');
  // The explanation, less the "Correct answer: B. …" line the studio puts first.
  const said = explanation.replace(/^Correct answer:[^\n]*\n?/i, '');
  for (const claim of areaClaimsIn(said)) {
    const verdict = judge(claim, spec, compiled, words);
    if (verdict && !verdict.truth) {
      issues.push({
        level: 'look',
        code: 'area.claim',
        text: `The explanation says ${claim.area} is ${claim.words}, but on the figure it is not (${verdict.why}). Say what ${claim.area} really is (or that it is not ${claim.what === 'dwl' ? MEASURE_WORDS.dwl : claim.words}), or leave it out; the key may stay.`,
      });
    }
  }
  const keyed = mcq.options[mcq.answer] ? optionStatements(mcq.options[mcq.answer]) : null;
  if (keyed && mcq.statements.length) {
    mcq.statements.forEach((statement, i) => {
      const claims = areaClaimsIn(statement);
      if (claims.length !== 1) return;
      const verdict = judge(claims[0], spec, compiled, words);
      if (!verdict) return;
      const keyedTrue = keyed.includes(i + 1);
      if (verdict.truth !== keyedTrue) {
        issues.push({
          level: 'look',
          code: 'area.statement',
          text: `Statement (${i + 1}) says ${claims[0].words} is ${claims[0].area}. On the figure that is ${verdict.truth ? 'true' : 'false'}, but the key (${mcq.options[mcq.answer]}) treats it as ${keyedTrue ? 'true' : 'false'}.`,
        });
      }
    });
  }
  return issues;
}
