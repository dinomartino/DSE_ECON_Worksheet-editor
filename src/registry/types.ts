import type { ComponentType } from 'react';
import type { BiText, ContentBlock, Question } from '@/model/types';
import type { RenderContext, RenderNode } from '@/render/ir';
import type { AnswerKeyContext, AnswerKeyEntry } from '@/render/answerKey';

/**
 * The question-type registry (§9).
 *
 * Adding a question type = one entry here. Numbering, marks totalling, persistence
 * and export orchestration all consume the registry and never switch on `type`.
 */

export interface EditorPanelProps<Q extends Question = Question> {
  question: Q;
  /** Apply a partial patch to this question (routed through the undoable store). */
  onChange: (patch: Partial<Q>) => void;
}

export interface QuestionTypeDefinition<Q extends Question = Question> {
  id: Q['type'];
  displayName: BiText;
  /** Produce a blank instance for "Add question". */
  create: () => Q;
  /**
   * Emit the neutral render IR. The preview, .docx and clipboard backends all
   * consume this, so a type implements rendering exactly once.
   */
  render: (question: Q, context: RenderContext) => RenderNode[];
  /**
   * How many blank lines this type wants between two consecutive instances of itself on
   * an exam paper, when the reference paper spaces them wider than the ordinary one line.
   *
   * Absent means the ordinary boundary, which is what every worksheet uses. It is asked
   * only on a paper whose shape is the reference's (§ `model/documentShape.ts`) — a
   * classroom worksheet keeps the one-line rhythm whatever its questions are.
   *
   * It lives on the definition rather than in the walker because the walker may not
   * branch on a concrete type id (`registry.test.ts` greps it, along with numbering,
   * marks and the three export backends). The rhythm between two MCQs is a fact about
   * MCQs, so the type states it and the walker only asks.
   */
  examGapLines?: number;
  /** The type's editor panel. */
  EditorPanel: ComponentType<EditorPanelProps<Q>>;
  /** Count of untranslated BiText fields, for the editor's warning badge (§5.2). */
  countMissingTranslations?: (question: Q) => number;
  /** Per-type facts for the pre-print paper check (`model/paperHealth.ts`). */
  healthFacts?: (question: Q) => QuestionHealthFacts;
  /** This question's entry in the separate answer key (`render/answerKey.ts`); absent = none. */
  answerKey?: (question: Q, context: AnswerKeyContext) => AnswerKeyEntry;
  /** This question as a quiz tool takes it (`export/csv/answerKeyCsv.ts`); absent = not one. */
  quizItem?: (question: Q) => QuizItem;
}

/** A lettered-choice question, as Kahoot or Blooket import it. */
export interface QuizItem {
  stem: ContentBlock[];
  /** Combination statements, printed "(1) …" under the stem. */
  statements: BiText[];
  /** `figure`: the option carries content a quiz cell cannot hold. */
  options: Array<{ text: BiText; figure: boolean }>;
  /** Index into `options`; absent = no key set. */
  answerIndex?: number;
}

/**
 * What a type tells the paper check about one question. `answerLetter` is present only
 * on lettered-choice types — `null` means the key is unset — and makes the question count
 * towards letter balance and the per-item time rate.
 */
export interface QuestionHealthFacts {
  /** Nothing authored: no stem, no body. Prints a bare number. */
  empty: boolean;
  answerLetter?: string | null;
  /** Letters the item offers, for its fair share of the balance. */
  optionCount?: number;
  /** Options with no text and no content. */
  blankOptions?: number;
  /** Two non-blank options read identically. */
  duplicateOptions?: boolean;
  /** Answerable leaves (part, or sub-part) with no teacher answer text. */
  unansweredParts?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyQuestionTypeDefinition = QuestionTypeDefinition<any>;
