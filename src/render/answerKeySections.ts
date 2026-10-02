import type { ResolvedAnswerKeyLayout } from '@/model/answerKeyLayout';
import { DEFAULT_LIST_INDENTS, toUpperLetter } from '@/model/numbering';
import { DEFAULT_CELL_PADDING } from '@/model/table';
import { bi, isBiTextEmpty, provenanceLabel } from '@/model/text';
import type { BiText, ContentBlock, LanguageMode, LqKeyLayout, McKeyLayout } from '@/model/types';
import { hasAnswerLayer } from '@/model/diagramAnswers';
import {
  diagramNodeFor,
  pushGap,
  trailLabel,
  type EditTarget,
  type RenderNode,
  type TableCellEdges,
  type TableNode,
  type TableNodeCell,
  type TextNode,
} from './ir';
import { MARK_SCHEME_WORDING, renderMarkScheme } from './markScheme';
import { ANSWER_KEY_WORDING, KEY_LAYOUT_WORDING } from './answerKeyWording';
import type { KeyChoice, KeyGroup, KeyLine, KeyScheme } from './answerKey';

/**
 * The answer key's section layouts: how the MC answers and the long questions are laid
 * out, each a pure function from the key's data to IR. `render/answerKey.ts` collects
 * the data and a style (`ANSWER_KEY_STYLES`) arranges these; nothing here names a
 * question type. A new layout is one entry in `MC_KEY_RENDERERS` or `LQ_KEY_RENDERERS`
 * plus its id in `model/answerKeyLayout.ts`.
 */

/** Number/letter pairs per grid row. */
export const ANSWER_GRID_PAIRS_PER_ROW = 5;

/** What an unkeyed choice prints: a dash, never a guess. */
export const UNANSWERED_MARK = '—';

/**
 * The Marks column's width, in twips: room for the widest label it carries ("max: 10",
 * "最高10分"), and in bilingual mode both of those on one line.
 */
export function marksColumnWidth(language: LanguageMode): number {
  return language === 'bilingual' ? 1800 : 1080;
}

/**
 * A list of blocks' paragraphs as key lines, each typed where it prints (stems on). For
 * the registry's `answerKey` hooks; tables and figures stay on the paper.
 */
export function paragraphLines(blocks: readonly ContentBlock[]): KeyLine[] {
  return blocks.flatMap((block): KeyLine[] =>
    block.kind === 'paragraph' && !isBiTextEmpty(block.text)
      ? [{ text: block.text, edit: { kind: 'blockText', blockId: block.id } }]
      : [],
  );
}

/** Marks the nodes pushed since `from` as one question's entry (`AnswerKeyView.owners`). */
export type Own = (from: number, questionId: string) => void;

/** What every section renderer is handed. */
export interface KeySectionContext {
  language: LanguageMode;
  layout: ResolvedAnswerKeyLayout;
  own: Own;
}

/**
 * Language-neutral text (a number, a letter, "(a)"): one side in bilingual mode, where
 * two filled sides stack and would print it twice.
 */
export function neutral(text: string, language: LanguageMode): BiText {
  return language === 'bilingual' ? { en: [{ text }], zh: [] } : bi(text, text);
}

/** The sides a line prints in: one, or English then Chinese as separate rows. */
const sidesOf = (language: LanguageMode): Array<'en' | 'zh'> =>
  language === 'bilingual' ? ['en', 'zh'] : [language];

/** One side of `text` as a line of its own (a tab-stop row cannot stack two). */
function sideOnly(text: BiText, side: 'en' | 'zh', language: LanguageMode): BiText {
  if (language !== 'bilingual') return text;
  return side === 'en' ? { en: text.en, zh: [] } : { en: [], zh: text.zh };
}

// --- Front matter ------------------------------------------------------------------

