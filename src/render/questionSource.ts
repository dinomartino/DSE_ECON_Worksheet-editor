import type { ListIndentScheme } from '@/model/numbering';
import { isBiTextEmpty, plain, trailingBlankLines } from '@/model/text';
import type { BiText, LanguageMode, RichText, Question, Worksheet } from '@/model/types';
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

/**
 * The bracketed label, one side per language: "(HKDSE 2019 Paper 1 Q12)" and
 * "（香港中學文憑考試 2019 卷一 第 12 題）". An empty side stays empty, so `trailLabel` falls
 * back to the other side as it does for every trail. Its spaces are no-break spaces, as the
 * marks label's are (`marksText`), so Word never tears it at a space.
 */
export function sourceTrail(source: BiText): BiText {
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
  { language, page = DEFAULT_PAGE_METRICS, indents }: { language: LanguageMode; page?: PageMetrics; indents: ListIndentScheme },
): RenderNode[] {
  const source = sourceOf(question);
  if (!source) return nodes;
  const at = nodes.findIndex((node) => node.kind === 'text' && node.listRef?.definition === 'question' && node.listRef.level === 0);
  const numbered = nodes[at];
  if (!numbered || numbered.kind !== 'text' || numbered.marks !== undefined || numbered.trail !== undefined) return nodes;
  const trail = sourceTrail(source);
  const fits = sourceFits(numbered, trailLabel(trail, language), language, page, indents);
  const out = [...nodes];
  out[at] = { ...numbered, trail, ...(fits ? {} : { trailOwnLine: true as const }) };
  return out;
}
