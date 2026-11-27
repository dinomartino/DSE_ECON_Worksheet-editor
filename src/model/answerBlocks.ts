import { isBiTextEmpty } from './text';
import type { BiText, ContentBlock, DiagramBlock } from './types';

/**
 * A model answer's blocks (u-0c5q): everything after its opening text — the old single
 * model diagram first, then `answerBlocks`. Answers keep two stored shapes so that every
 * build reads what it can:
 *
 *  - `answer` (text) + `answerDiagram` (one figure): what every build since 0.4.0 prints;
 *  - `answerBlocks`: anything more, in any order (tables, pictures, several diagrams, more
 *    text). Written at schema v4, so a release (0.10.x and older) opens the paper read-only,
 *    the answer's text still showing.
 *
 * Every reader goes through `answerBlocksOf`, every writer through `withAnswerBlocks`, which
 * stores the oldest shape that holds the content — a lone diagram goes back to
 * `answerDiagram`, an empty list to nothing — so a paper only becomes v4 for it while it needs to.
 */

/** A structured leaf (or essay question) that carries a model answer. */
export interface AnswerOwner {
  answer?: BiText;
  answerDiagram?: DiagramBlock;
  answerBlocks?: ContentBlock[];
}

const NONE: readonly ContentBlock[] = Object.freeze([]);

/** The answer's blocks in print order: the old model diagram, then the rest. */
export function answerBlocksOf(owner: AnswerOwner): ContentBlock[] {
  const blocks = owner.answerBlocks ?? [];
  if (!owner.answerDiagram) return blocks.length > 0 ? blocks : (NONE as ContentBlock[]);
  return [owner.answerDiagram, ...blocks];
}

/** The leaf with `blocks` as its answer's blocks, stored in the oldest shape that holds them. */
export function withAnswerBlocks<T extends AnswerOwner>(owner: T, blocks: readonly ContentBlock[]): T & AnswerOwner {
  const next: T & AnswerOwner = { ...owner };
  delete next.answerDiagram;
  delete next.answerBlocks;
  if (blocks.length === 1 && blocks[0].kind === 'diagram') next.answerDiagram = blocks[0];
  else if (blocks.length > 0) next.answerBlocks = [...blocks];
  return next;
}

/** Whether the answer says anything: text, or any block. */
export function hasAnswer(owner: AnswerOwner): boolean {
  return !isBiTextEmpty(owner.answer) || answerBlocksOf(owner).length > 0;
}