/** The subtitle, disclaimer and legend a layout switches on, under the title. */
export function renderFrontMatter(nodes: RenderNode[], context: KeySectionContext): void {
  const { layout, language } = context;
  if (layout.subtitle) {
    nodes.push({
      kind: 'text',
      style: 'Body',
      text: layout.subtitle,
      keepNext: true,
      format: { align: 'center' },
    });
  }
  if (layout.showDisclaimer) {
    pushGap(nodes);
    nodes.push({ kind: 'text', style: 'Body', text: KEY_LAYOUT_WORDING.disclaimer, format: { italic: true } });
  }
  if (layout.showLegend) {
    pushGap(nodes);
    nodes.push({
      kind: 'text',
      style: 'Body',
      text: KEY_LAYOUT_WORDING.legendHeading,
      keepNext: true,
      format: { bold: true },
    });
    const rows = sidesOf(language).flatMap((side) =>
      KEY_LAYOUT_WORDING.legend.map((entry) => ({ side, entry })),
    );
    rows.forEach(({ side, entry }, index) => {
      nodes.push({
        kind: 'columns',
        style: 'Body',
        keepLines: true,
        ...(index < rows.length - 1 ? { keepNext: true } : {}),
        cells: [
          { text: sideOnly(entry.symbol, side, language), at: 0, format: { bold: true } },
          { text: sideOnly(entry.meaning, side, language), at: 0.14 },
        ],
      });
    });
  }
}

/** "Total: n marks" at the end of the key, right-aligned. */
export function renderPaperTotal(nodes: RenderNode[], total: number): void {
  pushGap(nodes);
  nodes.push({
    kind: 'text',
    style: 'Body',
    text: KEY_LAYOUT_WORDING.paperTotal(total),
    format: { bold: true, align: 'right' },
  });
}

// --- MC ----------------------------------------------------------------------------

const centred = (text: BiText, bold = false, edges?: TableCellEdges): TableNodeCell => ({
  text,
  colSpan: 1,
  rowSpan: 1,
  align: 'center',
  covered: false,
  padding: DEFAULT_CELL_PADDING,
  ...(bold ? { format: { bold: true } } : {}),
  ...(edges ? { edges } : {}),
});

/** Number → letter pairs, `ANSWER_GRID_PAIRS_PER_ROW` to a row; a short last row pads empty. */
export function answerGrid(choices: KeyChoice[], language: LanguageMode): TableNode {
  const cell = (text: string, bold = false) => centred(neutral(text, language), bold);

  const rows: TableNodeCell[][] = [];
  for (let start = 0; start < choices.length; start += ANSWER_GRID_PAIRS_PER_ROW) {
    const row: TableNodeCell[] = [];
    for (let offset = 0; offset < ANSWER_GRID_PAIRS_PER_ROW; offset++) {
      const choice = choices[start + offset];
      row.push(
        cell(choice ? String(choice.number) : ''),
        cell(choice ? (choice.letter ?? UNANSWERED_MARK) : '', true),
      );
    }
    rows.push(row);
  }

  const columnCount = ANSWER_GRID_PAIRS_PER_ROW * 2;
  return {
    kind: 'table',
    rows,
    columnCount,
    columnWidths: Array.from({ length: columnCount }, () => 1 / columnCount),
    width: 1,
    indent: 0,
    align: 'left',
    borders: 'all',
    rowHeights: rows.map(() => undefined),
    blockId: 'answer-key-grid',
    captionPlacement: 'below',
  };
}

/** Rows per block in the HKEAA table: a rule closes every five. */
const BLOCK = 5;

/**
 * The HKEAA Paper 1 key: "Question No. | Key" in two column pairs, the first half down
 * the left (1–25 | 26–45 for 45 questions), rows ruled off in blocks of five. A real
 * bordered table, as the grid is; each cell rules its own edges.
 */
