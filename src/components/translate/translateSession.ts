import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { AiErrorInfo } from '@/ai/types';
import type { TextPath } from '@/model/textSlots';
import type { AppDialog, TranslateRequest } from '@/store/appDialogs';
import type {
  JobResult,
  RunOutcome,
  RunProgress,
  TermRow,
  TranslateOptions,
  TranslateScope,
  TranslationJob,
  TranslationPlan,
} from '@/translate/types';

/**
 * The Translate dialog's phases as a pure reducer, so every screen is a static-markup
 * test. The store outlives the dialog across a Settings round trip (scope, options and
 * finished rows survive `returnTo`); effects live in `translateController.ts`.
 */

export type SessionMode = 'translate' | 'check';
export type SessionPhase = 'setup' | 'running' | 'review' | 'error';
export type ReviewFilter = 'all' | 'look' | 'failed';
/** The footer's question: set by the first close (Escape, ✕, scrim) or by Back. */
export type Confirm = { kind: 'stop' } | { kind: 'discard'; then: 'close' | 'setup' };

/** One Translate click's work: the whole plan, and the results merged across retries. */
export interface RunRecord {
  plan: TranslationPlan;
  results: ReadonlyMap<string, JobResult>;
  model: string;
  ms: number;
  stopped: boolean;
}

export interface TranslateSession {
  request: TranslateRequest | null;
  mode: SessionMode;
  phase: SessionPhase;
  scope: TranslateScope;
  options: TranslateOptions | null;
  run: RunRecord | null;
  progress: RunProgress | null;
  error: AiErrorInfo | null;
  /** Explicit ticks by job key; an absent key follows `defaultAccepted`. */
  ticks: ReadonlyMap<string, boolean>;
  acceptCopies: boolean;
  filter: ReviewFilter;
  confirm: Confirm | null;
  /** Every write was stale at Insert. */
  nothingInserted: boolean;
  /** Check terms: explicit ticks by `termKey`; absent follows `defaultTermTick`. */
  termTicks: ReadonlyMap<string, boolean>;
}

export const EMPTY_SESSION: TranslateSession = {
  request: null,
  mode: 'translate',
  phase: 'setup',
  scope: { kind: 'paper' },
  options: null,
  run: null,
  progress: null,
  error: null,
  ticks: new Map(),
  acceptCopies: true,
  filter: 'all',
  confirm: null,
  nothingInserted: false,
  termTicks: new Map(),
};

export type SessionAction =
  | { type: 'open'; request: TranslateRequest; options: TranslateOptions; mode: SessionMode }
  | { type: 'reset' }
  | { type: 'setMode'; mode: SessionMode }
  | { type: 'setScope'; scope: TranslateScope }
  | { type: 'setOptions'; patch: Partial<TranslateOptions> }
  /** With `plan`: a new run. Without: a retry that keeps the record and its results. */
  | { type: 'runStarted'; plan?: TranslationPlan }
  | { type: 'progress'; progress: RunProgress }
  | { type: 'runFinished'; outcome: RunOutcome }
  | { type: 'runFailed'; error: AiErrorInfo }
  | { type: 'tick'; keys: readonly string[]; value: boolean }
  | { type: 'toggleCopies' }
  | { type: 'setFilter'; filter: ReviewFilter }
  | { type: 'confirm'; confirm: Confirm | null }
  | { type: 'discard' }
  | { type: 'review' }
  | { type: 'nothingInserted' }
  | { type: 'toggleTerm'; key: string; value: boolean };

/** Requests are small plain data; equal content (in any key order) is the same request. */
export function sameRequest(a: TranslateRequest | null | undefined, b: TranslateRequest | null | undefined): boolean {
  if (!a || !b) return false;
  return a === b || canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : v,
  );
}

export function reduceSession(state: TranslateSession, action: SessionAction): TranslateSession {
  switch (action.type) {
    case 'open':
      if (sameRequest(state.request, action.request)) {
        // Back from Settings: scope, options and finished rows are kept.
        const phase = state.run && finishedCount(state.run) > 0 ? 'review' : 'setup';
        return { ...state, phase, confirm: null, progress: null, error: null };
      }
      return {
        ...EMPTY_SESSION,
        request: action.request,
        mode: action.mode,
        scope: action.request.scope,
        options: action.options,
      };
    case 'reset':
      return EMPTY_SESSION;
    case 'setMode':
      return state.phase === 'setup' ? { ...state, mode: action.mode, confirm: null } : state;
    case 'setScope':
      return state.phase === 'setup' ? { ...state, scope: action.scope } : state;
    case 'setOptions':
      return state.phase === 'setup' && state.options
        ? { ...state, options: { ...state.options, ...action.patch } }
        : state;
    case 'runStarted': {
      const run = action.plan
        ? { plan: action.plan, results: new Map<string, JobResult>(), model: '', ms: 0, stopped: false }
        : state.run;
      if (!run) return state;
      return { ...state, phase: 'running', run, progress: null, error: null, confirm: null, nothingInserted: false };
    }
    case 'progress':
      return state.phase === 'running' ? { ...state, progress: action.progress } : state;
    case 'runFinished':
      return finishRun(state, action.outcome);
    case 'runFailed':
      return { ...state, phase: 'error', error: action.error, progress: null, confirm: null };
    case 'tick': {
      const ticks = new Map(state.ticks);
      for (const key of action.keys) ticks.set(key, action.value);
      return { ...state, ticks };
    }
    case 'toggleCopies':
      return { ...state, acceptCopies: !state.acceptCopies };
    case 'setFilter':
      return { ...state, filter: action.filter };
    case 'confirm':
      return { ...state, confirm: action.confirm };
    case 'discard':
      return { ...state, phase: 'setup', run: null, ticks: new Map(), error: null, confirm: null, filter: 'all' };
    case 'review':
      return state.run ? { ...state, phase: 'review', confirm: null, filter: 'all' } : state;
    case 'nothingInserted':
      return { ...state, nothingInserted: true, confirm: null };
    case 'toggleTerm': {
      const termTicks = new Map(state.termTicks);
      termTicks.set(action.key, action.value);
      return { ...state, termTicks };
    }
  }
}

