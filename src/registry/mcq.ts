import { createMcqQuestion } from '@/model/factories';
import { optionLabel, statementLabel } from '@/model/numbering';
import { bi, isBiTextEmpty, plain } from '@/model/text';
import type { LanguageMode, McqOptionLayout, McqQuestion } from '@/model/types';
import { blankLine, renderContentBlocks, type RenderContext, type RenderNode } from '@/render/ir';
import { McqEditorPanel } from '@/components/editor/McqEditorPanel';
import type { QuestionTypeDefinition } from './types';

/**
 * MCQ rendering (§8): stem blocks -> statements (if any) -> options A-D,
 * then teacher-only answer + explanation.
 *
 * Options and statements each get a numbering stream keyed by question id, which
 * the docx backend turns into a fresh `w:num` per question so lettering restarts
 * at A for every question (§7.2). Side-by-side option layouts are the exception:
 * they are one paragraph, so their markers are literal text (see `render`).
 */

/** Options are indented under the stem, matching the stacked style's gutter. */
const OPTION_INDENT = 480;

/**
 * Longest option, in characters, that still reads well on a shared line.
 *
 * Derived from real papers: "(1), (2) and (4) only" is 21 characters and four of those
 * fit comfortably across A4; a full sentence does not. CJK glyphs are roughly twice as
 * wide, so they count double.
 */
const INLINE_MAX = 24;
const COLUMNS2_MAX = 40;

function displayWidth(text: string): number {
  // CJK ideographs, kana, Hangul and fullwidth forms take about twice the width of a
  // Latin letter, so they count double when judging whether a row of options fits.
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    width += wide ? 2 : 1;
  }
  return width;
}

/**
 * The layout an MCQ renders with.
 *
 * An explicit `optionLayout` always wins. With none, options **stack** — the layout
 * every existing document was authored against, and the one §7.2 numbering applies to.
 * `suggestOptionLayout` is the auto part: the editor calls it when a question is created
 * or edited and writes the result, so a document's appearance is always something it
 * states rather than something re-derived (and re-derivable differently) at render time.
 */
export function resolveOptionLayout(question: McqQuestion): McqOptionLayout {
  return question.optionLayout ?? 'stacked';
}

/**
 * The layout that suits these options, from how long they are.
 *
 * Short options ("(1) and (2) only") read well side by side and save the vertical space
 * a 19-question paper needs; full sentences do not. Returned as a suggestion for the
 * editor to store, never applied implicitly at render time.
 */
export function suggestOptionLayout(
  question: McqQuestion,
  language: LanguageMode,
): McqOptionLayout {
  const widths = question.options.map((option) => {
    const en = displayWidth(plain(option.text.en));
    const zh = displayWidth(plain(option.text.zh));
    // In bilingual mode the two languages stack inside the cell, so the wider one
    // decides whether the row fits.
    if (language === 'en') return en;
    if (language === 'zh') return zh;
    return Math.max(en, zh);
  });

  // An empty option set (a blank question) must not read as "short" and go inline.
  if (widths.length === 0 || widths.every((width) => width === 0)) return 'stacked';

  const longest = Math.max(...widths);
  if (longest <= INLINE_MAX) return 'inline';
  if (longest <= COLUMNS2_MAX) return 'columns2';
  return 'stacked';
}

