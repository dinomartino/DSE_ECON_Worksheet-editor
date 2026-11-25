import type { ImagePart } from '@/ai/types';
import type { BiDraft } from '@/generate/types';
import type { Glossary } from '@/glossary/types';
import type { Side } from '@/model/textSlots';
import { lookupCode } from '@/syllabus';
import { conceptOf } from './concept';
import {
  MAX_AUTO_EXAMPLES,
  MAX_COUNT,
  MAX_EXAMPLES,
  MAX_NOTE_CHARS,
  type SentSummary,
  type SourceQuestion,
  type StudioRequest,
} from './types';

/**
 * The brief: everything that goes to the provider for one writing request, built on the
 * computer from the teacher's request and the 2025 syllabus data. It is the single source
 * of what is sent: the form's "Sends this to {provider}" lines (`sentSummary`) and the
 * request's JSON (`briefPayload`) both read it, and a test fails if the JSON holds
 * anything the summary does not name.
 *
 * What it holds (decision 1c, u-x79v: the teacher accepts that a bank question's own words
 * may be sent): the key point and its points, that key point's NOT-required limits, the
 * EDB terms for the Chinese side, the examples the teacher picked (stem, options, key),
 * and the Change line. What it never holds: an example's label (year, paper, number), a
 * document title, a name, or anything from the paper the teacher is writing for.
 */

export interface Brief {
  request: StudioRequest;
  topic: { code: string; en: string; zh: string };
  keyPoint: { code: string; en: string; zh: string; notRequired: readonly string[] };
  /** Further key points the questions may also touch (the AI's pick); names only. */
  also: ReadonlyArray<{ code: string; en: string; zh: string }>;
  points: ReadonlyArray<{ code: string; en: string; zh: string }>;
  /** Where each draft's key should sit (0–3), so a batch does not pile up on one letter. */
  keys: readonly number[];
}

export type BriefResult = Brief | { error: 'unknownKeyPoint' | 'noSides' };

