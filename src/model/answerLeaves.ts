/**
 * What the AI answer writer (`src/answers/`) may fill on a question, through the registry
 * hook `mapAnswers`. Shapes, not question types: a `written` leaf takes a model answer and
 * a mark scheme; a `choice` leaf takes one rationale per option.
 */
import type { EditTarget } from '@/render/ir';
import { isSchemeEmpty } from './markScheme';
import type { MarkScheme } from './markSchemeTypes';
import { isBiTextEmpty } from './text';
import { patch } from './textSlots';
import type { BiText } from './types';

interface LeafBase {
  /** Unique within its question ("part:P1/sub:S2"). Request-local; never stored. */
  key: string;
  /** "(b)(ii)", as the text walker labels the leaf's own text; '' for the whole question. */
  label: string;
  /** Identity changes whenever the leaf or the text it answers does: the stale guard. */
  stamp: object;
}

export interface WrittenLeaf extends LeafBase {
  shape: 'written';
  /** The marks the paper prints on this leaf; absent = none (no scheme is written). */
  marks?: number;
  /** The leaf's own question text is empty: nothing to answer. */
  blank: boolean;
  answer?: BiText;
  scheme?: MarkScheme;
  /** Where the answer prints in the teacher version. */
  answerTarget: EditTarget;
}

export interface ChoiceOptionLeaf {
  id: string;
  /** "A", as printed in version A. */
  letter: string;
  rationale?: BiText;
  /** No text and no figure. */
  blank: boolean;
  /** Where its rationale prints in the teacher version. */
  target: EditTarget;
}

export interface ChoiceLeaf extends LeafBase {
  shape: 'choice';
  options: ChoiceOptionLeaf[];
  /** Index into `options`; out of range = no key set. */
  answerIndex: number;
}

export type AnswerLeaf = WrittenLeaf | ChoiceLeaf;

export type AnswerFill =
  | { shape: 'written'; answer?: BiText; scheme?: MarkScheme }
  /** Option id → rationale. */
  | { shape: 'choice'; rationales: Readonly<Record<string, BiText>> };

/** Return a fill to write, or undefined to leave the leaf. */
export type AnswerVisitor = (leaf: AnswerLeaf) => AnswerFill | undefined;

/**
 * A written fill onto its stored leaf. Only an empty answer or scheme is written, so
 * nothing a teacher wrote is ever replaced; `leaf` itself when nothing was.
 */
export function fillWritten<T extends { answer?: BiText; scheme?: MarkScheme }>(leaf: T, fill: AnswerFill | undefined): T {
  if (!fill || fill.shape !== 'written') return leaf;
  const changes: Partial<T> = {};
  if (fill.answer && isBiTextEmpty(leaf.answer)) changes.answer = fill.answer;
  if (fill.scheme && isSchemeEmpty(leaf.scheme)) changes.scheme = fill.scheme;
  return patch(leaf, changes);
}

/** A choice fill onto one option: only an empty rationale is written. */
export function fillRationale<T extends { id: string; rationale?: BiText }>(option: T, fill: AnswerFill | undefined): T {
  if (!fill || fill.shape !== 'choice') return option;
  const next = fill.rationales[option.id];
  return next && isBiTextEmpty(option.rationale) ? patch(option, { rationale: next } as Partial<T>) : option;
}
