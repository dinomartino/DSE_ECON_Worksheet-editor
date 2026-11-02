import type { CoverLine, CoverPage } from './coverTypes';
import { withPaperSet } from './paperSet';
import { plain } from './text';
import type { BiText, RichText, Worksheet } from './types';

/**
 * Duplicate set (k-0299 step C, the user u-c17j): every paper of a set copied under a new id
 * into a new set, for next year's mock. The copy can move every year on by one where the
 * teacher wrote it as a year — the set's name, each paper's name and printed title, and the
 * cover's lines ("2026-27" → "2027-28", "2027-DSE" → "2028-DSE", "2027" → "2028"). Questions
 * are never touched: "the 2008 financial crisis" stays 2008.
 *
 * Like Duplicate on one paper, the copy drops the date sat and the classes (a new sitting).
 */

/** A school year or a year: "2026-27", "2026/2027", "2026–27", "2027". */
const YEAR = /(?<!\d)(20\d{2})(?:([-–/])(\d{4}|\d{2}))?(?!\d)/g;

/** The same, unanchored and stateless, for a yes/no. */
const HAS_YEAR = new RegExp(YEAR.source);

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** `text` with every year one on: "S6 Mock 2026-27" → "S6 Mock 2027-28". */
export function bumpYears(text: string): string {
  return text.replace(YEAR, (_whole, start: string, sep?: string, end?: string) => {
    const next = String(Number(start) + 1);
    if (!sep || !end) return next;
    const endNext = end.length === 4 ? String(Number(end) + 1) : pad((Number(end) + 1) % 100, 2);
    return `${next}${sep}${endNext}`;
  });
}

/** The first year written in any of `texts`, and what it becomes; none when no year is. */
export function yearChange(texts: readonly string[]): { from: string; to: string } | undefined {
  for (const text of texts) {
    const match = HAS_YEAR.exec(text);
    if (match) return { from: match[0], to: bumpYears(match[0]) };
  }
  return undefined;
}

const bumpRuns = (runs: RichText): RichText => {
  const next = runs.map((run) => (HAS_YEAR.test(run.text) ? { ...run, text: bumpYears(run.text) } : run));
  return next.some((run, i) => run !== runs[i]) ? next : runs;
};
const bumpBi = (text: BiText): BiText => {
  const en = bumpRuns(text.en);
  const zh = bumpRuns(text.zh);
  return en === text.en && zh === text.zh ? text : { en, zh };
};
const bumpLines = (lines: CoverLine[] | undefined) => lines?.map((line) => {
  const text = bumpBi(line.text);
  return text === line.text ? line : { ...line, text };
});

function bumpCover(cover: CoverPage): CoverPage {
  const next: CoverPage = { ...cover };
  if (cover.cornerLines) next.cornerLines = bumpLines(cover.cornerLines);
  if (cover.headLines) next.headLines = bumpLines(cover.headLines);
  if (cover.footLines) next.footLines = bumpLines(cover.footLines);
  return next;
}

/** Every text the year offer looks in: the set's name, the papers' names, titles and covers. */
export function setYearTexts(setName: string, papers: readonly Worksheet[]): string[] {
  const lines = (paper: Worksheet) =>
    [...(paper.cover?.cornerLines ?? []), ...(paper.cover?.headLines ?? []), ...(paper.cover?.footLines ?? [])].flatMap(
      (line) => [plain(line.text.en), plain(line.text.zh)],
    );
  return [
    setName,
    ...papers.flatMap((paper) => [paper.name ?? '', plain(paper.title.en), plain(paper.title.zh), ...lines(paper)]),
  ];
}

/** The name Duplicate set suggests: the year moved on, else the name with "(copy)". */
export function duplicateSetName(name: string, lang: 'en' | 'zh-HK'): string {
  const bumped = bumpYears(name);
  if (bumped !== name) return bumped;
  return `${name}${lang === 'zh-HK' ? '（副本）' : ' (copy)'}`;
}

export interface DuplicateSetOptions {
  /** The new set's id and name. */
  set: { id: string; name: string };
  /** Move every year on by one in names, titles and covers. */
  bumpYear: boolean;
  lang: 'en' | 'zh-HK';
  newId: () => string;
  now?: string;
}

/**
 * The papers of a new set, copied from `papers` (in set order). Each copy is a new document
 * (new id, created now) in the new set. Without the year change, each copy's name in the file
 * list says "(copy)"; the printed title is left as it is either way (no "(copy)" on a paper
 * students sit), its years moved on when asked.
 */
export function duplicateSetPapers(papers: readonly Worksheet[], options: DuplicateSetOptions): Worksheet[] {
  const now = options.now ?? new Date().toISOString();
  const suffix = options.lang === 'zh-HK' ? '（副本）' : ' (copy)';
  return papers.map((paper) => {
    const copy: Worksheet = { ...paper, id: options.newId(), createdAt: now, updatedAt: now };
    delete copy.classes;
    delete copy.satOn;
    const shown = paper.name?.trim() || plain(paper.title.en).trim() || plain(paper.title.zh).trim();
    if (options.bumpYear) {
      copy.title = bumpBi(paper.title);
      if (paper.cover) copy.cover = bumpCover(paper.cover);
      const bumped = bumpYears(shown);
      if (bumped !== shown || paper.name) copy.name = bumped === shown ? `${shown}${suffix}` : bumped;
    } else if (shown) {
      copy.name = `${shown}${suffix}`;
    }
    return withPaperSet(copy, options.set);
  });
}
