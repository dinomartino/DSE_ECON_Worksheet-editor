import { MCQ_SCHEME, mcqTag, mcqTagKey, mcqTopic, type SchemeTopic } from './topicSchemes';
import { isPatternTag, parsePatternTag } from './patterns';
import { isSubTopicCode, isTopicCode, matchesTopic, parentCode, topicDisplay, topicHeading, topicOf, TOPICS, type Topic, type TopicNames } from './topics';

/**
 * **The MCQ view** of a question's tags (k-0569, `Outbox/k-0569/PLAN.md` § 3): which of the
 * teacher's MCQ topics it is under, read from the EDB codes it stores plus any `@mcq:` tag.
 * Nothing is migrated: a saved paper's tags are read as they are, every time.
 *
 * A **view code** is one of:
 *  - a section ('A'…'J', or 'EL1'/'EL2'): somewhere in it, no finer topic ("General");
 *  - `@mcq:<key>`: an MCQ topic (the same string as the tag that may store it);
 *  - an EDB fine code of kind `pick` ('C.intervention'): several MCQ topics fit, none chosen;
 *  - an EDB fine code of kind `edb` ('E.policy', 'EL1.pricing'): no MCQ topic stands for it.
 *
 * How tags read (in this order):
 *  1. an `@mcq:` tag counts while it **agrees**: the list has no topic code, or one it
 *     covers (its own EDB codes, a gap code it is the home of, or their section letter).
 *     So a stale one, left after an older build re-tagged C.intervention as C.ped, is ignored;
 *  2. each EDB code it does not cover: one MCQ topic → that topic; a gap with a home
 *     (`GAP_HOMES`) → the home; several → `pick` (unless one of them is already placed);
 *     none → `edb`; a section letter → its only topic (D, G) or the section itself;
 *  3. a later build's 'C.new' reads as 'C'; free tags and 題型 never count.
 */

/** EDB codes no MCQ topic names, filed under the closest one (the user, D3 of k-0569). */
export const GAP_HOMES: Readonly<Record<string, string>> = {
  'C.individual-demand': 'basic-supply-demand',
  'C.market-demand': 'basic-supply-demand',
  'C.individual-supply': 'basic-supply-demand',
  'C.market-supply': 'basic-supply-demand',
  'A.specialization': 'division-of-labour',
  'F.unemployment': 'unemployment',
  'G.ad': 'adas',
  'G.as': 'adas',
  'G.equilibrium': 'adas',
};

export type ViewKind = 'section' | 'mcq' | 'pick' | 'edb';

/** A node of the MCQ view: `Topic`'s shape (so names, parents and children read alike) plus its kind. */
export interface ViewTopic extends Topic {
  kind: ViewKind;
  /** On `mcq`: the topic's key. */
  key?: string;
  /** On `pick`: the MCQ keys that fit, in list order. */
  candidates?: readonly string[];
  children: ViewTopic[];
}

const ELECTIVES = TOPICS.filter((topic) => topic.code.startsWith('EL'));

const mcqNode = (topic: SchemeTopic): ViewTopic => ({
  code: mcqTag(topic.key),
  en: topic.en,
  zh: topic.zh,
  parent: topic.section,
  kind: 'mcq',
  key: topic.key,
  children: [],
});

/**
 * The sections in order (Mentor's A–J, then the EDB electives, which no MCQ topic covers),
 * each with its MCQ topics as `children`. `pick`/`edb` nodes are not listed: `viewTopicOf`
 * makes them for a row that needs one.
 */
export const VIEW_SECTIONS: readonly ViewTopic[] = [
  ...MCQ_SCHEME.sections.map((section) => ({
    code: section.key,
    en: section.en,
    zh: section.zh,
    kind: 'section' as const,
    children: MCQ_SCHEME.topics.filter((topic) => topic.section === section.key).map(mcqNode),
  })),
  ...ELECTIVES.map((topic) => ({ code: topic.code, en: topic.en, zh: topic.zh, kind: 'section' as const, children: [] })),
];

const SECTION_BY_CODE = new Map(VIEW_SECTIONS.map((section) => [section.code, section]));
const MCQ_BY_CODE = new Map(VIEW_SECTIONS.flatMap((section) => section.children.map((child) => [child.code, child] as const)));

/** EDB fine code → the MCQ keys that name it (by `edb`), in list order. */
const EDB_TO_MCQ = new Map<string, string[]>();
for (const topic of MCQ_SCHEME.topics) {
  for (const code of topic.edb) if (isSubTopicCode(code)) EDB_TO_MCQ.set(code, [...(EDB_TO_MCQ.get(code) ?? []), topic.key]);
}

