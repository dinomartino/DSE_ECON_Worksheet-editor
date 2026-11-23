import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { newId } from '@/model/factories';
import type { Side } from '@/model/textSlots';
import type { Compared } from './session';
import type { Level, Shape, StudioDraft, StudioOutcome, StudioRequest, Usage } from './types';

/**
 * The trial's record (k-0499, decision 7a): every request the studio ran while the trial
 * was on, the drafts it wrote with their checks, and what the teacher made of each one.
 * The 30 invented briefs (`trialRun.ts`) and the teacher's own requests land here the same
 * way, so one tally (`trialScore.ts`) reads them both. Kept on this computer only
 * (`localStorage`, never sent anywhere), so a two-hour reading survives a reload; it holds
 * the AI's own drafts and the checks' findings, nothing of any paper or document.
 */

/** Is the key defensible: exactly one option a teacher would defend as the answer? */
export type KeyMark = 'ok' | 'bad';
/** What the teacher would do with the draft: use it as it stands, after one edit, or not at all. */
export type UseMark = 'asis' | 'edit' | 'reject';

export interface TrialDraft {
  /** The draft's own id (random, so it is unique across reloads). */
  id: string;
  draft: StudioDraft;
  key?: KeyMark;
  use?: UseMark;
}

/** What was asked, without the examples' words (those are the bank's, and stay out of the record). */
export interface RequestSummary {
  keyPoint: string;
  points: number;
  examples: number;
  note: boolean;
  count: number;
  level: Level;
  shape: Shape;
  sides: readonly Side[];
}

export interface TrialRun {
  id: string;
  /** `B07` for an invented brief, `mine` for a request the teacher made. */
  label: string;
  kind: 'write' | 'refine';
  /** ISO time. */
  at: string;
  request: RequestSummary;
  ok: boolean;
  /** The error kind when the run did not produce drafts (`cancelled`, `quota`, `network`…). */
  error?: string;
  model?: string;
  usage: Usage;
  /** What the near-copy check compared with; `past: null` = the Past paper bank was not available. */
  compared?: Compared;
  /** The batch notes' finding ids. */
  notes: string[];
  drafts: TrialDraft[];
}

export const MINE = 'mine';
export const isBriefLabel = (label: string): boolean => /^B\d\d$/.test(label);

export interface RunEntry {
  label: string;
  kind: 'write' | 'refine';
  request: StudioRequest;
  outcome: StudioOutcome;
  compared?: Compared;
  at?: string;
}

export interface MarkPatch {
  /** `null` takes a mark back. */
  key?: KeyMark | null;
  use?: UseMark | null;
}

export interface TrialLogState {
  /** Oldest first. */
  runs: TrialRun[];
  /** The last save to the browser's storage did not go through (full or blocked): the report is the copy. */
  saveFailed: boolean;
  record(entry: RunEntry): void;
  mark(draftId: string, patch: MarkPatch): void;
  clear(): void;
}

export const TRIAL_LOG_KEY = 'econgen.studioTrial.v1';
const VERSION = 1;

export const summaryOf = (request: StudioRequest): RequestSummary => ({
  keyPoint: request.keyPoint,
  points: request.points.length,
  examples: request.examples.length,
  note: request.note.trim() !== '',
  count: request.count,
  level: request.level,
  shape: request.shape,
  sides: request.sides,
});

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function isDraft(value: unknown): value is TrialDraft {
  if (!isObject(value) || typeof value.id !== 'string' || !isObject(value.draft)) return false;
  const draft = value.draft;
  return typeof draft.id === 'string' && Array.isArray(draft.checks) && isObject(draft.draft) && typeof draft.status === 'string';
}

function isRun(value: unknown): value is TrialRun {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.at === 'string' &&
    typeof value.ok === 'boolean' &&
    isObject(value.request) &&
    isObject(value.usage) &&
    Array.isArray(value.notes) &&
    Array.isArray(value.drafts) &&
    value.drafts.every(isDraft)
  );
}

