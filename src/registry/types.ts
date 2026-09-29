import type { ComponentType } from 'react';
import type { AnswerVisitor } from '@/model/answerLeaves';
import type { TextWalker } from '@/model/textSlots';
import type { BiText, ContentBlock, Question } from '@/model/types';
import type { MarkScheme } from '@/model/markSchemeTypes';
import type { EditTarget, RenderContext, RenderNode } from '@/render/ir';
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
  /**
   * Every BiText this question owns, through one walker that both reads and writes
   * (`model/textWalk.ts`). Return the question itself when `walk` changed nothing; never
   * create an absent optional field. Required: a field a type forgets is invisible to
   * translation and to the untranslated count, silently. The walker is already scoped to
   * this question (`q:<id>`, group "Question n").
   */
  mapTexts: (question: Q, walk: TextWalker) => Q;
  /**
   * The leaves the AI answer writer may fill (`model/answerLeaves.ts`), in print order,
   * each visited once; a returned fill writes only into empty fields. Return the question
   * itself when nothing was written. Absent = nothing to answer.
   */
  mapAnswers?: (question: Q, visit: AnswerVisitor) => Q;
  /** Per-type facts for the pre-print paper check (`model/paperHealth.ts`). */
  healthFacts?: (question: Q) => QuestionHealthFacts;
  /** This question's entry in the separate answer key (`render/answerKey.ts`); absent = none. */
  answerKey?: (question: Q, context: AnswerKeyContext) => AnswerKeyEntry;
  /** This question as a quiz tool takes it (`export/csv/answerKeyCsv.ts`); absent = not one. */
  quizItem?: (question: Q) => QuizItem;
  /**
   * This question as printed in paper version `context.version` (`model/versions.ts`);
   * version 0 is the authored order. Absent = the type never varies.
   */
  variant?: (question: Q, context: VariantContext) => QuestionVariant<Q>;
  /** How the paper summary counts and times this type (`model/paperSummary.ts`). */
  summary?: QuestionSummaryInfo;
  /** The question as a co-marker reads it, for the AI quality check (`quality/`); absent = not checked. */
  qualityView?: (question: Q) => QualityView;
}

/** One place in a question a reviewer can point at, in print order. */
export interface QualityAnchor {
  /** Unique within the question and readable: "stem", "A", "(1)", "(b)(ii)". */
  ref: string;
  role: 'stem' | 'leadIn' | 'statement' | 'option' | 'part';
  /** Card label: "Option B", "Statement (2)", "(b)(ii)"; '' for the stem. */
  label: string;
  /** The printed words: one line, blocks, or both (an option with a figure). */
  text?: BiText;
  blocks?: ContentBlock[];
  /** Where `text` renders on the page; absent = the first paragraph of `blocks`. */
  target?: EditTarget;
  /** Marks the paper prints for this anchor; absent = prints none. */
  marks?: number;
  /** `marks` is the total of the sub-parts below. */
  marksTotal?: true;
  /** Teacher-only marking scheme, checked against `schemeMarks ?? marks`. */
  scheme?: MarkScheme;
  /** The printed marks `scheme` must total when they are not this anchor's own (a shared label). */
  schemeMarks?: number;
  /** The option set as the answer. */
  keyed?: true;
}

export interface QualityView {
  /** Plain words for the reviewer: "multiple choice", "structured". */
  format: string;
  anchors: QualityAnchor[];
}

export interface QuestionSummaryInfo {
  /** Short count label, unpluralised so "1 MCQ" and "38 MCQ" both read: "MCQ" / "選擇題". */
  label: { en: string; zh: string };
  /** Compact label for dense lists (the question bank); absent = `label`. */
  short?: { en: string; zh: string };
  /** Minutes per item whatever its marks; absent = its marks at the paper's minutes-per-mark. */
  minutesPerItem?: number;
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

export interface VariantContext {
  seed: number;
  /** 0 = version A. */
  version: number;
}

export interface QuestionVariant<Q extends Question = Question> {
  /** Reordered, with its key remapped so the teacher version still marks the right choice. */
  question: Q;
  /** Per printed choice, the letter it has in version A; absent = order unchanged. */
  sourceLetters?: string[];
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