/** The MCQ keys an EDB fine code can mean: its own topics, else its gap home; [] for none. */
export function mcqCandidates(code: string): string[] {
  const own = EDB_TO_MCQ.get(code);
  if (own) return [...own];
  const home = GAP_HOMES[code];
  return home ? [home] : [];
}

/** Sections with exactly one MCQ topic (D, G): their letter alone means that topic. */
const ONLY_TOPIC = new Map(
  VIEW_SECTIONS.filter((section) => section.kind === 'section' && section.children.length === 1).map((section) => [
    section.code,
    section.children[0].key!,
  ]),
);

const sectionOfEdb = (code: string): string | undefined => {
  const part = parentCode(code) ?? code;
  return SECTION_BY_CODE.has(part) ? part : undefined;
};

const extraNodes = new Map<string, ViewTopic | null>();

/**
 * The view node a view code names: a section, an MCQ topic, or (made on demand) the `pick`
 * or `edb` node of an EDB fine code this build knows. Undefined for anything else.
 */
export function viewTopicOf(code: string): ViewTopic | undefined {
  const known = SECTION_BY_CODE.get(code) ?? MCQ_BY_CODE.get(code);
  if (known) return known;
  if (!extraNodes.has(code)) extraNodes.set(code, makeExtra(code));
  return extraNodes.get(code) ?? undefined;
}

function makeExtra(code: string): ViewTopic | null {
  const edb = topicOf(code);
  if (!edb?.parent) return null;
  const candidates = EDB_TO_MCQ.get(code);
  if (candidates && candidates.length > 1) {
    const section = mcqTopic(candidates[0])!.section;
    return { code, en: edb.en, zh: edb.zh, parent: section, kind: 'pick', candidates, children: [] };
  }
  if (candidates?.length === 1 || GAP_HOMES[code]) return null; // never a node: it reads as its topic
  const section = sectionOfEdb(code);
  return section ? { code, en: edb.en, zh: edb.zh, parent: section, kind: 'edb', children: [] } : null;
}

/** The section a view code sits in ('C' for 'C', '@mcq:quota' or 'C.intervention'). */
export function viewSectionOf(code: string): string | undefined {
  const node = viewTopicOf(code);
  return node ? (node.parent ?? node.code) : undefined;
}

/** An EDB code as this build reads it: known, else (a later build's 'C.new') its known section; else undefined. */
function readCode(tag: string): string | undefined {
  if (topicOf(tag)) return tag;
  const parent = parentCode(tag);
  return parent && topicOf(parent) ? parent : undefined;
}

/** Whether an MCQ topic stands for this EDB code: one of its codes, a gap it is home to, or their section. */
export function mcqCovers(topic: SchemeTopic, code: string): boolean {
  if (topic.edb.includes(code) || GAP_HOMES[code] === topic.key) return true;
  return !isSubTopicCode(code) && topic.edb.some((own) => (parentCode(own) ?? own) === code);
}

const ORDER = new Map<string, number>();
VIEW_SECTIONS.forEach((section, s) => {
  ORDER.set(section.code, s * 1000);
  section.children.forEach((child, c) => ORDER.set(child.code, s * 1000 + 1 + c));
});
/** Sort key: sections in order; inside one, MCQ topics in list order, then `pick`, then `edb` (EDB order). */
export function viewOrder(code: string): number {
  return orderOf(code);
}

function orderOf(code: string): number {
  const known = ORDER.get(code);
  if (known !== undefined) return known;
  const node = viewTopicOf(code);
  const section = ORDER.get(node?.parent ?? '') ?? 1e6;
  const edbOrder = EDB_ORDER.get(code) ?? 0;
  return section + (node?.kind === 'pick' ? 200 : 400) + edbOrder;
}
const EDB_ORDER = new Map(TOPICS.flatMap((topic) => topic.children.map((child, index) => [child.code, index] as const)));

const cache = new Map<string, string[]>();

/** The view codes a tag list falls under, each once, in view order (see the module note). */
export function viewCodesOf(tags: readonly string[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];
  const id = tags.join('\u0000');
  const hit = cache.get(id);
  if (hit) return hit;
  const result = derive(tags);
  if (cache.size > 5000) cache.clear();
  cache.set(id, result);
  return result;
}

