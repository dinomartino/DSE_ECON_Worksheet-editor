/**
 * "Questions from a source" (E3): the teacher pastes a source, the model returns HKDSE
 * items grounded only in it. Types only; the engine is pure with injected deps.
 */
import type { AiClient, AiErrorInfo, ProviderPreset } from '@/ai/types';
import type { Glossary } from '@/glossary/types';
import type { Side } from '@/model/textSlots';

/** What one run makes, derived from the document's shape (`recipeFor`). */
export interface Recipe {
  /** 'paper1' | 'lqMock' | 'lqWorksheet' | 'classroom' — for the prompt and the notes. */
  paper: 'paper1' | 'lqMock' | 'lqWorksheet' | 'classroom';
  mcq: number;
  structured: number;
  /** At least this many MCQs must be HKEAA combination-statement items. */
  combination: number;
  /** Inclusive total marks per structured question. */
  marks: { min: number; max: number };
  /** Where the pasted source prints: a shared stimulus before the batch, or a source panel in the question. */
  sourceAs: 'stimulus' | 'sourceBlock';
  /** Dotted answer space on each part (the booklet's writing room). */
  answerSpace: boolean;
}

/** One language pair as the model returns it: plain text, `**bold**` the only markup. */
export interface BiDraft { en: string; zh: string }

export interface McqDraft {
  kind: 'mcq';
  stem: BiDraft;
  /** Combination statements, without their "(1)" labels (derived when printed). */
  statements: BiDraft[];
  options: BiDraft[];
  answerIndex: number;
  explanation: BiDraft;
}

export interface PartDraft {
  stem: BiDraft;
  marks: number;
  answer: BiDraft;
  /** Marking points; dropped when they do not total the part's marks. */
  points: Array<{ text: BiDraft; marks: number }>;
}

export interface StructuredDraft {
  kind: 'structured';
  stem: BiDraft;
  parts: PartDraft[];
}

export type ItemDraft = McqDraft | StructuredDraft;

export interface GeneratedItem {
  /** "g1"… request-local. */
  key: string;
  /** "MCQ 2", "Structured question". */
  label: string;
  /** ok: insert; look: insert and highlight; failed: never inserted. */
  status: 'ok' | 'look' | 'failed';
  /** Absent when failed. */
  draft?: ItemDraft;
  notes: string[];
}

export interface GenerateInput {
  source: string;
  recipe: Recipe;
  /** Sides the paper prints: the model writes exactly these. */
  sides: readonly Side[];
}

export interface GenerateDeps {
  client: AiClient;
  preset: ProviderPreset;
  /** null → no pins or term notes. */
  glossary: Glossary | null;
}

export type GenerateOutcome =
  | {
      ok: true;
      items: GeneratedItem[];
      /** Batch notes: a missing combination item, fewer items than asked. */
      notes: string[];
      /** The side the pasted source is written in. */
      sourceSide: Side;
      model: string;
    }
  | { ok: false; error: AiErrorInfo };

/** The shortest source worth sending. */
export const MIN_SOURCE_CHARS = 80;
