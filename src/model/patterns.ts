import { topicLabel, topicOf } from './topics';

/**
 * A 題型 (Pattern): a teacher-defined kind of question inside one sub-topic ("Calculate
 * PED from a TR change" under `C.ped`). Stored on the question as a tag of the reserved
 * form `<sub-topic>::<name>`, so it rides on `Question.tags`: never printed, carried by
 * every copy, written to every copy and read as the union of copies like a topic. The
 * name is the identity; the kind (MCQ or LQ) is the question's own registry type, so an
 * MCQ and an LQ 題型 may share a name and are still two 題型.
 *
 * Only a sub-topic can hold 題型. A tag whose prefix is not a sub-topic code is a free tag.
 */

export const PATTERN_SEPARATOR = '::';

/** Longest name kept; longer is cut, not refused. */
export const PATTERN_NAME_MAX = 80;

export interface PatternRef {
  /** A sub-topic code, e.g. 'C.ped'. */
  topic: string;
  name: string;
}

/** Whether a code may hold 題型: a sub-topic, never a coarse topic or a free tag. */
export function holdsPatterns(code: string): boolean {
  return topicOf(code)?.parent !== undefined;
}

/** Whitespace collapsed, trimmed, cut to `PATTERN_NAME_MAX`. */
export function cleanPatternName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, PATTERN_NAME_MAX).trim();
}

/** The tag a question stores for a 題型. */
export function patternTag(topic: string, name: string): string {
  return `${topic}${PATTERN_SEPARATOR}${cleanPatternName(name)}`;
}

/** A 題型 tag's sub-topic and name; undefined for a topic code or a free tag. */
export function parsePatternTag(tag: string): PatternRef | undefined {
  const at = tag.indexOf(PATTERN_SEPARATOR);
  if (at <= 0) return undefined;
  const topic = tag.slice(0, at);
  const name = cleanPatternName(tag.slice(at + PATTERN_SEPARATOR.length));
  return name && holdsPatterns(topic) ? { topic, name } : undefined;
}

export const isPatternTag = (tag: string): boolean => parsePatternTag(tag) !== undefined;

/** A free tag: neither a topic code nor a 題型. */
export const isFreeTag = (tag: string): boolean => !topicOf(tag) && !isPatternTag(tag);

/** Same name, ignoring case and spacing: how a typed name finds an existing 題型. */
export function samePatternName(a: string, b: string): boolean {
  return cleanPatternName(a).toLocaleLowerCase() === cleanPatternName(b).toLocaleLowerCase();
}

/** The 題型 names a question's tags hold under one sub-topic, in tag order. */
export function patternsIn(tags: readonly string[] | undefined, topic: string): string[] {
  const names: string[] = [];
  for (const tag of tags ?? []) {
    const ref = parsePatternTag(tag);
    if (ref && ref.topic === topic && !names.includes(ref.name)) names.push(ref.name);
  }
  return names;
}

/**
 * Tags with the sub-topic's 題型 set to `name` (one per sub-topic), or cleared when
 * `name` is undefined. The tag sits right after its sub-topic code when that is present.
 * The same array when nothing changes.
 */
export function withPattern(tags: readonly string[], topic: string, name: string | undefined): string[] {
  const wanted = name && cleanPatternName(name) ? patternTag(topic, name) : undefined;
  const rest = tags.filter((tag) => parsePatternTag(tag)?.topic !== topic);
  if (wanted === undefined && rest.length === tags.length) return tags as string[];
  if (wanted === undefined) return rest;
  if (tags.length === rest.length + 1 && tags.includes(wanted)) return tags as string[];
  const at = rest.indexOf(topic);
  return at < 0 ? [...rest, wanted] : [...rest.slice(0, at + 1), wanted, ...rest.slice(at + 1)];
}

/** Drop the 題型 tags whose sub-topic is not in `keep`. */
export function withoutOrphanPatterns(tags: readonly string[], keep: (topic: string) => boolean): string[] {
  return tags.filter((tag) => {
    const ref = parsePatternTag(tag);
    return !ref || keep(ref.topic);
  });
}

/** What search matches a tag by: a topic's code and names, a 題型's name, a free tag itself. */
export function tagSearchWords(tag: string): string[] {
  const ref = parsePatternTag(tag);
  if (ref) return [ref.name];
  return [tag, topicLabel(tag, 'en'), topicLabel(tag, 'zh')];
}

/** How a tag reads in quiet chrome: a 題型 by its name, anything else as stored. */
export function tagText(tag: string): string {
  return parsePatternTag(tag)?.name ?? tag;
}
