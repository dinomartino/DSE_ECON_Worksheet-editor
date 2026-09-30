import { roundMinutes, MINUTES_PER_MARK } from '@/model/paperSummary';
import { rollupTopic, topicDisplay, topicHeading, topicLabel, topicOf, TOPICS } from '@/model/topics';
import { getQuestionType, listQuestionTypes } from '@/registry';
import { cohortLabel, schoolYearEnd, schoolYearLabel, type ClassTarget } from '@/library/cohort';
import { refsOf, rowUsedWith } from '@/library/history';
import { rowHasPattern, type PatternId } from '@/library/patterns';
import { searchRows } from '@/library/search';
import { isPatternTag, parsePatternTag } from '@/model/patterns';
import type { BankGroup, BankRow } from '@/library/types';
import type { WorksheetSummary } from '@/storage/types';

/**
 * The Question bank screen's data half: coverage (the topic cards), filters, the
 * selection tray's sums and the Add-to target. Types reach it only through the registry.
 * Every count is of distinct questions (`rootId`), so a question copied into three
 * papers counts once, as the list shows it once.
 */

/** A review's scope: every question, one topic code, or those with no topic. */
export type TopicPick = 'all' | 'untagged' | string;

/**
 * A row has a topic when any of its tags falls under a known code (`rollupTopic`: a later
 * build's 'C.new' counts under C); free tags do not count.
 */
export function hasTopic(row: Pick<BankRow, 'tags'>): boolean {
  return row.tags.some((tag) => rollupTopic(tag) !== undefined);
}

/** The coarse codes a row falls under ('C.ped' → 'C', and a later build's 'C.new' → 'C'), each once. */
export function coarseCodes(row: Pick<BankRow, 'tags'>): string[] {
  const codes = new Set<string>();
  for (const tag of row.tags) {
    const topic = rollupTopic(tag);
    if (topic) codes.add(topic.parent ?? topic.code);
  }
  return [...codes];
}

export interface CoverageBar {
  code: string;
  /** Distinct questions per type id, in registry order. */
  byType: { typeId: string; count: number }[];
  total: number;
  /** Few enough to warrant the amber floor rule. */
  thin: boolean;
}

export interface Coverage {
  bars: CoverageBar[];
  /** The tallest bar's total: every bar is drawn to this one scale. */
  max: number;
  /** Distinct questions with no topic code. */
  untagged: number;
  /** Distinct questions in the bank. */
  total: number;
  /** Type ids present anywhere, in registry order (the legend). */
  typeIds: string[];
  /** Documents the rows come from: papers and bank documents. */
  papers: number;
  banks: number;
}

/** Thin: under a fifth of the tallest bar, and never above 3 questions as the floor. */
export function isThin(total: number, max: number): boolean {
  return max > 0 && total < Math.max(3, Math.round(max * 0.2));
}

/**
 * Height in px of a bar segment on the shared scale. The scale is the tallest topic bar
 * (untagged is not a bar, so it never flattens the rest); an empty topic is 0.
 */
export function barPx(count: number, max: number, full: number): number {
  return count > 0 && max > 0 ? Math.max(2, (count / max) * full) : 0;
}

/** A topic card's filled width, in % of its track, on the same scale: never under 2% when not empty. */
export function barPercent(count: number, max: number): number {
  return count > 0 && max > 0 ? Math.max(2, (count / max) * 100) : 0;
}

/** One bar per coarse topic (A–J, EL1, EL2), each question counted once per topic it touches. */
export function coverage(rows: readonly BankRow[]): Coverage {
  const typeOrder = listQuestionTypes().map((type) => type.id);
  const byTopic = new Map<string, Map<string, Set<string>>>();
  const untagged = new Set<string>();
  const all = new Set<string>();
  const seenTypes = new Set<string>();
  const docs = new Map<string, BankRow['docKind']>();
  for (const row of rows) {
    docs.set(row.docId, row.docKind);
    all.add(row.rootId);
    seenTypes.add(row.typeId);
    const codes = coarseCodes(row);
    if (codes.length === 0) untagged.add(row.rootId);
    for (const code of codes) {
      const types = byTopic.get(code) ?? new Map<string, Set<string>>();
      byTopic.set(code, types);
      const roots = types.get(row.typeId) ?? new Set<string>();
      types.set(row.typeId, roots);
      roots.add(row.rootId);
    }
  }
  // A question tagged under a topic in one copy and untagged in another is tagged.
  for (const types of byTopic.values()) for (const roots of types.values()) for (const root of roots) untagged.delete(root);

  const ordered = [...typeOrder.filter((id) => seenTypes.has(id)), ...[...seenTypes].filter((id) => !typeOrder.includes(id)).sort()];
  const bars = TOPICS.map((topic) => {
    const types = byTopic.get(topic.code);
    const byType = ordered.map((typeId) => ({ typeId, count: types?.get(typeId)?.size ?? 0 }));
    const roots = new Set<string>();
    for (const set of types?.values() ?? []) for (const root of set) roots.add(root);
    return { code: topic.code, byType, total: roots.size, thin: false };
  });
  const max = Math.max(0, ...bars.map((bar) => bar.total));
  for (const bar of bars) bar.thin = isThin(bar.total, max);
  const kinds = [...docs.values()];
  return {
    bars,
    max,
    untagged: untagged.size,
    total: all.size,
    typeIds: ordered,
    papers: kinds.filter((kind) => kind === 'paper').length,
    banks: kinds.filter((kind) => kind === 'bank').length,
  };
}

