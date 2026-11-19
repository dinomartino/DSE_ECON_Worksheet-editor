import type { ListIndentScheme } from '@/model/numbering';
import { isBiTextEmpty, plain, trailingBlankLines } from '@/model/text';
import type { BiText, LanguageMode, QuestionSourceFormat, RichText, Question, Worksheet } from '@/model/types';
import { DEFAULT_PAGE_METRICS, trailLabel, type PageMetrics, type RenderNode, type TextNode } from './ir';
import { lineWidthTwips, splitRunLines } from './textWidth';

/**
 * A question's source printed on the paper (user u-w7gs: "keep the source, the year and
 * question number, when I make a worksheet from the past paper bank").
 *
 * The source is the question's own `provenance` ("HKCEE 2006 Paper 2 Q32" / "香港中學會考
 * 2006 卷二 第 32 題"), which every past paper bank question carries and which until now only
 * the teacher's copy and the answer key showed. With `Worksheet.showQuestionSources` on it
 * also prints in brackets at the right of the question's numbered first line, as the
 * numbered paragraph's `trail`: the slot a structured question's "(4 marks)" rides, which
 * the preview (so print and PDF), the `.docx` and the clipboard all draw already. Nothing
 * else moves: no node is added, so numbering, keeps and the answer key are as before.
 *
 * Derived at render, never stored on the question: turning the switch off leaves no trace.
 */

/** The question's source note, when it has one (only an MC question carries one today). */
export function sourceOf(question: Question): BiText | undefined {
  const provenance = (question as { provenance?: BiText }).provenance;
  return provenance && !isBiTextEmpty(provenance) ? provenance : undefined;
}

/** Whether the paper has any question with a source to print. */
export const hasQuestionSources = (worksheet: Pick<Worksheet, 'questions'>) =>
  worksheet.questions.some((question) => sourceOf(question) !== undefined);

/** Whether the paper prints its questions' sources. */
export const printsQuestionSources = (worksheet: Pick<Worksheet, 'showQuestionSources'>) =>
  worksheet.showQuestionSources === true;

/** The paper with its sources printed or not: stored only as `true`, absent when off. */
export function withQuestionSources(worksheet: Worksheet, on: boolean): Worksheet {
  if (printsQuestionSources(worksheet) === on) return worksheet;
  const next: Worksheet = { ...worksheet, showQuestionSources: true };
  if (!on) delete next.showQuestionSources;
  return next;
}

/** The formats, in the order the pickers list them. */
export const QUESTION_SOURCE_FORMATS: readonly QuestionSourceFormat[] = ['full', 'short', 'shortRoman'];

/** The paper's source format: full unless a known short one is stored. */
export function questionSourceFormat(worksheet: Pick<Worksheet, 'questionSourceFormat'>): QuestionSourceFormat {
  const format = worksheet.questionSourceFormat;
  return format === 'short' || format === 'shortRoman' ? format : 'full';
}

/** The paper with its source format: stored only when not full, absent for full. */
export function withQuestionSourceFormat(worksheet: Worksheet, format: QuestionSourceFormat): Worksheet {
  if (questionSourceFormat(worksheet) === format && (format !== 'full' || worksheet.questionSourceFormat === undefined)) return worksheet;
  const next: Worksheet = { ...worksheet, questionSourceFormat: format };
  if (format === 'full') delete next.questionSourceFormat;
  return next;
}

/** A source read off its printed words: exam code, `2019` / `SP` / `PP`, paper, question. */
export interface SourceParts {
  exam: 'CE' | 'AL' | 'DSE';
  when: string;
  paper: number;
  number: number;
}

const EXAM_CODE: Record<string, SourceParts['exam']> = {
  HKCEE: 'CE',
  HKALE: 'AL',
  HKDSE: 'DSE',
  香港中學會考: 'CE',
  香港高級程度會考: 'AL',
  香港中學文憑考試: 'DSE',
};
const WHEN_CODE: Record<string, string> = { 'Sample Paper': 'SP', 'Practice Paper': 'PP', 樣本試卷: 'SP', 練習卷: 'PP' };
const ZH_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const EN_SOURCE = /^(HKCEE|HKALE|HKDSE)\s+(\d{4}|Sample Paper|Practice Paper)\s+Paper\s+(\d+)\s+Q(\d+)$/;
const ZH_SOURCE = /^(香港中學會考|香港高級程度會考|香港中學文憑考試)\s*(\d{4}|樣本試卷|練習卷)\s*卷([一二三四五六七八九]|\d+)\s*第\s*(\d+)\s*題$/;

/**
 * The parts of a source the bank wrote ("HKDSE 2019 Paper 1 Q12", "HKDSE Sample Paper Paper 1
 * Q3", "香港中學會考 1991 卷二 第 1 題"; `pastpapers/pack.ts` sourceLabel), English side
 * first. Undefined for any other wording, such as a teacher's own note.
 */
export function sourceParts(source: BiText): SourceParts | undefined {
  const en = EN_SOURCE.exec(plain(source.en).replace(/\s+/g, ' ').trim());
  if (en) return { exam: EXAM_CODE[en[1]], when: WHEN_CODE[en[2]] ?? en[2], paper: Number(en[3]), number: Number(en[4]) };
  const zh = ZH_SOURCE.exec(plain(source.zh).replace(/\s+/g, ' ').trim());
  if (zh) return { exam: EXAM_CODE[zh[1]], when: WHEN_CODE[zh[2]] ?? zh[2], paper: ZH_DIGITS[zh[3]] ?? Number(zh[3]), number: Number(zh[4]) };
  return undefined;
}

