import { cleanClasses, isIsoDate } from './classes';
import type { CoverLine, CoverPage } from './coverTypes';
import { plain } from './text';
import type { BiText, RichText, Worksheet } from './types';

/**
 * A paper set's shared details (k-0299 step B; the user, u-c17j): the school, the
 * examination line, the date sat and the classes, kept in step across the set's papers.
 * Times and each paper's own name stay per paper.
 *
 * **Copied into each paper, never looked up at print time.** The school and examination
 * are the paper's own cover lines (tagged `CoverLine.sharedAs`); the date and classes its
 * own `satOn` / `classes`. So every backend still reads one paper alone, an older build
 * prints exactly what was last written, and nothing is stored for the set itself: the
 * papers *are* the set's details, and "drift" is simply two papers that disagree.
 */

export type CoverDetail = 'school' | 'exam';
export type SetDetail = CoverDetail | 'satOn' | 'classes';

/** A cover detail's two sides as plain text. */
export interface DetailText {
  en: string;
  zh: string;
}

/** What one paper says for each shared detail; a cover detail is absent when no line holds it. */
export interface PaperDetails {
  school?: DetailText;
  exam?: DetailText;
  satOn?: string;
  classes: string[];
}

/** A change to apply to every paper of a set: only the details given are written. */
export interface DetailsPatch {
  school?: DetailText;
  exam?: DetailText;
  /** '' clears the date. */
  satOn?: string;
  /** [] clears the classes. */
  classes?: string[];
}

/** The cover's own placeholders: a line still saying one of these has not been filled in. */
const PLACEHOLDERS: Record<CoverDetail, RegExp> = {
  school: /^(school name|學校名稱)$/i,
  exam: /^$/,
};

export function isPlaceholder(field: CoverDetail, text: DetailText): boolean {
  const sides = [text.en.trim(), text.zh.trim()].filter(Boolean);
  return sides.length === 0 || sides.every((side) => PLACEHOLDERS[field].test(side));
}

const EXAM_WORDS = /(exam|examination|mock|test|quiz|assessment|考試|測驗|小測|模擬|統測)/i;
const textOf = (line: CoverLine): DetailText => ({ en: plain(line.text.en).trim(), zh: plain(line.text.zh).trim() });
const sameText = (a: DetailText, b: DetailText) => a.en === b.en && a.zh === b.zh;
const hasWords = (text: DetailText) => text.en !== '' || text.zh !== '';

/**
 * The cover lines holding `field`, at most one in the head and one in the foot. Tagged lines
 * first. A cover with no tag for it (made before step B) is read conservatively, and a line
 * is only ever taken when it says what it is:
 *  - the school: the head line the foot block repeats (the cover prints the school twice),
 *    else a head line still saying SCHOOL NAME / 學校名稱; plus that foot line;
 *  - the examination: the first head line, other than the school's, that names an exam
 *    ("S.6 MOCK EXAMINATION", "中六模擬考試") and is not the paper's own name.
 * Nothing found means the paper has no such line: it is said so and never written.
 */
export function sharedLines(cover: CoverPage | undefined, field: CoverDetail): CoverLine[] {
  if (!cover) return [];
  const head = cover.headLines ?? [];
  const foot = cover.footLines ?? [];
  const tagged = [head.find((l) => l.sharedAs === field), foot.find((l) => l.sharedAs === field)].filter(
    (l): l is CoverLine => !!l,
  );
  if (tagged.length > 0) return tagged;
  // An untagged cover: the other field's tags still rule lines out.
  const taken = new Set([...head, ...foot].filter((l) => l.sharedAs && l.sharedAs !== field).map((l) => l.id));
  const free = head.filter((l) => !taken.has(l.id));
  const school = untaggedSchool(cover, taken);
  if (field === 'school') return school;
  const schoolIds = new Set(school.map((l) => l.id));
  const exam = free.find((l) => {
    if (schoolIds.has(l.id)) return false;
    const text = textOf(l);
    if (!hasWords(text) || /paper\s*[12]|試卷[一二]/i.test(`${text.en} ${text.zh}`)) return false;
    return EXAM_WORDS.test(`${text.en} ${text.zh}`);
  });
  return exam ? [exam] : [];
}