function derive(tags: readonly string[]): string[] {
  const codes = [...new Set(tags.filter((tag): tag is string => typeof tag === 'string' && isTopicCode(tag)).map(readCode))].filter(
    (code): code is string => code !== undefined,
  );
  const placed = new Set<string>();
  const covered = new Set<string>();
  for (const tag of tags) {
    const key = mcqTagKey(tag);
    const topic = key ? mcqTopic(key) : undefined;
    if (!topic) continue;
    const covers = codes.filter((code) => mcqCovers(topic, code));
    if (codes.length > 0 && covers.length === 0) continue; // stale: its codes are gone
    placed.add(topic.key);
    for (const code of covers) covered.add(code);
  }
  const out = new Set<string>();
  const picks: string[] = [];
  const sections: string[] = [];
  for (const code of codes) {
    if (covered.has(code)) continue;
    if (!isSubTopicCode(code)) {
      const only = ONLY_TOPIC.get(code);
      if (only) placed.add(only);
      else if (SECTION_BY_CODE.has(code)) sections.push(code);
      continue;
    }
    const candidates = mcqCandidates(code);
    if (candidates.length === 1) placed.add(candidates[0]);
    else if (candidates.length > 1) picks.push(code);
    else if (viewTopicOf(code)) out.add(code);
  }
  for (const code of picks) if (!mcqCandidates(code).some((key) => placed.has(key))) out.add(code);
  for (const key of placed) out.add(mcqTag(key));
  for (const section of sections) {
    // A section letter beside something finer in that section says nothing more.
    if (![...out].some((code) => viewSectionOf(code) === section)) out.add(section);
  }
  return [...out].sort((a, b) => orderOf(a) - orderOf(b));
}

/** Whether a tag list falls under a view code: the code itself, or (a section) anything in it. */
export function matchesView(tags: readonly string[] | undefined, code: string): boolean {
  const node = viewTopicOf(code);
  if (!node) return false;
  const codes = viewCodesOf(tags);
  return node.kind === 'section' ? codes.some((own) => viewSectionOf(own) === code) : codes.includes(code);
}

/**
 * A bank query's topic: a view code reads through the MCQ view (`matchesView`); an EDB code
 * the view does not name ('C.ped', which reads as an MCQ topic) as before (`matchesTopic`).
 */
export function matchesBankTopic(tags: readonly string[] | undefined, code: string): boolean {
  return viewTopicOf(code) ? matchesView(tags, code) : matchesTopic(tags, code);
}

/** Has some view code at all: what "tagged" means in the bank (same as having a known EDB code or MCQ topic). */
export const hasViewTopic = (tags: readonly string[] | undefined): boolean => viewCodesOf(tags).length > 0;

/** Sections a tag list falls under, each once, in order. */
export function viewSections(tags: readonly string[] | undefined): string[] {
  return [...new Set(viewCodesOf(tags).map((code) => viewSectionOf(code)!))];
}

/** A view code's name: an MCQ topic's own, a `pick`/`edb` node's EDB name, a section's name; else as stored. */
export function viewDisplay(code: string, names: TopicNames = 'en'): string {
  const node = viewTopicOf(code);
  if (!node) return code;
  return names === 'both' ? `${node.en} ${node.zh}` : node[names];
}

/** With its section letter first, where the topic is not otherwise clear: "C · Per-unit Tax". */
export function viewHeading(code: string, names: TopicNames = 'en'): string {
  const node = viewTopicOf(code);
  if (!node) return code;
  return `${node.parent ?? node.code} · ${viewDisplay(code, names)}`;
}

/** A code as a bank screen names it: a view code by the view, any other EDB code ('C.ped') by `topics.ts`, a free tag as stored. */
export function bankTopicDisplay(code: string, names: TopicNames = 'en'): string {
  return viewTopicOf(code) ? viewDisplay(code, names) : topicDisplay(code, names);
}

/** The same with its section letter first ("C · Per-unit Tax"). */
export function bankTopicHeading(code: string, names: TopicNames = 'en'): string {
  return viewTopicOf(code) ? viewHeading(code, names) : topicHeading(code, names);
}

/**
 * A tag list as a bank row's tag line reads it: the view codes it falls under, then its
 * free tags as stored, and a code this build cannot read at all (a later build's 'K') as
 * stored too, so nothing kept is hidden. EDB codes and `@mcq:` tags never show raw; 題型
 * are left to the caller.
 */
export function viewTagList(tags: readonly string[]): string[] {
  return [
    ...viewCodesOf(tags),
    ...tags.filter((tag) => (isTopicCode(tag) ? readCode(tag) === undefined : mcqTagKey(tag) === undefined && !isPatternTag(tag))),
  ];
}

/* ------------------------------------------------------------------------------------ */
/* Writing                                                                              */
/* ------------------------------------------------------------------------------------ */

/** The EDB codes in a list that already stand for a topic: fine codes it covers, or a section letter meaning only it (D, G). */
function codesSaying(topic: SchemeTopic, tags: readonly string[]): string[] {
  return tags.filter(
    (own) => isTopicCode(own) && topicOf(own) !== undefined && mcqCovers(topic, own) && (isSubTopicCode(own) || ONLY_TOPIC.get(own) === topic.key),
  );
}

