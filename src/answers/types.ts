/**
 * The answer writer's contract (IDEAS E1): what a plan holds, what a run returns and what
 * the store applies. Types only.
 */
import type { AiErrorInfo } from '@/ai/types';
import type { AnswerFill, AnswerLeaf } from '@/model/answerLeaves';
import type { Side } from '@/model/textSlots';
import type { RunDeps } from '@/translate/types';

export type { RunDeps };

/** What one target asks for. */
export type AnswerNeeds =
  | { shape: 'written'; answer: boolean; scheme: boolean }
  /** Option ids still without a rationale. */
  | { shape: 'choice'; options: string[] };

export interface AnswerTarget {
  /** "a1"… request-local; never an app id. */
  key: string;
  questionId: string;
  /** "Question 3 (b)(ii)". */
  where: string;
  /** The leaf as read at plan time; its `stamp` is the stale guard. */
  leaf: AnswerLeaf;
  needs: AnswerNeeds;
}

/** One printed line of a question, for the model's context. */
export interface ContextLine {
  /** "(b)(ii)", "Option A", "Statement 1"; absent for the stem. */
  label?: string;
  en: string;
  zh: string;
}

export interface QuestionContext {
  questionId: string;
  /** "Question 3". */
  where: string;
  lines: ContextLine[];
  /** Printed characters, for chunking. */
  chars: number;
}

export interface AnswerChunk {
  id: string;
  targetKeys: string[];
}

export interface AnswerPlan {
  worksheetId: string;
  /** Sides written: the languages the paper prints. English is always asked for (the glossary check reads it). */
  sides: Side[];
  targets: ReadonlyMap<string, AnswerTarget>;
  contexts: ReadonlyMap<string, QuestionContext>;
  chunks: AnswerChunk[];
}

export interface AnswerResult {
  key: string;
  /** ok: insert; look: insert and highlight; failed: nothing inserted. */
  status: 'ok' | 'look' | 'failed';
  /** Absent when failed. */
  fill?: AnswerFill;
  /** Look notes, or why it failed. */
  notes: string[];
}

export interface AnswerProgress { done: number; total: number }

export interface AnswersOutcome {
  results: ReadonlyMap<string, AnswerResult>;
  /** Remaining chunks not attempted. */
  fatal?: AiErrorInfo;
  /** The signal aborted: finished chunks kept. */
  stopped: boolean;
}

/** A fill and its stale guard. */
export interface AnswerWrite {
  key: string;
  questionId: string;
  leafKey: string;
  stamp: object;
  fill: AnswerFill;
}

export interface AnswerApplyReport {
  /** Target keys written. */
  applied: string[];
  skipped: Array<{ key: string; reason: 'changed' | 'gone' }>;
  refused?: 'readOnly' | 'otherDocument';
}