function untaggedSchool(cover: CoverPage, taken: Set<string>): CoverLine[] {
  const head = (cover.headLines ?? []).filter((l) => !taken.has(l.id) && l.sharedAs === undefined);
  const foot = (cover.footLines ?? []).filter((l) => !taken.has(l.id) && l.sharedAs === undefined);
  for (const h of head) {
    const text = textOf(h);
    if (!hasWords(text)) continue;
    const pair = foot.find((f) => sameText(textOf(f), text));
    if (pair) return [h, pair];
  }
  const placeholder = head.find((h) => hasWords(textOf(h)) && isPlaceholder('school', textOf(h)));
  if (!placeholder) return [];
  const pair = foot.find((f) => sameText(textOf(f), textOf(placeholder)));
  return pair ? [placeholder, pair] : [placeholder];
}

/** What a paper says for each shared detail. */
export function paperDetails(worksheet: Worksheet): PaperDetails {
  const [school] = sharedLines(worksheet.cover, 'school');
  const [exam] = sharedLines(worksheet.cover, 'exam');
  return {
    ...(school ? { school: textOf(school) } : {}),
    ...(exam ? { exam: textOf(exam) } : {}),
    ...(isIsoDate(worksheet.satOn) ? { satOn: worksheet.satOn } : {}),
    classes: cleanClasses(worksheet.classes) ?? [],
  };
}

/** A side rewritten to `text`, keeping its first run's formatting. */
function withSide(runs: RichText, text: string): RichText {
  if (!text) return [];
  const [first] = runs;
  return [{ ...(first ?? {}), text }];
}

function withLineText(line: CoverLine, field: CoverDetail, text: DetailText): CoverLine {
  const next: BiText = { en: withSide(line.text.en, text.en), zh: withSide(line.text.zh, text.zh) };
  const unchanged = sameText(textOf(line), text) && line.sharedAs === field;
  return unchanged ? line : { ...line, text: next, sharedAs: field };
}

/**
 * `worksheet` with the details in `patch` written in. A cover detail goes into the lines
 * `sharedLines` finds (and tags them, so they are found the same way next time); a paper
 * with no such line is left as it is. Returns `worksheet` itself when nothing changes.
 */
export function withDetails(worksheet: Worksheet, patch: DetailsPatch): Worksheet {
  let next = worksheet;
  for (const field of ['school', 'exam'] as const) {
    const text = patch[field];
    if (!text || !next.cover) continue;
    const ids = new Set(sharedLines(next.cover, field).map((l) => l.id));
    if (ids.size === 0) continue;
    const map = (lines: CoverLine[] | undefined) =>
      lines?.map((l) => (ids.has(l.id) ? withLineText(l, field, text) : l));
    const cover: CoverPage = { ...next.cover, headLines: map(next.cover.headLines), footLines: map(next.cover.footLines) };
    if (!next.cover.headLines) delete cover.headLines;
    if (!next.cover.footLines) delete cover.footLines;
    const changed =
      cover.headLines?.some((l, i) => l !== next.cover?.headLines?.[i]) ||
      cover.footLines?.some((l, i) => l !== next.cover?.footLines?.[i]);
    if (changed) next = { ...next, cover };
  }
  if (patch.satOn !== undefined) {
    const satOn = isIsoDate(patch.satOn) ? patch.satOn : undefined;
    if (satOn !== (isIsoDate(next.satOn) ? next.satOn : undefined)) {
      next = { ...next };
      if (satOn) next.satOn = satOn;
      else delete next.satOn;
    }
  }
  if (patch.classes !== undefined) {
    const classes = cleanClasses(patch.classes);
    const had = cleanClasses(next.classes);
    if ((classes ?? []).join('\u0000') !== (had ?? []).join('\u0000')) {
      next = { ...next };
      if (classes) next.classes = classes;
      else delete next.classes;
    }
  }
  return next;
}

