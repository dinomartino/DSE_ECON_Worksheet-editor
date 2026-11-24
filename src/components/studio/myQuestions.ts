import { stimuliServing } from '@/library/stimuli';
import { searchRows } from '@/library/search';
import type { BankGroup, BankRow } from '@/library/types';
import { matchesTopic, rollupTopic, TOPICS } from '@/model/topics';
import type { McqQuestion, Worksheet } from '@/model/types';
import type { PastPaperItem } from '@/pastpapers/pack';
import { sourceFromQuestion } from '@/questionStudio/source';
import type { SourceQuestion } from '@/questionStudio/types';
import { keyPointOfTags } from './studioView';

/**
 * "My questions" in the studio's reference picker (k-0529, u-ov6l): every multiple-choice
 * question in the teacher's own saved papers and 題庫, one entry per question (a `BankGroup`:
 * every copy of one root), to write like. Read-only: a pick loads the owning document and
 * builds the same `SourceQuestion` a past-paper pick builds; nothing is ever written back.
 * Other question types are left out for now (the studio writes MC only) and counted, so the
 * picker can say so.
 */

export const MCQ_TYPE = 'mcq';

/** How far back a question's latest use or making date may be. */
export const WHEN_CHOICES = ['any', 'month', 'half', 'year', 'older'] as const;
export type When = (typeof WHEN_CHOICES)[number];

export interface MyFilter {
  words: string;
  /** A coarse or fine topic code; absent = every topic. */
  topic?: string;
  when: When;
}

export const NO_FILTER: MyFilter = { words: '', when: 'any' };

const DAY_MS = 86_400_000;
const WHEN_DAYS: Record<Exclude<When, 'any' | 'older'>, number> = {
  month: 31,
  half: 183,
  year: 366,
};

/** Whether a use date (ISO) falls in `when`, counted back from `now`. An unreadable date passes only 'any'. */
export function inWhen(usedOn: string, when: When, now: number): boolean {
  if (when === 'any') return true;
  const at = Date.parse(usedOn);
  if (Number.isNaN(at)) return false;
  if (when === 'older') return now - at > WHEN_DAYS.year * DAY_MS;
  return now - at <= WHEN_DAYS[when] * DAY_MS;
}

/** The id a reference from one of the teacher's own questions carries (the 題庫 page's ✦ Write like this uses the same). */
export const mineSourceId = (docId: string, questionId: string) => `mine:${docId}/${questionId}`;

/** `mineSourceId` read back; undefined for any other id (a past-paper tag). */
export function parseMineId(id: string): { docId: string; questionId: string } | undefined {
  const m = /^mine:([^/]+)\/(.+)$/.exec(id);
  return m ? { docId: m[1], questionId: m[2] } : undefined;
}

/** The name a reference shows: its paper's list name and its number there ("Mock 2026 · Q4"). */
export const mineLabel = (docLabel: string, number?: number) => `${docLabel}${number ? ` · Q${number}` : ''}`;

export interface MyEntry {
  group: BankGroup;
  /** The copy shown and picked: the group's lead (newest use). */
  row: BankRow;
  /** When it was last used as a reference here (ms), if it was. */
  recentAt?: number;
}

export interface MyList {
  entries: MyEntry[];
  /** Multiple-choice questions before the filter. */
  total: number;
  /** Questions of other types, never listed (MC only for now). */
  otherTypes: number;
}

/**
 * The listed questions: multiple-choice only, filtered, then the ones recently used as a
 * reference (newest first), then the rest by their latest use or making date, newest first.
 * A word matches any copy of the question (or its paper's title), as the 題庫 search does.
 */