/* ------------------------------------------------------------------------------------ */
/* Filters                                                                              */
/* ------------------------------------------------------------------------------------ */

export type MarksBand = 'any' | '1' | '2-4' | '5-8' | '9+';
export type Since = 'ever' | 'year' | '12m' | '6m';
export type SourceFilter = 'all' | 'paper' | 'bank';

export interface BankFilters {
  text: string;
  topic: TopicPick;
  typeId?: string;
  marks: MarksBand;
  /** Leave out questions used with these students (a cohort, or a class by name)… */
  notUsedWith?: ClassChoice;
  /** …on a paper sat since this point. */
  since: Since;
  source: SourceFilter;
  /** One 題型: its type and its name under its sub-topic. */
  pattern?: PatternId;
}

export const DEFAULT_FILTERS: BankFilters = { text: '', topic: 'all', marks: 'any', since: 'ever', source: 'all' };

export const MARKS_BANDS: { value: MarksBand; label: string; min?: number; max?: number }[] = [
  { value: 'any', label: 'Any marks' },
  { value: '1', label: '1 mark', min: 1, max: 1 },
  { value: '2-4', label: '2–4 marks', min: 2, max: 4 },
  { value: '5-8', label: '5–8 marks', min: 5, max: 8 },
  { value: '9+', label: '9+ marks', min: 9 },
];

export const SINCE_CHOICES: { value: Since; label: string }[] = [
  { value: 'ever', label: 'at any time' },
  { value: 'year', label: 'this school year' },
  { value: '12m', label: 'in the last 12 months' },
  { value: '6m', label: 'in the last 6 months' },
];

