import { createDiagramBlock, createParagraphBlock, createSourceBlock, newId, nextSourceLetter } from './factories';
import { PART_TEXT_INDENT } from './numbering';
import { contentWidth, DEFAULT_PAGE_SETUP } from './page';
import { buildTableFromTemplate } from './tableTemplates';
import { bi, emptyBiText, plain } from './text';
import type {
  BiText,
  ContentBlock,
  ParagraphBlock,
  QuestionPart,
  QuestionSubPart,
  RichText,
  StructuredQuestion,
  TableBlock,
} from './types';

/**
 * A data-response question (DRQ) as DSE Paper 2 sets it (k-0474; DSE 2022–2026 read for it,
 * `Outbox/k-0474/DRQ-ANALYSIS.md`): an opening line, Sources A, B, C… each captioned
 * "Source X: …" above its frame, then parts that each open "Refer to Source X." and end
 * in a 14-mark essay part with a standard note printed before it.
 *
 * Nothing here is a new stored shape: a DRQ is an ordinary structured question whose stem
 * holds `source` blocks. These are starting values and text edits, so a document built
 * with them opens in every released build.
 */

/** What a new source can start with — the kinds the papers print, commonest first. */
export type SourceKind =
  | 'table'
  | 'barChart'
  | 'lineChart'
  | 'text'
  | 'views'
  | 'forum'
  | 'stakeholders';

export const SOURCE_KINDS: readonly SourceKind[] = [
  'table',
  'barChart',
  'lineChart',
  'text',
  'views',
  'forum',
  'stakeholders',
];

/** The diagram template behind each figure kind (`diagramTemplates.ts`). */
const FIGURE_TEMPLATE: Partial<Record<SourceKind, string>> = {
  barChart: 'bar-chart',
  lineChart: 'line-chart',
  forum: 'forum',
  stakeholders: 'stakeholders',
};

/** A small data table: a heading row over two rows of figures, as most DRQ tables are. */
function dataTable(): TableBlock {
  const table = buildTableFromTemplate('twoPeriod');
  // Full column inside a source's frame, and left-aligned there like the papers' tables.
  return { ...table, width: undefined, align: undefined };
}

/** The body a source of `kind` starts with. */
export function sourceBody(kind: SourceKind): ContentBlock[] {
  const template = FIGURE_TEMPLATE[kind];
  if (template) return [{ ...createDiagramBlock(template), align: 'center' }];
  if (kind === 'table') return [dataTable()];
  if (kind === 'views') return [buildTableFromTemplate('views')];
  return [createParagraphBlock()];
}

/** A lettered source holding a fresh body of `kind`. */
export function createSourceOf(kind: SourceKind, letter = 'A'): Extract<ContentBlock, { kind: 'source' }> {
  return { ...createSourceBlock(letter), blocks: sourceBody(kind) };
}

/** The letter the next source in `blocks` takes: one past the sources already there. */
export function nextLetterIn(blocks: readonly ContentBlock[]): string {
  return nextSourceLetter(blocks.filter((block) => block.kind === 'source').length);
}

/**
 * The letter a source goes by, for the panel: read from its caption ("Source B: …",
 * "資料B：…") when it names one, else its place among the stem's sources. Display only —
 * nothing stores an index (§`SourceBlock`).
 */
export function sourceLetter(
  block: Extract<ContentBlock, { kind: 'source' }>,
  ordinal: number,
): string {
  const label = block.label ? `${plain(block.label.en)} ${plain(block.label.zh)}` : '';
  const named = /(?:Source|資料)\s*([A-Z])\b/.exec(label);
  return named ? named[1] : nextSourceLetter(ordinal);
}

// ── "Refer to Source A." ────────────────────────────────────────────────────────────

