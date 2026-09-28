/**
 * The AI question quality check's contract (IDEAS E4). Findings only: nothing here
 * writes to the document. Types only.
 */
import type { AiClient, AiErrorInfo, ProviderPreset } from '@/ai/types';
import type { QualityAnchor } from '@/registry/types';

/** What a finding is about. The last two are deterministic and never asked of the model. */
export const MODEL_ISSUES = [
  'twoAnswers', 'wrongKey', 'weakDistractor', 'combination', 'negativeStem',
  'ambiguous', 'commandMarks', 'noDataNeeded', 'missingUnits', 'bilingual', 'other',
] as const;
export type ModelIssue = (typeof MODEL_ISSUES)[number];
export type QualityIssue = ModelIssue | 'schemeMarks' | 'statementRange';

/** 'fix': probably wrong as printed. 'look': worth a look. */
export type QualitySeverity = 'fix' | 'look';

/** One question as the check reads it, in print order. */
export interface QualityQuestion {
  questionId: string;
  /** "Question 3". */
  where: string;
  /** "multiple choice", "structured". */
  format: string;
  anchors: QualityAnchor[];
}

export interface QualityFinding {
  /** Unique within one run. */
  id: string;
  questionId: string;
  /** The anchor it points at; absent = the whole question. */
  anchor?: QualityAnchor;
  /** "Question 3 (b)", "Question 5 · Option C". */
  where: string;
  issue: QualityIssue;
  severity: QualitySeverity;
  /** One or two plain sentences for a teacher. */
  message: string;
  /** A suggested rewording, as text; never applied. */
  suggestion?: string;
  from: 'check' | 'model';
}

export interface QualityDeps {
  client: AiClient;
  preset: ProviderPreset;
  model: string;
}

export interface QualityProgress {
  /** Questions whose review finished (or failed). */
  done: number;
  total: number;
}

export interface QualityOutcome {
  /** Deterministic findings first per question, then the model's; in print order. */
  findings: QualityFinding[];
  /** Questions with content, sent or checked. */
  total: number;
  /** Questions the model reviewed. */
  reviewed: number;
  /** Questions whose request failed without stopping the run. */
  failed: number;
  stopped: boolean;
  /** Stopped the run (bad key, quota…); finished findings are kept. */
  fatal?: AiErrorInfo;
}
