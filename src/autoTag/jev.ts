import type { DecideAnswer, DecideQuestion, DecideRequest, DecideResult } from '@/ai/types';
import { cleanPatternName } from '@/model/patterns';
import { lookupCode } from '@/syllabus';
import { mcqTagKey, mcqTopic } from '@/model/topicSchemes';
import { isSubTopicCode, topicOf } from '@/model/topics';
import { buildPayload, knownCode, listCode, listCodesOf, MAX_TOPICS, topicList } from './prompt';
import type { TagConfidence, TagPartSuggestion, TagQuestion, TagSuggestion } from './types';

/**
 * AI tagging on Jev (k-0567, u-ioig): for teachers on DSEcon Mentor credits, the same
 * questions go to Mentor's `/ai/decide` as typed questions instead of the Gemini prompt
 * (`prompt.ts`). One Choice per question, or per part (u-g13t), over the same topic list the
 * prompt carries (`topicList`, one option per topic); the main topic is the most probable,
 * up to two more where Jev gives them real weight; how sure comes from the probability.
 * Jev writes no text, so the reason line is the main topic's syllabus points, in the
 * question's own language (k-0500: topic words follow the paper, not the interface). The
 * teacher's own 題型 is a second Choice over their names, with a companion Noul asking
 * whether any fits; it is kept only under the main topic, as in the prompt's rule.
 * Blind test (Outbox/k-0567): 77.9% exact topic on HKDSE 2024 + 2023 Paper 1 against
 * Flash-Lite's 76.7%, at about half the credits.
 */

/** Bump with any change to the questions sent (wording, options, names). */
export const TAG_JEV_VERSION = 'k0569.1';

/** A second or third topic needs at least this much of Jev's probability. */
export const ALSO_MIN = 0.15;
/** How sure, from the main topic's probability (the blind test: high 90% right, the rest about a third). */
export const HIGH_MIN = 0.7;
export const MEDIUM_MIN = 0.4;
/** A 題型 is kept when the companion Noul says one fits and Jev's pick is at least this likely. */
export const PATTERN_FITS_MIN = 0.5;
export const PATTERN_PICK_MIN = 0.4;

const TASK =
  'A Hong Kong teacher files their own HKDSE Economics questions under the syllabus topic each one TESTS: what a student must know or do to answer it, not words that merely appear in the text. ' +
  'In a question, "entries" are its printed parts in order (stem, leadIn data, statement, option, part with its "label"); <b>…</b> is bold, [Diagram …] and [Picture …] describe figures, "| a | b |" is a table row, and the option with "keyed": true is the correct answer. Questions from an older syllabus go to the closest topic.';

let criteriaCache: Record<string, string> | null = null;
/** The prompt's LIST as Choice options: the same line per topic, with its part. */
export function topicCriteria(): Record<string, string> {
  if (criteriaCache) return criteriaCache;
  const out: Record<string, string> = {};
  let part = '';
  for (const line of topicList().split('\n')) {
    const head = /^# (\S+) (.*)$/.exec(line);
    if (head) {
      part = `${head[1]} ${head[2]}`;
      continue;
    }
    const m = /^(\S+)\s{2}(.*)$/.exec(line);
    if (m) out[m[1]] = `${m[2]} [syllabus part ${part}]`;
  }
  criteriaCache = out;
  return out;
}

/** Question names Mentor accepts: letters, digits and `_ . : ( ) -`. */
const nameOf = (key: string, label?: string) => (label ? `${key}_${label}` : key).replace(/[^A-Za-z0-9_.:()-]/g, '');

function topicQuestion(key: string, label: string | undefined): DecideQuestion {
  const target = `\`questions.${key}\``;
  return {
    type: 'choice',
    instructions: label
      ? { task: TASK, question: `Which ONE topic does part ${label} of ${target} test? File what THAT part asks the student to do; the stem, the data and the other parts are only its context.` }
      : { task: TASK, question: `Which ONE topic does ${target} mostly test?` },
    criteria: topicCriteria(),
  };
}