function finishRun(state: TranslateSession, outcome: RunOutcome): TranslateSession {
  if (!state.run || state.phase !== 'running') return state;
  const results = new Map(state.run.results);
  // A retried row starts from its own defaultAccepted, never from a tick made before it had a result.
  const ticks = new Map(state.ticks);
  for (const [key, result] of outcome.results) {
    results.set(key, result);
    ticks.delete(key);
  }
  const run: RunRecord = {
    plan: state.run.plan,
    results,
    model: outcome.model || state.run.model,
    ms: state.run.ms + outcome.ms,
    stopped: outcome.stopped,
  };
  const base = { ...state, run, ticks, progress: null, confirm: null };
  if (outcome.fatal) return { ...base, phase: 'error', error: outcome.fatal };
  // Stop before any row finished: back to Setup, nothing to review.
  if (finishedCount(run) === 0 && (outcome.stopped || results.size === 0)) {
    return { ...base, phase: 'setup', run: null, ticks: new Map() };
  }
  return { ...base, phase: 'review', filter: 'all' };
}

/** Every option on: what the scope holds at all (Setup's row counts, "nothing to fill"). */
export function probeOptions(options: TranslateOptions): TranslateOptions {
  return {
    ...options,
    directions: { toZh: true, toEn: true },
    includeTeacher: true,
    includeDiagramLabels: true,
    copySymbols: { toZh: true, toEn: true },
  };
}

// ---- selectors ----

const usable = (result: JobResult | undefined): result is JobResult =>
  !!result && result.status !== 'failed' && !!result.runs;

/** Rows with a translation to insert. */
export function finishedCount(run: RunRecord): number {
  let n = 0;
  for (const result of run.results.values()) if (usable(result)) n += 1;
  return n;
}

/** Jobs a retry sends: never attempted (Stop, fatal) or failed. */
export function pendingKeys(run: RunRecord): string[] {
  return [...run.plan.jobs.keys()].filter((key) => !usable(run.results.get(key)));
}

export function unattemptedCount(run: RunRecord): number {
  return [...run.plan.jobs.keys()].filter((key) => !run.results.has(key)).length;
}

/** What Select All / None touches: rows shown under `filter` that can be ticked at all. */
export function selectableKeys(run: RunRecord, filter: ReviewFilter): string[] {
  return reviewGroups(run, filter).flatMap((group) =>
    group.items.filter((item) => usable(item.result)).map((item) => item.key),
  );
}

export function isTicked(session: TranslateSession, key: string): boolean {
  const result = session.run?.results.get(key);
  if (!usable(result)) return false;
  return session.ticks.get(key) ?? result.defaultAccepted;
}

export function acceptedKeys(session: TranslateSession): Set<string> {
  const keys = new Set<string>();
  for (const key of session.run?.results.keys() ?? []) if (isTicked(session, key)) keys.add(key);
  return keys;
}

export function insertCount(session: TranslateSession): number {
  const copies = session.run?.plan.copies.length ?? 0;
  return acceptedKeys(session).size + (session.acceptCopies ? copies : 0);
}

/** What Escape, ✕ or the scrim does now. Paid work is never lost to one stray press. */
export type CloseIntent = 'close' | 'askStop' | 'stop' | 'askDiscard' | 'discard';
export function closeIntent(session: TranslateSession): CloseIntent {
  if (session.phase === 'running') return session.confirm?.kind === 'stop' ? 'stop' : 'askStop';
  const pending = session.mode === 'translate' && !session.nothingInserted && !!session.run && finishedCount(session.run) > 0;
  if (!pending) return 'close';
  return session.confirm?.kind === 'discard' ? 'discard' : 'askDiscard';
}

