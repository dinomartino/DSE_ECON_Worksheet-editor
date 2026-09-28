import { parseItemsPayload } from '@/ai/schema';
import { AiError, isAiError, type AiErrorInfo, type AiErrorKind, type CompletionRequest, type HttpDeps } from '@/ai/types';
import type { Glossary, TermCheck } from '@/glossary/types';
import { isRichTextEmpty, normalizeRuns, plain } from '@/model/text';
import type { Side, SlotMeta, TranslationWrite } from '@/model/textSlots';
import type { BiText, RichText } from '@/model/types';
import { normalizeEn, normalizeZh, traditionalize } from './normalize';
import { buildRequest, type RepairNotes, wireFor } from './prompt';
import type {
  Chunk,
  Direction,
  Issue,
  JobResult,
  RunDeps,
  RunOutcome,
  RunPhase,
  RunProgress,
  TranslationJob,
  TranslationPlan,
} from './types';
import { type CheckedIssue, validateItem } from './validate';
import { decodeWire } from './wire';

/**
 * Per chunk: request → decode → normalise → validate → glossary check → deny auto-fix →
 * at most one repair pass → keep the better pass per item.
 */

/** One item's outcome from one pass. */
export interface Pass {
  output: string;
  runs?: RichText;
  issues: CheckedIssue[];
  terms: TermCheck[];
  fixes: JobResult['fixes'];
  error?: AiErrorInfo;
}

const target = (job: TranslationJob): Side => (job.direction === 'toZh' ? 'zh' : 'en');
const shown = (terms: TermCheck[]) => terms.filter((t) => t.severity === 'note' || t.severity === 'warn');

function checkTerms(job: TranslationJob, runs: RichText, glossary: Glossary): { runs: RichText; terms: TermCheck[]; fixes: JobResult['fixes'] } {
  const source = plain(job.source);
  if (job.direction === 'toEn') return { runs, terms: shown(glossary.checkZhToEn(source, plain(runs))), fixes: [] };
  const fixed = glossary.autoFix(source, runs);
  return {
    runs: fixed.runs,
    terms: shown(glossary.checkEnToZh(source, plain(fixed.runs))),
    fixes: fixed.fixes.map(({ from, to }) => ({ from, to, how: 'autoFix' as const })),
  };
}

/** The whole item pipeline on one model output. Pure; also runs the few-shot answers. */
export function evaluateItem(job: TranslationJob, output: string, glossary: Glossary | null): Pass {
  const { codec } = wireFor(job);
  const decoded = decodeWire(output, codec, target(job), job.kind, job.aroundValue);
  if (!decoded.ok) return { output, issues: validateItem(job, codec, output, decoded, glossary), terms: [], fixes: [] };
  let runs = (job.direction === 'toZh' ? normalizeZh : normalizeEn)(decoded.runs).runs;
  let terms: TermCheck[] = [];
  let fixes: JobResult['fixes'] = [];
  if (glossary) ({ runs, terms, fixes } = checkTerms(job, runs, glossary));
  return { output, runs, issues: validateItem(job, codec, output, { ok: true, runs }, glossary), terms, fixes };
}

const fails = (pass: Pass) => pass.issues.filter((i) => i.severity === 'fail').length + (pass.error || !pass.runs ? 1 : 0);
const warnTerms = (pass: Pass) => pass.terms.filter((t) => t.severity === 'warn').length;
const warns = (pass: Pass) => pass.issues.filter((i) => i.severity === 'warn').length;

/** Fewer fails, then fewer warn-severity terms, then fewer warns; ties keep the first. */
export function better(first: Pass, second: Pass): Pass {
  for (const measure of [fails, warnTerms, warns]) {
    const a = measure(first);
    const b = measure(second);
    if (a !== b) return b < a ? second : first;
  }
  return first;
}

function termNote(term: TermCheck): string {
  if (term.conflict) {
    return `“${term.conflict.form}” means “${term.conflict.meansEn}”; the English says “${term.source.text}” → ${term.expected}.`;
  }
  return `Use “${term.expected}” for “${term.source.text}”.`;
}

const RIDE_ALONG: ReadonlySet<Issue['code']> = new Set(['numbers', 'symbols', 'duration', 'emphasis']);
const NOT_RETRYABLE: ReadonlySet<AiErrorKind> = new Set(['truncated', 'safety']);