/** What a saved record holds, run by run: a run that is not what this build wrote is left out, never fatal. */
export function parseTrialLog(raw: string | null): TrialRun[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!isObject(data) || data.version !== VERSION || !Array.isArray(data.runs)) return [];
    return data.runs.filter(isRun);
  } catch {
    return [];
  }
}

type Storage_ = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The browser's storage when there is one that works (a sandboxed frame throws on touching it). */
export function browserStorage(): Storage_ | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function createTrialLog(storage: Storage_ | undefined = browserStorage()): UseBoundStore<StoreApi<TrialLogState>> {
  let initial: TrialRun[] = [];
  try {
    initial = parseTrialLog(storage?.getItem(TRIAL_LOG_KEY) ?? null);
  } catch {
    initial = [];
  }
  const store = create<TrialLogState>((set, get) => ({
    runs: initial,
    saveFailed: false,

    record: ({ label, kind, request, outcome, compared, at }) => {
      const run: TrialRun = {
        id: newId(),
        label,
        kind,
        at: at ?? new Date().toISOString(),
        request: summaryOf(request),
        ok: outcome.ok,
        usage: outcome.usage,
        ...(compared ? { compared } : {}),
        ...(outcome.ok
          ? { model: outcome.model, notes: outcome.notes.map((note) => note.id), drafts: outcome.drafts.map((draft): TrialDraft => ({ id: draft.id, draft })) }
          : { error: outcome.error.kind, notes: [], drafts: [] }),
      };
      set({ runs: [...get().runs, run] });
    },

    mark: (draftId, patch) => {
      set({
        runs: get().runs.map((run) =>
          run.drafts.some((d) => d.id === draftId)
            ? {
                ...run,
                drafts: run.drafts.map((d) => {
                  if (d.id !== draftId) return d;
                  const next: TrialDraft = { ...d };
                  if (patch.key !== undefined) {
                    if (patch.key === null) delete next.key;
                    else next.key = patch.key;
                  }
                  if (patch.use !== undefined) {
                    if (patch.use === null) delete next.use;
                    else next.use = patch.use;
                  }
                  return next;
                }),
              }
            : run,
        ),
      });
    },

    clear: () => set({ runs: [] }),
  }));

  if (storage) {
    let last = store.getState().runs;
    store.subscribe((state) => {
      if (state.runs === last) return;
      last = state.runs;
      try {
        if (state.runs.length === 0) storage.removeItem(TRIAL_LOG_KEY);
        else storage.setItem(TRIAL_LOG_KEY, JSON.stringify({ version: VERSION, runs: state.runs }));
        if (state.saveFailed) store.setState({ saveFailed: false });
      } catch {
        if (!state.saveFailed) store.setState({ saveFailed: true });
      }
    });
  }
  return store;
}

// ---- reading the record ----

/** Every draft the studio showed, with the run that wrote it (a draft a hard check failed was never shown). */
export function shownDrafts(runs: readonly TrialRun[]): Array<{ run: TrialRun; entry: TrialDraft }> {
  return runs.flatMap((run) => run.drafts.filter((d) => d.draft.status !== 'failed').map((entry) => ({ run, entry })));
}

/** A draft with both marks given. */
export const isMarked = (entry: TrialDraft): boolean => entry.key !== undefined && entry.use !== undefined;

/** The invented briefs that have been run through to drafts (a run that errored does not count, so it is run again). */
export function briefsDone(runs: readonly TrialRun[]): Set<string> {
  return new Set(runs.filter((run) => run.ok && run.kind === 'write' && isBriefLabel(run.label)).map((run) => run.label));
}

export function findDraft(runs: readonly TrialRun[], draftId: string): { run: TrialRun; entry: TrialDraft } | undefined {
  for (const run of runs) {
    const entry = run.drafts.find((d) => d.id === draftId);
    if (entry) return { run, entry };
  }
  return undefined;
}