/** The first day (`YYYY-MM-DD`, local) a use date must reach; undefined = any time. School years start 1 Sep. */
export function sinceDate(since: Since, now: Date): string | undefined {
  if (since === 'ever') return undefined;
  if (since === 'year') return `${now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1}-09-01`;
  const back = new Date(now);
  back.setMonth(back.getMonth() - (since === '12m' ? 12 : 6));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${back.getFullYear()}-${pad(back.getMonth() + 1)}-${pad(back.getDate())}`;
}

/** One entry in the Class filter: a DSE cohort and the classes it has been, or a class with no form in its name. */
export interface ClassChoice {
  /** Stable across renders: `dse:2027` or `class:<key>`. */
  id: string;
  /** "DSE 2027", or the class as first spelled. */
  label: string;
  /** A cohort's classes by school year, "4A 24-25, 5A 5B 25-26"; absent for a plain class. */
  detail?: string;
  target: ClassTarget;
}

/**
 * The Class filter's words for one choice. `closed` fits the closed select (the chosen
 * option shows it); `open` is the whole story, for the open list; `note` repeats a
 * cohort's classes under the select, since the closed label leaves them out.
 */
export function classChoiceText(choice: ClassChoice): { closed: string; open: string; note?: string } {
  const closed = `Not used with ${choice.label}`;
  if (!choice.detail) return { closed, open: closed };
  return { closed, open: `${closed} (${choice.detail})`, note: `Same students: ${choice.detail}` };
}

/**
 * Whom papers were sat by: each DSE cohort (oldest first), then each class whose name has
 * no form number, by name. Drafts and banks name no one.
 */
export function classChoices(rows: readonly BankRow[]): ClassChoice[] {
  const cohorts = new Map<number, Map<string, { name: string; year: number }>>();
  const plain = new Map<string, string>();
  for (const row of rows) {
    if (row.docKind !== 'paper') continue;
    for (const ref of refsOf(row)) {
      if (ref.cohort === undefined) {
        if (!plain.has(ref.key)) plain.set(ref.key, ref.name);
        continue;
      }
      const year = schoolYearEnd(row.usedOn) ?? 0;
      const members = cohorts.get(ref.cohort) ?? new Map<string, { name: string; year: number }>();
      cohorts.set(ref.cohort, members);
      const member = `${year} ${ref.key}`;
      if (!members.has(member)) members.set(member, { name: ref.name, year });
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  const cohortChoices = [...cohorts]
    .sort(([a], [b]) => a - b)
    .map(([cohort, members]): ClassChoice => {
      const years = new Map<number, string[]>();
      for (const { name, year } of members.values()) years.set(year, [...(years.get(year) ?? []), name]);
      const detail = [...years]
        .sort(([a], [b]) => a - b)
        .map(([year, names]) => `${names.sort(byName).join(' ')} ${schoolYearLabel(year)}`)
        .join(', ');
      return { id: `dse:${cohort}`, label: cohortLabel(cohort), detail, target: { cohort } };
    });
  const plainChoices = [...plain]
    .sort(([, a], [, b]) => byName(a, b))
    .map(([key, name]): ClassChoice => ({ id: `class:${key}`, label: name, target: { key } }));
  return [...cohortChoices, ...plainChoices];
}

/**
 * The rows the page's filters admit. Text, topic, type and marks go through `searchRows`;
 * untagged, source and "not used with <class> since…" are this page's own.
 */
export function filterRows(rows: readonly BankRow[], filters: BankFilters, now = new Date()): BankRow[] {
  const band = MARKS_BANDS.find((b) => b.value === filters.marks);
  const topic = filters.topic === 'all' || filters.topic === 'untagged' ? undefined : filters.topic;
  const matched = searchRows(rows, {
    text: filters.text,
    ...(topic ? { topic } : {}),
    ...(filters.typeId ? { typeId: filters.typeId } : {}),
    ...(band && band.value !== 'any' ? { marks: { min: band.min, max: band.max } } : {}),
  });
  const cutoff = sinceDate(filters.since, now);
  const target = filters.notUsedWith?.target;
  const used = target
    ? new Set(
        rows
          .filter((row) => rowUsedWith(row, [target]) && (cutoff === undefined || row.usedOn.slice(0, 10) >= cutoff))
          .map((row) => row.rootId),
      )
    : undefined;
  const tagged = filters.topic === 'untagged' ? new Set(rows.filter(hasTopic).map((row) => row.rootId)) : undefined;
  return matched.filter(
    (row) =>
      (!tagged || !tagged.has(row.rootId)) &&
      (filters.source === 'all' || row.docKind === filters.source) &&
      (!filters.pattern || rowHasPattern(row, filters.pattern)) &&
      (!used || !used.has(row.rootId)),
  );
}

/** One narrowing filter, named the way the empty state says it. */
export interface ActiveFilter {
  key: keyof BankFilters;
  label: string;
}

export function activeFilters(filters: BankFilters): ActiveFilter[] {
  const active: ActiveFilter[] = [];
  if (filters.text.trim()) active.push({ key: 'text', label: `“${filters.text.trim()}”` });
  if (filters.topic === 'untagged') active.push({ key: 'topic', label: 'untagged' });
  else if (filters.topic !== 'all') active.push({ key: 'topic', label: topicHeading(filters.topic) });
  if (filters.typeId) active.push({ key: 'typeId', label: typeName(filters.typeId) });
  if (filters.marks !== 'any') active.push({ key: 'marks', label: MARKS_BANDS.find((b) => b.value === filters.marks)?.label ?? '' });
  if (filters.notUsedWith) {
    const since = filters.since === 'ever' ? '' : ` ${SINCE_CHOICES.find((s) => s.value === filters.since)?.label}`;
    active.push({ key: 'notUsedWith', label: `not used with ${filters.notUsedWith.label}${since}` });
  }
  if (filters.source !== 'all') active.push({ key: 'source', label: filters.source === 'bank' ? 'from banks' : 'from worksheets' });
  if (filters.pattern) active.push({ key: 'pattern', label: `題型 ${filters.pattern.name}` });
  return active;
}

/** Filters with one of them back at its default. */
export function clearFilter(filters: BankFilters, key: keyof BankFilters): BankFilters {
  if (key === 'notUsedWith') return { ...filters, notUsedWith: undefined, since: 'ever' };
  if (key === 'typeId') return { ...filters, typeId: undefined };
  if (key === 'pattern') return { ...filters, pattern: undefined };
  return { ...filters, [key]: DEFAULT_FILTERS[key] };
}

/** The registry's short label ("MCQ", "LQ"); the plural reads fine unpluralised. */
export function typeName(typeId: string): string {
  const summary = getQuestionType(typeId)?.summary;
  const label = (summary?.short ?? summary?.label)?.en ?? typeId;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Each distinct version of a group once (its newest copy), newest first. */
export function distinctVersions(group: BankGroup): BankRow[] {
  const seen = new Set<string>();
  return group.rows.filter((row) => {
    if (seen.has(row.contentKey)) return false;
    seen.add(row.contentKey);
    return true;
  });
}

/* ------------------------------------------------------------------------------------ */
/* Selection tray                                                                       */
/* ------------------------------------------------------------------------------------ */

export interface TraySummary {
  count: number;
  marks: number;
  /** Estimated working minutes at the classroom pace (`paperSummary.ts`). */
  minutes: number;
  /** Topic codes by how many picked questions carry them, most first; ties by guide order. */
  mix: { code: string; count: number }[];
}

/** One question's minutes, by the paper summary's rule: its type's per-item pace, else marks. */
export function rowMinutes(row: Pick<BankRow, 'typeId' | 'marks'>): number {
  return getQuestionType(row.typeId)?.summary?.minutesPerItem ?? row.marks * MINUTES_PER_MARK.classroom;
}

const GUIDE_ORDER = new Map(
  TOPICS.flatMap((topic) => [topic, ...topic.children]).map((topic, index) => [topic.code, index] as const),
);

export function traySummary(rows: readonly BankRow[]): TraySummary {
  const mix = new Map<string, number>();
  for (const row of rows) {
    for (const tag of new Set(row.tags)) if (topicOf(tag)) mix.set(tag, (mix.get(tag) ?? 0) + 1);
  }
  return {
    count: rows.length,
    marks: rows.reduce((sum, row) => sum + row.marks, 0),
    minutes: roundMinutes(rows.reduce((sum, row) => sum + rowMinutes(row), 0)),
    mix: [...mix]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || (GUIDE_ORDER.get(a.code) ?? 0) - (GUIDE_ORDER.get(b.code) ?? 0)),
  };
}

/** "Price elasticity of demand ×3, Market intervention ×1"; the first three, then "+N more". */
export function mixLabel(mix: TraySummary['mix'], shown = 3): string {
  const head = mix.slice(0, shown).map(({ code, count }) => `${topicDisplay(code)} ×${count}`);
  const rest = mix.length - shown;
  return rest > 0 ? `${head.join(', ')} +${rest} more` : head.join(', ');
}

/** The key a picked or focused row is held by; a question is unique within its document. */
export const rowKey = (row: Pick<BankRow, 'docId' | 'questionId'>) => `${row.docId}\u0000${row.questionId}`;

/* ------------------------------------------------------------------------------------ */
/* Targets                                                                              */
/* ------------------------------------------------------------------------------------ */

/**
 * Where "Add to …" puts the picks: the document open last in this session, if it is still
 * saved. Never a guess (the newest paper may be the wrong kind entirely): none opened, or a
 * bank (its rows say so), and there is no "Add to", only "New worksheet from these".
 */
export function addTarget(
  summaries: readonly WorksheetSummary[],
  rows: readonly BankRow[],
  lastOpenId: string | undefined,
): WorksheetSummary | undefined {
  const banks = new Set(rows.filter((row) => row.docKind === 'bank').map((row) => row.docId));
  const usable = summaries.filter((summary) => !banks.has(summary.id));
  return usable.find((summary) => summary.id === lastOpenId);
}

/** "11 questions · 3 worksheets · 1 bank". */
export function bankCountLabel(coverage: Pick<Coverage, 'total' | 'papers' | 'banks'>): string {
  // A no-break space: a narrow column wraps between the parts, never inside "1 bank".
  const n = (count: number, noun: string) => `${count}\u00a0${noun}${count === 1 ? '' : 's'}`;
  return [n(coverage.total, 'question'), n(coverage.papers, 'worksheet'), ...(coverage.banks ? [n(coverage.banks, 'bank')] : [])].join(' · ');
}

/** "C.ped Price elasticity of demand" lines for the preview's Topics; 題型 are listed apart (`patternLines`). */
export function tagLines(tags: readonly string[]): { code: string; name?: string }[] {
  return tags.filter((tag) => !isPatternTag(tag)).map((tag) => (topicOf(tag) ? { code: tag, name: topicLabel(tag, 'en') } : { code: tag }));
}

/** A row's 題型 as the preview lists them: sub-topic code and name. */
export function patternLines(tags: readonly string[]): { topic: string; name: string }[] {
  return tags.flatMap((tag) => {
    const ref = parsePatternTag(tag);
    return ref ? [ref] : [];
  });
}
