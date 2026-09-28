import type { SlotMeta, TranslationWrite } from '@/model/textSlots';
import type { BiText } from '@/model/types';
import type { Direction, JobResult, RunDeps, RunOutcome, RunProgress, TranslationPlan } from './types';

/**
 * Per chunk: request → decode → normalise → validate → glossary check → deny auto-fix →
 * at most one repair pass → keep the better pass per item.
 */

/** Never rejects. */
export function runTranslation(
  plan: TranslationPlan,
  deps: RunDeps,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
): Promise<RunOutcome> {
  // P-ENGINE replaces this body
  void plan;
  void deps;
  void signal;
  void onProgress;
  return Promise.resolve({ results: new Map(), stopped: false, model: '', ms: 0 });
}

/** Accepted job keys → writes fanned out to every slot, plus accepted copies. */
export function writesFor(
  plan: TranslationPlan,
  outcome: RunOutcome,
  accepted: ReadonlySet<string>,
  acceptCopies: boolean,
): TranslationWrite[] {
  // P-ENGINE replaces this body
  void plan;
  void outcome;
  void accepted;
  void acceptCopies;
  return [];
}

/** BiTextField: one BiText, same pipeline, no walker. `meta` is the field's `translate` prop. */
export function translateOne(
  text: BiText,
  direction: Direction,
  meta: Pick<SlotMeta, 'kind' | 'aroundValue'>,
  deps: RunDeps,
  signal: AbortSignal,
): Promise<JobResult> {
  // P-ENGINE replaces this body
  void text;
  void direction;
  void meta;
  void deps;
  void signal;
  return Promise.resolve({
    key: 't1',
    status: 'failed',
    issues: [],
    terms: [],
    fixes: [],
    passes: 1,
    defaultAccepted: false,
  });
}
