import type { Side } from '@/model/textSlots';

/**
 * The near-copy check: does a draft repeat a question the app already holds? Local, free
 * and instant; it reads words only, so nothing leaves the computer.
 *
 * A text is cut into overlapping runs of words ("shingles": 6 English words, 8 中文
 * characters; numbers all read as `#`, so "the same question with new numbers" still
 * matches). The score is the share of the draft's runs found in ONE existing question.
 * Stock phrasing ("which of the following is correct") is in hundreds of questions and
 * proves nothing, so a run found in more than `boilerplateLimit` questions does not count.
 *
 * Tuning (measured on the published by-topic bank, 1,759 questions, nearest neighbour of
 * each one): the median question shares 7% of its distinctive runs with its closest
 * neighbour, the 90th percentile 31%. The limit below is a starting point for the trial
 * (§ docs/design/question-studio.md), not a measured optimum.
 */

export type CorpusKind = 'bank' | 'mine' | 'paper' | 'example' | 'draft';

/** One question's words, in reading order (stem, statements, options). */
export interface CorpusDoc {
  id: string;
  kind: CorpusKind;
  en: string;
  zh: string;
}

export const EN_SHINGLE = 6;
export const ZH_SHINGLE = 8;
/** A draft sharing this much of its distinctive text with one question is too close. */
export const NEAR_COPY_LIMIT = 0.3;
/** A run copied word for word: stems repeat across a bank, so only a long one counts alone. */
export const VERBATIM_WORDS = 24;
export const VERBATIM_CHARS = 36;
/** Fewer distinctive runs than this and the share means little; a verbatim run still counts. */
const MIN_DISTINCTIVE = 4;
/** A run in more questions than this is stock phrasing (8 of 1,759; 6 in a small bank). */
export const boilerplateLimit = (docs: number): number => Math.max(6, Math.ceil(docs / 250));

// ---- words ----

const EN_TOKEN = /[a-z0-9]+(?:[.,][0-9]+)*%?/g;
const NUMBER = /^[0-9][0-9.,]*%?$/;
const CJK = /[㐀-鿿豈-﫿]/g;

/** Lower-cased words; every number is `#`. */
export function enTokens(text: string): string[] {
  return (text.toLowerCase().match(EN_TOKEN) ?? []).map((token) => (NUMBER.test(token) ? '#' : token));
}

/** The Chinese characters only: digits, Latin letters and punctuation drop out. */
export function zhChars(text: string): string {
  return (text.match(CJK) ?? []).join('');
}

const enRuns = (text: string): string[] => {
  const words = enTokens(text);
  const out: string[] = [];
  for (let i = 0; i + EN_SHINGLE <= words.length; i += 1) out.push(words.slice(i, i + EN_SHINGLE).join(' '));
  return out;
};

const zhRuns = (text: string): string[] => {
  const chars = zhChars(text);
  const out: string[] = [];
  for (let i = 0; i + ZH_SHINGLE <= chars.length; i += 1) out.push(chars.slice(i, i + ZH_SHINGLE));
  return out;
};

// ---- the index ----

interface SideIndex {
  /** run → the docs (by position) holding it. */
  postings: Map<string, number[]>;
  /** Per doc, its runs. */
  runs: Array<Set<string>>;
}

export interface CorpusIndex {
  readonly docs: readonly CorpusDoc[];
  /** Each doc's words as one string (`wordsKey`), so a question can be left out of a comparison by its words. */
  readonly prints: readonly string[];
  readonly en: SideIndex;
  readonly zh: SideIndex;
}

const newSide = (): SideIndex => ({ postings: new Map(), runs: [] });

/** A question's words as one string: two docs with the same words are the same question. */
export const wordsKey = (doc: Pick<CorpusDoc, 'en' | 'zh'>): string => `${enTokens(doc.en).join(' ')}\u0000${zhChars(doc.zh)}`;

