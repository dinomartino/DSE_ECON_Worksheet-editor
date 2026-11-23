import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { AiErrorInfo } from '@/ai/types';
import { normalizeRequest } from './brief';
import { writeDrafts, type Stage } from './run';
import type { StudioEnv } from './session';
import { requestOfBrief, TRIAL_BRIEFS, type TrialBrief } from './trialBriefs';
import { briefsDone, type TrialLogState } from './trialLog';

/**
 * Running the trial's invented briefs (k-0499, decision 7a): each brief is one Write, asked
 * once on the teacher's own provider and key, one after another, with the same engine, checks
 * and near-copy corpus the Write button uses. Every outcome goes into the trial's record
 * (`trialLog.ts`); none of it touches the studio's sheet, so a brief is judged on its own
 * (it is not told about the drafts of the one before) and the teacher's own work is not
 * buried under ninety cards. Resumable: a brief that already has drafts is skipped, so
 * "Run the rest" after a stop, an error or a reload carries on where it was.
 */

export interface BriefProgress {
  /** Briefs with drafts so far. */
  done: number;
  total: number;
  /** The brief being written, and its stage. */
  current?: string;
  stage?: Stage;
}

export type BriefRunEnd =
  /** Every brief has drafts. */
  | { kind: 'finished' }
  /** The teacher pressed Stop. */
  | { kind: 'stopped' }
  /** The provider or the set-up said no (no key, no connection, quota…): stopped here, nothing lost. */
  | { kind: 'error'; error: AiErrorInfo };

export async function runBriefs(args: {
  env: StudioEnv;
  log: UseBoundStore<StoreApi<TrialLogState>>;
  signal: AbortSignal;
  /** Tests run a few; the trial runs `TRIAL_BRIEFS`. */
  briefs?: readonly TrialBrief[];
  onProgress?: (progress: BriefProgress) => void;
}): Promise<BriefRunEnd> {
  const { env, log, signal, briefs = TRIAL_BRIEFS, onProgress } = args;
  const resolved = await env.resolve();
  if (!resolved.ok) return { kind: 'error', error: resolved.error };
  const total = briefs.length;
  const finished = () => briefs.filter((brief) => briefsDone(log.getState().runs).has(brief.id)).length;

  for (const brief of briefs) {
    if (signal.aborted) return { kind: 'stopped' };
    if (briefsDone(log.getState().runs).has(brief.id)) continue;
    onProgress?.({ done: finished(), total, current: brief.id });
    const request = normalizeRequest(requestOfBrief(brief));
    const outcome = await writeDrafts(request, resolved.deps, {
      signal,
      progress: (_done, _total, stage) => onProgress?.({ done: finished(), total, current: brief.id, stage }),
    });
    try {
      log.getState().record({ label: brief.id, kind: 'write', request, outcome, compared: resolved.compared });
    } catch {
      // A record that cannot be kept must not end the run.
    }
    if (!outcome.ok) return outcome.error.kind === 'cancelled' ? { kind: 'stopped' } : { kind: 'error', error: outcome.error };
  }
  onProgress?.({ done: finished(), total });
  return { kind: 'finished' };
}

export interface BriefRunnerState {
  /** Set while a run is going. */
  progress?: BriefProgress;
  /** How the last run ended; cleared when a new one starts or the teacher dismisses it. */
  end?: BriefRunEnd;
  start(): Promise<void>;
  stop(): void;
  dismiss(): void;
}

/**
 * The run as app state, so it goes on when the teacher leaves the Trial kit for the Write tab
 * (a run is some twenty minutes) and the page finds its progress and its Stop when they come
 * back. One run at a time; a throw leaves it idle, never stuck on "running".
 */
export function createBriefRunner(
  env: StudioEnv,
  log: UseBoundStore<StoreApi<TrialLogState>>,
  briefs: readonly TrialBrief[] = TRIAL_BRIEFS,
): UseBoundStore<StoreApi<BriefRunnerState>> {
  let controller: AbortController | undefined;
  return create<BriefRunnerState>((set, get) => ({
    start: async () => {
      if (get().progress) return;
      const mine = new AbortController();
      controller = mine;
      set({ progress: { done: briefs.filter((brief) => briefsDone(log.getState().runs).has(brief.id)).length, total: briefs.length }, end: undefined });
      try {
        const end = await runBriefs({ env, log, signal: mine.signal, briefs, onProgress: (progress) => set({ progress }) });
        set({ progress: undefined, end });
      } catch (error) {
        set({ progress: undefined, end: undefined });
        throw error;
      } finally {
        if (controller === mine) controller = undefined;
      }
    },
    stop: () => controller?.abort(),
    dismiss: () => set({ end: undefined }),
  }));
}
