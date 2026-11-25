import type { AiClient, AiErrorInfo, ProviderPreset } from '@/ai/types';

/**
 * AI tagging for the teacher's own bank (k-0560, user u-4cgi): an untagged question goes
 * to the AI with the syllabus topic list the bank uses (`model/topics.ts`, the 2025 guide's
 * key points), and comes back as a suggestion the teacher accepts, changes or skips. Nothing
 * here writes a document. Types only.
 */

/** One printed text of the question, in print order, as the prompt carries it. */
export interface TagEntry {
  /** stem, leadIn, statement, option, part (`QualityAnchor.role`). */
  role: string;
  label?: string;
  text: string;
  /** The keyed option of an MC question. */
  keyed?: true;
}

/** One question as sent. */
export interface TagQuestion {
  /** Request-local key, "q1". Never an app id. */
  key: string;
  /** Which question in the bank (`BankRow.rootId`): what a suggestion is for. */
  rootId: string;
  /** The type's own words ("multiple-choice question"): `QualityView.format`. */
  format: string;
  entries: TagEntry[];
  /**
   * The teacher's own 題型 for this question's type, by sub-topic (`patternNames`): the
   * only names a suggestion's 題型 may take. Absent = the teacher has none.
   */
  patterns?: Readonly<Record<string, readonly string[]>>;
}

export type TagConfidence = 'high' | 'medium' | 'low';

/** What the AI suggests for one question, checked: only codes the bank knows. */
export interface TagSuggestion {
  rootId: string;
  /** Topic codes from `TOPICS`, main first, one to three; never empty. */
  topics: string[];
  /** One of the teacher's own 題型 under the main topic, exactly as stored. */
  pattern?: { topic: string; name: string };
  conf: TagConfidence;
  /** One short sentence: what the question asks the student to do. */
  why: string;
}

export interface TagOutcome {
  suggestions: TagSuggestion[];
  /** Questions sent. */
  total: number;
  /** Questions whose reply could not be read, or named no topic the bank knows. */
  failed: string[];
  stopped: boolean;
  /** A run-ending error (no key, out of credits, signed out…). */
  fatal?: AiErrorInfo;
}

export interface TagDeps {
  client: AiClient;
  preset: ProviderPreset;
}
