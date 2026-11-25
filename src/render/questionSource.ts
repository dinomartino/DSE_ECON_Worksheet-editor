import type { ListIndentScheme } from '@/model/numbering';
import { isBiTextEmpty, plain } from '@/model/text';
import type { BiText, LanguageMode, QuestionSourceFormat, RichText, Question, Worksheet } from '@/model/types';
import { trailLabel, type RenderNode, type TextNode } from './ir';

/**
 * A question's source printed on the paper (user u-w7gs: "keep the source, the year and
 * question number, when I make a worksheet from the past paper bank").
 *
 * The source is the question's own `provenance` ("HKCEE 2006 Paper 2 Q32" / "香港中學會考
 * 2006 卷二 第 32 題"), which every past paper bank question carries and which until now only
 * the teacher's copy and the answer key showed. With `Worksheet.showQuestionSources` on it
 * also prints in brackets on a line of its own at the top of the question, at the left edge
 * of the question number ("(DSESP/P1/Q3)" over "1. A positive statement", user u-tchj; it
 * rode at the right of the numbered line until then): one plain paragraph, which the preview
 * (so print and PDF), the `.docx` and the clipboard all draw as any other, kept with the
 * question (`keepNext`) so a page never ends on a source. Numbering and the answer key are as
 * before.
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
 * back to the other side. Its spaces are no-break spaces, so Word never tears it at a space.
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
 * The question's nodes with its source on a line of its own above them, at the left edge of
 * the question number (the number hangs from the margin, so the line starts there), in the
 * numbered line's style, size and fonts. It keeps with the question (`keepNext`): the
 * preview's paginator never breaks after it, and the `.docx` breaks where the preview does.
 * A bilingual paper prints the label once, both sides on one line when they differ
 * (`trailLabel`). Untouched when the question has no source.
 */
export function withSourceLine(
  nodes: RenderNode[],
  question: Question,
  { language, indents, format = 'full' }: { language: LanguageMode; indents: ListIndentScheme; format?: QuestionSourceFormat },
): RenderNode[] {
  const source = sourceOf(question);
  if (!source || nodes.length === 0) return nodes;
  const numbered = nodes.find((node): node is TextNode => node.kind === 'text' && node.listRef?.definition === 'question' && node.listRef.level === 0);
  const label = trailLabel(sourceTrail(source, format), language);
  if (!label) return nodes;
  const run = [{ text: label }];
  const { fontSize, fonts } = numbered?.format ?? {};
  const level = indents.question[0];
  const numberEdge = level ? level.left - level.hanging : 0;
  const line: TextNode = {
    kind: 'text',
    style: numbered?.style ?? 'Question Stem',
    text: { en: run, zh: language === 'bilingual' ? [] : run },
    ...(fontSize !== undefined || fonts !== undefined ? { format: { ...(fontSize !== undefined ? { fontSize } : {}), ...(fonts !== undefined ? { fonts } : {}) } } : {}),
    ...(numberEdge > 0 ? { indent: numberEdge } : {}),
    keepNext: true,
  };
  return [line, ...nodes];
}