/** `next` in `before`'s order (what stays keeps its place), then what is new, in `next`'s order. */
function inPlace(before: readonly string[], next: readonly string[]): string[] {
  const wanted = new Set(next);
  const kept = before.filter((tag) => wanted.has(tag));
  return [...new Set([...kept, ...next.filter((tag) => !before.includes(tag))])];
}

/** A list without `codes` and the 題型 that hang on them. */
function withoutCodes(tags: readonly string[], codes: ReadonlySet<string>): string[] {
  return tags.filter((tag) => !codes.has(tag) && !(isPatternTag(tag) && codes.has(parsePatternTag(tag)!.topic)));
}

/**
 * A tag list made to fall under exactly `want` (view codes, or EDB codes), as one write
 * (the topic picker's Apply, "Set topic … replace"):
 *  - an MCQ topic keeps the EDB codes already there that say it, else gains all its own;
 *    its `@mcq:` tag is written only when those codes alone do not say it;
 *  - a section, `pick` or `edb` code, or an EDB code that reads as an MCQ topic, is itself;
 *  - every other code and `@mcq:` tag this build reads goes; what it cannot read (a later
 *    build's 'C.new' or 'K', a later list's key) stays; a 題型 stays while its sub-topic does;
 *    free and other system tags stay, after the topics (as `replaceTopics` always wrote).
 */
export function withViewCodes(tags: readonly string[], want: readonly string[]): string[] {
  const codes: string[] = [];
  const keys: string[] = [];
  for (const code of new Set(want)) {
    const node = viewTopicOf(code);
    if (!node) {
      if (topicOf(code)) codes.push(code);
      continue;
    }
    if (node.kind === 'mcq') {
      const topic = mcqTopic(node.key!)!;
      keys.push(topic.key);
      const kept = codesSaying(topic, tags);
      codes.push(...(kept.length > 0 ? kept : topic.edb));
    } else if (node.kind === 'section' && tags.some((own) => isTopicCode(own) && !topicOf(own) && readCode(own) === code)) {
      // A later build's 'C.new', kept below, already says the section.
    } else {
      codes.push(code);
    }
  }
  const finalCodes = [...new Set(codes)];
  const said = new Set(viewCodesOf(finalCodes));
  const mcqTags = keys.filter((key) => !said.has(mcqTag(key))).map(mcqTag);
  const rest = tags.filter((tag) => {
    if (isTopicCode(tag)) return !topicOf(tag);
    const key = mcqTagKey(tag);
    if (key !== undefined) return !mcqTopic(key);
    if (isPatternTag(tag)) return finalCodes.includes(parsePatternTag(tag)!.topic);
    return true;
  });
  return [...new Set([...finalCodes, ...mcqTags, ...rest])];
}

/**
 * One view code added, touching nothing else: a section, `pick` or `edb` code (or an EDB
 * code) goes on as itself; an MCQ topic gains its EDB codes when none there says it, and its
 * `@mcq:` tag when the codes alone do not (so picking one for a `pick` row resolves it).
 */
export function addViewCode(tags: readonly string[], code: string): string[] {
  const node = viewTopicOf(code);
  if (node?.kind !== 'mcq') return tags.includes(code) ? [...tags] : [...tags, code];
  if (viewCodesOf(tags).includes(code)) return [...tags];
  const topic = mcqTopic(node.key!)!;
  const withCodes = codesSaying(topic, tags).length > 0 ? [...tags] : inPlace(tags, [...tags, ...topic.edb]);
  return viewCodesOf(withCodes).includes(code) ? withCodes : [...withCodes, mcqTag(topic.key)];
}

/**
 * One view code taken off, touching nothing else. An MCQ topic: its `@mcq:` tag, and the EDB
 * codes that said it unless another topic left on the list still needs them, with their 題型.
 * A section: its letter, and a later build's codes there. Any other code: itself, as stored.
 */
export function removeViewCode(tags: readonly string[], code: string): string[] {
  const node = viewTopicOf(code);
  if (node?.kind === 'mcq') {
    const topic = mcqTopic(node.key!)!;
    const others = viewCodesOf(tags).filter((own) => own !== code);
    const needed = (own: string) =>
      others.some((other) => {
        if (other === own) return true;
        const key = mcqTagKey(other);
        const otherTopic = key ? mcqTopic(key) : undefined;
        return otherTopic !== undefined && mcqCovers(otherTopic, own);
      });
    const gone = new Set(tags.filter((own) => isTopicCode(own) && topicOf(own) && mcqCovers(topic, own) && !needed(own)));
    gone.add(mcqTag(topic.key));
    return withoutCodes(tags, gone);
  }
  if (node?.kind === 'section') {
    return withoutCodes(tags, new Set([code, ...tags.filter((own) => isTopicCode(own) && !topicOf(own) && readCode(own) === code)]));
  }
  return withoutCodes(tags, new Set([code]));
}
