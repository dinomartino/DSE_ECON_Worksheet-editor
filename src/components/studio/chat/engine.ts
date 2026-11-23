import type { BiDraft } from '@/generate/types';
import { normalizeRequest } from '@/questionStudio/brief';
import { refine as refineDraft, writeDrafts, type RunHooks } from '@/questionStudio/run';
import type { Refinement, SourceQuestion, StudioDeps, StudioDraft, StudioOutcome, StudioRequest, Usage } from '@/questionStudio/types';
import { localPick } from './localPick';

/**
 * The seam between the chat screen (k-0516) and the engine (`src/questionStudio/`, k-0514).
 * The screen calls only this; the engine team owns what sits behind it. Three calls:
 *
 * - `pick`: step 1 of every request (u-lm1c). The AI picks the EDB key point(s) for what the
 *   teacher typed and/or the reference questions, with a reason each. Today this falls back to
 *   `localPick` (the reference's own tag, or the syllabus names in the typed words) until the
 *   engine's `pickKeyPoints` lands; then `livePick` below swaps to it and nothing else changes.
 * - `write`: step 2. Writes and checks drafts on the picked key point. `hooks.partial`, when the
 *   engine supports it, is called with each draft's words as they stream (u-2ouc: word by word);
 *   until then drafts arrive whole when the run finishes and the screen shows "writing…" cards.
 * - `refine`: Another / Harder / Easier / a change in words, on one draft.
 */

/** One key point the AI picked, with its reason (the engine's `KeyPick`, k-0514 `pick.ts`). */
export interface KeyPick {
  /** A key point code, `C.ped`. */
  code: string;
  /** One sentence, English (the model's); '' when there is none. */
  reason: string;
  /** Picked on the computer (the fallback): why, as a code the interface words. */
  basis?: { kind: 'tag'; label: string } | { kind: 'words'; hit: string } | { kind: 'example'; hit: string };
}

export interface PickInput {
  /** What the teacher typed ('' = nothing). */
  text: string;
  examples: readonly SourceQuestion[];
  /** The key point each picked example's tags name, by example id (the bank knows it). */
  tagged?: Readonly<Record<string, string>>;
}

export type PickOutcome = { ok: true; picks: KeyPick[]; usage: Usage; model: string; /** Picked on the computer, not by the AI (the fallback). */ local?: boolean } | { ok: false; error: import('@/ai/types').AiErrorInfo; usage: Usage };

/**
 * A draft while it streams: whatever words have arrived so far, in the order they print.
 * `index` is its place in the batch (0-based). The engine calls `partial` as often as it likes;
 * each call carries the whole draft so far, never a delta.
 */
export interface PartialDraft {
  index: number;
  stem: Partial<BiDraft>;
  statements: Array<Partial<BiDraft>>;
  options: Array<Partial<BiDraft>>;
  /** True once the words are complete and the checks are running. */
  checking?: boolean;
}

export interface WriteHooks extends RunHooks {
  /** Streaming (k-0514): each draft's words as they arrive. Optional: an engine without it never calls it. */
  partial?: (draft: PartialDraft) => void;
}

export interface StudioEngine {
  pick(input: PickInput, deps: StudioDeps, signal: AbortSignal): Promise<PickOutcome>;
  write(request: StudioRequest, deps: StudioDeps, hooks: WriteHooks, avoid: readonly StudioDraft[]): Promise<StudioOutcome>;
  refine(request: StudioRequest, target: StudioDraft, refinement: Refinement, others: readonly StudioDraft[], deps: StudioDeps, hooks: WriteHooks): Promise<StudioOutcome>;
}

const noUsage = (): Usage => ({ requests: 0, input: 0, output: 0, thinking: 0, ms: 0 });

/** Until k-0514's `pickKeyPoints` is on develop: the computer's own pick (no request is made). */
export async function livePick(input: PickInput): Promise<PickOutcome> {
  const picks = localPick(input);
  return { ok: true, picks, usage: noUsage(), model: '', local: true };
}

export const liveEngine: StudioEngine = {
  pick: (input) => livePick(input),
  write: (request, deps, hooks, avoid) => writeDrafts(normalizeRequest(request), deps, hooks, { avoid }),
  refine: (request, target, refinement, others, deps, hooks) => refineDraft(request, target, refinement, others, deps, hooks),
};