export function hkeaaTable(choices: KeyChoice[], language: LanguageMode): TableNode {
  const down = Math.max(BLOCK, Math.ceil(Math.ceil(choices.length / 2) / BLOCK) * BLOCK);
  const pairs = choices.length > down ? 2 : 1;
  const columnCount = pairs * 2;
  const edges = (top: boolean, bottom: boolean): TableCellEdges => ({ top, bottom, left: true, right: true });

  const header = Array.from({ length: pairs }, () => [
    centred(KEY_LAYOUT_WORDING.questionNo, true, edges(true, true)),
    centred(KEY_LAYOUT_WORDING.key, true, edges(true, true)),
  ]).flat();
  const rows: TableNodeCell[][] = [header];
  const length = Math.min(down, choices.length);
  for (let index = 0; index < length; index++) {
    const ruled = edges(index % BLOCK === 0, index % BLOCK === BLOCK - 1 || index === length - 1);
    const row: TableNodeCell[] = [];
    for (let pair = 0; pair < pairs; pair++) {
      const choice = choices[pair * down + index];
      row.push(
        centred(neutral(choice ? `${choice.number}.` : '', language), false, ruled),
        centred(neutral(choice ? (choice.letter ?? UNANSWERED_MARK) : '', language), false, ruled),
      );
    }
    rows.push(row);
  }

  return {
    kind: 'table',
    rows,
    columnCount,
    columnWidths: Array.from({ length: columnCount }, () => 1 / columnCount),
    width: pairs === 2 ? 0.8 : 0.4,
    indent: 0,
    align: 'center',
    borders: 'headerRule',
    rowHeights: rows.map(() => undefined),
    blockId: 'answer-key-mc-table',
    captionPlacement: 'below',
  };
}

/** A choice with the notes its layout switches off removed. */
export function shownNotes(choice: KeyChoice, layout: ResolvedAnswerKeyLayout): KeyChoice {
  return {
    ...choice,
    note: layout.showExplanations ? choice.note : undefined,
    rationale: layout.showRationales ? choice.rationale : undefined,
    provenance: layout.showSources ? choice.provenance : undefined,
  };
}

/** Whether a choice has anything to print under the grid. */
export function hasNotes(choice: KeyChoice): boolean {
  return (
    (choice.note !== undefined && !isBiTextEmpty(choice.note)) ||
    (choice.rationale?.length ?? 0) > 0 ||
    (choice.provenance !== undefined && !isBiTextEmpty(choice.provenance))
  );
}

interface NoteLine {
  text: BiText;
  marker?: string;
  edit?: EditTarget;
  format?: TextNode['format'];
}

/** One question's note lines, its number riding the first: a hung list at the text column. */
function pushHungLines(nodes: RenderNode[], number: number, lines: NoteLine[], language: LanguageMode): void {
  lines.forEach((line, index) => {
    nodes.push({
      kind: 'columns',
      style: 'Body',
      indent: DEFAULT_LIST_INDENTS.stemText,
      hanging: DEFAULT_LIST_INDENTS.stemText,
      keepLines: true,
      ...(index < lines.length - 1 ? { keepNext: true } : {}),
      cells: [
        { text: neutral(index === 0 ? `${number}.` : '', language), at: 0 },
        {
          text: line.text,
          at: 0.5,
          ...(line.marker ? { marker: line.marker } : {}),
          ...(line.edit ? { edit: line.edit } : {}),
          ...(line.format ? { format: line.format } : {}),
        },
      ],
    });
  });
}

/** The explanation, each option's rationale, then the source note. */
function noteLines(choice: KeyChoice, language: LanguageMode): NoteLine[] {
  const lines: NoteLine[] = [];
  if (choice.note && !isBiTextEmpty(choice.note)) lines.push({ text: choice.note, edit: choice.noteEdit });
  for (const { letter, text, edit } of choice.rationale ?? []) lines.push({ text, marker: `${letter}.`, edit });
  if (choice.provenance && !isBiTextEmpty(choice.provenance)) {
    lines.push({ text: choice.provenance, marker: provenanceLabel(language), edit: choice.provenanceEdit });
  }
  return lines;
}

