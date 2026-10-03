import type { ResolvedAnswerKeyLayout } from '@/model/answerKeyLayout';
import { DEFAULT_LIST_INDENTS, toUpperLetter } from '@/model/numbering';
import { DEFAULT_CELL_PADDING } from '@/model/table';
import { bi, isBiTextEmpty, plain, provenanceLabel } from '@/model/text';
import type { BiText, ContentBlock, LanguageMode, LqKeyLayout, McKeyLayout } from '@/model/types';
import { hasAnswerLayer } from '@/model/diagramAnswers';
import {
  diagramNodeFor,
  pushGap,
  trailLabel,
  type ColumnsNode,
  type EditSegment,
  type EditTarget,
  type RenderNode,
  type TableCellEdges,
  type TableNode,
  type TableNodeCell,
  type TextNode,
} from './ir';
import { MARK_SCHEME_WORDING, renderMarkScheme, schemePointGroups } from './markScheme';
import { ANSWER_KEY_WORDING, KEY_LAYOUT_WORDING } from './answerKeyWording';
import type { AnswerKeyRow, KeyChoice, KeyGroup, KeyLine, KeyScheme } from './answerKey';
import { schemeLevels } from '@/model/markScheme';

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
  /** The next figure number in this key (HKEAA's "Figure n"); derived per render, never stored. */
  nextFigure?: () => number;
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

/** A cell printing `choice`'s number or key: clicked on the page, it selects that question. */
const ownedBy = (cell: TableNodeCell, choice: KeyChoice | undefined): TableNodeCell =>
  choice ? { ...cell, questionId: choice.questionId } : cell;

