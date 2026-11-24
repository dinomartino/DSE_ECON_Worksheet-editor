import type { AiFeature, ProviderId, TokenUsage } from './types';

/**
 * A small log of what each AI call cost (k-0537): input (with the cached part), output and
 * thinking tokens, and credits, per call and grouped by job. A job is one client: every feature
 * makes a fresh client for each run (`createRunDeps`), so a studio worksheet, a translation or a
 * coverage report is one job. Kept in memory and, when the browser allows, the last
 * `KEEP` calls in localStorage under `econ-ai-usage`. Token counts and names only: never the
 * prompt, the paper or the answer.
 *
 * Credits: the hosted relay's own receipt when there is one; for an own Gemini key, what the same
 * tokens would cost on DSEcon Mentor's credits (`estimated`), so the two paths compare; none for
 * other providers, whose prices differ.
 */

export interface UsageRecord {
  /** ms since epoch. */
  at: number;
  job: string;
  feature: AiFeature;
  provider: ProviderId;
  model: string;
  /** The whole prompt, cached part included. */
  input: number;
  cached: number;
  /** Anthropic's cache-creation tokens (billed at 1.25×). */
  cacheWrite: number;
  output: number;
  thinking: number;
  credits?: number;
  /** `credits` computed from Mentor's rates, not read from a receipt. */
  estimated?: true;
  ms: number;
}

/** DSEcon Mentor's rates (CONTRACT §2): credits per million tokens; thinking bills as output. */
export const HOSTED_RATES = { input: 1170, cachedInput: 58.5, output: 5850 } as const;

export const USAGE_STORAGE_KEY = 'econ-ai-usage';
const KEEP = 300;

/**
 * Gemini's `candidatesTokenCount` excludes thinking; the OpenAI shape's `completion_tokens`
 * includes its `reasoning_tokens`. The log keeps `output` as the visible answer on both.
 */
function visibleOutput(family: 'gemini' | 'openai' | 'anthropic', usage: TokenUsage): number {
  const output = usage.output ?? 0;
  return family === 'openai' ? Math.max(0, output - (usage.thinking ?? 0)) : output;
}

export function hostedCredits(r: Pick<UsageRecord, 'input' | 'cached' | 'output' | 'thinking'>): number {
  const fresh = Math.max(0, r.input - r.cached);
  return (fresh * HOSTED_RATES.input + r.cached * HOSTED_RATES.cachedInput + (r.output + r.thinking) * HOSTED_RATES.output) / 1e6;
}

export interface CallFacts {
  job: string;
  feature: AiFeature;
  provider: ProviderId;
  family: 'gemini' | 'openai' | 'anthropic';
  relay: boolean;
  model: string;
  usage?: TokenUsage;
  charged?: number;
  ms: number;
  at: number;
}

export function toRecord(f: CallFacts): UsageRecord {
  const u = f.usage ?? {};
  const base = {
    at: f.at, job: f.job, feature: f.feature, provider: f.provider, model: f.model,
    input: u.input ?? 0, cached: u.cached ?? 0, cacheWrite: u.cacheWrite ?? 0,
    output: visibleOutput(f.family, u), thinking: u.thinking ?? 0, ms: f.ms,
  };
  if (f.relay) return f.charged === undefined ? { ...base, credits: hostedCredits(base), estimated: true } : { ...base, credits: f.charged };
  return f.family === 'gemini' ? { ...base, credits: hostedCredits(base), estimated: true } : base;
}

const records: UsageRecord[] = [];
const listeners = new Set<(r: UsageRecord) => void>();
let loaded = false;

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

const isRecordLike = (x: unknown): x is UsageRecord =>
  typeof x === 'object' && x !== null && typeof (x as UsageRecord).job === 'string' && typeof (x as UsageRecord).input === 'number';

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const saved: unknown = JSON.parse(storage()?.getItem(USAGE_STORAGE_KEY) ?? '[]');
    if (Array.isArray(saved)) records.unshift(...saved.filter(isRecordLike).slice(-KEEP));
  } catch {
    // A damaged log starts again; it is only a record.
  }
}

/** Called by the client after every call that answered. Never throws. */
export function recordUsage(facts: CallFacts): void {
  try {
    load();
    const r = toRecord(facts);
    records.push(r);
    if (records.length > KEEP) records.splice(0, records.length - KEEP);
    storage()?.setItem(USAGE_STORAGE_KEY, JSON.stringify(records));
    for (const l of [...listeners]) l(r);
  } catch (error) {
    console.warn('AI usage log failed', error);
  }
}

export function onUsage(listener: (r: UsageRecord) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Oldest first. */
export function usageLog(): readonly UsageRecord[] {
  load();
  return [...records];
}

export function clearUsageLog(): void {
  records.length = 0;
  loaded = true;
  try {
    storage()?.removeItem(USAGE_STORAGE_KEY);
  } catch {
    // nothing kept
  }
}

export interface JobUsage {
  job: string;
  /** Features in the order first seen. */
  features: AiFeature[];
  calls: number;
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
  thinking: number;
  credits?: number;
  /** Any call's credits was an estimate. */
  estimated?: true;
  started: number;
}

/** The log summed per job, in the order jobs started. */
export function usageByJob(log: readonly UsageRecord[] = usageLog()): JobUsage[] {
  const jobs = new Map<string, JobUsage>();
  for (const r of log) {
    const j = jobs.get(r.job) ?? { job: r.job, features: [], calls: 0, input: 0, cached: 0, cacheWrite: 0, output: 0, thinking: 0, started: r.at };
    if (!j.features.includes(r.feature)) j.features.push(r.feature);
    j.calls += 1;
    j.input += r.input;
    j.cached += r.cached;
    j.cacheWrite += r.cacheWrite;
    j.output += r.output;
    j.thinking += r.thinking;
    if (r.credits !== undefined) j.credits = (j.credits ?? 0) + r.credits;
    if (r.estimated) j.estimated = true;
    jobs.set(r.job, j);
  }
  return [...jobs.values()];
}

let jobCount = 0;
/** A new job id: time-based so ids from different page loads don't collide in the saved log. */
export function newJobId(): string {
  jobCount += 1;
  return `${Date.now().toString(36)}-${jobCount}`;
}