/**
 * The choices' notes, if any, as a hung list under the grid: the explanation beside the
 * number, then one "A. …" line per option rationale and a "Source:" line, all at the
 * explanation's text column. The number rides on the first line, whichever it is.
 * `versioned`: the rationale letters are Version A's, so the heading says so.
 */
export function renderNotes(
  nodes: RenderNode[],
  choices: KeyChoice[],
  language: LanguageMode,
  versioned: boolean,
  own: Own,
): void {
  const noted = choices.filter(hasNotes);
  if (noted.length === 0) return;
  const lettered = versioned && noted.some((choice) => (choice.rationale?.length ?? 0) > 0);
  const heading = lettered ? ANSWER_KEY_WORDING.explanationsVersionA : ANSWER_KEY_WORDING.explanations;
  nodes.push({
    kind: 'text',
    style: 'Body',
    text: bi(heading.en, heading.zh),
    keepNext: true,
    format: { bold: true },
  });
  for (const choice of noted) {
    const start = nodes.length;
    pushHungLines(nodes, choice.number, noteLines(choice, language), language);
    own(start, choice.questionId);
  }
}

/**
 * The list layout: a question per entry, its key beside the number (or, with stems on,
 * the stem there and "Answer: C" under it), its notes below at the same column.
 */
function renderChoiceList(nodes: RenderNode[], choices: KeyChoice[], context: KeySectionContext): void {
  const { language, layout, own } = context;
  for (const choice of choices) {
    const start = nodes.length;
    const letter = choice.letter ?? UNANSWERED_MARK;
    const stem = layout.showStems ? (choice.stem ?? []) : [];
    const lines: NoteLine[] = [
      ...stem.map((line) => ({ text: line.text, ...(line.edit ? { edit: line.edit } : {}) })),
      stem.length > 0
        ? { text: KEY_LAYOUT_WORDING.answer(letter), format: { bold: true } }
        : { text: neutral(letter, language), format: { bold: true } },
      ...noteLines(choice, language),
    ];
    pushHungLines(nodes, choice.number, lines, language);
    own(start, choice.questionId);
  }
}

/** How one MC layout prints a section's choices; `table` is its per-version key. */
export interface McKeyRenderer {
  render: (nodes: RenderNode[], choices: KeyChoice[], context: KeySectionContext) => void;
  /** One version's answers, when versions are on. Absent = the grid. */
  table?: (choices: KeyChoice[], language: LanguageMode) => TableNode;
}

/** Word follows every table with an empty paragraph, which is the gap below it. */
export const MC_KEY_RENDERERS: Record<McKeyLayout, McKeyRenderer> = {
  grid: {
    render: (nodes, choices, { language, own }) => {
      nodes.push(answerGrid(choices, language));
      renderNotes(nodes, choices, language, false, own);
    },
    table: answerGrid,
  },
  hkeaaTable: {
    render: (nodes, choices, { language, own }) => {
      nodes.push(hkeaaTable(choices, language));
      renderNotes(nodes, choices, language, false, own);
    },
    table: hkeaaTable,
  },
  list: { render: renderChoiceList },
};

// --- Long questions ------------------------------------------------------------------

/** Whether any of these nodes prints a label in the marks position. */
const carriesMarks = (nodes: TextNode[]) => nodes.some((node) => node.trail !== undefined || node.marks !== undefined);

/** Question or part wording before an answer: italic, typed where it prints. */
function stemNodes(lines: KeyLine[] | undefined, indent: number): TextNode[] {
  return (lines ?? []).map((line) => ({
    kind: 'text',
    style: 'Body',
    text: line.text,
    keepNext: true,
    ...(indent ? { indent } : {}),
    ...(line.edit ? { edit: line.edit } : {}),
    format: { italic: true },
  }));
}

/**
 * One marked question: its number, then a label line per part and sub-part carrying the
 * marks, with the author's scheme text under it at the paper's own text columns.
 *
 * `column` (the HKEAA layout): every paragraph stops short of a right-hand Marks column
 * (`TextNode.marksColumn`) and the column carries the marks where they are earned — a
 * point's "(1)", a group's `n@` and `max` — or, on a line with no marked scheme under
 * it, the line's own total as "(n)".
 */