/** The teacher's 題型 for a question, as `topic::name` options (only names they already have). */
function patternOptions(q: TagQuestion): Array<{ option: string; topic: string; name: string }> {
  const out: Array<{ option: string; topic: string; name: string }> = [];
  for (const [topic, names] of Object.entries(q.patterns ?? {})) {
    for (const raw of names) {
      const name = cleanPatternName(raw);
      if (!name) continue;
      const option = `${topic}::${name}`.slice(0, 80);
      if (!out.some((o) => o.option === option)) out.push({ option, topic, name: raw });
    }
  }
  return out;
}

function patternQuestions(q: TagQuestion, key: string, label: string | undefined, name: string): Record<string, DecideQuestion> {
  const options = patternOptions(q);
  if (options.length === 0) return {};
  const target = label ? `part ${label} of \`questions.${key}\`` : `\`questions.${key}\``;
  const list = options.map((o) => o.option.split('::')[1]);
  const fits: DecideQuestion = {
    type: 'noul',
    instructions: `The teacher sorts questions into their own kinds of question (題型): ${list.map((n) => `"${n}"`).join(', ')}. Does one of these kinds describe ${target}?`,
    criteria: { true: 'One of the kinds clearly describes what the question asks the student to do.', false: 'None of the kinds fits, or only loosely.' },
  };
  if (options.length === 1) return { [`${name}__fits`]: fits };
  return {
    [`${name}__fits`]: fits,
    [`${name}__kind`]: {
      type: 'choice',
      instructions: `Which of the teacher's own kinds of question (題型) best describes ${target}? The part before "::" is the syllabus topic the kind sits under.`,
      criteria: Object.fromEntries(options.map((o) => [o.option, null])),
    },
  };
}

/** One `/ai/decide` request for a chunk of questions (`run.ts` chunks them as for the prompt). */
export function buildDecide(chunk: readonly TagQuestion[], signal: AbortSignal): DecideRequest {
  const payload = buildPayload(chunk).questions;
  const state = { questions: Object.fromEntries(payload.map(({ key, ...rest }) => [key, rest])) };
  const questions: Record<string, DecideQuestion> = {};
  for (const q of chunk) {
    const labels = q.parts?.length ? q.parts.map((p) => p.label) : [undefined];
    for (const label of labels) {
      const name = nameOf(q.key, label);
      questions[name] = topicQuestion(q.key, label);
      Object.assign(questions, patternQuestions(q, q.key, label, name));
    }
  }
  return { feature: 'tag', state, questions, signal };
}

// ---------- reading the answers ----------

const isCjk = (text: string) => (text.match(/[㐀-鿿]/g)?.length ?? 0) > text.replace(/\s/g, '').length / 3;

/** The question's own language: Chinese when most of its words are. */
export function questionLanguage(q: TagQuestion): 'en' | 'zh' {
  return isCjk(q.entries.map((e) => e.text).join(' ')) ? 'zh' : 'en';
}

/**
 * The reason line Jev can't write: the topic's syllabus points (else its name), in `lang`.
 * An MCQ topic (k-0569) reads by the guide's points of its first EDB sub-topic that has any.
 */
export function syllabusLine(code: string, lang: 'en' | 'zh'): string {
  const key = mcqTagKey(code);
  const mcq = key ? mcqTopic(key) : undefined;
  if (mcq) {
    const fine = mcq.edb.find((edb) => isSubTopicCode(edb) && lookupCode(edb)?.keyPoint);
    return fine ? syllabusLine(fine, lang) : mcq[lang] || mcq.en;
  }
  const hit = lookupCode(code);
  const keyPoint = hit?.keyPoint;
  if (keyPoint) {
    // A guide point that introduces a list ends in a colon ("Deviations from efficiency:"): not before a "；".
    const points = keyPoint.points.map((p) => (p[lang] || p.en).trim().replace(/[:：]+$/, '')).filter((p) => p && p !== keyPoint[lang]);
    if (points.length) return points.join(lang === 'zh' ? '；' : '; ');
    return keyPoint[lang] || keyPoint.en;
  }
  const topic = topicOf(code);
  return topic ? topic[lang] || topic.en : code;
}