/** Number → letter pairs, `ANSWER_GRID_PAIRS_PER_ROW` to a row; a short last row pads empty. */
export function answerGrid(choices: KeyChoice[], language: LanguageMode): TableNode {
  const cell = (text: string, bold = false) => centred(neutral(text, language), bold);

  const rows: TableNodeCell[][] = [];
  for (let start = 0; start < choices.length; start += ANSWER_GRID_PAIRS_PER_ROW) {
    const row: TableNodeCell[] = [];
    for (let offset = 0; offset < ANSWER_GRID_PAIRS_PER_ROW; offset++) {
      const choice = choices[start + offset];
      row.push(
        ownedBy(cell(choice ? String(choice.number) : ''), choice),
        ownedBy(cell(choice ? (choice.letter ?? UNANSWERED_MARK) : '', true), choice),
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
        ownedBy(centred(neutral(choice ? `${choice.number}.` : '', language), false, ruled), choice),
        ownedBy(centred(neutral(choice ? (choice.letter ?? UNANSWERED_MARK) : '', language), false, ruled), choice),
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
 * `versioned`: the rationale letters are Version A's, so the heading says so, unless
 * `versionHeading` names the version the letters belong to.
 */
export function renderNotes(
  nodes: RenderNode[],
  choices: KeyChoice[],
  language: LanguageMode,
  versioned: boolean,
  own: Own,
  versionHeading?: { en: string; zh: string },
): void {
  const noted = choices.filter(hasNotes);
  if (noted.length === 0) return;
  const lettered = versioned && noted.some((choice) => (choice.rationale?.length ?? 0) > 0);
  const heading =
    versionHeading ?? (lettered ? ANSWER_KEY_WORDING.explanationsVersionA : ANSWER_KEY_WORDING.explanations);
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

// --- The key's ruled tables ------------------------------------------------------------

/** A piece of a table cell: an authored field (typed where it prints) or derived wording. */
interface CellPiece {
  /** Derived wording before the field on its line ("C. ", "Source: "). */
  lead?: BiText;
  value: BiText;
  edit?: EditTarget;
  /** A field that is itself several (a point and its `/` alternatives). */
  segments?: { en: EditSegment[]; zh: EditSegment[] };
}

/**
 * Pieces as one cell, a line each: the joined text every backend prints and, when any
 * piece is typed on the page, the segments the preview edits it through (each field
 * alone; joined, a side's segments are exactly its text).
 */
function cellText(pieces: CellPiece[]): Pick<TableNodeCell, 'text' | 'edit' | 'segments'> {
  if (pieces.length === 0) return { text: { en: [], zh: [] } };
  const [only] = pieces;
  if (pieces.length === 1 && !only.lead && !only.segments) {
    return { text: only.value, ...(only.edit ? { edit: only.edit } : {}) };
  }
  const side = (key: 'en' | 'zh') => {
    const runs: BiText['en'] = [];
    const segments: EditSegment[] = [];
    pieces.forEach((piece, index) => {
      const derived = (text: BiText['en']) => {
        if (text.length === 0) return;
        runs.push(...text);
        segments.push({ runs: text });
      };
      if (index > 0) derived([{ text: '\n' }]);
      if (piece.lead) derived(piece.lead[key]);
      if (piece.segments) {
        runs.push(...piece.value[key]);
        segments.push(...piece.segments[key]);
      } else if (piece.edit) {
        runs.push(...piece.value[key]);
        segments.push({ edit: piece.edit, value: piece.value });
      } else {
        derived(piece.value[key]);
      }
    });
    return { runs, segments };
  };
  const en = side('en');
  const zh = side('zh');
  const typed = pieces.some((piece) => piece.edit || piece.segments);
  return {
    text: { en: en.runs, zh: zh.runs },
    ...(typed ? { segments: { en: en.segments, zh: zh.segments } } : {}),
  };
}

interface CellOptions {
  align?: TableNodeCell['align'];
  bold?: boolean;
  italic?: boolean;
  /** Spans this many columns; the row then carries `colSpan - 1` covered cells after it. */
  span?: number;
}

/** A body cell of the key's ruled tables: text at the top, as a long answer reads. */
function keyCell(content: Pick<TableNodeCell, 'text' | 'edit' | 'segments'>, options: CellOptions = {}): TableNodeCell {
  const format = {
    ...(options.bold ? { bold: true } : {}),
    ...(options.italic ? { italic: true } : {}),
  };
  return {
    ...content,
    colSpan: options.span ?? 1,
    rowSpan: 1,
    align: options.align ?? 'left',
    covered: false,
    padding: DEFAULT_CELL_PADDING,
    vAlign: 'top',
    ...(Object.keys(format).length > 0 ? { format } : {}),
  };
}

/** The cells a spanning cell covers: printed by none of the backends. */
const coveredCells = (count: number): TableNodeCell[] =>
  Array.from({ length: count }, () => ({ ...keyCell({ text: { en: [], zh: [] } }), covered: true }));

/** A heading row: bold, centred, a cell per column. */
const headingRow = (heads: BiText[]): TableNodeCell[] =>
  heads.map((head) => keyCell({ text: head }, { align: 'center', bold: true }));

/**
 * One of the key's ruled tables: a heading row that repeats on each page it runs onto,
 * and rows that keep with the next where `keep` says (`TableNode.rowKeepNext`), so it
 * breaks between rows in all three backends rather than moving whole.
 */
function keyTable(
  rows: TableNodeCell[][],
  keep: boolean[],
  columnWidths: number[],
  blockId: string,
  heading = 1,
): TableNode {
  return {
    kind: 'table',
    rows,
    columnCount: columnWidths.length,
    columnWidths,
    width: 1,
    indent: 0,
    align: 'left',
    // Rows ruled cell by cell (`ruledRows`) draw only their own edges.
    borders: rows.some((row) => row.some((cell) => cell.edges)) ? 'headerRule' : 'all',
    rowHeights: rows.map(() => undefined),
    blockId,
    captionPlacement: 'below',
    ...(heading > 0 ? { headerRows: heading } : {}),
    rowKeepNext: keep,
    ...(keep[keep.length - 1] ? { keepNext: true } : {}),
  };
}

// --- MC with reasons -----------------------------------------------------------------

/** Question | Key | Explanation | Why the other options are wrong. */
const RATIONALE_COLUMNS = [0.13, 0.08, 0.35, 0.44];

/**
 * The MC key with each question's reasoning (Edexcel-style): the explanation (with the
 * key's own reason and, switched on, the source note) beside why each other option is
 * wrong. Every reason is typed where it prints. Only drawn when some question has option
 * reasons to show; otherwise the layout is the HKEAA table.
 */
export function rationaleTable(choices: KeyChoice[], language: LanguageMode): TableNode {
  const rows: TableNodeCell[][] = [
    headingRow([KEY_LAYOUT_WORDING.tableQuestion, KEY_LAYOUT_WORDING.key, KEY_LAYOUT_WORDING.explanation, KEY_LAYOUT_WORDING.otherOptions]),
  ];
  for (const choice of choices) {
    const reasons = choice.rationale ?? [];
    const own = reasons.filter((reason) => reason.letter === choice.letter);
    const others = reasons.filter((reason) => reason.letter !== choice.letter);
    const explanation: CellPiece[] = [
      ...(choice.note && !isBiTextEmpty(choice.note) ? [{ value: choice.note, edit: choice.noteEdit }] : []),
      ...own.map((reason) => ({ lead: neutral(`${reason.letter}. `, language), value: reason.text, edit: reason.edit })),
      ...(choice.provenance && !isBiTextEmpty(choice.provenance)
        ? [{ lead: bi(`${provenanceLabel('en')} `, `${provenanceLabel('zh')}`), value: choice.provenance, edit: choice.provenanceEdit }]
        : []),
    ];
    rows.push([
      ownedBy(keyCell({ text: neutral(`${choice.number}.`, language) }, { align: 'center' }), choice),
      ownedBy(keyCell({ text: neutral(choice.letter ?? UNANSWERED_MARK, language) }, { align: 'center', bold: true }), choice),
      keyCell(cellText(explanation)),
      keyCell(
        cellText(others.map((reason) => ({ lead: neutral(`${reason.letter}. `, language), value: reason.text, edit: reason.edit }))),
      ),
    ]);
  }
  return keyTable(rows, rows.map((_, index) => index === 0), RATIONALE_COLUMNS, 'answer-key-mc-reasons');
}

const hasReasons = (choices: KeyChoice[]) => choices.some((choice) => (choice.rationale?.length ?? 0) > 0);

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
  /** The reasons table, or the HKEAA table and its notes when no question has reasons. */
  rationaleTable: {
    render: (nodes, choices, context) => {
      if (!hasReasons(choices)) {
        MC_KEY_RENDERERS.hkeaaTable.render(nodes, choices, context);
        return;
      }
      nodes.push(rationaleTable(choices, context.language));
    },
    table: hkeaaTable,
  },
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
 * it, the line's own total as "(n)". There a model answer diagram follows the scheme,
 * captioned "Figure n", its points under "Indicate in Figure n:" (HKEAA's order).
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
    const diagram = answerDiagramNode(row);
    // HKEAA (the Marks column): the points under "Indicate in Figure n:", then the figure
    // captioned "Figure n". Elsewhere the diagram precedes the scheme, uncaptioned.
    if (diagram && column) {
      const figure = context.nextFigure?.() ?? 1;
      if (schemeNodes.length > 0) {
        nodes.push(
          inColumn({
            kind: 'text',
            style: 'Marking Scheme',
            text: KEY_LAYOUT_WORDING.indicateIn(figure),
            indent: answerIndent,
            keepNext: true,
          }),
          ...schemeNodes.map(inColumn),
        );
      }
      nodes.push(
        { kind: 'text', style: 'Body', text: KEY_LAYOUT_WORDING.figure(figure), keepNext: true, format: { align: 'center' } },
        diagram,
      );
      return;
    }
    // Not teacher-only: the whole key is the teacher's, answer layer included.
    if (diagram) nodes.push(diagram);
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

/** A row's model answer diagram, its answer layer drawn (the whole key shows answers). */
function answerDiagramNode(row: AnswerKeyRow): RenderNode | undefined {
  if (!row.diagram) return undefined;
  const node = diagramNodeFor(row.diagram, {});
  return hasAnswerLayer(row.diagram.diagram) ? { ...node, answers: true } : node;
}

/** The bullet's hang: the point's text column sits this far right of the bullet. */
const BULLET_HANG = 240;

/**
 * Suggested answers (`lqLayout: 'answers'`), the student handout: each part's label,
 * its wording (stems on), its answer text, its model diagram with the answer layer drawn
 * in the same red as everywhere else (the layer *is* the answer here, and one colour is
 * what students saw marked), and, switched on, the first route's marking points as plain
 * bullets — `text / alternative`, no marks, no `n@`, no "any N", no `max`, no OR, no
 * levels or EC. Other routes are left out: without "OR" they would read as more points
 * to learn rather than another way to answer. Marks print only as the paper's own
 * "(3 marks)" on a label, and only with `showPartMarks`.
 */
function renderAnswers(nodes: RenderNode[], scheme: KeyScheme, context: KeySectionContext): void {
  const { language, layout, own } = context;
  const { question, partText, subPartText } = DEFAULT_LIST_INDENTS;
  const start = nodes.length;
  const stems = layout.showStems ? stemNodes(scheme.stem, question[0].left) : [];
  const total = layout.questionTotals && scheme.total > 0;
  const marksOf = (marks: number | undefined): Partial<TextNode> =>
    layout.showPartMarks && marks !== undefined ? { marks } : {};

  const rows = scheme.rows.map((row) => {
    const indent = row.depth === 1 ? partText : subPartText;
    const [route] = layout.schemeAsPoints ? schemePointGroups(row.scheme, row.schemeAt) : [];
    const points = (route ?? []).flatMap((group) => group.points);
    const bullets: ColumnsNode[] = points.map((point) => ({
      kind: 'columns',
      style: 'Body',
      indent: indent + BULLET_HANG,
      hanging: BULLET_HANG,
      keepLines: true,
      cells: [
        { text: neutral('•', language), at: 0 },
        {
          text: point.text,
          at: 0.04,
          ...(point.segments ? { segments: point.segments } : point.edit ? { edit: point.edit } : {}),
        },
      ],
    }));
    return { row, indent, bullets };
  });

  nodes.push({
    kind: 'text',
    style: 'Question Stem',
    text: bi(ANSWER_KEY_WORDING.question(scheme.number).en, ANSWER_KEY_WORDING.question(scheme.number).zh),
    ...marksOf(scheme.marks),
    keepNext: rows.length > 0 || stems.length > 0 || total,
    format: { bold: true },
  });
  nodes.push(...stems);
  rows.forEach(({ row, indent, bullets }, index) => {
    const prompts = layout.showStems && row.label !== undefined ? stemNodes(row.prompt, indent) : [];
    const answered = row.answer !== undefined && !isBiTextEmpty(row.answer);
    const hasAnswer = answered || row.diagram !== undefined || bullets.length > 0;
    const last = index === rows.length - 1;
    if (row.label !== undefined) {
      nodes.push({
        kind: 'text',
        style: row.depth === 1 ? 'Sub-question' : 'Sub-sub-question',
        text: neutral(row.label, language),
        ...marksOf(row.marks),
        indent: row.depth === 1 ? question[0].left : partText,
        keepNext: hasAnswer || !last || prompts.length > 0 || total,
      });
    }
    if (prompts.length > 0) {
      prompts[prompts.length - 1].keepNext = hasAnswer || !last || total;
      nodes.push(...prompts);
    }
    if (answered) {
      nodes.push({
        kind: 'text',
        style: 'Body',
        text: row.answer!,
        indent,
        keepLines: true,
        ...(row.answerEdit ? { edit: row.answerEdit } : {}),
      });
    }
    const diagram = answerDiagramNode(row);
    if (diagram) nodes.push(diagram);
    nodes.push(...bullets);
  });
  if (total) {
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

/** Question | Answer | Marks | Guidance. */
const SCHEME_TABLE_COLUMNS = [0.12, 0.5, 0.1, 0.28];
/** Level | Descriptor | Marks. */
const LEVELS_TABLE_COLUMNS = [0.12, 0.76, 0.12];

/** One drafted body row of the Detailed table: its cells, its keep, whether it opens a part. */
interface DraftRow {
  cells: TableNodeCell[];
  keepNext: boolean;
  opensPart: boolean;
}

/**
 * Rule a run of drafted rows the way a CIE scheme is ruled: every column, a heading row
 * boxed, a rule above each part, and none between the lines of one part, so a part reads
 * as one cell. A run's first and last rows close it (a diagram may interrupt the table).
 */
function ruledRows(heading: TableNodeCell[] | undefined, rows: DraftRow[]): { cells: TableNodeCell[][]; keep: boolean[] } {
  const all = [...(heading ? [{ cells: heading, keepNext: true, opensPart: true }] : []), ...rows];
  return {
    cells: all.map((row, index) => {
      const top = index === 0 || row.opensPart;
      const bottom = index === all.length - 1 || all[index + 1].opensPart;
      return row.cells.map((cell) => ({ ...cell, edges: { top, bottom, left: true, right: true } }));
    }),
    keep: all.map((row, index) => row.keepNext && index < all.length - 1),
  };
}

/**
 * The Detailed table (`lqLayout: 'table'`, CIE-style): each question a ruled table,
 * Question | Answer | Marks | Guidance under a heading row that repeats on every page it
 * runs onto. A part's first row carries its label ("3(b)(i)") and, stems on, its wording;
 * then its answer text; then a row per marking point with its mark, the group's rules
 * spelled out in Guidance on its first point (any N, first N only, n marks each, max, OR).
 * A line's own total shows only where no point claims the marks, as the Marks column
 * does. A model diagram ends the table and prints full width under it, the table going
 * on below. Levels and EC follow the question in a Level | Descriptor | Marks table.
 * Rows break between points, never inside one, in all three backends.
 */
function renderSchemeTable(nodes: RenderNode[], scheme: KeyScheme, context: KeySectionContext): void {
  const { language, layout, own } = context;
  const start = nodes.length;
  const empty: BiText = { en: [], zh: [] };
  const heading = headingRow([
    KEY_LAYOUT_WORDING.tableQuestion,
    KEY_LAYOUT_WORDING.tableAnswer,
    KEY_LAYOUT_WORDING.tableMarks,
    KEY_LAYOUT_WORDING.tableGuidance,
  ]);
  let headed = false;
  let rows: DraftRow[] = [];
  let piece = 0;
  /** Close the table so far; `keepNext`: it keeps with what follows (a diagram). */
  const flush = (keepNext = false) => {
    if (rows.length === 0) return;
    const ruled = ruledRows(headed ? undefined : heading, rows);
    if (keepNext) ruled.keep[ruled.keep.length - 1] = true;
    nodes.push(
      keyTable(ruled.cells, ruled.keep, SCHEME_TABLE_COLUMNS, `answer-key-scheme-${scheme.questionId}-${piece}`, headed ? 0 : 1),
    );
    headed = true;
    piece += 1;
    rows = [];
  };
  const marksCell = (marks: number | undefined) =>
    keyCell({ text: neutral(marks !== undefined ? String(marks) : '', language) }, { align: 'center' });
  const row = (question: string, answer: Pick<TableNodeCell, 'text' | 'edit' | 'segments'>, marks: number | undefined, guidance: BiText, options: { italic?: boolean; opensPart?: boolean; keepNext?: boolean } = {}) => {
    rows.push({
      cells: [
        keyCell({ text: neutral(question, language) }),
        keyCell(answer, { italic: options.italic }),
        marksCell(marks),
        keyCell({ text: guidance }),
      ],
      keepNext: options.keepNext ?? false,
      opensPart: options.opensPart ?? false,
    });
  };

  if (layout.showStems) {
    (scheme.stem ?? []).forEach((line, index) => {
      rows.push({
        cells: [
          keyCell({ text: line.text, ...(line.edit ? { edit: line.edit } : {}) }, { italic: true, span: 4 }),
          ...coveredCells(3),
        ],
        keepNext: true,
        opensPart: index === 0,
      });
    });
  }

  const levelTables: Array<{ label: string; row: AnswerKeyRow }> = [];
  let part = '';
  scheme.rows.forEach((entry, index) => {
    if (entry.depth === 1 && entry.label !== undefined) part = entry.label;
    const label =
      entry.label === undefined
        ? index === 0
          ? String(scheme.number)
          : ''
        : `${scheme.number}${entry.depth === 2 ? part : ''}${entry.label}`;
    let pending = label;
    let opens = entry.label !== undefined || index === 0;
    /** The part's label and opening rule ride on whichever row comes first. */
    const take = () => {
      const out = { question: pending, opensPart: opens };
      pending = '';
      opens = false;
      return out;
    };
    const groups = schemePointGroups(entry.scheme, entry.schemeAt);
    const pointMarks = (each: number | undefined, marks: number | undefined) => each ?? marks;
    const claimed = groups.some((route) =>
      route.some((group) => group.points.some(({ point }) => pointMarks(group.each, point.marks) !== undefined)),
    );
    let ownMarks = claimed ? undefined : entry.marks;
    const marks = () => {
      const out = ownMarks;
      ownMarks = undefined;
      return out;
    };
    const hasPoints = groups.length > 0;
    const answered = entry.answer !== undefined && !isBiTextEmpty(entry.answer);

    const prompts = layout.showStems && entry.label !== undefined ? (entry.prompt ?? []) : [];
    prompts.forEach((line) => {
      const head = take();
      row(head.question, { text: line.text, ...(line.edit ? { edit: line.edit } : {}) }, undefined, empty, {
        italic: true,
        opensPart: head.opensPart,
        keepNext: true,
      });
    });
    if (answered) {
      const head = take();
      row(head.question, { text: entry.answer!, ...(entry.answerEdit ? { edit: entry.answerEdit } : {}) }, marks(), empty, {
        opensPart: head.opensPart,
        keepNext: hasPoints,
      });
    }
    // A label no row has carried yet gets its own, when no point will carry it first —
    // unless it only heads its sub-parts ("3(b)" before "3(b)(i)"), which carry it.
    const diagram = answerDiagramNode(entry);
    const headsSubParts = entry.marks === undefined && scheme.rows[index + 1]?.depth === 2;
    if (pending !== '' && (!hasPoints || diagram) && (diagram || !headsSubParts)) {
      const head = take();
      row(head.question, { text: empty }, marks(), empty, { opensPart: head.opensPart, keepNext: hasPoints });
    }
    if (diagram) {
      flush(true);
      nodes.push(diagram);
    }
    groups.forEach((route, routeIndex) => {
      route.forEach((group, groupIndex) => {
        const rules: BiText[] = [
          ...(routeIndex > 0 && groupIndex === 0 ? [KEY_LAYOUT_WORDING.orRoute] : []),
          ...(group.take !== undefined ? [MARK_SCHEME_WORDING.any(group.take)] : []),
          ...(group.take !== undefined && group.group.firstOnly ? [MARK_SCHEME_WORDING.firstOnly(group.take)] : []),
          ...(group.each !== undefined ? [KEY_LAYOUT_WORDING.eachMark(group.each)] : []),
          ...(typeof group.group.max === 'number' && group.group.max >= 0 ? [MARK_SCHEME_WORDING.max(group.group.max)] : []),
        ];
        // A rule a row, beside the points from the first: one tall cell would hold a
        // whole page's rows together. A part has no rules inside, so they read as one.
        const count = Math.max(group.points.length, rules.length);
        for (let line = 0; line < count; line += 1) {
          const point = group.points[line];
          const head = take();
          const own = point ? pointMarks(group.each, point.point.marks) : undefined;
          rows.push({
            cells: [
              keyCell({ text: neutral(head.question, language) }),
              keyCell(
                point
                  ? { text: point.text, ...(point.segments ? { segments: point.segments } : point.edit ? { edit: point.edit } : {}) }
                  : { text: empty },
              ),
              marksCell(point ? (own ?? marks()) : undefined),
              keyCell({ text: rules[line] ?? empty }),
            ],
            // A rule that outruns its points stays beside them.
            keepNext: line + 1 < count && line + 1 >= group.points.length,
            opensPart: head.opensPart || (routeIndex > 0 && groupIndex === 0 && line === 0),
          });
        }
      });
    });
    if (entry.scheme && (schemeLevels(entry.scheme).length > 0 || entry.scheme.ec)) {
      levelTables.push({ label: label || String(scheme.number), row: entry });
    }
  });

  if (layout.questionTotals && scheme.total > 0) {
    if (rows.length > 0) rows[rows.length - 1].keepNext = true;
    rows.push({
      cells: [
        keyCell({ text: neutral('', language) }),
        keyCell({ text: KEY_LAYOUT_WORDING.total }, { align: 'right', bold: true }),
        keyCell({ text: neutral(String(scheme.total), language) }, { align: 'center', bold: true }),
        keyCell({ text: empty }),
      ],
      keepNext: false,
      opensPart: true,
    });
  }
  flush();

  for (const { label, row: entry } of levelTables) {
    renderLevelsTable(nodes, label, entry, language);
  }
  own(start, scheme.questionId);
}

/**
 * A leaf's levels and EC after its question (Detailed table): a bold line naming the part,
 * then Level | Descriptor | Marks, the EC rows under their own spanning head. Each
 * descriptor is typed where it prints.
 */
function renderLevelsTable(nodes: RenderNode[], label: string, row: AnswerKeyRow, language: LanguageMode): void {
  const scheme = row.scheme!;
  const at = row.schemeAt;
  const levels = schemeLevels(scheme);
  const heading = levels.length > 0 ? MARK_SCHEME_WORDING.levels : MARK_SCHEME_WORDING.ec;
  pushGap(nodes);
  nodes.push({
    kind: 'text',
    style: 'Body',
    text: bi(`${label} ${plain(heading.en)}`, `${label} ${plain(heading.zh)}`),
    keepNext: true,
    format: { bold: true },
  });
  const rows: TableNodeCell[][] = [
    headingRow([KEY_LAYOUT_WORDING.level, KEY_LAYOUT_WORDING.descriptor, KEY_LAYOUT_WORDING.tableMarks]),
  ];
  const keep: boolean[] = [true];
  levels.forEach((level, index) => {
    rows.push([
      keyCell({ text: neutral(String(index + 1), language) }, { align: 'center' }),
      keyCell({ text: level.descriptor, ...(at ? { edit: { kind: 'schemeLevel', ...at, levelId: level.id } } : {}) }),
      keyCell(
        { text: neutral(level.min === level.max ? `${level.min}` : `${level.min}–${level.max}`, language) },
        { align: 'center' },
      ),
    ]);
    keep.push(false);
  });
  if (scheme.ec) {
    rows.push([
      keyCell({ text: MARK_SCHEME_WORDING.ec }, { bold: true, span: 2 }),
      ...coveredCells(1),
      keyCell({ text: MARK_SCHEME_WORDING.max(scheme.ec.max) }, { align: 'center', bold: true }),
    ]);
    keep.push(true);
    for (const descriptor of scheme.ec.descriptors ?? []) {
      rows.push([
        keyCell({ text: neutral('', language) }),
        keyCell({ text: descriptor.text, ...(at ? { edit: { kind: 'schemeEc', ...at, descriptorId: descriptor.id } } : {}) }),
        keyCell({ text: neutral(String(descriptor.marks), language) }, { align: 'center' }),
      ]);
      keep.push(false);
    }
  }
  keep[keep.length - 1] = false;
  nodes.push(keyTable(rows, keep, LEVELS_TABLE_COLUMNS, `answer-key-levels-${at?.subPartId ?? at?.partId ?? label}`));
}

/** How one long-question layout prints a question's entry. */
export type LqKeyRenderer = (nodes: RenderNode[], scheme: KeyScheme, context: KeySectionContext) => void;

export const LQ_KEY_RENDERERS: Record<LqKeyLayout, LqKeyRenderer> = {
  compact: (nodes, scheme, context) => renderScheme(nodes, scheme, context),
  marksColumn: (nodes, scheme, context) =>
    renderScheme(nodes, scheme, context, marksColumnWidth(context.language)),
  table: renderSchemeTable,
  answers: renderAnswers,
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