/** An index over `docs`. A doc whose words equal an earlier one's is left out (copies must not look like stock phrasing). */
export function buildCorpusIndex(docs: readonly CorpusDoc[]): CorpusIndex {
  const kept: CorpusDoc[] = [];
  const prints: string[] = [];
  const en = newSide();
  const zh = newSide();
  const seen = new Set<string>();
  for (const doc of docs) {
    const fingerprint = wordsKey(doc);
    if (fingerprint === '\u0000' || seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const at = kept.length;
    kept.push(doc);
    prints.push(fingerprint);
    for (const [side, runs] of [[en, new Set(enRuns(doc.en))], [zh, new Set(zhRuns(doc.zh))]] as const) {
      side.runs.push(runs);
      for (const run of runs) {
        const list = side.postings.get(run);
        if (list) list.push(at);
        else side.postings.set(run, [at]);
      }
    }
  }
  return { docs: kept, prints, en, zh };
}

export const EMPTY_CORPUS: CorpusIndex = buildCorpusIndex([]);

// ---- the check ----

export interface NearCopyResult {
  /** Whole percent of the draft's distinctive runs found in its closest question. */
  percent: number;
  /** The closest question, when any shares a run. */
  closest?: CorpusDoc;
  side?: Side;
  /** A long run copied word for word, or the whole draft inside one question. */
  verbatim: boolean;
  tooClose: boolean;
}

interface SideScore { ratio: number; doc?: CorpusDoc; verbatim: boolean }

/** Questions left out of a comparison: by their words, and by the id the corpus knows them under. */
interface Exempt { prints: ReadonlySet<string>; ids: ReadonlySet<string> }

function scoreSide(side: Side, text: string, layers: readonly CorpusIndex[], exempt: Exempt): SideScore {
  const runs = side === 'en' ? enRuns(text) : zhRuns(text);
  const unique = [...new Set(runs)];
  if (!unique.length) return { ratio: 0, verbatim: false };
  const total = layers.reduce((sum, layer) => sum + layer.docs.length, 0);
  const limit = boilerplateLimit(total);
  const frequency = (run: string) => layers.reduce((sum, layer) => sum + ((layer[side].postings.get(run)?.length) ?? 0), 0);
  const rare = new Set(unique.filter((run) => frequency(run) <= limit));

  // Candidate questions: every one holding a run of the draft; the closest by distinctive runs.
  const shared = new Map<CorpusDoc, number>();
  const all = new Map<CorpusDoc, { layer: CorpusIndex; at: number; count: number }>();
  for (const run of unique) {
    const isRare = rare.has(run);
    for (const layer of layers) {
      for (const at of layer[side].postings.get(run) ?? []) {
        const doc = layer.docs[at];
        if (exempt.prints.has(layer.prints[at]) || exempt.ids.has(doc.id)) continue;
        if (isRare) shared.set(doc, (shared.get(doc) ?? 0) + 1);
        const entry = all.get(doc);
        if (entry) entry.count += 1;
        else all.set(doc, { layer, at, count: 1 });
      }
    }
  }
  let closest: CorpusDoc | undefined;
  let best = 0;
  for (const [doc, count] of shared) {
    if (count > best) { best = count; closest = doc; }
  }
  const ratio = rare.size >= MIN_DISTINCTIVE ? best / rare.size : 0;

  // A verbatim run, over the few questions sharing the most runs; or the whole draft inside one.
  const span = side === 'en' ? VERBATIM_WORDS - EN_SHINGLE + 1 : VERBATIM_CHARS - ZH_SHINGLE + 1;
  let verbatim = false;
  let verbatimDoc: CorpusDoc | undefined;
  const candidates = [...all.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 4);
  for (const [doc, { layer, at, count }] of candidates) {
    const held = layer[side].runs[at];
    let run = 0;
    for (const each of runs) {
      run = held.has(each) ? run + 1 : 0;
      if (run >= span) break;
    }
    if (run >= span || (unique.length >= 3 && count === unique.length)) {
      verbatim = true;
      verbatimDoc = doc;
      break;
    }
  }
  return { ratio, doc: verbatimDoc ?? closest, verbatim };
}

/**
 * How close a draft is to the questions in `base` (the bank, the teacher's own, the open
 * paper) and `extra` (the examples and the other drafts: few, indexed on the spot). `exempt`
 * names questions to leave out of the comparison wherever they are held: the reference a
 * teacher picked for strict mode (u-uugw: no limit against it), found by their id (a bank
 * question is named by its source tag, one of the teacher's own `mine:doc/question` in the
 * example and `doc/question` in the corpus) and by their words, so the corpus's own copy of it
 * is left out too.
 */
export function checkNearCopy(text: { en: string; zh: string }, base: CorpusIndex, extra: readonly CorpusDoc[] = [], exempt: readonly CorpusDoc[] = []): NearCopyResult {
  const layers = extra.length ? [base, buildCorpusIndex(extra)] : [base];
  const skip: Exempt = {
    prints: new Set(exempt.map(wordsKey)),
    ids: new Set(exempt.flatMap((doc) => [doc.id, doc.id.replace(/^mine:/, '')])),
  };
  let result: NearCopyResult = { percent: 0, verbatim: false, tooClose: false };
  for (const side of ['en', 'zh'] as const) {
    const score = scoreSide(side, text[side], layers, skip);
    const tooClose = score.ratio >= NEAR_COPY_LIMIT || score.verbatim;
    const worse = Number(tooClose) > Number(result.tooClose) || (tooClose === result.tooClose && score.ratio > result.percent / 100);
    if (worse) {
      result = {
        percent: Math.round(score.ratio * 100),
        ...(score.doc ? { closest: score.doc } : {}),
        side,
        verbatim: score.verbatim,
        tooClose,
      };
    }
  }
  return result;
}
