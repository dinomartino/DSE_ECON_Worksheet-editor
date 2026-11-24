import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { PastPaperItem } from '@/pastpapers/pack';
import { buildsOf, materialize } from '@/questionStudio/deliver';
import type { SheetDraft } from '@/questionStudio/session';
import { type TopicNames } from '@/model/topics';
import { countOf, type KeyPointCounts } from '@/questionStudio/frequency';
import type { CheckRow, StudioDraft } from '@/questionStudio/types';
import { lookupCode, SYLLABUS } from '@/syllabus';
import { toRuns } from '@/generate/validate';

/** The Question studio screen's pure half: what its lists and cards are made of. */

export interface KeyPointGroup {
  code: string;
  name: string;
  options: Array<{ code: string; name: string; /** HKDSE questions, when the bank's index is there to count. */ count?: number }>;
}

/**
 * A syllabus name ({en, zh}: a topic, key point or point) as `names` asks: topic names are
 * paper words (`model/topics.ts` → `topicNamesFor`), so the studio names them in the
 * language it writes in, never the interface's (k-0500).
 */
export function syllabusName(name: { en: string; zh: string }, names: TopicNames): string {
  if (names === 'both') return name.en === name.zh ? name.en : `${name.en} ${name.zh}`;
  return name[names] || name.en;
}

/** The syllabus's topics and their key points, named as `names` asks (the studio's language). */
export function keyPointGroups(names: TopicNames): KeyPointGroup[] {
  return SYLLABUS.topics.map((topic) => ({
    code: topic.code,
    name: syllabusName(topic, names),
    options: topic.keyPoints.map((keyPoint) => ({ code: keyPoint.code, name: syllabusName(keyPoint, names) })),
  }));
}

export interface RankedKeyPoints {
  /** Topics by how many HKDSE questions they hold, their key points likewise (ties keep syllabus order). */
  groups: KeyPointGroup[];
  /** Key points HKDSE has never asked (no multiple-choice question since 2012), folded away until asked for. */
  folded: KeyPointGroup[];
}

/**
 * The key point list as the teacher sees it once the bank's index can count (u-7jvk): each key
 * point carries its HKDSE count, the list is sorted by it, and the key points DSE never asks
 * are folded into `folded` (the one chosen stays where it is). Without counts the list is the
 * syllabus's own, nothing folded.
 */
export function rankKeyPoints(groups: readonly KeyPointGroup[], counts: KeyPointCounts | undefined, keep = ''): RankedKeyPoints {
  if (!counts) return { groups: [...groups], folded: [] };
  const ranked: Array<{ group: KeyPointGroup; total: number; at: number }> = [];
  const folded: KeyPointGroup[] = [];
  groups.forEach((group, at) => {
    const withCount = group.options.map((option, order) => ({ option: { ...option, count: countOf(counts, option.code) }, order }));
    const shown = withCount.filter(({ option }) => option.count > 0 || option.code === keep).sort((a, b) => b.option.count - a.option.count || a.order - b.order);
    const never = withCount.filter(({ option }) => option.count === 0 && option.code !== keep).map(({ option }) => option);
    if (never.length) folded.push({ code: group.code, name: group.name, options: never });
    if (shown.length) ranked.push({ group: { ...group, options: shown.map(({ option }) => option) }, total: shown.reduce((sum, { option }) => sum + (option.count ?? 0), 0), at });
  });
  ranked.sort((a, b) => b.total - a.total || a.at - b.at);
  return { groups: ranked.map(({ group }) => group), folded };
}

/** The key point a question's tags name (a topic code, or the topic part of a pattern tag), if any. */
export function keyPointOfTags(tags: readonly string[] | undefined): string | undefined {
  for (const tag of tags ?? []) {
    const code = tag.split('::')[0];
    const hit = lookupCode(code);
    if (hit && !hit.point) return code;
  }
  return undefined;
}

const LETTERS = 'ABCD';
export const letterOf = (index: number): string => LETTERS[index] ?? '?';

/** 18420 → "18.4k"; under a thousand as is. */
export function tokenCount(n: number): string {
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, '')}k`;
}

/** A draft as the Past paper bank's card draws a question, so its preview is the card's own. */
export function draftItem(entry: SheetDraft): PastPaperItem | undefined {
  const build = buildsOf([entry])[0];
  const question = build ? materialize(build) : undefined;
  if (!question) return undefined;
  return {
    topicId: '',
    docId: '',
    question,
    source: { exam: 'other', tag: '' },
    provenance: { en: '', zh: '' },
    excerpt: { en: '', zh: '' },
    searchText: '',
  };
}

/** The explanation as plain lines, one per side the draft was written in. */
export function explanationLines(draft: StudioDraft['draft'], sides: readonly Side[]): string[] {
  return sides.map((side) => plain(toRuns(draft.explanation[side])).trim()).filter(Boolean);
}

/** The words of a stem, for a card with no preview: one line per side. */
export function stemLines(draft: StudioDraft['draft'], sides: readonly Side[]): string[] {
  return sides.map((side) => plain(toRuns(draft.stem[side])).trim()).filter(Boolean);
}

/** The check row for an id, if the draft has it. */
export const rowOf = (draft: StudioDraft, id: CheckRow['id']): CheckRow | undefined => draft.checks.find((c) => c.id === id);
