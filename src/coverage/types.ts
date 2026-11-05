/**
 * The syllabus coverage check's contract (k-0317, design § 10.11 of
 * `docs/research/2026-11-syllabus-analysis.md`). A one-off report: nothing here is
 * written to the document. Types only.
 */
import type { AiClient, AiErrorInfo, ProviderPreset } from '@/ai/types';
import type { QualityQuestion } from '@/quality/types';

export type Band = 'know' | 'apply' | 'evaluate';
export type Confidence = 'high' | 'medium' | 'low';
export const BANDS: readonly Band[] = ['know', 'apply', 'evaluate'];
export const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];

/** One place in a question that earns its own marks: the question itself (MC), a part or a sub-part. */
export interface MarkedUnit {
  /** Request-local key: "q3", "q3.(b)(ii)". */
  key: string;
  /** The part's printed label, "(b)(ii)"; '' = the whole question. */
  label: string;
  marks: number;
}

export interface CoverageQuestion {
  question: QualityQuestion;
  /** The question's request-local key, "q3". */
  key: string;
  /** The printed question number, "3". */
  number: string;
  units: MarkedUnit[];
}

/** One syllabus item the AI says a unit tests. */
export interface Pick {
  /** A key-point code ('C.ped') or point code ('C.ped#arc'). */
  code: string;
  /** 2 = main (one per unit), 1 = also (at most two). */
  w: 1 | 2;
  band: Band;
  conf: Confidence;
  /** One short sentence. */
  why: string;
}

export interface UnitResult {
  key: string;
  label: string;
  marks: number;
  picks: Pick[];
  /**
   * What the guide says is NOT required that earning the marks needs; '' = none. Kept in
   * the temporary file only, not shown (design § 10.11, the user's answer 9).
   */
  outside: string;
}

/** What one question's temporary file holds. */
export interface QuestionResult {
  questionId: string;
  /** The printed question number, "3". */
  number: string;
  /** False: the request failed; `units` then carry no picks. */
  ok: boolean;
  units: UnitResult[];
}

export interface CoverageDeps {
  client: AiClient;
  preset: ProviderPreset;
  model: string;
}

export interface CoverageRunOutcome {
  /** Questions with words, sent. */
  total: number;
  /** Their results as read back from the temporary files, in print order. */
  results: QuestionResult[];
  stopped: boolean;
  fatal?: AiErrorInfo;
}
