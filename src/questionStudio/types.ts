/**
 * Question studio (k-0499): the engine that writes new multiple-choice questions from a
 * syllabus key point and, when the teacher picks them, bank questions to write like.
 * Types only. The engine is pure over injected deps (like `src/generate/run.ts`): no
 * React, no store, no Settings.
 */
import type { AiClient, AiErrorInfo, ImagePart, ProviderPreset } from '@/ai/types';
import type { BiDraft, McqDraft } from '@/generate/types';
import type { Glossary } from '@/glossary/types';
import type { Side } from '@/model/textSlots';
import type { ContentBlock } from '@/model/types';
import type { DiagramIssue, DiagramSpec, SolvedKey } from '@/diagramGen/types';
import type { BiText, DiagramBlock } from '@/model/types';
import type { CorpusIndex } from './nearCopy';
import type { KeyPick } from './pick';
import type { PartialDraft } from './partial';

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
  /** The question's own explanation of its key, when it has one (k-0529: sent with the example). */
  explanation?: BiDraft;
  /** A picture or diagram the words cannot carry: the model is told it is not shown. */
  hasFigure: boolean;
  /**
   * The question's pictures, `data:image/…` in reading order (`figures.ts`), read when the
   * question is picked or found. Sent with the request when the provider reads pictures; the
   * model is told how many belong to this example. Absent/empty = words only.
   */
  figures?: readonly ImagePart[];
  /**
   * The picture and diagram blocks `figures` is drawn from (`figures.ts`), kept until the
   * run reads them: drawing a diagram needs a canvas, so it happens when a request is
   * written (`StudioEnv.figures`), not when a question is picked.
   */
  figureBlocks?: readonly ContentBlock[];
  /** Added by the studio as a style reference (never picked by the teacher); never exempt from the near-copy check. */
  auto?: boolean;
}

