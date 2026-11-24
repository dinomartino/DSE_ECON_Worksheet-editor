import type { BiDraft } from '@/generate/types';
import { flattenBlocks } from '@/model/edits';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import { questionTexts } from '@/model/textWalk';
import type { BiText, ContentBlock, McqQuestion, Question, TableBlock } from '@/model/types';
import { placedFigureBlocks } from './figures';
import type { DiagramReference } from '@/diagramGen/types';
import type { CorpusDoc, CorpusKind } from './nearCopy';
import type { SourceQuestion } from './types';

/**
 * A question as the studio reads it: to write like (`sourceFromQuestion`), or as words to
 * compare a draft with (`corpusDocOf`). Text only: pictures are noted, never described.
 */

const SIDES: readonly Side[] = ['en', 'zh'];

const biOf = (text: BiText): BiDraft => ({ en: plain(text.en).trim(), zh: plain(text.zh).trim() });

/** The marker a picture leaves in an example's words; `figureAt` says which picture sits there (k-0544). */
export const PICTURE_MARK = '[picture]';

/**
 * A table as plain lines: one per row, cells joined by " | ". A merged cell's words fill every
 * cell it covers, so each column keeps its heading ("Total expenditure ($) | Total expenditure
 * ($)" over "Mary | Peter"); a cell holding a picture says so after its label ("(1) [picture]").
 */
function tableLines(table: TableBlock, side: Side): string {
  const grid = table.rows.map((row) => row.cells.map((cell) => (cell.covered ? null : [plain(cell.text[side]).trim(), cell.image ? PICTURE_MARK : ''].filter(Boolean).join(' '))));
  table.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (cell.covered) return;
      for (let dr = 0; dr < (cell.rowSpan ?? 1); dr += 1) {
        for (let dc = 0; dc < (cell.colSpan ?? 1); dc += 1) {
          if ((dr || dc) && grid[r + dr] && grid[r + dr][c + dc] === null) grid[r + dr][c + dc] = grid[r][c];
        }
      }
    }),
  );
  return grid
    .map((row) => row.map((text) => text ?? '').join(' | '))
    .filter((line) => line.replace(/[|\s]/g, '') !== '')
    .join('\n');
}

/**
 * Blocks as plain text per side: paragraphs, table rows, source labels, in order; two tables
 * in a row are kept apart by a blank line. A picture or diagram sets `figure` (the words cannot
 * carry it) and leaves `PICTURE_MARK` where it sits.
 */
export function blocksText(blocks: ContentBlock[]): { text: BiDraft; figure: boolean } {
  const out: Record<Side, string[]> = { en: [], zh: [] };
  let figure = false;
  let lastTable = false;
  // A grid's figures print under their labels ("(1) [picture]"), read once at the grid (k-0545).
  const inGrid = new Set<string>();
  for (const block of flattenBlocks(blocks)) {
    if (block.kind === 'figureRow' || inGrid.has(block.id)) continue;
    if (block.kind === 'figureGrid') {
      figure = true;
      for (const cell of block.cells) {
        inGrid.add(cell.figure.id);
        for (const side of SIDES) out[side].push(`${plain(cell.label?.[side]).trim()} ${PICTURE_MARK}`.trim());
      }
      lastTable = false;
      continue;
    }
    if (block.kind === 'paragraph') {
      for (const side of SIDES) out[side].push(plain(block.text[side]).trim());
    } else if (block.kind === 'table') {
      for (const side of SIDES) out[side].push((lastTable ? '\n' : '') + tableLines(block, side));
      if (block.caption) for (const side of SIDES) out[side].push(plain(block.caption[side]).trim());
      if (block.rows.some((row) => row.cells.some((cell) => cell.image && !cell.covered))) figure = true;
    } else if (block.kind === 'source') {
      if (block.label) for (const side of SIDES) out[side].push(plain(block.label[side]).trim());
    } else if (block.kind === 'image' || block.kind === 'diagram') {
      figure = true;
      for (const side of SIDES) out[side].push(PICTURE_MARK);
    }
    lastTable = block.kind === 'table' && !block.caption;
  }
  const join = (side: Side) => out[side].filter(Boolean).join('\n');
  // A side with no words of its own keeps no bare picture marks.
  const words = (side: Side) => (out[side].some((t) => t && t !== PICTURE_MARK) ? join(side) : '');
  return { text: { en: words('en'), zh: words('zh') }, figure };
}

/** An option's words: its line, then anything printed under it (a table as lines, a picture as `PICTURE_MARK`). */
function optionText(option: McqQuestion['options'][number]): { text: BiDraft; figure: boolean } {
  const line = biOf(option.text);
  if (!option.blocks?.length) return { text: line, figure: false };
  const under = blocksText(option.blocks);
  const both = (side: Side) => [line[side], under.text[side] || (under.figure ? PICTURE_MARK : '')].filter(Boolean).join('\n');
  return { text: { en: both('en'), zh: both('zh') }, figure: under.figure };
}