/** Fix notes for the repair pass, or null when the item does not go. */
export function repairNotesFor(pass: Pass): string[] | null {
  if (pass.error && NOT_RETRYABLE.has(pass.error.kind)) return null;
  const failing = pass.issues.filter((i) => i.severity === 'fail');
  const simplified = pass.issues.filter((i) => i.code === 'simplified');
  const terms = pass.terms.filter((t) => t.severity === 'warn');
  const reversed = pass.issues.filter((i) => i.code === 'polarity');
  if (!failing.length && !simplified.length && !terms.length && !reversed.length && !pass.error) return null;
  const notes = [
    ...failing.map((i) => i.fix),
    ...reversed.map((i) => i.fix),
    ...terms.map(termNote),
    ...simplified.map((i) => i.fix),
    ...pass.issues.filter((i) => RIDE_ALONG.has(i.code)).map((i) => i.fix),
  ].filter((note): note is string => Boolean(note));
  if (pass.error) notes.push('Translate this item again; the last reply could not be read.');
  return [...new Set(notes)];
}

const CONTENT_RISK: ReadonlySet<Issue['code']> = new Set(['numbers', 'symbols', 'duration', 'length', 'latinInZh', 'polarity']);

/** Simplified conversion on what remains, then status and the default tick. */
export function finalize(job: TranslationJob, pass: Pass, passes: 1 | 2, glossary: Glossary | null): JobResult {
  let { runs, issues, terms } = pass;
  const fixes = [...pass.fixes];
  if (runs && job.direction === 'toZh') {
    const converted = traditionalize(runs);
    if (converted.converted.length) {
      runs = converted.runs;
      fixes.push(...converted.converted.map(({ from, to }) => ({ from, to, how: 'simplified' as const })));
      issues = issues.filter((i) => i.code !== 'simplified');
      if (glossary) {
        const rechecked = checkTerms(job, runs, glossary);
        runs = rechecked.runs;
        terms = rechecked.terms;
        fixes.push(...rechecked.fixes);
      }
    }
  }
  const failed = !runs || Boolean(pass.error) || issues.some((i) => i.severity === 'fail');
  const flagged = issues.some((i) => i.severity === 'warn') || terms.some((t) => t.severity === 'warn');
  const risky = issues.some((i) => CONTENT_RISK.has(i.code)) || terms.some((t) => t.conflict);
  return {
    key: job.key,
    status: failed ? 'failed' : flagged ? 'flagged' : 'ready',
    ...(runs && !failed ? { runs: normalizeRuns(runs) } : {}),
    issues: issues.map(({ code, severity, message }) => ({ code, severity, message })),
    terms,
    fixes,
    passes,
    ...(pass.error ? { error: pass.error } : {}),
    defaultAccepted: !failed && !risky,
  };
}

// ---- requests ----

type Fetched = Map<string, { text: string } | { error: AiErrorInfo }>;

interface Run {
  plan: TranslationPlan;
  deps: RunDeps;
  signal: AbortSignal;
  progress: RunProgress;
  emit: (phase: RunProgress['phase']) => void;
  model: string;
  usage: { input: number; output: number } | undefined;
}

const MAX_TRUNCATION_DEPTH = 3;
const MAX_ISOLATION_DEPTH = 6;

function rowError(run: Run, kind: AiErrorKind, message: string): AiErrorInfo {
  return { kind, provider: run.deps.preset.id, message, fatal: false, actions: [] };
}

const ROW_MESSAGES: Partial<Record<AiErrorKind, string>> = {
  truncated: 'The reply was cut off.',
  safety: 'The provider declined this text.',
  badOutput: "The reply couldn't be read.",
};

function subChunk(chunk: Chunk, keys: readonly string[], jobs: TranslationPlan['jobs']): Chunk {
  const groups = chunk.groups
    .map((group) => ({ ...group, jobKeys: group.jobKeys.filter((key) => keys.includes(key)) }))
    .filter((group) => group.jobKeys.length > 0);
  const sourceChars = keys.reduce((n, key) => n + plain(jobs.get(key)!.source).length, 0);
  return { ...chunk, groups, sourceChars };
}

async function complete(run: Run, request: CompletionRequest) {
  // Stop means no further request, whatever the client does with an aborted signal.
  if (run.signal.aborted) throw new AiError(rowError(run, 'cancelled', 'Stopped.'));
  run.emit(run.progress.phase);
  const result = await run.deps.client.complete(request);
  run.progress.requestsDone += 1;
  run.model = result.model || run.model;
  if (result.usage) {
    run.usage ??= { input: 0, output: 0 };
    run.usage.input += result.usage.input ?? 0;
    run.usage.output += result.usage.output ?? 0;
  }
  return result;
}