const ROMAN: Array<[number, string]> = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n: number) => {
  let out = '';
  let rest = n;
  for (const [value, letters] of ROMAN) {
    while (rest >= value) {
      out += letters;
      rest -= value;
    }
  }
  return out;
};

/**
 * The short form, the bank's own tag shape: "DSE2019/P1/Q12", or with the paper in Roman
 * numerals "DSE2019/I/Q12"; a sample or practice paper "DSESP/P1/Q3", "DSEPP/P1/Q3".
 * The same on every language: codes and numbers, nothing to translate.
 */
export function shortSource(parts: SourceParts, format: Exclude<QuestionSourceFormat, 'full'>): string {
  const paper = format === 'shortRoman' && parts.paper >= 1 && parts.paper <= 39 ? roman(parts.paper) : `P${parts.paper}`;
  return `${parts.exam}${parts.when}/${paper}/Q${parts.number}`;
}

/**
 * The bracketed label, one side per language: full, "(HKDSE 2019 Paper 1 Q12)" and
 * "（香港中學文憑考試 2019 卷一 第 12 題）"; short, "(DSE2019/P1/Q12)" on both sides, so a
 * bilingual paper prints it once (`trailLabel`). A source a short form cannot read (a
 * teacher's own wording) stays in full. An empty side stays empty, so `trailLabel` falls
 * back to the other side as it does for every trail. Its spaces are no-break spaces, as the
 * marks label's are (`marksText`), so Word never tears it at a space.
 */
export function sourceTrail(source: BiText, format: QuestionSourceFormat = 'full'): BiText {
  const parts = format === 'full' ? undefined : sourceParts(source);
  if (parts && format !== 'full') {
    const label = [{ text: `(${shortSource(parts, format)})` }];
    return { en: label, zh: label };
  }
  const tight = (side: RichText) => plain(side).trim().replace(/\s+/g, '\u00a0');
  const en = tight(source.en);
  const zh = tight(source.zh);
  return {
    en: en ? [{ text: `(${en})` }] : [],
    zh: zh ? [{ text: `（${zh}）` }] : [],
  };
}

/**
 * How far the last wrapped line of `line` (no hard breaks) reaches, in twips, in a column
 * `width` wide: greedy, breaking after a space or beside a CJK character, as Word does.
 */
export function lastLineReach(line: RichText, width: number, fontSize: number, latinFont: string): number {
  const tokens: RichText[] = [];
  for (const run of line) {
    for (const piece of run.text.match(/[\u2e80-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef\u3000-\u303f]|[^\s\u2e80-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef\u3000-\u303f]+\s*|\s+/g) ?? []) {
      tokens.push([{ ...run, text: piece }]);
    }
  }
  let reach = 0;
  for (const token of tokens) {
    const word = token[0].text.replace(/\s+$/, '');
    const solid = lineWidthTwips([{ ...token[0], text: word }], fontSize, latinFont);
    const whole = lineWidthTwips(token, fontSize, latinFont);
    if (reach > 0 && word && reach + solid > width) reach = 0;
    reach += whole;
    if (!word && reach > width) reach = 0;
  }
  // A line's trailing space does not take room from the label (Word lets it hang).
  const last = tokens[tokens.length - 1]?.[0];
  if (last) reach -= lineWidthTwips([{ ...last, text: last.text.slice(last.text.replace(/\s+$/, '').length) }], fontSize, latinFont);
  return Math.max(0, reach);
}

/**
 * Whether the label fits after the numbered line's last words, with room to spare: an em and
 * a half, so a line the estimate (`textWidth.ts`, which errs wide) calls borderline goes to a
 * line of its own in every backend rather than to each backend's own wrap. A bilingual paper
 * prints both sides of the stem and a label in both languages: always its own line.
 */
export function sourceFits(node: TextNode, label: string, language: LanguageMode, page: PageMetrics, indents: ListIndentScheme): boolean {
  if (language === 'bilingual') return false;
  const runs = node.text[language].length > 0 ? node.text[language] : node.text[language === 'en' ? 'zh' : 'en'];
  // A text ending in hard breaks already sets its label on a line the preview measures.
  if (trailingBlankLines(runs) > 0) return true;
  const fontSize = node.format?.fontSize ?? page.fontSize;
  const width = page.textWidth - (indents.question[0]?.left ?? 0);
  const lines = splitRunLines(runs);
  const reach = lastLineReach(lines[lines.length - 1] ?? [], width, fontSize, page.latinFont);
  const room = lineWidthTwips([{ text: label }], fontSize, page.latinFont) + 1.5 * fontSize * 20;
  return reach + room <= width;
}

/**
 * The question's nodes with its source on the numbered first line. Untouched when the
 * question has no source, or its numbered line already carries marks or a trail.
 */
export function withSourceTrail(
  nodes: RenderNode[],
  question: Question,
  {
    language,
    page = DEFAULT_PAGE_METRICS,
    indents,
    format = 'full',
  }: { language: LanguageMode; page?: PageMetrics; indents: ListIndentScheme; format?: QuestionSourceFormat },
): RenderNode[] {
  const source = sourceOf(question);
  if (!source) return nodes;
  const at = nodes.findIndex((node) => node.kind === 'text' && node.listRef?.definition === 'question' && node.listRef.level === 0);
  const numbered = nodes[at];
  if (!numbered || numbered.kind !== 'text' || numbered.marks !== undefined || numbered.trail !== undefined) return nodes;
  const trail = sourceTrail(source, format);
  const fits = sourceFits(numbered, trailLabel(trail, language), language, page, indents);
  const out = [...nodes];
  out[at] = { ...numbered, trail, ...(fits ? {} : { trailOwnLine: true as const }) };
  return out;
}
