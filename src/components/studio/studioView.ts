import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { PastPaperItem } from '@/pastpapers/pack';
import { buildsOf, materialize } from '@/questionStudio/deliver';
import type { SheetDraft } from '@/questionStudio/session';
import { type TopicNames } from '@/model/topics';
import type { CheckRow, StudioDraft } from '@/questionStudio/types';
import { lookupCode, SYLLABUS } from '@/syllabus';
import { toRuns } from '@/generate/validate';

/** The Question studio screen's pure half: what its lists and cards are made of. */

export interface KeyPointGroup {
  code: string;
  name: string;
  options: Array<{ code: string; name: string }>;
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

/** The key point a question's tags name (a topic code, or the topic part of a pattern tag), if any. */
export function keyPointOfTags(tags: readonly string[] | undefined): string | undefined {
  for (const tag of tags ?? []) {
    const code = tag.split('::')[0];
    const hit = lookupCode(code);
    if (hit && !hit.point) return code;
  }
  return undefined;
}

/** Drafts the teacher can use (in the order the sheet has them), and those left out by a hard check. */
export function partition(entries: readonly SheetDraft[]): { standing: SheetDraft[]; leftOut: SheetDraft[] } {
  return {
    standing: entries.filter((e) => e.draft.status !== 'failed'),
    leftOut: entries.filter((e) => e.draft.status === 'failed'),
  };
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
