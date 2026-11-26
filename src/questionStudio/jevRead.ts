import type { DecideAnswer, DecideQuestion, DecideRequest, DecideResult } from '@/ai/types';
import { draftsPayload, TURN_PARTS, type DraftBrief, type TurnPart } from './understand';

/**
 * The studio's pre-router on Jev (k-0567, u-5sy9): on DSEcon Mentor credits, a teacher's
 * message once drafts exist is read first by TypeSafe Jev through Mentor's `/ai/decide`
 * (feature `studio.read`, about 0.07 credits and 0.2 s) instead of the main model's
 * 7.6-credit, 8-second read (`understand.ts`).
 *
 * - An edit, one more like a draft, or an edit whose draft can't be told goes straight to
 *   its path: the edit, the write, or "Which draft do you mean?". The main-model read is
 *   skipped.
 * - New questions and questions about a draft keep today's call: it picks the key point and
 *   writes the concept, or writes the answer.
 * - Any doubt (Jev failing, an unsure intent, Mentor's fallback model answering) keeps
 *   today's call too, so a teacher never gets a worse read than before.
 * - Words the computer already reads as new questions (`intent.ts`) aren't sent to Jev at all:
 *   they need the main read anyway, and the round trip would only delay it (`chatStore.ts`).
 *
 * Code applies the read rules of `understand.ts` (the chip, "recent", every draft, a draft
 * that isn't there); Jev only answers the questions. The cut-offs are pinned to `jev-1.14.0`
 * (Mentor pins the model) and were set on k-0567's 80 invented messages
 * (`Outbox/k-0567/router/`).
 */

export const STUDIO_READ_VERSION = 'k0567.r1';

/** Jev's top intent below this: today's main-model read decides. */
export const INTENT_MIN = 0.7;
/**
 * "One more like a draft" needs more: misread, it writes a near copy of a draft instead of the
 * new topic asked for ("now do the same on unit tax" read as another like the unit-tax draft
 * at 0.66, k-0567).
 */
export const ANOTHER_MIN = 0.85;
/** A draft Noul at or above this names that draft. */
export const DRAFT_YES = 0.7;
/** Between this and DRAFT_YES a draft might be meant: the teacher is asked which. */
export const DRAFT_MAYBE = 0.3;
/** "Every draft" and "a draft that isn't there". */
export const FLAG_MIN = 0.5;
/** Harder / easier: used only when Jev is this sure and the other is low. */
export const HOW_MIN = 0.7;
/** A part an edit touches. */
export const PART_MIN = 0.6;

export type StudioReadIntent = 'edit' | 'another' | 'new' | 'ask';

export interface StudioReadInput {
  text: string;
  drafts: readonly DraftBrief[];
  /** Drafts the last reply wrote or changed, by number. */
  recent: readonly number[];
  /** The parts the computer's words saw (`intent.ts`), for the diagram rule in `partsOf`. */
  localParts?: readonly TurnPart[];
}

/** What the pre-router says. `act`: do it now, no main-model read. `main`: today's read. */
export type StudioRoute =
  | {
      route: 'act';
      kind: 'edit' | 'another' | 'unsure';
      /** What the teacher wants done (for "Which draft?": an edit, or one more like it). */
      wanted: 'edit' | 'another';
      /** The drafts (edit / another), or the ones offered in "Which draft?" (unsure). */
      drafts: number[];
      /** From Jev when it is sure, else undefined (the computer's read decides). */
      how?: 'harder' | 'easier' | 'change';
      /** From Jev when any part is clear, else undefined (the computer's read decides). */
      parts?: TurnPart[];
    }
  | { route: 'main'; why: 'new' | 'ask' | 'doubt' | 'fallback' };

const ORD_EN = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ORD_ZH = '一二三四五六七八九十';

const INTENT: DecideQuestion = {
  type: 'choice',
  instructions:
    'A Hong Kong economics teacher typed `request` in a chat where drafts of new HKDSE multiple-choice questions are already on the page (`drafts`, numbered by `no`). What does the teacher want? The request may be English, Chinese, Cantonese or mixed.',
  criteria: {
    edit: { what: 'Change one or more drafts already on the page: their stem, options, statements, answer, numbers, table, diagram, wording, language or difficulty.', examples: ['make the last question harder', 'Q2 太易', '改返啲選項', 'the numbers are wrong', 'use a table instead', '太多字'] },
    another: { what: 'Write one MORE question like a draft on the page, keeping that draft as it is.', examples: ['another like draft 2', '再出一題似第二題', 'one more like the first one'] },
    new: { what: 'Write new questions on a topic or idea; not a change to a draft on the page and not modelled on one draft.', examples: ['write 3 more on price ceilings', 'another one on elasticity', '出兩題關於最高限價'] },
    ask: { what: 'A question about a draft that wants an answer or explanation, not a change.', examples: ['why is B wrong?', '點解答案係 C？', 'is Q2 at DSE level?'] },
  },
};