function renderScheme(nodes: RenderNode[], scheme: KeyScheme, context: KeySectionContext, column?: number): void {
  const { language, layout, own } = context;
  const { question, partText, subPartText } = DEFAULT_LIST_INDENTS;
  const start = nodes.length;
  const stems = layout.showStems ? stemNodes(scheme.stem, question[0].left) : [];
  const total = layout.questionTotals && scheme.total > 0;
  const inColumn = (node: TextNode): TextNode => (column ? { ...node, marksColumn: column } : node);

  // The rows' scheme nodes first: whether a row's marks move into the column depends on them.
  const rows = scheme.rows.map((row) => ({
    row,
    schemeNodes: renderMarkScheme(row.scheme, {
      indent: row.depth === 1 ? partText : subPartText,
      ...(row.schemeAt ? { at: row.schemeAt } : {}),
    }),
  }));
  /** A line's own total: "(n marks)" at the line end, or "(n)" in an unclaimed column. */
  const marksOf = (marks: number | undefined, claimed: boolean): Partial<TextNode> => {
    if (marks === undefined) return {};
    if (!column) return { marks };
    return claimed ? {} : { trail: MARK_SCHEME_WORDING.mark(marks) };
  };

  nodes.push(
    inColumn({
      kind: 'text',
      style: 'Question Stem',
      text: bi(ANSWER_KEY_WORDING.question(scheme.number).en, ANSWER_KEY_WORDING.question(scheme.number).zh),
      ...marksOf(scheme.marks, rows.some(({ schemeNodes }) => carriesMarks(schemeNodes))),
      keepNext: scheme.rows.length > 0 || stems.length > 0 || total,
      format: { bold: true },
    }),
  );
  nodes.push(...stems.map(inColumn));
  rows.forEach(({ row, schemeNodes }, index) => {
    const labelIndent = row.depth === 1 ? question[0].left : partText;
    const answerIndent = row.depth === 1 ? partText : subPartText;
    const prompts = layout.showStems && row.label !== undefined ? stemNodes(row.prompt, answerIndent) : [];
    const hasAnswer =
      (row.answer !== undefined && !isBiTextEmpty(row.answer)) ||
      row.diagram !== undefined ||
      schemeNodes.length > 0;
    const last = index === scheme.rows.length - 1;
    if (row.label !== undefined) {
      nodes.push(
        inColumn({
          kind: 'text',
          style: row.depth === 1 ? 'Sub-question' : 'Sub-sub-question',
          text: neutral(row.label, language),
          ...marksOf(row.marks, carriesMarks(schemeNodes)),
          indent: labelIndent,
          keepNext: hasAnswer || !last || prompts.length > 0 || total,
        }),
      );
    }
    if (prompts.length > 0) {
      prompts[prompts.length - 1].keepNext = hasAnswer || !last || total;
      nodes.push(...prompts.map(inColumn));
    }
    if (row.answer !== undefined && !isBiTextEmpty(row.answer)) {
      nodes.push(
        inColumn({
          kind: 'text',
          style: 'Marking Scheme',
          text: row.answer,
          indent: answerIndent,
          ...(row.answerEdit ? { edit: row.answerEdit } : {}),
        }),
      );
    }
    // Not teacher-only: the whole key is the teacher's, answer layer included.
    if (row.diagram) {
      const node = diagramNodeFor(row.diagram, {});
      nodes.push(hasAnswerLayer(row.diagram.diagram) ? { ...node, answers: true } : node);
    }
    nodes.push(...schemeNodes.map(inColumn));
  });
  if (total) {
    // The total belongs to its question: whatever printed last keeps with it.
    // (Every node here is this call's own, so setting the flag mutates nothing shared.)
    const previous = nodes[nodes.length - 1];
    if (previous && previous.kind !== 'pageBreak') (previous as { keepNext?: boolean }).keepNext = true;
    nodes.push({
      kind: 'text',
      style: 'Body',
      text: KEY_LAYOUT_WORDING.questionTotal(scheme.total),
      format: { bold: true, align: 'right' },
    });
  }
  own(start, scheme.questionId);
}