/** One request for `keys`; truncation, safety blocks and unreadable replies bisect. Throws AiError. */
async function fetchItems(run: Run, chunk: Chunk, keys: string[], repair: RepairNotes | undefined, depth = 0, retried = false): Promise<Fetched> {
  const part = subChunk(chunk, keys, run.plan.jobs);
  const request = buildRequest(part, run.plan.jobs, run.deps.glossary, run.deps.preset, run.signal, repair);
  const result = await complete(run, request);
  const bisect = async (kind: AiErrorKind, maxDepth: number): Promise<Fetched> => {
    if (keys.length === 1 || depth >= maxDepth) {
      return new Map(keys.map((key) => [key, { error: rowError(run, kind, ROW_MESSAGES[kind] ?? '') }]));
    }
    const mid = Math.ceil(keys.length / 2);
    run.progress.requestsTotal += 2;
    const left = await fetchItems(run, chunk, keys.slice(0, mid), repair, depth + 1, true);
    const right = await fetchItems(run, chunk, keys.slice(mid), repair, depth + 1, true);
    return new Map([...left, ...right]);
  };
  if (result.finish === 'length') return bisect('truncated', MAX_TRUNCATION_DEPTH);
  if (result.finish === 'safety') return bisect('safety', MAX_ISOLATION_DEPTH);
  const items = parseItemsPayload(result.text);
  if (!items) {
    if (!retried) {
      run.progress.requestsTotal += 1;
      return fetchItems(run, chunk, keys, repair, depth, true);
    }
    return bisect('badOutput', MAX_TRUNCATION_DEPTH);
  }
  const out: Fetched = new Map();
  for (const item of items) if (keys.includes(item.key) && !out.has(item.key)) out.set(item.key, { text: item.text });
  return out;
}

const MISSING: CheckedIssue = {
  code: 'missingKey', severity: 'fail', message: 'Missing from the reply', fix: 'Translate this item; it was missing from your reply.',
};

function passesFrom(run: Run, keys: string[], fetched: Fetched): Map<string, Pass> {
  const out = new Map<string, Pass>();
  for (const key of keys) {
    const job = run.plan.jobs.get(key)!;
    const hit = fetched.get(key);
    if (!hit) out.set(key, { output: '', issues: [MISSING], terms: [], fixes: [] });
    else if ('error' in hit) out.set(key, { output: '', issues: [], terms: [], fixes: [], error: hit.error });
    else out.set(key, evaluateItem(job, hit.text, run.deps.glossary));
  }
  return out;
}

/** Pass 1, then one repair request for the items that need it; results land per pass. */
async function runChunk(run: Run, chunk: Chunk, results: Map<string, JobResult>): Promise<void> {
  const keys = chunk.groups.flatMap((group) => group.jobKeys);
  const glossary = run.deps.glossary;
  let first: Map<string, Pass>;
  try {
    run.progress.phase = 'translating';
    first = passesFrom(run, keys, await fetchItems(run, chunk, keys, undefined));
  } catch (error) {
    if (!isAiError(error) || error.info.fatal || error.info.kind === 'cancelled') throw error;
    // Transport trouble after retries (network, server, timeout): these rows fail; the run goes on.
    for (const key of keys) {
      const pass: Pass = { output: '', issues: [], terms: [], fixes: [], error: error.info };
      results.set(key, finalize(run.plan.jobs.get(key)!, pass, 1, glossary));
    }
    return;
  }
  run.emit('checking');
  const repair = new Map<string, { previous: string; fix: string[] }>();
  for (const [key, pass] of first) {
    results.set(key, finalize(run.plan.jobs.get(key)!, pass, 1, glossary));
    const fix = repairNotesFor(pass);
    if (fix) repair.set(key, { previous: pass.output, fix });
  }
  if (!repair.size || run.signal.aborted) return;

  run.progress.phase = 'fixing';
  run.progress.requestsTotal += 1;
  const repairKeys = [...repair.keys()];
  let second: Map<string, Pass>;
  try {
    second = passesFrom(run, repairKeys, await fetchItems(run, chunk, repairKeys, repair));
  } catch (error) {
    if (!isAiError(error) || error.info.fatal || error.info.kind === 'cancelled') throw error;
    return;
  }
  for (const key of repairKeys) {
    const job = run.plan.jobs.get(key)!;
    const kept = better(first.get(key)!, second.get(key)!);
    results.set(key, finalize(job, kept, 2, glossary));
  }
  run.emit('checking');
}

type Sleep = HttpDeps['sleep'];
const waitHooks = new WeakMap<Sleep, { start: (ms: number) => void; end: () => void }>();

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * The client's sleep (its one rate-limit retry), shown as 'waiting' by the run whose
 * `deps.sleep` it is. Ends early on abort; the client's next request then reports it.
 */
export function announcedSleep(sleep: Sleep = abortableSleep): Sleep {
  const announced: Sleep = async (ms, signal) => {
    const hook = waitHooks.get(announced);
    hook?.start(ms);
    try {
      await sleep(ms, signal);
    } finally {
      hook?.end();
    }
  };
  return announced;
}