/** A shuffled run of the four positions, repeated to `count`. */
export function keyPlan(count: number, random: () => number = Math.random): number[] {
  const out: number[] = [];
  while (out.length < count) {
    const round = [0, 1, 2, 3];
    for (let i = round.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    out.push(...round);
  }
  return out.slice(0, count);
}

/** The request as the engine will use it: counts clamped, the note capped, points that belong to the key point. */
/** How a request's examples are used: not at all, as a style reference, or close to each on purpose. */
export function referenceMode(request: Pick<StudioRequest, 'examples' | 'strict'>): 'none' | 'style' | 'pattern' {
  if (request.examples.length === 0) return 'none';
  return request.strict === true && request.examples.every((e) => e.auto !== true) ? 'pattern' : 'style';
}

export function normalizeRequest(raw: StudioRequest): StudioRequest {
  const { concept: rawConcept, ...request } = raw;
  const concept = conceptOf(rawConcept);
  const hit = lookupCode(request.keyPoint);
  const points = hit ? request.points.filter((code) => lookupCode(code)?.keyPoint.code === hit.keyPoint.code) : [];
  return {
    ...request,
    points: [...new Set(points)],
    alsoKeyPoints: [...new Set(request.alsoKeyPoints ?? [])].filter((code) => code !== request.keyPoint && lookupCode(code) && !lookupCode(code)?.point).slice(0, 1),
    examples: request.examples.slice(0, request.examples.length > 0 && request.examples.every((e) => e.auto === true) ? MAX_AUTO_EXAMPLES : MAX_EXAMPLES),
    count: Math.min(MAX_COUNT, Math.max(1, Math.floor(request.count) || 1)),
    sides: (['en', 'zh'] as const).filter((side) => request.sides.includes(side)),
    note: request.note.trim().slice(0, MAX_NOTE_CHARS),
    ...(concept ? { concept } : {}),
  };
}

export function makeBrief(raw: StudioRequest, random?: () => number): BriefResult {
  const request = normalizeRequest(raw);
  const hit = lookupCode(request.keyPoint);
  if (!hit || hit.point) return { error: 'unknownKeyPoint' };
  if (!request.sides.length) return { error: 'noSides' };
  const chosen = request.points.length
    ? hit.keyPoint.points.filter((point) => request.points.includes(point.code))
    : hit.keyPoint.points;
  return {
    request,
    topic: { code: hit.topic.code, en: hit.topic.en, zh: hit.topic.zh },
    keyPoint: { code: hit.keyPoint.code, en: hit.keyPoint.en, zh: hit.keyPoint.zh, notRequired: hit.keyPoint.notRequired },
    also: (request.alsoKeyPoints ?? []).flatMap((code) => {
      const other = lookupCode(code);
      return other ? [{ code: other.keyPoint.code, en: other.keyPoint.en, zh: other.keyPoint.zh }] : [];
    }),
    points: chosen.map(({ code, en, zh }) => ({ code, en, zh })),
    keys: keyPlan(request.count, random),
  };
}

// ---- the payload ----

/** One bilingual text with only the sides the paper prints. */
function sidesOf(text: BiDraft, sides: readonly Side[]): Partial<Record<Side, string>> {
  const out: Partial<Record<Side, string>> = {};
  for (const side of sides) if (text[side].trim()) out[side] = text[side].trim();
  return out;
}

const LETTERS = 'ABCD';

/** One example as the provider sees it: its words and key. Never its label, id or source. */
export function examplePayload(source: SourceQuestion, sides: readonly Side[], figures = 0): Record<string, unknown> {
  return {
    ...(source.passage ? { passage: sidesOf(source.passage, sides) } : {}),
    stem: sidesOf(source.stem, sides),
    statements: source.statements.map((s) => sidesOf(s, sides)),
    options: source.options.map((o) => sidesOf(o, sides)),
    ...(source.answerIndex >= 0 ? { key: LETTERS[source.answerIndex] } : {}),
    ...(source.explanation && (source.explanation.en.trim() || source.explanation.zh.trim()) ? { explanation: sidesOf(source.explanation, sides) } : {}),
    // `figures`: this many pictures are attached, in this example's order, `figureAt` saying where each sits
    // ("stem (1)", "option A"); `figureNotShown`: it has a picture (or more) the model cannot see.
    ...(figures > 0 ? { figures, ...(source.figureAt?.length ? { figureAt: source.figureAt.slice(0, figures) } : {}) } : {}),
    ...(source.hasFigure && figures < Math.max(1, source.figurePlaces?.length ?? source.figureBlocks?.length ?? 0) ? { figureNotShown: true } : {}),
  };
}

/** Pictures in all of a request's examples that one request carries (a bigger set is cut, earlier examples first). */
export const MAX_REQUEST_FIGURES = 6;

/**
 * The pictures each example sends: its own figures when the provider reads pictures, within
 * `MAX_REQUEST_FIGURES` over the request. One list per example, same order as the examples.
 */
export function sentFigures(examples: readonly SourceQuestion[], vision: boolean): ImagePart[][] {
  let room = MAX_REQUEST_FIGURES;
  return examples.map((example) => {
    if (!vision || room <= 0) return [];
    const take = [...(example.figures ?? [])].slice(0, room);
    room -= take.length;
    return take;
  });
}

/** The EDB term lines for the Chinese side: the key point's names and the examples' English. */
function pinLines(brief: Brief, glossary: Glossary | null, denyHints: boolean): string[] {
  if (!glossary || !brief.request.sides.includes('zh')) return [];
  const texts = [
    brief.keyPoint.en,
    ...brief.also.map((k) => k.en),
    ...brief.points.map((p) => p.en),
    ...brief.request.examples.flatMap((e) => [e.stem.en, ...e.statements.map((s) => s.en), ...e.options.map((o) => o.en)]),
  ].filter(Boolean);
  return glossary.pin(texts, 'toZh', { denyHints }).map((pin) => pin.line);
}

/** Top-level keys of the writing payload, for the "nothing else is sent" test. */
export const PAYLOAD_KEYS: readonly string[] = [
  'task', 'make', 'languages', 'syllabus', 'glossary', 'examples', 'teacherNote', 'avoid', 'redo', 'rewrite',
];

/** The JSON object the provider receives as the user turn (extra fields are the run's own: `avoid`, `redo`, `rewrite`). */
export function briefPayload(brief: Brief, glossary: Glossary | null, denyHints: boolean, vision = false): Record<string, unknown> {
  const { request } = brief;
  const figures = sentFigures(request.examples, vision);
  return {
    task: 'question-studio-write',
    make: {
      count: request.count,
      level: request.level,
      shape: request.shape,
      keys: brief.keys,
      ...(request.examples.length ? { reference: referenceMode(request) } : {}),
    },
    languages: request.sides,
    syllabus: {
      topic: { en: brief.topic.en, zh: brief.topic.zh },
      keyPoint: { en: brief.keyPoint.en, zh: brief.keyPoint.zh },
      ...(brief.also.length ? { alsoKeyPoints: brief.also.map((k) => ({ en: k.en, zh: k.zh })) } : {}),
      points: brief.points.map((p) => ({ en: p.en, zh: p.zh })),
      notRequired: brief.keyPoint.notRequired,
      // k-0554: the exact idea within the key point, so a draft stays on its reference's concept.
      ...(request.concept ? { concept: request.concept } : {}),
    },
    glossary: pinLines(brief, glossary, denyHints),
    ...(request.examples.length ? { examples: request.examples.map((e, i) => examplePayload(e, request.sides, figures[i].length)) } : {}),
    ...(request.note ? { teacherNote: request.note } : {}),
  };
}

/** What the form says is sent (the words are the UI's). */
export function sentSummary(request: StudioRequest, vision = false): SentSummary {
  const brief = makeBrief(request);
  const clean = 'error' in brief ? normalizeRequest(request) : brief.request;
  const hit = lookupCode(clean.keyPoint);
  const chars = clean.examples.reduce((sum, e) => sum + JSON.stringify(examplePayload(e, clean.sides)).length, 0);
  return {
    keyPoint: clean.keyPoint,
    points: 'error' in brief ? 0 : brief.points.length,
    limits: hit?.keyPoint.notRequired.length ?? 0,
    examples: clean.examples.length,
    reference: referenceMode(clean),
    exampleChars: chars,
    note: clean.note !== '',
    figures: sentFigures(clean.examples, vision).reduce((n, list) => n + list.length, 0),
    sides: clean.sides,
    count: clean.count,
    level: clean.level,
  };
}
