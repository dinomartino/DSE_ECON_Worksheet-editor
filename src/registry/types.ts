import type { ComponentType } from 'react';
import type { BiText, Question } from '@/model/types';
import type { RenderContext, RenderNode } from '@/render/ir';

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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyQuestionTypeDefinition = QuestionTypeDefinition<any>;