function draftQuestion(n: number): DecideQuestion {
  const en = ORD_EN[n - 1] ?? `${n}th`;
  const zh = n <= 10 ? ORD_ZH[n - 1] : String(n);
  return {
    type: 'noul',
    instructions: `Does \`request\` point at the draft whose \`no\` is ${n}: by its number or place ("Draft ${n}", "Q${n}", "草稿 ${n}", "第${zh}題", "the ${en} one"), or by what only that draft has (its table, its diagram, its topic, its options)?`,
    criteria: {
      true: `The request names or describes draft ${n} in particular.`,
      false: 'The request names another draft, every draft, a draft that does not exist, or no draft at all (only "it", "this one", "呢題", or nothing).',
    },
  };
}

const ALL: DecideQuestion = {
  type: 'noul',
  instructions: 'Does `request` itself contain a word that means every draft on the page ("all", "all three", "every", "everything", "全部", "每題", "所有")?',
  criteria: {
    true: 'One of those words is in `request` and refers to the drafts.',
    false: 'No such word: the request names one or some drafts, or names no draft at all ("it", "this one", "the options", "呢題", "題幹", or nothing). A message that names no draft is NOT about every draft.',
  },
};

const MISSING: DecideQuestion = {
  type: 'noul',
  instructions: 'Does `request` name a draft by a number or place that is NOT among the `no` values in `drafts` (e.g. "draft 5" when the drafts are 1 to 3)?',
};

const HARDER: DecideQuestion = {
  type: 'noul',
  instructions: 'If `request` asks to change a draft, is the change ONLY to make it harder or more challenging ("harder", "too easy", "太易", "深啲", "more challenging"), with no other change named?',
  criteria: { true: 'Only harder.', false: 'Easier, or a specific change (numbers, options, wording, table, diagram, answer, format), or not a change at all.' },
};

const EASIER: DecideQuestion = {
  type: 'noul',
  instructions: 'If `request` asks to change a draft, is the change ONLY to make it easier or simpler ("easier", "too hard", "太難", "易啲", "淺啲"), with no other change named?',
  criteria: { true: 'Only easier.', false: 'Harder, or a specific change (numbers, options, wording, table, diagram, answer, format), or not a change at all.' },
};

/** What each part means to the teacher, for its Noul. */
const PART_WHAT: Record<TurnPart, string> = {
  stem: 'the stem: the question text or scenario itself (its length, wording, context)',
  options: 'the options A to D (the choices, distractors)',
  statements: 'the numbered statements (1), (2), (3), or turning it into a statements format',
  answer: 'which option is the answer (the key)',
  explanation: 'the explanation of the answer',
  diagram: 'the diagram, graph or curves (labels, axes, shifts)',
  table: 'the table (its rows, columns)',
  numbers: 'the numbers or values used (prices, quantities, amounts, currency)',
  language: 'the language: translating, or English vs Chinese wording',
};

function partQuestion(part: TurnPart): DecideQuestion {
  return { type: 'noul', instructions: `If \`request\` asks to change a draft, does the change touch ${PART_WHAT[part]}?` };
}

/** The Jev request: the drafts as the main read sees them, the intent, which drafts, and for an edit how and what. */
export function buildStudioRead(input: StudioReadInput, signal: AbortSignal): DecideRequest {
  const questions: Record<string, DecideQuestion> = { intent: INTENT, all: ALL, missing: MISSING, harder: HARDER, easier: EASIER };
  for (const d of input.drafts) questions[`d${d.no}`] = draftQuestion(d.no);
  for (const p of TURN_PARTS) questions[`part_${p}`] = partQuestion(p);
  return {
    feature: 'studio.read',
    state: { request: input.text.trim(), drafts: draftsPayload(input.drafts), recent: [...input.recent] },
    questions,
    signal,
  };
}

const noul = (a: Record<string, DecideAnswer>, k: string): number | undefined => {
  const x = a[k];
  return x?.type === 'noul' ? x.noul : undefined;
};

