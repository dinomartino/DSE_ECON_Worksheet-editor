import type { Manifest, PastPaperItem, SearchRow, TopicEntry } from '@/pastpapers/pack';
import { keyPointsOfCode } from './frequency';
import { sourceFromQuestion } from './source';
import type { Shape, SourceQuestion, StudioRequest } from './types';

/**
 * The real questions the studio adds by itself when the teacher picks none (u-7jvk: real
 * examples by default): 3 to 5 HKDSE multiple-choice questions on the chosen key point from
 * the Past paper bank, sent as style references. The pick is weighted: recent HKDSE years
 * first, questions the model can read in words (a picture it cannot see counts less), the
 * shape the teacher asked for, and a mix of plain and combination items when any shape will
 * do. Chosen from the bank's search index, so only the few topics holding the picks are
 * downloaded. Pure over `random` and the bank handed in; nothing here touches a store.
 */

/** References per request: 3 for one draft, 4 for three, 5 for five. */
export const referencesWanted = (count: number): number => (count >= 5 ? 5 : count >= 3 ? 4 : 3);

/** Combination items print their statements as "(1) … (2) …" in the index's words. */
export const isCombinationRow = (row: Pick<SearchRow, 'en' | 'zh'>): boolean => /\(1\)/.test(row.en || row.zh) && /\(2\)/.test(row.en || row.zh);

/** How much a row is worth as a reference; 0 = never. */
export function rowWeight(row: SearchRow, shape: Shape, exact: boolean): number {
  const { exam, year, special } = row.source;
  let weight = exam === 'HKDSE' ? (year === undefined ? (special ? 0.8 : 0.5) : 1 + Math.max(0, Math.min(14, year - 2012)) / 14) : exam === 'HKCEE' ? 0.35 : exam === 'HKALE' ? 0.15 : 0;
  if (row.pictures > 0) weight *= 0.4;
  if (!exact) weight *= 0.5;
  if (shape !== 'any' && isCombinationRow(row) !== (shape === 'combination')) weight *= 0.05;
  return weight;
}

export interface ChooseOptions {
  keyPoint: string;
  shape: Shape;
  sides: readonly ('en' | 'zh')[];
  want: number;
  random?: () => number;
  /** Source tags not to pick again (a pick that could not be read). */
  exclude?: ReadonlySet<string>;
}

/** The rows to ask for, best first: weighted sampling without replacement, then a plain/combination mix for `any`. */
export function chooseReferenceRows(rows: readonly SearchRow[], topics: readonly TopicEntry[], options: ChooseOptions): SearchRow[] {
  const random = options.random ?? Math.random;
  const exactTopics = new Set<string>();
  const looseTopics = new Set<string>();
  for (const topic of topics) {
    for (const code of topic.syllabus ?? []) {
      if (!keyPointsOfCode(code).includes(options.keyPoint)) continue;
      (code === options.keyPoint ? exactTopics : looseTopics).add(topic.id);
    }
  }
  let pool = rows
    .filter((row) => (exactTopics.has(row.topicId) || looseTopics.has(row.topicId)) && !options.exclude?.has(row.source.tag))
    .map((row) => ({ row, weight: rowWeight(row, options.shape, exactTopics.has(row.topicId)) }))
    .filter((entry) => entry.weight > 0);
  // Words on every side the paper prints, when there are enough such questions.
  const worded = pool.filter(({ row }) => options.sides.every((side) => row[side].trim() !== ''));
  if (worded.length >= options.want) pool = worded;
  const picked: typeof pool = [];
  const left = [...pool];
  while (picked.length < options.want && left.length > 0) {
    const total = left.reduce((sum, entry) => sum + entry.weight, 0);
    let at = random() * total;
    let index = 0;
    for (; index < left.length - 1; index += 1) {
      at -= left[index].weight;
      if (at < 0) break;
    }
    picked.push(left.splice(index, 1)[0]);
  }
  if (options.shape === 'any' && picked.length >= 2) {
    const kinds = new Set(picked.map((entry) => isCombinationRow(entry.row)));
    if (kinds.size === 1) {
      const other = left.filter((entry) => isCombinationRow(entry.row) !== [...kinds][0]).sort((a, b) => b.weight - a.weight)[0];
      if (other) {
        picked.sort((a, b) => b.weight - a.weight);
        picked[picked.length - 1] = other;
      }
    }
  }
  return picked.map((entry) => entry.row);
}

