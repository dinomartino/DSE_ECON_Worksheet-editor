import type { ChatTurn, DecideAnswer, OutputDialect, TokenUsage } from '@/ai/types';

/**
 * The studio's review record (k-0598, user u-575f): a develop-only tool that keeps, for every
 * reply of a studio chat, what happened behind it, so the teacher can export a conversation
 * with their own notes and an agent can read it to improve the studio. Never in a release
 * build (u-u4av), desktop only (u-5fy1): `available.ts`.
 *
 * Kept on this computer only (IndexedDB `econ-studio-review`, `reviewStore.ts`); nothing here
 * is ever sent anywhere. No key, token or sign-in ever goes in (`redact.ts`): a request carries
 * none (the client holds them), and every string is scrubbed again on the way in.
 */

/** A long text kept once (a system prompt, a schema) and named by its fingerprint. */
export interface PromptRef {
  prompt: string;
}

/** A picture sent with a call: never its data, only what it was. */
export interface PictureNote {
  id: string;
  kb: number;
}

export interface TraceError {
  kind: string;
  message: string;
  status?: number;
  detail?: string;
}

/** Every event's time, as milliseconds since the reply started. */
interface At {
  at: number;
}

/** One AI request exactly as sent, and the raw reply. */
export interface CallEvent extends At {
  t: 'call';
  /** `stream` = the words came in as they were written. */
  mode: 'complete' | 'stream';
  feature?: string;
  provider: string;
  /** The model that answered (from the result), else the one asked for. */
  model?: string;
  ms: number;
  maxOutputTokens: number;
  system: string | PromptRef;
  turns: ChatTurn[];
  schema?: string | PromptRef;
  shapeHint?: string;
  pictures?: PictureNote[];
  reply?: string;
  finish?: string;
  dialect?: OutputDialect;
  usage?: TokenUsage;
  /** Mentor's receipt: credits this call cost, and left after it. */
  charged?: number;
  balance?: number;
  error?: TraceError;
}

/** A typed question to Jev (the pre-router, k-0567): what it was asked and what it said. */
export interface DecideEvent extends At {
  t: 'decide';
  feature: string;
  ms: number;
  state: unknown;
  questions: unknown;
  answers?: Record<string, DecideAnswer>;
  model?: string;
  fallback?: boolean;
  charged?: number;
  balance?: number;
  /** Mentor does not offer it (null result). */
  notOffered?: boolean;
  error?: TraceError;
}

/** The engine's own progress (pick, references, write, rewrite, solve, diagram). */
export interface StageEvent extends At {
  t: 'stage';
  stage: string;
  /** A write's mode and attempt (2 = rewritten after a check failed). */
  mode?: string;
  attempt?: number;
}

/** A decision the chat made: the computer's read, Jev's route, the read it acted on, the key point. */
export interface DecisionEvent extends At {
  t: 'decision';
  what: 'localRead' | 'route' | 'intent' | 'pick';
  value: unknown;
}

/** What a write or a change asked the engine for. */
export interface RequestEvent extends At {
  t: 'request';
  kind: 'write' | 'refine';
  request: unknown;
  refinement?: unknown;
  /** The draft being changed (refine). */
  target?: { no?: number; id: string };
}

/** What came back: the drafts with every check's verdict, the batch notes, the usage. */
export interface OutcomeEvent extends At {
  t: 'outcome';
  kind: 'write' | 'refine';
  ok: boolean;
  model?: string;
  usage?: unknown;
  notes?: unknown;
  drafts?: unknown[];
  error?: TraceError;
}

/** The reply failed, or something else worth a line. */
export interface InfoEvent extends At {
  t: 'info';
  text: string;
  error?: TraceError;
}

export type TraceEvent = CallEvent | DecideEvent | StageEvent | DecisionEvent | RequestEvent | OutcomeEvent | InfoEvent;

/** Everything behind one reply (an AI turn of a chat). */
export interface TurnTrace {
  /** `${chatId}:${turnId}`. */
  id: string;
  chatId: string;
  turnId: string;
  startedAt: string;
  endedAt?: string;
  events: TraceEvent[];
}

export type TurnTag = 'good' | 'wrong' | 'unclear';
export const TURN_TAGS: readonly TurnTag[] = ['good', 'wrong', 'unclear'];

export interface TurnNote {
  text?: string;
  tag?: TurnTag;
  at: string;
}

/** The teacher's own notes on one chat: on the whole conversation, and per reply. */
export interface ChatNotes {
  chatId: string;
  chat?: string;
  turns: Record<string, TurnNote>;
}
