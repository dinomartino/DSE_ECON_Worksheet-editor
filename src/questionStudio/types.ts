/**
 * Question studio (k-0499): the engine that writes new multiple-choice questions from a
 * syllabus key point and, when the teacher picks them, bank questions to write like.
 * Types only. The engine is pure over injected deps (like `src/generate/run.ts`): no
 * React, no store, no Settings.
 */
import type { AiClient, AiErrorInfo, ProviderPreset } from '@/ai/types';
import type { BiDraft, McqDraft } from '@/generate/types';
import type { Glossary } from '@/glossary/types';
import type { Side } from '@/model/textSlots';
import type { CorpusIndex } from './nearCopy';

/** How hard a draft is meant to be. Intended, not measured (no results to measure it). */
export type Level = 'same' | 'harder' | 'easier';

/** `plain`: four ordinary options. `combination`: HKEAA statements (1)(2)(3) and combined options. */
export type Shape = 'plain' | 'combination' | 'any';

/** Drafts per request. The form offers 1, 3 or 5; the engine never writes more than the cap. */
export const BATCH_SIZES = [1, 3, 5] as const;
export const MAX_COUNT = 5;
/** Bank questions the teacher may pick as examples in one request. */
export const MAX_EXAMPLES = 3;
/** Real questions the studio adds by itself as style references when none is picked (3 to 5). */
export const MAX_AUTO_EXAMPLES = 5;
/** The Change line's longest text. */
export const MAX_NOTE_CHARS = 400;

/**
 * A question to write like (decision 1c: its own words go to the provider). `label` is for
 * the teacher ("CE2011 Paper 2 Q8") and never leaves the computer: the model is not told a
 * year, paper or number, because a citation invites a memorised copy.
 */
export interface SourceQuestion {
  /** Stable: the bank's source tag, or a question id. */
  id: string;
  label: string;
  /** A shared passage printed before the question, when it has one. */
  passage?: BiDraft;
  stem: BiDraft;
  statements: BiDraft[];
  options: BiDraft[];
  /** 0–3; -1 when the question has no usable key. */
  answerIndex: number;
  /** A picture or diagram the words cannot carry: the model is told it is not shown. */
  hasFigure: boolean;
  /** Added by the studio as a style reference (never picked by the teacher); never exempt from the near-copy check. */
  auto?: boolean;
}

/** What a teacher asks for. */
export interface StudioRequest {
  /** A syllabus key point code, `C.ped` (`src/syllabus`). */
  keyPoint: string;
  /** Narrow it to some of its points (`C.ped#arc`); none = the whole key point. */
  points: readonly string[];
  /** Zero to `MAX_EXAMPLES` picked questions to write like, or up to `MAX_AUTO_EXAMPLES` the studio chose (all `auto`). */
  examples: readonly SourceQuestion[];
  /**
   * Picked examples only: write each draft close to its example on purpose (same concept, stem
   * and option pattern, the logic of each wrong option; a new scenario and new figures), and
   * do not hold the draft to the near-copy limit against them (u-uugw: unlimited). Absent or
   * false = a style reference only. Never applies to `auto` examples.
   */
  strict?: boolean;
  count: number;
  level: Level;
  shape: Shape;
  /** The sides the paper prints: the model writes exactly these. */
  sides: readonly Side[];
  /** The Change line, the teacher's own words ('' = none). */
  note: string;
}

// ---- checks ----

export type CheckId = 'shape' | 'key' | 'numbers' | 'terms' | 'syllabus' | 'lint' | 'copy';
export const CHECK_IDS: readonly CheckId[] = ['shape', 'key', 'numbers', 'terms', 'syllabus', 'lint', 'copy'];

/**
 * One thing a check found. `id` is a code and `params` its values: the interface words for
 * each id live in the studio's message catalogue (English and 中文), never here.
 */
export interface Finding {
  id: string;
  params?: Readonly<Record<string, string | number>>;
}

/** pass: nothing to say. look: read it. fail: never offered for insert. skipped: did not run. */
export type CheckState = 'pass' | 'look' | 'fail' | 'skipped';

export interface CheckRow {
  id: CheckId;
  state: CheckState;
  findings: Finding[];
  /** The near-copy share as a whole percent; the only check with a number. */
  value?: number;
}

/** What the fresh solve said (never shown to the writer: it runs in a separate request). */
export interface SolveResult {
  /** 0–3. */
  answer: number;
  working: string;
  /** The solver found two options defensible, or none. */
  ambiguous: boolean;
}

export type DraftStatus = 'ok' | 'look' | 'failed';

export interface StudioDraft {
  /** Unique across a session: a refined draft gets a new id. */
  id: string;
  draft: McqDraft;
  /** A few words on what this draft varies (its slip or context), as the model wrote them. */
  angle: string;
  status: DraftStatus;
  checks: CheckRow[];
  solve?: SolveResult;
  /** 1 = first write; 2 = rewritten once after a check failed. */
  attempt: 1 | 2;
}

// ---- running ----

export interface StudioDeps {
  client: AiClient;
  preset: ProviderPreset;
  /** null → no EDB term pins or Chinese term checks. */
  glossary: Glossary | null;
  /** The questions a draft must not copy (bank, the teacher's own, the open paper). */
  corpus: CorpusIndex;
  /** For the key plan; tests inject a seeded one. */
  random?: () => number;
}

/** Real provider counts, summed over a run: the first trial logs them. */
export interface Usage {
  requests: number;
  input: number;
  output: number;
  thinking: number;
  ms: number;
}

export type StudioOutcome =
  | {
      ok: true;
      drafts: StudioDraft[];
      /** Batch notes: fewer drafts than asked, a key letter used too often, the key check skipped. */
      notes: Finding[];
      model: string;
      usage: Usage;
    }
  | { ok: false; error: AiErrorInfo; usage: Usage };

/** What the form lists under "Sends this to {provider}" (the words are the UI's). */
export interface SentSummary {
  keyPoint: string;
  points: number;
  /** Syllabus limits sent with it ("NOT required"). */
  limits: number;
  /** Bank or paper questions sent whole (stem, options, key). */
  examples: number;
  /** How they are used: close to each on purpose (`pattern`) or as a style reference (`style`). */
  reference: 'none' | 'style' | 'pattern';
  /** Characters of those questions, for a size hint. */
  exampleChars: number;
  note: boolean;
  sides: readonly Side[];
  count: number;
  level: Level;
}

/** A change the teacher asks of one draft. */
export type Refinement =
  | { kind: 'another' }
  | { kind: 'harder' }
  | { kind: 'easier' }
  | { kind: 'change'; text: string };
