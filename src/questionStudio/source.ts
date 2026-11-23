import type { BiDraft } from '@/generate/types';
import { flattenBlocks } from '@/model/edits';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import { questionTexts } from '@/model/textWalk';
import type { BiText, ContentBlock, McqQuestion, Question, TableBlock } from '@/model/types';
import { figureBlocksOf } from './figures';
import type { CorpusDoc, CorpusKind } from './nearCopy';
import type { SourceQuestion } from './types';

/**
 * A question as the studio reads it: to write like (`sourceFromQuestion`), or as words to
 * compare a draft with (`corpusDocOf`). Text only: pictures are noted, never described.
 */

const SIDES: readonly Side[] = ['en', 'zh'];

const biOf = (text: BiText): BiDraft => ({ en: plain(text.en).trim(), zh: plain(text.zh).trim() });

/** A table as plain lines: one per row, cells joined by " | ". */
function tableLines(table: TableBlock, side: Side): string {
  return table.rows
    .map((row) => row.cells.map((cell) => plain(cell.text[side]).trim()).join(' | '))
    .filter((line) => line.replace(/[|\s]/g, '') !== '')
    .join('\n');
}

/**
 * Blocks as plain text per side: paragraphs, table rows, source labels, in order. A
 * picture or diagram sets `figure` (the words cannot carry it).
 */
export function blocksText(blocks: ContentBlock[]): { text: BiDraft; figure: boolean } {
  const out: Record<Side, string[]> = { en: [], zh: [] };
  let figure = false;
  for (const block of flattenBlocks(blocks)) {
    if (block.kind === 'paragraph') {
      for (const side of SIDES) out[side].push(plain(block.text[side]).trim());
    } else if (block.kind === 'table') {
      for (const side of SIDES) out[side].push(tableLines(block, side));
      if (block.caption) for (const side of SIDES) out[side].push(plain(block.caption[side]).trim());
    } else if (block.kind === 'source') {
      if (block.label) for (const side of SIDES) out[side].push(plain(block.label[side]).trim());
    } else if (block.kind === 'image' || block.kind === 'diagram') {
      figure = true;
    }
  }
  const join = (side: Side) => out[side].filter(Boolean).join('\n');
  return { text: { en: join('en'), zh: join('zh') }, figure };
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
  const optionFigure = question.options.some((o) => (o.blocks?.length ?? 0) > 0);
  const key = question.answerIndex;
  const figureBlocks = figureBlocksOf(question, opts.passage);
  return {
    id: opts.id ?? question.id,
    label: opts.label,
    ...(passage && (passage.text.en || passage.text.zh) ? { passage: passage.text } : {}),
    stem: stem.text,
    statements: (question.statements ?? []).map(biOf),
    options: question.options.map((o) => biOf(o.text)),
    answerIndex: Number.isInteger(key) && key >= 0 && key < question.options.length ? key : -1,
    hasFigure: stem.figure || (passage?.figure ?? false) || optionFigure,
    ...(figureBlocks.length ? { figureBlocks } : {}),
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
