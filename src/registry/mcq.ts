import { createMcqQuestion } from '@/model/factories';
import { optionLabel, statementLabel, toUpperLetter } from '@/model/numbering';
import { areBlocksEmpty, bi, isBiTextEmpty, plain, provenanceLabel } from '@/model/text';
import type { BiText, LanguageMode, McqOption, McqOptionLayout, McqQuestion } from '@/model/types';
import { shuffledOrder } from '@/model/versions';
import {
  pushGap,
  renderContentBlocks,
  type ColumnsNode,
  type RenderContext,
  type RenderNode,
  type TextNode,
} from '@/render/ir';
import { McqEditorPanel } from '@/components/editor/McqEditorPanel';
import type {
  QuestionHealthFacts,
  QuestionTypeDefinition,
  QuestionVariant,
  QuizItem,
  VariantContext,
} from './types';
import type { AnswerKeyEntry } from '@/render/answerKey';

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
  // Options carrying blocks can stack or sit two per row — never inline.
  //
  // `inline` is one paragraph with tab stops, and a paragraph cannot hold a picture
  // per cell — the figures would be dropped silently, which is the worst way for this
  // to fail (the option letters still print, so the question looks complete and is
  // simply unanswerable). `columns2` escapes that because a blocks-bearing question
  // renders it as a real layout-table grid (§ `OptionRowNode`), the reference's own
  // 2×2 diagram shape. Enforced here rather than validated on write, because that
  // keeps it true for documents authored before options could carry blocks.
  if (question.options.some((option) => (option.blocks?.length ?? 0) > 0)) {
    return question.optionLayout === 'columns2' ? 'columns2' : 'stacked';
  }
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
  // Figure options suggest the reference's own shape: the 2×2 grid, two per row. The
  // text-width heuristic below has nothing to say about a picture.
  if (question.options.some((option) => (option.blocks?.length ?? 0) > 0)) return 'columns2';

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
      // The numbered paragraph is built by hand rather than through
      // `renderContentBlocks`, so it has to carry the block's own formatting itself.
      // Without this the *first* stem paragraph silently ignored alignment, size and
      // colour while every later one honoured them — and because only the preview
      // applies alignment via CSS, an aligned stem previewed one way and exported with
      // no `w:jc` at all.
      format: firstBlock.format,
      edit: { kind: 'blockText', blockId: firstBlock.id },
      listRef: {
        stream: context.questionStream,
        definition: 'question',
        level: 0,
        marker: `${context.questionNumber}.`,
      },
    });
    // Continuation blocks indent to the stem's continuation column — the scheme's,
    // because the exam paper runs its follow-up stem text from the page margin while
    // a worksheet keeps it under the number (§ `listIndentScheme`).
    renderContentBlocks(nodes, restBlocks, 'Question Stem', {
      keepNext: true,
      indent: context.indents.stemText,
    });
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
    renderContentBlocks(nodes, question.blocks, 'Question Stem', {
      keepNext: true,
      indent: context.indents.stemText,
    });
  }

  /*
   * A blank line after the stem, and another after the statements.
   *
   * This is the reference paper's shape exactly: stem, blank, the numbered (1)(2)(3)
   * statements, blank, the A–D options. The gap has to be a spent line because the
   * document runs on a fixed 12pt line with no paragraph spacing anywhere
   * (§ One fixed line, no paragraph spacing) — there is no `w:after` to grow.
   *
   * Via `pushGap`, so a stem whose text ends in a trailing hard break already spends the
   * line and does not get a second one on top of it.
   */
  pushGap(nodes);

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
  if (statements.length > 0) pushGap(nodes);

  const layout = resolveOptionLayout(question);
  const anyOptionBlocks = question.options.some((option) => (option.blocks?.length ?? 0) > 0);

  if (layout === 'columns2' && anyOptionBlocks) {
    // Figure options two per row — the reference's 2×2 grid, each letter above its own
    // graph. Tab stops cannot hold a picture per cell, so this is a real grid
    // (§ `OptionRowNode`): each cell is the option's own nodes, the lettered line then
    // its blocks. Like every side-by-side layout, the markers are literal text.
    for (let start = 0; start < question.options.length; start += 2) {
      const row = question.options.slice(start, start + 2);
      const lastRow = start + 2 >= question.options.length;
      const cells = row.map((option, offset) => {
        const blocks = option.blocks ?? [];
        const cell: RenderNode[] = [
          {
            kind: 'columns',
            style: 'MCQ Option',
            // Cell-relative: the letter sits at the cell's own left edge, as the
            // reference prints it. Kept with its own figure — the grid row is atomic
            // in both backends, but the flag also holds if the cell is ever reflowed.
            keepNext: blocks.length > 0,
            cells: [
              {
                text: option.text,
                at: 0,
                marker: optionLabel(start + offset),
                edit: { kind: 'mcqOption', questionId: question.id, optionId: option.id },
              },
            ],
          },
        ];
        renderContentBlocks(cell, blocks, 'MCQ Option', {});
        return cell;
      });
      // An odd last row squares off with an empty cell, so a lone option keeps the
      // same half-column its siblings print in rather than spreading page-wide.
      if (cells.length === 1) cells.push([]);
      nodes.push({
        kind: 'optionRow',
        cells,
        keepNext: !lastRow || context.mode.version === 'teacher',
      });
    }
  } else if (layout === 'stacked') {
    question.options.forEach((option, index) => {
      const blocks = option.blocks ?? [];
      const last = index === question.options.length - 1;
      nodes.push({
        kind: 'text',
        style: 'MCQ Option',
        // Keep every option with the next one so the A-D block never splits; the last
        // option is free to break unless a teacher answer follows. An option carrying
        // blocks must also keep with its own figure, or Word breaks the page between
        // the letter and the diagram that answers it.
        keepNext:
          blocks.length > 0 || !last || context.mode.version === 'teacher',
        text: option.text,
        edit: { kind: 'mcqOption', questionId: question.id, optionId: option.id },
        listRef: {
          stream: `option:${context.questionId}`,
          definition: 'option',
          level: 0,
          marker: optionLabel(index),
        },
      });

      // The option's own figure, printed under its letter. Not in the numbered
      // paragraph: a `w:drawing` inside a list item takes the marker's hanging indent
      // and prints half a line up, and the picture paragraph needs `lineRule="auto"`
      // that the option style cannot give it.
      if (blocks.length > 0) {
        renderContentBlocks(nodes, blocks, 'MCQ Option', {
          keepNext: !last || context.mode.version === 'teacher',
          // Aligned with the option's own *text*, not the page margin: the blocks
          // continue the answer the letter introduces, so they start where its words
          // do. Taken from the scheme's option indent rather than restated, since that is the
          // one definition the exporter's `w:ind` and the preview's padding both read —
          // a second copy is how the page and the paper end up disagreeing.
          indent: context.indents.option.left,
        });
      }
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

  // Teacher-only notes after the key: explanation, per-option rationale, source note.
  const notes = teacherNotes(question, context.mode.language);
  const answerLetter = optionLabel(question.answerIndex).replace('.', '');
  nodes.push({
    kind: 'text',
    style: 'Answer',
    teacherOnly: true,
    keepNext: notes.length > 0,
    text: bi(`Answer: ${answerLetter}`, `答案：${answerLetter}`),
  });
  notes.forEach((node, index) => {
    // Only set when another note follows: an explanation alone renders as it always has.
    if (index < notes.length - 1) node.keepNext = true;
    nodes.push(node);
  });

  return nodes;
}

/**
 * Options carrying a rationale, lettered as printed. Letters are by position, so in a
 * shuffled version each rationale is lettered where its own option now prints.
 */
export function optionRationales(question: McqQuestion): Array<{ letter: string; text: BiText; optionId: string }> {
  return question.options.flatMap((option, index) =>
    isBiTextEmpty(option.rationale)
      ? []
      : [{ letter: toUpperLetter(index), text: option.rationale!, optionId: option.id }],
  );
}

/**
 * Explanation, then one "A. …" row per option rationale, then the source note — all in
 * the Marking Scheme style, each an edit target. Nothing when none is authored.
 */
function teacherNotes(question: McqQuestion, language: LanguageMode): Array<TextNode | ColumnsNode> {
  const notes: Array<TextNode | ColumnsNode> = [];
  if (!isBiTextEmpty(question.explanation)) {
    notes.push({
      kind: 'text',
      style: 'Marking Scheme',
      teacherOnly: true,
      text: question.explanation!,
      edit: { kind: 'mcqExplanation', questionId: question.id },
    });
  }
  for (const { letter, text, optionId } of optionRationales(question)) {
    notes.push({
      kind: 'columns',
      style: 'Marking Scheme',
      teacherOnly: true,
      keepLines: true,
      cells: [
        {
          text,
          at: 0,
          marker: `${letter}.`,
          edit: { kind: 'mcqRationale', questionId: question.id, optionId },
        },
      ],
    });
  }
  if (!isBiTextEmpty(question.provenance)) {
    notes.push({
      kind: 'columns',
      style: 'Marking Scheme',
      teacherOnly: true,
      keepLines: true,
      cells: [
        {
          text: question.provenance!,
          at: 0,
          marker: provenanceLabel(language),
          edit: { kind: 'mcqProvenance', questionId: question.id },
        },
      ],
    });
  }
  return notes;
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
  question.options.forEach((option) => check(option.rationale));
  check(question.provenance);
  return missing;
}

/** The key as a letter (null when it points at no option), blank and duplicate options. */
function healthFacts(question: McqQuestion): QuestionHealthFacts {
  const { answerIndex, options } = question;
  const keyed = Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length;
  const blank = options.filter((option) => isBiTextEmpty(option.text) && areBlocksEmpty(option.blocks));
  const seen = new Set<string>();
  let duplicateOptions = false;
  for (const option of options) {
    for (const lang of ['en', 'zh'] as const) {
      const words = plain(option.text[lang]).trim().replace(/\s+/g, ' ').toLowerCase();
      if (!words) continue;
      if (seen.has(`${lang}:${words}`)) duplicateOptions = true;
      seen.add(`${lang}:${words}`);
    }
  }
  return {
    empty:
      areBlocksEmpty(question.blocks) &&
      (question.statements ?? []).every((statement) => isBiTextEmpty(statement)) &&
      blank.length === options.length,
    answerLetter: keyed ? toUpperLetter(answerIndex) : null,
    optionCount: options.length,
    blankOptions: blank.length,
    duplicateOptions,
  };
}

/**
 * The answer grid's letter — none when `answerIndex` points at no option — the
 * explanation, each option's rationale (lettered as this question prints) and the source note.
 */
function answerKey(question: McqQuestion): AnswerKeyEntry {
  const { answerIndex, options } = question;
  const keyed = Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length;
  const rationale = optionRationales(question).map(({ letter, text }) => ({ letter, text }));
  return {
    kind: 'choice',
    ...(keyed ? { letter: optionLabel(answerIndex).replace('.', '') } : {}),
    ...(isBiTextEmpty(question.explanation) ? {} : { note: question.explanation }),
    ...(rationale.length > 0 ? { rationale } : {}),
    ...(isBiTextEmpty(question.provenance) ? {} : { provenance: question.provenance }),
  };
}

/** The stem, statements and options for a quiz tool; the key only when it points at an option. */
function quizItem(question: McqQuestion): QuizItem {
  const { answerIndex, options } = question;
  const keyed = Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length;
  return {
    stem: question.blocks,
    statements: question.statements ?? [],
    options: options.map((option) => ({ text: option.text, figure: !areBlocksEmpty(option.blocks) })),
    ...(keyed ? { answerIndex } : {}),
  };
}

/** "All of the above", "none of these", "Both A and C", 以上皆是… — text whose meaning is its place. */
const POSITIONAL = [
  /\b(all|none|both|neither|either)\s+of\s+(the\s+)?(above|these|them|those)\b/i,
  /\b[A-D]\s*(,|&|and|or|及|和|或)\s*[A-D]\b/,
  /(以上|上述)(皆|均|全|都|各|所有)/,
];
/** "(1) and (2) only", "1, 2 and 3", "(i) only": a combination answer, ordered by convention. */
const COMBINATION = /^\s*([(（]\s*(\d+|[ivx]+)\s*[)）]|\d+\s*(,|、|&|and|及|和|only))/i;

function isPositional(text: BiText): boolean {
  const sides = [plain(text.en), plain(text.zh)];
  return POSITIONAL.some((pattern) => sides.some((side) => pattern.test(side)));
}

/** Whether every version prints this question in the authored order. */
export function keepsOptionOrder(question: McqQuestion): boolean {
  if ((question.statements ?? []).length > 0) return true;
  return question.options.some((option) =>
    [option.text.en, option.text.zh].some((side) => COMBINATION.test(plain(side))),
  );
}

/** Whether this option keeps its letter in every version: pinned, or its text says where it is. */
export function optionStaysPut(option: McqOption): boolean {
  return option.pinned === true || isPositional(option.text);
}

/**
 * Options reordered for one paper version; `answerIndex` follows its option. Pinned and
 * positional options keep their letter; combination questions never move.
 */
function variant(question: McqQuestion, context: VariantContext): QuestionVariant<McqQuestion> {
  if (context.version === 0 || keepsOptionOrder(question)) return { question };
  const order = shuffledOrder(
    question.options.map((option) => !optionStaysPut(option)),
    { seed: context.seed, version: context.version, id: question.id },
  );
  if (order.every((source, printed) => source === printed)) return { question };
  return {
    question: {
      ...question,
      options: order.map((source) => question.options[source]),
      answerIndex: order.indexOf(question.answerIndex),
    },
    sourceLetters: order.map(toUpperLetter),
  };
}

/**
 * Three blank lines between two MCQs on an exam paper, against the ordinary one.
 *
 * Measured off the reference (DSE 2021 P1): consecutive questions there sit three empty
 * paragraphs apart, while a stem sits one line from its own options. The paper is airier
 * than a worksheet on purpose — each question is self-contained and answered on a
 * separate machine-read sheet — so the boundary between two questions must read as a
 * stronger break than the boundary inside one. At one line the two read alike and the
 * options of Q7 crowd the stem of Q8.
 *
 * Applies **only on a Paper 1**, and only between two MCQs: `renderWorksheet` asks for it
 * on no other shape, so a classroom worksheet holding MCQs keeps the one-line rhythm it
 * has always printed.
 */
const MCQ_EXAM_GAP_LINES = 3;

export const mcqType: QuestionTypeDefinition<McqQuestion> = {
  id: 'mcq',
  displayName: bi('Multiple Choice', '多項選擇題'),
  create: createMcqQuestion,
  render,
  examGapLines: MCQ_EXAM_GAP_LINES,
  EditorPanel: McqEditorPanel,
  countMissingTranslations,
  healthFacts,
  answerKey,
  quizItem,
  variant,
};