/** One paper's value for a detail, as the drift list names it. */
export interface DriftValue {
  id: string;
  /** `undefined` for a cover detail: the paper has no line for it. */
  value: string | undefined;
  placeholder: boolean;
}

/** A detail the papers disagree on. */
export interface Drift {
  field: SetDetail;
  values: DriftValue[];
  /** The value to offer as "Use … on every paper": the newest paper's filled-in one. */
  suggestion?: DetailText | string | string[];
}

const showText = (text: DetailText | undefined) => (text ? text.en || text.zh : undefined);

/**
 * Where a set's papers disagree, detail by detail, newest paper first in each list. A paper
 * with no line for a cover detail counts as disagreeing (its cover will not follow); one
 * still showing SCHOOL NAME too. Dates differ legitimately when the papers were sat on
 * different days, so the dialog words that one as a note, not a fault.
 */
export function detailDrift(papers: readonly Worksheet[]): Drift[] {
  const newest = [...papers].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const details = newest.map((paper) => ({ id: paper.id, details: paperDetails(paper) }));
  const drifts: Drift[] = [];
  for (const field of ['school', 'exam'] as const) {
    const texts = details.map(({ details: d }) => d[field]);
    const keys = new Set(texts.map((t) => (t ? `${t.en}\u0000${t.zh}` : '')));
    const placeholders = texts.some((t) => !t || isPlaceholder(field, t));
    if (keys.size <= 1 && !(placeholders && texts.some((t) => t && !isPlaceholder(field, t)))) continue;
    const filled = texts.find((t): t is DetailText => !!t && !isPlaceholder(field, t));
    drifts.push({
      field,
      values: details.map(({ id, details: d }) => ({
        id,
        value: showText(d[field]),
        placeholder: !d[field] || isPlaceholder(field, d[field]!),
      })),
      ...(filled ? { suggestion: filled } : {}),
    });
  }
  const dates = new Set(details.map(({ details: d }) => d.satOn ?? ''));
  if (dates.size > 1) {
    const filled = details.find(({ details: d }) => d.satOn)?.details.satOn;
    drifts.push({
      field: 'satOn',
      values: details.map(({ id, details: d }) => ({ id, value: d.satOn, placeholder: !d.satOn })),
      ...(filled ? { suggestion: filled } : {}),
    });
  }
  const classKeys = new Set(details.map(({ details: d }) => d.classes.map((c) => c.toLowerCase()).sort().join(',')));
  if (classKeys.size > 1) {
    const filled = details.find(({ details: d }) => d.classes.length > 0)?.details.classes;
    drifts.push({
      field: 'classes',
      values: details.map(({ id, details: d }) => ({
        id,
        value: d.classes.length > 0 ? d.classes.join(' ') : undefined,
        placeholder: d.classes.length === 0,
      })),
      ...(filled ? { suggestion: filled } : {}),
    });
  }
  return drifts;
}

/**
 * The values the Set details dialog starts from: for each detail, the newest paper's
 * filled-in value (a placeholder only when no paper has better).
 */
export function startingDetails(papers: readonly Worksheet[]): PaperDetails {
  const newest = [...papers].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const all = newest.map(paperDetails);
  const pick = (field: CoverDetail) =>
    all.map((d) => d[field]).find((t) => t && !isPlaceholder(field, t)) ?? all.map((d) => d[field]).find(Boolean);
  const school = pick('school');
  const exam = pick('exam');
  const satOn = all.find((d) => d.satOn)?.satOn;
  return {
    ...(school ? { school } : {}),
    ...(exam ? { exam } : {}),
    ...(satOn ? { satOn } : {}),
    classes: all.find((d) => d.classes.length > 0)?.classes ?? [],
  };
}
