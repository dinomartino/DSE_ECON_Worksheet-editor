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
  /** The type's editor panel. */
  EditorPanel: ComponentType<EditorPanelProps<Q>>;
  /** Count of untranslated BiText fields, for the editor's warning badge (§5.2). */
  countMissingTranslations?: (question: Q) => number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyQuestionTypeDefinition = QuestionTypeDefinition<any>;