/** What a teacher asks for. */
export interface StudioRequest {
  /** A syllabus key point code, `C.ped` (`src/syllabus`). */
  keyPoint: string;
  /**
   * Further key points the AI picked (step 1, `pick.ts`) that the questions may also touch,
   * 0–1 of them; the first key point is the primary one every check reads.
   */
  alsoKeyPoints?: readonly string[];
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

/** pass: nothing to say. look: read it. fail: a red warning (k-0531). skipped: did not run (or out of date after the teacher's edit, k-0530). */
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

/** What a draft changed from its reference, in one of the four ways the screen lists. */
export type ChangeAspect = 'varies' | 'format' | 'numbers' | 'key';
export const CHANGE_ASPECTS: readonly ChangeAspect[] = ['varies', 'format', 'numbers', 'key'];

/** One line of "what changed from the reference", as the model wrote it (k-0520): both languages, `''` for a side the paper does not print. */
export interface DraftChange {
  aspect: ChangeAspect;
  note: BiDraft;
}

/**
 * ok: every check passed. look: read it (a check found something, or failed: a near-copy or a
 * broken format, shown as a red warning on the card, k-0531). failed: only in drafts saved
 * before k-0531, when such a draft was left out; read as look on load (`shownDraft`).
 */
export type DraftStatus = 'ok' | 'look' | 'failed';

export interface StudioDraft {
  /** Unique across a session: a refined draft gets a new id. */
  id: string;
  draft: McqDraft;
  /** A few words on what this draft varies (its slip or context), as the model wrote them. */
  angle: string;
  /**
   * What it changed from its reference (what varies, format, numbers, key), a note each, one
   * line per aspect at most. Empty when the request had no reference or the model gave none;
   * the screen then falls back to what it can tell itself. `angle` stays the one-line note.
   * Always set by the engine; optional so a draft saved before k-0520 still reads.
   */
  changes?: DraftChange[];
  status: DraftStatus;
  checks: CheckRow[];
  solve?: SolveResult;
  /** 1 = first write; 2 = rewritten once after a check failed. */
  attempt: 1 | 2;
  /** The AI-made figure (k-0514 → k-0515's `generateDiagram`), when the run was asked for diagrams; absent = not asked. */
  diagram?: DraftDiagram;
  /** The writer's note to the diagram maker (k-0534), never printed; absent = no figure asked for. */
  figure?: string;
  /**
   * The teacher edited this version by hand (k-0530): its local checks were run again, and
   * the key check is out of date (`key.edited`) when the question itself changed.
   */
  edited?: true;
  /**
   * Its number in the draft's history, 第 N 版 (k-0530, u-hyt5): given when the version is
   * made and never renumbered, so going back to an older one moves nothing. Absent in a draft
   * saved before: numbered by its place on reading (`chatStorage`).
   */
  version?: number;
  /** Who made this version and how, for the version list. Absent: an AI version from before k-0530. */
  made?: VersionMade;
  /**
   * The teacher's words with their formatting (subscripts, fractions, colour), as the editor's
   * fields hold them (k-0530). The paper prints these; `draft` keeps the plain words (bold as
   * `**…**`) that the checks and the AI read. Absent: `draft` is all there is.
   */
  rich?: DraftRich;
}

/** Who made a version of a draft (k-0530): the AI (its first write, or a change asked for) or the teacher's own edit. */
export interface VersionMade {
  by: 'ai' | 'you';
  /** The AI's kind of change: write = the first draft; harder / easier / change / another. */
  how?: 'write' | 'harder' | 'easier' | 'change' | 'another';
  /** The teacher's words for a change, shortened for the list. */
  said?: string;
  /** ISO time. */
  at: string;
  /** An edit: the version it was edited from (Undo edit goes back to it). */
  from?: number;
}

/** A draft's printed text as rich text, field by field (k-0530). */
export interface DraftRich {
  stem: BiText;
  statements: BiText[];
  options: BiText[];
  explanation: BiText;
}

/**
 * The figure written for one draft. `ok` and `look` carry a `block` (an ordinary editable
 * diagram); `look` is to be shown with its `issues` for the teacher to check; `failed` has
 * no block and is never inserted; `none` means the question needs no figure.
 */
export interface DraftDiagram {
  status: 'ok' | 'look' | 'failed' | 'none';
  block: DiagramBlock | null;
  /** `question`: printed with the question. `answer`: the model answer's diagram. */
  placement: 'question' | 'answer' | null;
  issues: DiagramIssue[];
  /** A reference picture was given but the provider could not take it. */
  imageSkipped?: boolean;
  /** Why it failed, when the provider call itself did. */
  error?: AiErrorInfo;
  /**
   * The figure's spec (k-0534): what a follow-up edits ("label Q1 and Q3", "move P1 up")
   * and what direct editing (k-0530) opens; `compileSpec` draws it again. Saved with the
   * chat, never in a document (the paper gets `block`).
   */
  spec?: DiagramSpec;
  /** The key as the drawing gives it, when the solver could read the question. */
  solved?: SolvedKey;
  /** The figure in words for the blind solve (ticks in order, what each marks). */
  figureWords?: string;
  /** The teacher changed it in the diagram editor (k-0530): the AI's issues no longer describe it. */
  edited?: true;
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
  /** Also write a figure for each draft that stands (`generateDiagram`, one more request per draft). Default off. */
  diagrams?: boolean;
}

/** The steps of a run, in order (a rewrite or a second solve repeats its stage). */
export type Stage = 'pick' | 'references' | 'write' | 'rewrite' | 'solve' | 'diagram';

/**
 * What a run tells the screen while it works (k-0514), UI-independent: `RunHooks.onEvent`,
 * or the session's `live` state (`stream.ts:applyEvent` is the reducer between the two).
 * `index` is the draft's position in the batch (the order `StudioOutcome.drafts` keeps).
 */
export type StudioEvent =
  | { type: 'stage'; stage: Stage }
  /** Step 1 finished: the key points the AI chose (never sent when the teacher set one). */
  | { type: 'pick'; picks: KeyPick[] }
  /** Real questions found to write like. */
  | { type: 'references'; count: number }
  /** A write request starts: `streamed` = text arrives word by word; `whole` = each draft arrives complete. */
  | { type: 'write'; mode: 'streamed' | 'whole'; attempt: 1 | 2 }
  /** A draft's words as far as they have arrived (also sent once complete). */
  | { type: 'text'; index: number; draft: PartialDraft; attempt: 1 | 2 }
  /** A draft after the local checks, after the solve, or with its figure: the latest state of that draft. */
  | { type: 'draft'; index: number; draft: StudioDraft }
  /** A figure is being written for the draft (`working`), or finished (`done`, the draft event carries it). */
  | { type: 'diagram'; index: number; state: 'working' | 'done' };

/** A draft on the live screen: its words while they arrive, then the checked draft. */
export interface LiveDraft {
  index: number;
  /** Absent only before the first text of this draft arrives. */
  partial?: PartialDraft;
  /** Set once the draft has been checked; replaces `partial` as the thing to show. */
  draft?: StudioDraft;
  diagram?: 'working' | 'done';
  attempt: 1 | 2;
}

export interface LiveState {
  stage?: Stage;
  /** The write that is running or ran last: `streamed` or `whole`. */
  mode?: 'streamed' | 'whole';
  picks: KeyPick[];
  references: number;
  drafts: LiveDraft[];
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
  /** Pictures attached to the request (only to a provider that reads them; 0 otherwise). */
  figures: number;
  sides: readonly Side[];
  count: number;
  level: Level;
}

/** A change the teacher asks of one draft. */
export type Refinement =
  | { kind: 'another' }
  | { kind: 'harder' }
  | { kind: 'easier' }
  /**
   * `parts`: what the teacher's words touch, as the chat read them (k-0535: `stem`, `options`,
   * `diagram`, `table`, …; `understand.ts:TURN_PARTS`). Absent = not known. A change with
   * `diagram` is the diagram-spec path's to make (k-0534).
   */
  | { kind: 'change'; text: string; parts?: readonly string[] };