function confOf(p: number): TagConfidence {
  return p >= HIGH_MIN ? 'high' : p >= MEDIUM_MIN ? 'medium' : 'low';
}

/** Topics from one Choice answer: main, then up to two more with real weight; only codes the tree knows. */
export function topicsOf(answer: DecideAnswer | undefined): { topics: string[]; conf: TagConfidence } | undefined {
  if (!answer || answer.type !== 'choice') return undefined;
  const main = knownCode(answer.choice);
  if (!main) return undefined;
  const ranked = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1]);
  const p = answer.probabilities[answer.choice] ?? ranked[0]?.[1] ?? 0;
  const also: string[] = [];
  for (const [code, q] of ranked) {
    if (also.length >= MAX_TOPICS - 1) break;
    const known = knownCode(code);
    if (q >= ALSO_MIN && known && known !== main && !also.includes(known)) also.push(known);
  }
  return { topics: [main, ...also], conf: confOf(p) };
}

function patternOf(q: TagQuestion, main: string, answers: Record<string, DecideAnswer>, name: string): TagSuggestion['pattern'] {
  const options = patternOptions(q);
  const fits = answers[`${name}__fits`];
  if (!options.length || fits?.type !== 'noul' || fits.noul < PATTERN_FITS_MIN) return undefined;
  let picked = options.length === 1 ? options[0] : undefined;
  const kind = answers[`${name}__kind`];
  if (options.length > 1 && kind?.type === 'choice' && (kind.probabilities[kind.choice] ?? 0) >= PATTERN_PICK_MIN) picked = options.find((o) => o.option === kind.choice);
  // As in the prompt: only a name the teacher has, under the main topic (its EDB sub-topic falls under it, k-0569).
  return picked && listCodesOf(picked.topic).includes(listCode(main)) ? { topic: picked.topic, name: picked.name } : undefined;
}

/** Each question's suggestion from Jev's answers; null for a question with nothing usable. */
export function suggestionsFromDecide(chunk: readonly TagQuestion[], result: Pick<DecideResult, 'answers'>): Map<string, TagSuggestion | null> {
  const out = new Map<string, TagSuggestion | null>();
  for (const q of chunk) {
    const lang = questionLanguage(q);
    if (!q.parts?.length) {
      const name = nameOf(q.key);
      const read = topicsOf(result.answers[name]);
      if (!read) {
        out.set(q.rootId, null);
        continue;
      }
      const pattern = patternOf(q, read.topics[0], result.answers, name);
      out.set(q.rootId, { rootId: q.rootId, topics: read.topics, conf: read.conf, why: syllabusLine(read.topics[0], lang), ...(pattern ? { pattern } : {}) });
      continue;
    }
    const parts: TagPartSuggestion[] = [];
    for (const part of q.parts) {
      const name = nameOf(q.key, part.label);
      const read = topicsOf(result.answers[name]);
      if (!read) continue;
      const pattern = patternOf(q, read.topics[0], result.answers, name);
      parts.push({ label: part.label, slot: part.slot, topics: read.topics, conf: read.conf, why: syllabusLine(read.topics[0], lang), ...(pattern ? { pattern } : {}) });
    }
    if (!parts.length) {
      out.set(q.rootId, null);
      continue;
    }
    const order = { low: 0, medium: 1, high: 2 } as const;
    const conf = parts.reduce<TagConfidence>((least, p) => (order[p.conf] < order[least] ? p.conf : least), 'high');
    out.set(q.rootId, { rootId: q.rootId, topics: [...new Set(parts.flatMap((p) => p.topics))], conf, why: '', parts });
  }
  return out;
}

/** Every part of a question answered (a question without parts: answered at all). */
export function completeIn(q: TagQuestion, s: TagSuggestion | null | undefined): boolean {
  if (!s) return false;
  return !q.parts?.length || (s.parts?.length ?? 0) === q.parts.length;
}