/** How one long-question layout prints a question's entry. */
export type LqKeyRenderer = (nodes: RenderNode[], scheme: KeyScheme, context: KeySectionContext) => void;

export const LQ_KEY_RENDERERS: Record<LqKeyLayout, LqKeyRenderer> = {
  compact: (nodes, scheme, context) => renderScheme(nodes, scheme, context),
  marksColumn: (nodes, scheme, context) =>
    renderScheme(nodes, scheme, context, marksColumnWidth(context.language)),
};

/** Whether a key draws a Marks column anywhere: it then carries the "Marks" running head. */
export function hasMarksColumn(nodes: RenderNode[]): boolean {
  return nodes.some((node) => node.kind === 'text' && node.marksColumn !== undefined);
}

/**
 * The Marks column's head, "Marks" / "分數", printed right-aligned at the top of every
 * page of a key that has the column: a running header in the `.docx`, the same line in
 * the margin of each preview sheet. Derived from the nodes, so the two cannot disagree;
 * undefined = no column, no header (the key's header part stays absent, byte for byte).
 * A combined key has one header for all its parts: it shows if any part has the column.
 */
export function answerKeyRunningHead(nodes: RenderNode[], language: LanguageMode): string | undefined {
  return hasMarksColumn(nodes) ? trailLabel(KEY_LAYOUT_WORDING.marksHeader, language) : undefined;
}

// --- Versions ------------------------------------------------------------------------

/**
 * Question × version: each cell reads "A→C B→A …", the Version A letter of every
 * printed option, so any version's responses can be marked or pooled against A.
 */
export function renderVersionMap(
  nodes: RenderNode[],
  groups: KeyGroup[],
  letters: string[],
  language: LanguageMode,
): void {
  const { versionMap, versionMapHint, sameAsA } = ANSWER_KEY_WORDING;
  const others = letters.slice(1);
  pushGap(nodes);
  nodes.push({ kind: 'text', style: 'Section Heading', text: bi(versionMap.en, versionMap.zh), keepNext: true });
  nodes.push({ kind: 'text', style: 'Body', text: bi(versionMapHint.en, versionMapHint.zh), keepNext: true });

  const cell = (text: BiText, bold = false): TableNodeCell => ({
    text,
    colSpan: 1,
    rowSpan: 1,
    align: 'left',
    covered: false,
    padding: DEFAULT_CELL_PADDING,
    ...(bold ? { format: { bold: true } } : {}),
  });
  const same =
    language === 'bilingual' ? neutral(`${sameAsA.en} ${sameAsA.zh}`, language) : bi(sameAsA.en, sameAsA.zh);

  const rows: TableNodeCell[][] = [
    [cell(neutral('', language)), ...others.map((letter) => cell(neutral(letter, language), true))],
  ];
  for (const group of groups) {
    group.choices.forEach((choice) => {
      rows.push([
        cell(neutral(String(choice.number), language), true),
        ...others.map((_, offset) => {
          const map = choice.versions[offset + 1]?.sourceLetters;
          if (!map) return cell(same);
          return cell(neutral(map.map((source, printed) => `${toUpperLetter(printed)}→${source}`).join('  '), language));
        }),
      ]);
    });
  }

  const questionColumn = 0.1;
  nodes.push({
    kind: 'table',
    rows,
    columnCount: others.length + 1,
    columnWidths: [questionColumn, ...others.map(() => (1 - questionColumn) / others.length)],
    width: 1,
    indent: 0,
    align: 'left',
    borders: 'all',
    rowHeights: rows.map(() => undefined),
    blockId: 'answer-key-version-map',
    captionPlacement: 'below',
  });
}