/** Jev's answers → act now, or today's read. Pure. */
export function routeStudioRead(result: Pick<DecideResult, 'answers' | 'fallback'>, input: StudioReadInput): StudioRoute {
  // Mentor's Gemini fallback (not used for studio.read, but an older server might): its rough probabilities aren't trusted here.
  if (result.fallback) return { route: 'main', why: 'fallback' };
  const a = result.answers;
  const intent = a.intent;
  if (intent?.type !== 'choice') return { route: 'main', why: 'doubt' };
  const kind = intent.choice as StudioReadIntent;
  const top = intent.probabilities[kind] ?? intent.confidence ?? 0;
  if (top < (kind === 'another' ? ANOTHER_MIN : INTENT_MIN)) return { route: 'main', why: 'doubt' };
  if (kind === 'new' || kind === 'ask') return { route: 'main', why: kind };
  if (kind !== 'edit' && kind !== 'another') return { route: 'main', why: 'doubt' };

  // Every draft the read needs answered, else today's read.
  const scores = input.drafts.map((d) => ({ no: d.no, editable: d.state !== 'added', p: noul(a, `d${d.no}`) }));
  if (scores.some((s) => s.p === undefined) || noul(a, 'all') === undefined || noul(a, 'missing') === undefined) return { route: 'main', why: 'doubt' };
  const editable = scores.filter((s) => s.editable).map((s) => s.no);

  const how = howOf(a);
  const parts = partsOf(a, input.localParts);
  const extra = { wanted: kind, ...(how ? { how } : {}), ...(parts ? { parts } : {}) };
  const which = (offered: number[]): StudioRoute => ({ route: 'act', kind: 'unsure', drafts: offered.length ? offered : editable, ...extra });

  // A draft that isn't on the page: ask which (understand.ts rule).
  if ((noul(a, 'missing') ?? 0) >= FLAG_MIN) return which(editable);
  if ((noul(a, 'all') ?? 0) >= FLAG_MIN) {
    const every = input.drafts.filter((d) => d.state === 'open' || d.state === 'accepted').map((d) => d.no);
    if (every.length === 0) return which(editable);
    return { route: 'act', kind: kind === 'another' ? 'unsure' : 'edit', drafts: every, ...extra };
  }
  const yes = scores.filter((s) => s.editable && (s.p ?? 0) >= DRAFT_YES).map((s) => s.no);
  const maybe = scores.filter((s) => s.editable && (s.p ?? 0) >= DRAFT_MAYBE && (s.p ?? 0) < DRAFT_YES).map((s) => s.no);
  // A draft named that can't be edited (already in the paper): ask.
  if (scores.some((s) => !s.editable && (s.p ?? 0) >= DRAFT_YES) && yes.length === 0) return which(editable);
  if (maybe.length) return which([...yes, ...maybe].sort((x, y) => x - y));
  if (yes.length) return { route: 'act', kind: kind === 'another' && yes.length > 1 ? 'unsure' : kind, drafts: yes, ...extra };
  // No draft named: the one the last reply wrote, when there is exactly one.
  const recent = input.recent.filter((n) => editable.includes(n));
  if (recent.length === 1) return { route: 'act', kind, drafts: recent, ...extra };
  return which(recent.length ? recent : editable);
}

function howOf(a: Record<string, DecideAnswer>): 'harder' | 'easier' | undefined {
  const h = noul(a, 'harder');
  const e = noul(a, 'easier');
  if (h === undefined || e === undefined) return undefined;
  if (h >= HOW_MIN && e < DRAFT_MAYBE) return 'harder';
  if (e >= HOW_MIN && h < DRAFT_MAYBE) return 'easier';
  return undefined;
}

/**
 * The parts Jev is sure of; undefined when none (the computer's read decides). A diagram the
 * computer's words saw and Jev half-saw is kept: leaving it out keeps a figure the new words
 * may no longer fit (`run.ts:refine`), so in doubt the figure is redone.
 */
function partsOf(a: Record<string, DecideAnswer>, local: readonly TurnPart[] = []): TurnPart[] | undefined {
  const out = TURN_PARTS.filter((p) => (noul(a, `part_${p}`) ?? 0) >= PART_MIN);
  if (!out.length) return undefined;
  if (!out.includes('diagram') && local.includes('diagram') && (noul(a, 'part_diagram') ?? 0) >= DRAFT_MAYBE) out.push('diagram');
  return out;
}
