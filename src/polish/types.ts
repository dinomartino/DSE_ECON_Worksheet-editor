import type { AiClient, AiErrorInfo, ProviderPreset } from '@/ai/types';
import type { StyleFinding } from '@/dseStyle';
import type { Side, TextPath } from '@/model/textSlots';
import type { BiText, McqQuestion } from '@/model/types';
import type { EditTarget } from '@/render/ir';

/**
 * AI wording enhancement (k-0549, user u-ddyz): the teacher's own MC question, sent to the
 * AI with the HKDSE house style (k-0548) to improve its wording, grammar and structure,
 * and offered back field by field. Nothing is written until the teacher accepts.
 */

export type PolishFieldKind = 'stem' | 'statement' | 'option';

/** One text the AI may reword: a stem paragraph, a statement or an option's line. */
export interface PolishField {
  /** Request-local: "q1.stem1", "q1.s2", "q1.B". Never an app id. */
  key: string;
  kind: PolishFieldKind;
  path: TextPath;
  target?: EditTarget;
  /** "Question 3 · Option B": the review card's header, as Check terms writes it. */
  where: string;
  /** The stored text as read (the stale guard). */
  text: BiText;
}

export interface PolishQuestion {
  questionId: string;
  /** Request-local key, "q1". */
  key: string;
  question: McqQuestion;
  fields: PolishField[];
  /** Languages the question is written in (a side with words in any field). */
  sides: Side[];
  /** The key as a letter, "C". */
  answer: string;
}

export type BlockReason = 'numbers' | 'order' | 'key';

export interface PolishChange {
  id: string;
  questionId: string;
  path: TextPath;
  target?: EditTarget;
  where: string;
  kind: PolishFieldKind;
  before: BiText;
  after: BiText;
  /** The sides that differ. */
  sides: Side[];
  why: { en: string; zh: string };
  /** Present: not offered. The numbers check, the option order or the key moved. */
  blocked?: { reason: BlockReason; detail: string };
}

export interface PolishQuestionResult {
  questionId: string;
  changes: PolishChange[];
  /** The house-style check (`checkDseStyle`) on the question as it is, and with every offered change. */
  styleBefore: StyleFinding[];
  styleAfter: StyleFinding[];
}

export interface PolishOutcome {
  results: PolishQuestionResult[];
  /** Questions sent; questions answered (readable reply). */
  total: number;
  reviewed: number;
  failed: number;
  stopped: boolean;
  fatal?: AiErrorInfo;
}

export interface PolishDeps {
  client: AiClient;
  preset: ProviderPreset;
}