export function myQuestionList(groups: readonly BankGroup[], filter: MyFilter, recent: Readonly<Record<string, number>>, now: number): MyList {
  let otherTypes = 0;
  const mcq: BankGroup[] = [];
  for (const group of groups) {
    if (group.rows[0]?.typeId === MCQ_TYPE) mcq.push(group);
    else otherTypes++;
  }
  const words = filter.words.trim();
  const hits = words
    ? new Set(
        searchRows(
          mcq.flatMap((g) => g.rows),
          { text: words },
        ).map((row) => row.rootId),
      )
    : undefined;
  const entries: MyEntry[] = [];
  for (const group of mcq) {
    const row = group.rows[0];
    if (hits && !hits.has(group.rootId)) continue;
    if (filter.topic && !matchesTopic(row.tags, filter.topic)) continue;
    if (!inWhen(row.usedOn, filter.when, now)) continue;
    const recentAt = recent[group.rootId];
    entries.push(recentAt ? { group, row, recentAt } : { group, row });
  }
  // A stable sort keeps the groups' own newest-first order among the rest.
  entries.sort((a, b) => (b.recentAt ?? 0) - (a.recentAt ?? 0));
  return { entries, total: mcq.length, otherTypes };
}

/** The coarse topics the listed questions are tagged with, in guide order, each with its count. */
export function myTopics(groups: readonly BankGroup[]): { code: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const group of groups) {
    const row = group.rows[0];
    if (row?.typeId !== MCQ_TYPE) continue;
    const coarse = new Set<string>();
    for (const tag of row.tags) {
      const topic = rollupTopic(tag);
      if (topic) coarse.add(topic.parent ?? topic.code);
    }
    for (const code of coarse) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return TOPICS.filter((t) => counts.has(t.code)).map((t) => ({
    code: t.code,
    count: counts.get(t.code) ?? 0,
  }));
}

/** How many entries a page of the list shows; "Show more" adds another. */
export const PAGE_SIZE = 40;

export interface MineReference {
  source: SourceQuestion;
  keyPoint?: string;
  /**
   * The question dressed as a past-paper item, so the studio's compare view and the
   * reference preview draw it as it prints (its own paper's stimulus included).
   */
  item: PastPaperItem;
}

/**
 * One of the teacher's own questions as a studio reference, from its loaded document. The
 * question is read, never changed: the source and item hold copies of its words and blocks.
 * Undefined when the question is gone or is not multiple choice.
 */
export function mineReference(worksheet: Worksheet, questionId: string, label: string, number?: number): MineReference | undefined {
  const found = worksheet.questions.find((q) => q.id === questionId);
  if (!found || found.type !== MCQ_TYPE) return undefined;
  const mcq = structuredClone(found) as McqQuestion;
  const stimulus = stimuliServing(worksheet).get(questionId);
  const lead = stimulus ? structuredClone(stimulus) : undefined;
  return {
    source: sourceFromQuestion(mcq, {
      id: mineSourceId(worksheet.id, questionId),
      label,
      passage: lead?.blocks,
    }),
    keyPoint: keyPointOfTags(mcq.tags),
    item: {
      topicId: '',
      docId: worksheet.id,
      question: mcq,
      ...(lead ? { stimulus: lead } : {}),
      source: { exam: 'other', tag: '', ...(number ? { number } : {}) },
      provenance: { en: label, zh: label },
      excerpt: { en: '', zh: '' },
      searchText: '',
      ...(number ? { number } : {}),
    },
  };
}

// ---- recently used ----

/** Questions used as a reference here, by `rootId` → when (ms). On this computer only. */
export const RECENT_KEY = 'econgen.recentRefs.v1';
const RECENT_MAX = 60;

type Store = Pick<Storage, 'getItem' | 'setItem'> | undefined;
const defaultStore = (): Store => (typeof window === 'undefined' ? undefined : window.localStorage);

export function readRecent(store: Store = defaultStore()): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(store?.getItem(RECENT_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, number> = {};
    for (const [key, at] of Object.entries(raw)) if (typeof at === 'number' && Number.isFinite(at)) out[key] = at;
    return out;
  } catch {
    return {};
  }
}

/** Note a question as just used; the oldest fall off past `RECENT_MAX`. */
export function noteRecent(rootId: string, now: number, store: Store = defaultStore()): Record<string, number> {
  const next = Object.entries({ ...readRecent(store), [rootId]: now })
    .sort((a, b) => b[1] - a[1])
    .slice(0, RECENT_MAX);
  const out = Object.fromEntries(next);
  try {
    store?.setItem(RECENT_KEY, JSON.stringify(out));
  } catch {
    // Storage full or blocked: the order just isn't remembered.
  }
  return out;
}
