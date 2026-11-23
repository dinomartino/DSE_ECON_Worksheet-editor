import type { AiErrorInfo } from '@/ai/types';
import { normalizeRequest } from '@/questionStudio/brief';
import { pickKeyPoints } from '@/questionStudio/pick';
import { refine as refineDraft, writeDrafts, type RunHooks } from '@/questionStudio/run';
import type { Refinement, SourceQuestion, StudioDeps, StudioDraft, StudioOutcome, StudioRequest, Usage } from '@/questionStudio/types';
import { localPick } from './localPick';

export type { PartialDraft } from '@/questionStudio/partial';

/**
 * The seam between the chat screen (k-0516) and the engine (`src/questionStudio/`, k-0514).
 * The screen calls only this; the engine team owns what sits behind it.
 *
 * - `pick`: step 1 of every request (u-lm1c). The AI picks the EDB key point(s) for what the
 *   teacher typed and the reference questions (with their pictures), a reason each
 *   (`pick.ts:pickKeyPoints`). When it names none, the computer's own pick (`localPick`: the
 *   reference's bank tag, or syllabus names in the words) fills in, marked as such.
 * - `write`: step 2, `run.ts:writeDrafts` with `hooks.onEvent`, so the drafts' words stream in
 *   (u-2ouc: word by word, where the provider streams), then the checked drafts, then each
 *   draft's AI-made diagram.
 * - `refine`: Another / Harder / Easier / a change in words, on one draft.
 */

/** One key point the AI picked, with its reason (the engine's `KeyPick`, plus the computer's own basis when it picked). */
export interface KeyPick {
  /** A key point code, `C.ped`. */
  code: string;
  /** One sentence, English (the model's); '' when there is none. */
  reason: string;
  /** The same in Hong Kong Chinese (k-0520); '' or absent from an older reply, or a pick made on the computer. */
  reasonZh?: string;
  /** Picked on the computer (the fallback): why, as a code the interface words. */
  basis?: { kind: 'tag'; label: string } | { kind: 'words'; hit: string } | { kind: 'example'; hit: string };
}

export interface PickInput {
  /** What the teacher typed ('' = nothing). */
  text: string;
  examples: readonly SourceQuestion[];
  /** The key point each picked example's tags name, by example id (the bank knows it): the fallback's hint. */
  tagged?: Readonly<Record<string, string>>;
  /** The key point(s) the chat is on now, main first: a follow-up ("the same in Chinese") keeps them (k-0520). */
  current?: readonly string[];
}

export type PickOutcome = { ok: true; picks: KeyPick[]; usage: Usage; model: string; /** Picked on the computer, not by the AI. */ local?: boolean } | { ok: false; error: AiErrorInfo; usage: Usage };

export type WriteHooks = RunHooks;

export interface StudioEngine {
  pick(input: PickInput, deps: StudioDeps, signal: AbortSignal): Promise<PickOutcome>;
  write(request: StudioRequest, deps: StudioDeps, hooks: WriteHooks, avoid: readonly StudioDraft[]): Promise<StudioOutcome>;
  refine(request: StudioRequest, target: StudioDraft, refinement: Refinement, others: readonly StudioDraft[], deps: StudioDeps, hooks: WriteHooks): Promise<StudioOutcome>;
}

const noUsage = (): Usage => ({ requests: 0, input: 0, output: 0, thinking: 0, ms: 0 });

/** The computer's own pick, with no request made (tests; and when the AI names no key point). */
export async function computerPick(input: PickInput): Promise<PickOutcome> {
  return { ok: true, picks: localPick(input), usage: noUsage(), model: '', local: true };
}

export const liveEngine: StudioEngine = {
  async pick(input, deps, signal) {
    const asked = await pickKeyPoints({ text: input.text, examples: input.examples, ...(input.current?.length ? { current: input.current } : {}) }, deps, signal);
    if (!asked.ok) return asked;
    if (asked.picks.length > 0) return { ok: true, picks: asked.picks, usage: asked.usage, model: asked.model };
    const local = await computerPick(input);
    return local.ok ? { ...local, usage: asked.usage } : local;
  },
  write: (request, deps, hooks, avoid) => writeDrafts(normalizeRequest(request), deps, hooks, { avoid }),
  refine: (request, target, refinement, others, deps, hooks) => refineDraft(request, target, refinement, others, deps, hooks),
};
