import type { AiErrorInfo } from '@/ai/types';
import type { BiDraft } from '@/generate/types';
import { normalizeRequest } from '@/questionStudio/brief';
import { pickKeyPoints } from '@/questionStudio/pick';
import { refine as refineDraft, writeDrafts, type RunHooks } from '@/questionStudio/run';
import type { Refinement, SourceQuestion, StudioDeps, StudioDraft, StudioOutcome, StudioRequest, Usage } from '@/questionStudio/types';
import { understandTurn, type DraftBrief, type TurnRead } from '@/questionStudio/understand';
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
 *
 * Once drafts exist, `pick` also reads the message (k-0535): with `drafts` it asks the same
 * request what the teacher wants and which draft(s) (`understand.ts`), so a message still
 * costs one request. `picks: false` = the draft is known and only an answer is wanted (a
 * small request without the syllabus). An engine that gives no `turn` leaves the chat to its
 * own rules (`intent.ts`).
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
  /** The drafts on the page (k-0535): also read what the message wants. */
  drafts?: readonly DraftBrief[];
  /** Drafts the last reply wrote or changed, by number. */
  recent?: readonly number[];
  /** The draft chosen before typing (the chip), by number. */
  target?: number;
  /** False: only read the message (no key point wanted, no syllabus sent). Default true. */
  picks?: boolean;
  /** The concept the chat is on now (k-0554): a follow-up keeps it. */
  currentConcept?: BiDraft;
}

export type PickOutcome =
  | {
      ok: true;
      picks: KeyPick[];
      /** The exact idea the questions must test, when the AI read one (k-0554). */
      concept?: BiDraft;
      usage: Usage;
      model: string;
      /** Picked on the computer, not by the AI. */ local?: boolean;
      /** What the message wants (k-0535), when the AI said. */ turn?: TurnRead;
    }
  | { ok: false; error: AiErrorInfo; usage: Usage };

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
    if (input.drafts?.length) {
      const wantPicks = input.picks !== false;
      const read = await understandTurn(
        { text: input.text, examples: input.examples, ...(input.current?.length ? { current: input.current } : {}), ...(input.currentConcept ? { currentConcept: input.currentConcept } : {}), drafts: input.drafts, recent: input.recent ?? [], ...(input.target !== undefined ? { target: input.target } : {}), picks: wantPicks },
        deps,
        signal,
      );
      if (!read.ok) return read;
      const turn = read.read ? { turn: read.read } : {};
      if (read.picks.length > 0 || !wantPicks || (read.read && read.read.intent !== 'new')) return { ok: true, picks: read.picks, ...(read.concept ? { concept: read.concept } : {}), usage: read.usage, model: read.model, ...turn };
      const local = await computerPick(input);
      return local.ok ? { ...local, usage: read.usage, ...turn } : local;
    }
    const asked = await pickKeyPoints({ text: input.text, examples: input.examples, ...(input.current?.length ? { current: input.current } : {}), ...(input.currentConcept ? { currentConcept: input.currentConcept } : {}) }, deps, signal);
    if (!asked.ok) return asked;
    if (asked.picks.length > 0) return { ok: true, picks: asked.picks, ...(asked.concept ? { concept: asked.concept } : {}), usage: asked.usage, model: asked.model };
    const local = await computerPick(input);
    return local.ok ? { ...local, usage: asked.usage } : local;
  },
  write: (request, deps, hooks, avoid) => writeDrafts(normalizeRequest(request), deps, hooks, { avoid }),
  refine: (request, target, refinement, others, deps, hooks) => refineDraft(request, target, refinement, others, deps, hooks),
};