/** The lead sentence as the papers word it: "Refer to Sources C and D." / "參閱資料C及D。" */
export function sourceReference(letters: readonly string[]): BiText {
  if (letters.length === 0) return emptyBiText();
  const list = (and: string, comma: string) =>
    letters.length === 1
      ? letters[0]
      : `${letters.slice(0, -1).join(comma)}${and}${letters[letters.length - 1]}`;
  const en = `Refer to Source${letters.length > 1 ? 's' : ''} ${list(' and ', ', ')}.`;
  const zh = `參閱資料${list('及', '、')}。`;
  return bi(en, zh);
}

const LEAD_EN = /^Refer to Sources? ([A-Z](?:(?:, | and )[A-Z])*)\.\s*/;
const LEAD_ZH = /^參閱資料([A-Z](?:[、及][A-Z])*)。\s*/;

/** The letters a part's opening "Refer to …" names, read from its first paragraph. */
export function referencedSources(blocks: readonly ContentBlock[]): string[] {
  const first = blocks[0];
  if (first?.kind !== 'paragraph') return [];
  const en = LEAD_EN.exec(plain(first.text.en));
  if (en) return en[1].split(/, | and /);
  const zh = LEAD_ZH.exec(plain(first.text.zh));
  return zh ? zh[1].split(/[、及]/) : [];
}

/** `text` with its opening lead sentence (if any) replaced by `lead` (none when empty). */
function withLead(text: RichText, pattern: RegExp, lead: string, gap: string): RichText {
  const runs = text.map((run) => ({ ...run }));
  const head = runs[0];
  const existing = head ? pattern.exec(head.text) : null;
  if (existing && head) {
    head.text = head.text.slice(existing[0].length);
    if (head.text === '') runs.shift();
  }
  if (!lead) return runs;
  // Its own plain run, so the sentence never inherits the bold of what follows. Chinese
  // runs on after 。 with no space.
  const rest = runs.length > 0 ? gap : '';
  return [{ text: `${lead}${rest}` }, ...runs];
}

/**
 * Set which sources a part's opening sentence refers to, in both languages at once.
 * Rewrites the "Refer to …" already there, adds one to the first paragraph, or — with no
 * paragraph first — inserts a paragraph for it. An empty list removes the sentence.
 */
export function withSourceReference(blocks: readonly ContentBlock[], letters: readonly string[]): ContentBlock[] {
  const sorted = [...new Set(letters)].sort();
  const lead = sourceReference(sorted);
  const first = blocks[0];
  if (first?.kind === 'paragraph') {
    const next: ParagraphBlock = {
      ...first,
      text: {
        en: withLead(first.text.en, LEAD_EN, plain(lead.en), ' '),
        zh: withLead(first.text.zh, LEAD_ZH, plain(lead.zh), ''),
      },
    };
    return [next, ...blocks.slice(1)];
  }
  if (sorted.length === 0) return [...blocks];
  return [createParagraphBlock(lead), ...blocks];
}

// ── The essay part's note ──────────────────────────────────────────────────────────

/**
 * The note every DRQ prints before its essay part, with that part's letter. Stored as
 * ordinary text (the part's interlude), so it opens in every build; the letter is the
 * one the part has when the note is added, and is the teacher's to edit afterwards.
 */
export function essayNote(partLetter: string): BiText {
  return bi(
    `For part ${partLetter}, candidates are required to present their answers in an essay form. ` +
      'Criteria for marking will include the use of the sources and economic theories, relevant content, ' +
      'logical presentation and clarity of expression.',
    `${partLetter}部須以短文形式作答。評分準則包括資料及經濟理論的運用、內容的相關性、表達的邏輯性及清晰程度。`,
  );
}

/** True when a part's interlude already opens with an essay note (either language). */
export function hasEssayNote(part: QuestionPart): boolean {
  const first = part.blocksBefore?.[0];
  if (first?.kind !== 'paragraph') return false;
  return /^For part /.test(plain(first.text.en)) || /部須以短文形式作答/.test(plain(first.text.zh));
}

// ── The DRQ starter ─────────────────────────────────────────────────────────────────