/** Never rejects. */
export async function runTranslation(
  plan: TranslationPlan,
  deps: RunDeps,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
): Promise<RunOutcome> {
  const now = deps.now ?? (() => Date.now());
  const started = now();
  const results = new Map<string, JobResult>();
  const progress: RunProgress = { phase: 'translating', requestsDone: 0, requestsTotal: plan.chunks.length };
  const run: Run = {
    plan, deps, signal, progress, model: deps.model, usage: undefined,
    emit: (phase) => {
      progress.phase = phase;
      onProgress({ ...progress });
    },
  };
  let resume: RunPhase = 'translating';
  if (deps.sleep) {
    waitHooks.set(deps.sleep, {
      start: (ms) => {
        if (progress.phase !== 'waiting') resume = progress.phase;
        progress.phase = 'waiting';
        onProgress({ ...progress, waitMs: ms });
      },
      end: () => run.emit(progress.phase === 'waiting' ? resume : progress.phase),
    });
  }
  const queue = [...plan.chunks];
  let fatal: AiErrorInfo | undefined;
  let stopped = false;
  const worker = async () => {
    while (queue.length && !fatal && !signal.aborted) {
      const chunk = queue.shift()!;
      try {
        await runChunk(run, chunk, results);
      } catch (error) {
        if (signal.aborted || (isAiError(error) && error.info.kind === 'cancelled')) stopped = true;
        else if (isAiError(error)) fatal ??= error.info;
        else fatal ??= { kind: 'badOutput', provider: deps.preset.id, message: 'Something went wrong while translating.', fatal: true, actions: ['retry'] };
      }
    }
  };
  const workers = Math.max(1, Math.min(deps.preset.concurrency, plan.chunks.length));
  await Promise.all(Array.from({ length: workers }, worker));
  if (deps.sleep) waitHooks.delete(deps.sleep);
  return {
    results,
    ...(fatal ? { fatal } : {}),
    stopped: stopped || signal.aborted,
    model: run.model,
    ms: now() - started,
    ...(run.usage ? { usage: run.usage } : {}),
  };
}

/** Accepted job keys → writes fanned out to every slot, plus accepted copies. */
export function writesFor(
  plan: TranslationPlan,
  outcome: RunOutcome,
  accepted: ReadonlySet<string>,
  acceptCopies: boolean,
): TranslationWrite[] {
  const writes: TranslationWrite[] = [];
  for (const [key, job] of plan.jobs) {
    const result = outcome.results.get(key);
    if (!accepted.has(key) || !result?.runs || result.status === 'failed') continue;
    for (const slot of job.slots) writes.push({ ...slot, next: result.runs });
  }
  return acceptCopies ? [...writes, ...plan.copies] : writes;
}

/** BiTextField: one BiText, same pipeline, no walker. `meta` is the field's `translate` prop. */
export async function translateOne(
  text: BiText,
  direction: Direction,
  meta: Pick<SlotMeta, 'kind' | 'aroundValue'>,
  deps: RunDeps,
  signal: AbortSignal,
): Promise<JobResult> {
  const side: Side = direction === 'toZh' ? 'zh' : 'en';
  const from: Side = side === 'zh' ? 'en' : 'zh';
  const source = normalizeRuns(text[from]);
  const job: TranslationJob = {
    key: 't1', direction, kind: meta.kind, ...(meta.aroundValue ? { aroundValue: meta.aroundValue } : {}),
    groupKey: 'field', where: '', source,
    slots: [{ path: 'field', side, sourceSnapshot: text[from], targetSnapshot: text[side] }],
    replacing: !isRichTextEmpty(text[side]),
  };
  const failed = (error?: AiErrorInfo): JobResult => ({
    key: 't1', status: 'failed', issues: [], terms: [], fixes: [], passes: 1, ...(error ? { error } : {}), defaultAccepted: false,
  });
  if (isRichTextEmpty(source)) return failed();
  const plan: TranslationPlan = {
    worksheetId: '', scope: { kind: 'paths', paths: ['field'] },
    options: { directions: { toZh: true, toEn: true }, includeTeacher: true, includeDiagramLabels: true, copySymbols: { toZh: false, toEn: false } },
    jobs: new Map([['t1', job]]), copies: [],
    chunks: [{ id: 'c1', direction, groups: [{ groupKey: 'field', where: '', context: [], jobKeys: ['t1'] }], sourceChars: plain(source).length }],
    counts: { toZh: 0, toEn: 0, teacher: 0, diagramLabels: 0, symbols: { toZh: 0, toEn: 0 }, copied: 0, replaceable: 0, contextLines: 0, chars: 0, requests: 1 },
  };
  const outcome = await runTranslation(plan, deps, signal, () => {});
  return outcome.results.get('t1') ?? failed(outcome.fatal);
}