/** What `findReferences` needs of the bank (the app's store, or a fake). */
export interface ReferenceBank {
  open(): Promise<void>;
  manifest(): Pick<Manifest, 'topics' | 'search'> | undefined;
  /** The topic's questions, or undefined when it could not be read. */
  items(topicId: string): Promise<PastPaperItem[] | undefined>;
}

/** A bank item as a style reference; undefined when it is not a usable multiple-choice question. */
export function referenceOf(item: PastPaperItem, auto = true): SourceQuestion | undefined {
  const question = item.question;
  if (question.type !== 'mcq' || question.options.length < 2) return undefined;
  const source = sourceFromQuestion(question, { id: item.source.tag || question.id, label: item.provenance.en || item.source.tag, passage: item.stimulus?.blocks });
  return source.answerIndex >= 0 ? (auto ? { ...source, auto: true } : source) : undefined;
}

/**
 * The references for a request: `referencesWanted` real questions on its key point, [] when
 * the bank is not there or holds none. Two rounds, so a pick the bank cannot give is replaced.
 */
export async function findReferences(request: Pick<StudioRequest, 'keyPoint' | 'shape' | 'sides' | 'count'>, bank: ReferenceBank, opts: { random?: () => number; signal?: AbortSignal } = {}): Promise<SourceQuestion[]> {
  try {
    await bank.open();
  } catch {
    return [];
  }
  const manifest = bank.manifest();
  if (!manifest?.search?.length) return [];
  const want = referencesWanted(request.count);
  const found: SourceQuestion[] = [];
  const tried = new Set<string>();
  for (let round = 0; round < 2 && found.length < want; round += 1) {
    if (opts.signal?.aborted) return [];
    const rows = chooseReferenceRows(manifest.search, manifest.topics, { keyPoint: request.keyPoint, shape: request.shape, sides: request.sides, want: want - found.length, random: opts.random, exclude: tried });
    if (rows.length === 0) break;
    for (const row of rows) tried.add(row.source.tag);
    const topicIds = [...new Set(rows.map((row) => row.topicId))];
    const loaded = new Map<string, PastPaperItem[] | undefined>(await Promise.all(topicIds.map(async (id) => [id, await bank.items(id).catch(() => undefined)] as const)));
    for (const row of rows) {
      const item = loaded.get(row.topicId)?.find((candidate) => candidate.source.tag === row.source.tag);
      const reference = item ? referenceOf(item) : undefined;
      if (reference && !found.some((f) => f.id === reference.id)) found.push(reference);
    }
  }
  return found;
}

// ---- picking one by hand (k-0514) ----

/** Rows shown at most for one search. */
export const MAX_FOUND = 30;

/**
 * The bank's questions that match what the teacher typed (every word, in either language, the
 * source line or the tag: "elasticity 2019", "價格彈性", "HKDSE paper 1 Q12"), newest HKDSE first.
 * Nothing typed lists the newest. From the index only: no topic is downloaded to search.
 */
export function searchRows(rows: readonly SearchRow[], query: string, limit = MAX_FOUND): SearchRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const rank = (row: SearchRow) => (row.source.exam === 'HKDSE' ? 3 : row.source.exam === 'HKCEE' ? 2 : 1) * 10_000 + (row.source.year ?? 0);
  return rows
    .filter((row) => words.every((word) => row.searchText.includes(word)))
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, limit);
}

/** One searched row as an example the teacher picked (not an `auto` one); undefined when it cannot be read as a multiple-choice question with a key. */
export async function loadReference(row: SearchRow, bank: Pick<ReferenceBank, 'items'>): Promise<SourceQuestion | undefined> {
  const item = (await bank.items(row.topicId).catch(() => undefined))?.find((candidate) => candidate.source.tag === row.source.tag);
  return item ? referenceOf(item, false) : undefined;
}