function partReferring(letters: string[], marks: number | undefined): QuestionPart {
  return { id: newId(), blocks: [createParagraphBlock(sourceReference(letters))], ...(marks !== undefined ? { marks } : {}) };
}

function subPart(): QuestionSubPart {
  // Unmarked: the group shares the part's one label after (ii), as 2024 (c) and 2025 (b) print it.
  return { id: newId(), blocks: [createParagraphBlock()] };
}

/**
 * The essay part's two-row table of strategies, as 2022–2025 each set one: from the part's
 * text column to the right margin, as the papers print it (flush at 0 would put it out in
 * the question number's gutter, left of "(e)").
 */
function strategyTable(contentWidthTwips: number): TableBlock {
  const table = buildTableFromTemplate('views');
  const indent = contentWidthTwips > 0 ? PART_TEXT_INDENT / contentWidthTwips : 0;
  const labels = [bi('Strategy 1', '策略一'), bi('Strategy 2', '策略二')];
  return {
    ...table,
    indent,
    width: 1 - indent,
    columnWidths: [0.22, 0.78],
    rows: labels.map((label, index) => ({
      id: newId(),
      cells: [
        { ...table.rows[index].cells[0], text: label },
        { ...table.rows[index].cells[1], text: emptyBiText() },
      ],
    })),
  };
}

/**
 * The stem and parts of a fresh DRQ, shaped like the papers': Sources A–D (a table, a bar
 * chart, a news extract, people's views), then (a) A, (b) B, (c) C and D in two sub-parts
 * sharing one mark, (d) D, and (e) the 14-mark essay with its note before it and a strategy
 * table. Totals 28 marks. Every caption and question line is the teacher's to type over.
 */
export function createDrqContent(
  contentWidthTwips: number = contentWidth(DEFAULT_PAGE_SETUP),
): Pick<StructuredQuestion, 'blocks' | 'parts'> {
  const kinds: SourceKind[] = ['table', 'barChart', 'text', 'views'];
  const blocks: ContentBlock[] = [
    createParagraphBlock(),
    ...kinds.map((kind, index) => createSourceOf(kind, nextSourceLetter(index))),
  ];
  const essay: QuestionPart = {
    id: newId(),
    blocksBefore: [createParagraphBlock(essayNote('(e)'))],
    blocks: [
      createParagraphBlock(bi('Suppose the Government is considering two strategies.', '假設政府正考慮兩項策略。')),
      strategyTable(contentWidthTwips),
      createParagraphBlock(
        bi(
          'With reference to the above sources and your own knowledge in Economics, discuss',
          '參考以上資料及就你的經濟學知識，討論',
        ),
      ),
    ],
    marks: 14,
  };
  const parts: QuestionPart[] = [
    partReferring(['A'], 2),
    partReferring(['B'], 3),
    { ...partReferring(['C', 'D'], 5), subParts: [subPart(), subPart()] },
    partReferring(['D'], 4),
    essay,
  ];
  return { blocks, parts };
}

/** A whole new DRQ, for the rail's Question menu. */
export function createDrqQuestion(contentWidthTwips?: number): StructuredQuestion {
  return { id: newId(), type: 'structured', ...createDrqContent(contentWidthTwips) };
}

/**
 * Whether a structured question is still the blank one a new question starts as — one
 * empty paragraph, and no more than one untouched part — so the panel can offer to turn it
 * into a DRQ without throwing anything away.
 */
export function isBlankStructured(question: StructuredQuestion): boolean {
  const blankBlocks = (blocks: readonly ContentBlock[]) =>
    blocks.every((block) => block.kind === 'paragraph' && plain(block.text.en) === '' && plain(block.text.zh) === '');
  return (
    blankBlocks(question.blocks) &&
    question.parts.length <= 1 &&
    question.parts.every(
      (part) =>
        blankBlocks(part.blocks) &&
        !(part.subParts?.length) &&
        !(part.blocksBefore?.length) &&
        (!part.answer || (plain(part.answer.en) === '' && plain(part.answer.zh) === '')),
    )
  );
}