function render(question: McqQuestion, context: RenderContext): RenderNode[] {
  const nodes: RenderNode[] = [];
  const [firstBlock, ...restBlocks] = question.blocks;

  // The first stem paragraph carries the question number; if the stem opens with a
  // table or image we emit an empty numbered paragraph so the number still appears.
  if (firstBlock && firstBlock.kind === 'paragraph') {
    nodes.push({
      kind: 'text',
      style: 'Question Stem',
      text: firstBlock.text,
      keepNext: true,
      edit: { kind: 'blockText', blockId: firstBlock.id },
      listRef: {
        stream: context.questionStream,
        definition: 'question',
        level: 0,
        marker: `${context.questionNumber}.`,
      },
    });
    nodes.push(...renderContentBlocks(restBlocks, 'Question Stem', { keepNext: true }));
  } else {
    nodes.push({
      kind: 'text',
      style: 'Question Stem',
      text: { en: [], zh: [] },
      keepNext: true,
      listRef: {
        stream: context.questionStream,
        definition: 'question',
        level: 0,
        marker: `${context.questionNumber}.`,
      },
    });
    nodes.push(...renderContentBlocks(question.blocks, 'Question Stem', { keepNext: true }));
  }

  /*
   * A blank line after the stem, and another after the statements.
   *
   * This is the reference paper's shape exactly: stem, blank, the numbered (1)(2)(3)
   * statements, blank, the A–D options. The gap has to be a spent line because the
   * document runs on a fixed 12pt line with no paragraph spacing anywhere
   * (§ One fixed line, no paragraph spacing) — there is no `w:after` to grow.
   */
  nodes.push(blankLine());

  const statements = question.statements ?? [];
  statements.forEach((statement, index) => {
    nodes.push({
      kind: 'text',
      style: 'Statement',
      text: statement,
      keepNext: true,
      edit: { kind: 'mcqStatement', questionId: question.id, index },
      listRef: {
        stream: `statement:${context.questionId}`,
        definition: 'statement',
        level: 0,
        marker: statementLabel(index),
      },
    });
  });

  // Only when there were statements: without them the stem's own blank already
  // separates the question from its options, and a second would double the gap.
  if (statements.length > 0) nodes.push(blankLine());

  const layout = resolveOptionLayout(question);

  if (layout === 'stacked') {
    question.options.forEach((option, index) => {
      nodes.push({
        kind: 'text',
        style: 'MCQ Option',
        // Keep every option with the next one so the A-D block never splits; the last
        // option is free to break unless a teacher answer follows.
        keepNext: index < question.options.length - 1 || context.mode.version === 'teacher',
        text: option.text,
        edit: { kind: 'mcqOption', questionId: question.id, optionId: option.id },
        listRef: {
          stream: `option:${context.questionId}`,
          definition: 'option',
          level: 0,
          marker: optionLabel(index),
        },
      });
    });
  } else {
    // Side-by-side options are one paragraph with tab stops, so they cannot use the
    // native `w:num` option stream — the A-D markers become literal text in the row.
    // That is the accepted trade-off for a layout Word has no list primitive for.
    const perRow = layout === 'inline' ? question.options.length : 2;
    for (let start = 0; start < question.options.length; start += perRow) {
      const row = question.options.slice(start, start + perRow);
      nodes.push({
        kind: 'columns',
        style: 'MCQ Option',
        keepNext:
          start + perRow < question.options.length || context.mode.version === 'teacher',
        cells: row.map((option, offset) => ({
          text: option.text,
          // Evenly spaced across the row; `at` is row-relative, so the indent is
          // already accounted for.
          at: offset / perRow,
          marker: optionLabel(start + offset),
          edit: { kind: 'mcqOption', questionId: question.id, optionId: option.id },
        })),
        indent: OPTION_INDENT,
      });
    }
  }

  const answerLetter = optionLabel(question.answerIndex).replace('.', '');
  nodes.push({
    kind: 'text',
    style: 'Answer',
    teacherOnly: true,
    keepNext: !isBiTextEmpty(question.explanation),
    text: bi(`Answer: ${answerLetter}`, `答案：${answerLetter}`),
  });

  if (!isBiTextEmpty(question.explanation)) {
    nodes.push({
      kind: 'text',
      style: 'Marking Scheme',
      teacherOnly: true,
      text: question.explanation!,
      edit: { kind: 'mcqExplanation', questionId: question.id },
    });
  }

  return nodes;
}

function countMissingTranslations(question: McqQuestion): number {
  let missing = 0;
  const check = (text?: { en: unknown[]; zh: unknown[] }) => {
    if (!text) return;
    const hasEn = text.en.length > 0;
    const hasZh = text.zh.length > 0;
    if (hasEn !== hasZh) missing += 1;
  };
  for (const block of question.blocks) {
    if (block.kind === 'paragraph') check(block.text);
  }
  (question.statements ?? []).forEach(check);
  question.options.forEach((option) => check(option.text));
  check(question.explanation);
  return missing;
}

export const mcqType: QuestionTypeDefinition<McqQuestion> = {
  id: 'mcq',
  displayName: bi('Multiple Choice', '多項選擇題'),
  create: createMcqQuestion,
  render,
  EditorPanel: McqEditorPanel,
  countMissingTranslations,
};