/**
 * A multiple-choice question as an example to write like. `passage` is the shared passage
 * printed before it (a bank topic keeps that in a stimulus element beside the question).
 * `label` stays on the teacher's side.
 */
export function sourceFromQuestion(
  question: McqQuestion,
  opts: { id?: string; label: string; passage?: ContentBlock[] },
): SourceQuestion {
  const stem = blocksText(question.blocks);
  const passage = opts.passage?.length ? blocksText(opts.passage) : null;
  const options = question.options.map(optionText);
  const optionFigure = options.some((o) => o.figure);
  const key = question.answerIndex;
  const placed = placedFigureBlocks(question, opts.passage);
  const explanation = question.explanation ? biOf(question.explanation) : undefined;
  return {
    id: opts.id ?? question.id,
    label: opts.label,
    ...(passage && (passage.text.en || passage.text.zh) ? { passage: passage.text } : {}),
    stem: stem.text,
    statements: (question.statements ?? []).map(biOf),
    options: options.map((o) => o.text),
    answerIndex: Number.isInteger(key) && key >= 0 && key < question.options.length ? key : -1,
    ...(explanation && (explanation.en || explanation.zh) ? { explanation } : {}),
    hasFigure: stem.figure || (passage?.figure ?? false) || optionFigure,
    ...(question.options.some((o) => flattenBlocks(o.blocks ?? []).some((b) => b.kind === 'table')) ? { optionTables: true } : {}),
    ...(placed.length ? { figureBlocks: placed.map((p) => p.block), figurePlaces: placed.map((p) => p.at), ...(placed.some((p) => p.cell) ? { figureGrid: placed.map((p) => p.cell ?? null) } : {}) } : {}),
  };
}

/** The printed words of any question, English and 中文 apart, in reading order. */
export function corpusDocOf(question: Question, kind: CorpusKind, id = question.id): CorpusDoc {
  const words: Record<Side, string[]> = { en: [], zh: [] };
  for (const slot of questionTexts(question)) {
    if (slot.role !== 'print' || slot.unprinted) continue;
    for (const side of SIDES) {
      const text = plain(slot.text[side]).trim();
      if (text) words[side].push(text);
    }
  }
  return { id, kind, en: words.en.join(' '), zh: words.zh.join(' ') };
}

/** An example's own words as a corpus doc: a draft must not copy what it was shown. */
export function corpusDocOfSource(source: SourceQuestion): CorpusDoc {
  const parts = (side: Side) =>
    [source.passage?.[side], source.stem[side], ...source.statements.map((s) => s[side]), ...source.options.map((o) => o[side])]
      .filter((text): text is string => Boolean(text))
      .join(' ');
  return { id: source.id, kind: 'example', en: parts('en'), zh: parts('zh') };
}

/** A draft's own words as a corpus doc. */
export function corpusDocOfDraft(id: string, draft: { stem: BiDraft; statements: BiDraft[]; options: BiDraft[] }): CorpusDoc {
  const parts = (side: Side) => [draft.stem[side], ...draft.statements.map((s) => s[side]), ...draft.options.map((o) => o[side])].filter(Boolean).join(' ');
  return { id, kind: 'draft', en: parts('en').replace(/\*\*/g, ''), zh: parts('zh').replace(/\*\*/g, '') };
}

/** Whether an example is a combination item (statements (1)(2)(3)). */
export const isCombinationSource = (source: SourceQuestion): boolean => source.statements.length >= 2;

/**
 * The figure of the example a draft follows, for `generateDiagram`'s `reference` (k-0514):
 * in pattern mode draft n follows example n (cycling), otherwise the first example that has a
 * figure. An editor diagram is sent as words (every provider reads that); a picture only when
 * the provider reads pictures: the stem's, else a set drawn as one, with where it is printed
 * (k-0544). Undefined when the example has none.
 */
export function referenceFor(examples: readonly SourceQuestion[], index: number, vision: boolean): DiagramReference | undefined {
  const pool = examples.filter((e) => e.hasFigure || e.figureBlocks?.length || e.figures?.length);
  if (pool.length === 0) return undefined;
  const own = examples[index % examples.length];
  const example = own && pool.includes(own) ? own : pool[0];
  const block = example.figureBlocks?.find((b): b is Extract<ContentBlock, { kind: 'diagram' }> => b.kind === 'diagram');
  if (block) return { diagram: block.diagram };
  // The picture the question is built on (k-0544): the stem's or the passage's first, then a set
  // drawn as one (a grid, the options), then whatever there is — never option A's alone by default.
  const figures = example.figures ?? [];
  const at = example.figureAt ?? [];
  const order = [(p: string) => /^(stem|passage)/.test(p), (p: string) => p.includes('in one picture'), () => true];
  const pick = order.map((test) => figures.findIndex((_, i) => test(at[i] ?? ''))).find((i) => i >= 0) ?? -1;
  if (pick < 0 || !vision) return undefined;
  const where = at[pick];
  return { image: figures[pick], ...(where && where !== 'figure' ? { text: `The attached picture is the past question's ${where}.` } : {}) };
}