/** The same plan narrowed to `keys` (a retry): chunks keep their groups' context. */
export function restrictPlan(plan: TranslationPlan, keys: readonly string[]): TranslationPlan {
  const keep = new Set(keys);
  const jobs = new Map([...plan.jobs].filter(([key]) => keep.has(key)));
  const chunks = plan.chunks
    .map((chunk) => ({
      ...chunk,
      groups: chunk.groups
        .map((group) => ({ ...group, jobKeys: group.jobKeys.filter((key) => keep.has(key)) }))
        .filter((group) => group.jobKeys.length > 0),
    }))
    .filter((chunk) => chunk.groups.length > 0);
  return { ...plan, jobs, copies: [], chunks, counts: { ...plan.counts, requests: chunks.length } };
}

// ---- review rows ----

export interface ReviewItem { key: string; job: TranslationJob; result: JobResult }
export interface ReviewGroup { key: string; label: string; items: ReviewItem[] }

export function filterCounts(run: RunRecord | null): Record<ReviewFilter, number> {
  const counts = { all: 0, look: 0, failed: 0 };
  for (const result of run?.results.values() ?? []) {
    counts.all += 1;
    if (result.status === 'flagged') counts.look += 1;
    if (result.status === 'failed') counts.failed += 1;
  }
  return counts;
}

/** Finished rows in plan (reading) order, grouped under their owner's heading. */
export function reviewGroups(run: RunRecord | null, filter: ReviewFilter): ReviewGroup[] {
  if (!run) return [];
  const headings = new Map<string, string>();
  for (const chunk of run.plan.chunks) for (const group of chunk.groups) headings.set(group.groupKey, group.where);
  const groups = new Map<string, ReviewGroup>();
  for (const [key, job] of run.plan.jobs) {
    const result = run.results.get(key);
    if (!result) continue;
    if (filter === 'look' && result.status !== 'flagged') continue;
    if (filter === 'failed' && result.status !== 'failed') continue;
    let group = groups.get(job.groupKey);
    if (!group) {
      group = { key: job.groupKey, label: headings.get(job.groupKey) ?? job.where.split(' · ')[0], items: [] };
      groups.set(job.groupKey, group);
    }
    group.items.push({ key, job, result });
  }
  return [...groups.values()];
}

/** "Question 3 · (b) · table cell" under "Question 3" reads "(b) · table cell". */
export function locationLabel(job: TranslationJob, groupLabel: string): string {
  if (job.where === groupLabel) return '';
  return job.where.startsWith(`${groupLabel} · `) ? job.where.slice(groupLabel.length + 3) : job.where;
}

// ---- Check terms ----

export const termKey = (path: TextPath, index: number): string => `${path}#${index}`;

export type TermBucket = 'fix' | 'lower' | 'manual';
export function termBucket(check: TermRow['checks'][number]): TermBucket {
  if (!check.fix) return 'manual';
  return check.fix.kind === 'lowerRank' ? 'lower' : 'fix';
}

/** Old seeds and mainland/Taiwan forms are pre-ticked; a textbook variant and a lower rank are not. */
export function defaultTermTick(check: TermRow['checks'][number]): boolean {
  return check.fix?.kind === 'deny' && check.fix.denyKind !== 'variant';
}

export function isTermTicked(session: TranslateSession, row: TermRow, index: number): boolean {
  const check = row.checks[index];
  if (!check?.fix) return false;
  return session.termTicks.get(termKey(row.path, index)) ?? defaultTermTick(check);
}

export function acceptedTermFixes(session: TranslateSession, rows: readonly TermRow[]): Map<TextPath, Set<number>> {
  const accepted = new Map<TextPath, Set<number>>();
  for (const row of rows) {
    const indices = new Set(row.checks.map((_, i) => i).filter((i) => isTermTicked(session, row, i)));
    if (indices.size > 0) accepted.set(row.path, indices);
  }
  return accepted;
}

// ---- host ----

/**
 * What `TranslateHost` does when the app dialog or the document changes: open (or resume)
 * the request; close a request for another document or a read-only one; keep the session
 * while Settings holds it as `returnTo`; otherwise drop it.
 */
export function hostAction(
  open: AppDialog | null,
  session: TranslateSession,
  doc: { worksheetId: string; readOnly: boolean },
): 'open' | 'closeStale' | 'keep' | 'reset' {
  if (open?.kind === 'translate') {
    return open.request.worksheetId === doc.worksheetId && !doc.readOnly ? 'open' : 'closeStale';
  }
  if (open?.kind === 'settings' && sameRequest(open.returnTo, session.request)) return 'keep';
  return 'reset';
}

// ---- store ----

export interface SessionStore {
  session: TranslateSession;
  dispatch: (action: SessionAction) => void;
}

export function createSessionStore(): UseBoundStore<StoreApi<SessionStore>> {
  return create<SessionStore>((set) => ({
    session: EMPTY_SESSION,
    dispatch: (action) => set((state) => ({ session: reduceSession(state.session, action) })),
  }));
}

export const useTranslateSession = createSessionStore();

