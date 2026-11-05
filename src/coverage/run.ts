import { AiError, isAiError, type AiErrorInfo } from '@/ai/types';
import type { Side } from '@/model/textSlots';
import type { ScratchRun } from '@/platform/scratch';
import { lookupCode } from '@/syllabus';
import { buildRequest, coverageChars, parsePicks, type RawPick } from './prompt';
import type { CoverageDeps, CoverageQuestion, CoverageRunOutcome, Pick, QuestionResult, UnitResult } from './types';

/**
 * The run: whole questions in chunks to the model; each question's validated result is
 * written to its own temporary file the moment its chunk returns; when every chunk is done
 * (or the run stops) the results are read back from those files. The caller builds the
 * report from them and disposes of the files. Never rejects.
 */

export const MAX_CHUNK_CHARS = 6000;
export const MAX_CHUNK_QUESTIONS = 6;
/** MC questions are short: more of them fit one request. */
export const MAX_CHUNK_MC = 12;
const MAX_PICKS = 3;
const MAX_WHY = 240;

/** Whole questions, in order, under both budgets (one oversized question goes alone). */
export function chunkQuestions(items: CoverageQuestion[]): CoverageQuestion[][] {
  const chunks: CoverageQuestion[][] = [];
  let current: CoverageQuestion[] = [];
  let chars = 0;
  for (const item of items) {
    const size = coverageChars(item);
    const cap = [...current, item].every((q) => q.question.format === 'multiple choice') ? MAX_CHUNK_MC : MAX_CHUNK_QUESTIONS;
    if (current.length && (current.length >= cap || chars + size > MAX_CHUNK_CHARS)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

const norm = (key: string) => key.toLowerCase().replace(/\s+/g, '');
const clip = (text: string) => (text.length > MAX_WHY ? `${text.slice(0, MAX_WHY - 1)}…` : text);

/**
 * Never trusts the reply: an unknown code or a key not sent is dropped, a code repeated in
 * a unit counts once, at most three picks per unit, exactly one main (the first is
 * promoted when none is). A unit the reply skipped keeps no picks.
 */
export function validatePicks(raw: RawPick[], question: CoverageQuestion): UnitResult[] {
  const byKey = new Map<string, RawPick[]>();
  for (const item of raw) {
    const list = byKey.get(norm(item.key)) ?? [];
    list.push(item);
    byKey.set(norm(item.key), list);
  }
  return question.units.map((unit) => {
    const seen = new Set<string>();
    const picks: Pick[] = [];
    let outside = '';
    for (const item of byKey.get(norm(unit.key)) ?? []) {
      if (!lookupCode(item.code) || seen.has(item.code)) continue;
      seen.add(item.code);
      if (item.outside && !outside) outside = clip(item.outside);
      picks.push({ code: item.code, w: item.weight === 'main' ? 2 : 1, band: item.band, conf: item.conf, why: clip(item.why) });
    }
    const mainAt = picks.findIndex((p) => p.w === 2);
    const ordered = mainAt > 0 ? [picks[mainAt], ...picks.filter((_, i) => i !== mainAt)] : picks;
    const kept = ordered.slice(0, MAX_PICKS).map((p, i): Pick => ({ ...p, w: i === 0 ? 2 : 1 }));
    return { key: unit.key, label: unit.label, marks: unit.marks, picks: kept, outside };
  });
}

const failed = (q: CoverageQuestion): QuestionResult => ({
  questionId: q.question.questionId,
  number: q.number,
  ok: false,
  units: q.units.map((u) => ({ key: u.key, label: u.label, marks: u.marks, picks: [], outside: '' })),
});

interface Run {
  deps: CoverageDeps;
  side: Side;
  whyLanguage: 'en' | 'zh';
  signal: AbortSignal;
}

/** One request for `chunk`; a cut-off, blocked or unreadable reply splits it in two. Throws AiError. */
async function analyse(run: Run, chunk: CoverageQuestion[], retried = false): Promise<QuestionResult[]> {
  if (run.signal.aborted) throw new AiError({ kind: 'cancelled', provider: run.deps.preset.id, message: 'Stopped.', fatal: false, actions: [] });
  const result = await run.deps.client.complete(buildRequest(chunk, run.side, run.whyLanguage, run.deps.preset, run.signal));
  const split = async (): Promise<QuestionResult[]> => {
    if (chunk.length === 1) return [failed(chunk[0])];
    const mid = Math.ceil(chunk.length / 2);
    return [...(await analyse(run, chunk.slice(0, mid))), ...(await analyse(run, chunk.slice(mid)))];
  };
  if (result.finish === 'length' || result.finish === 'safety') return split();
  const raw = parsePicks(result.text);
  if (!raw) return retried ? split() : analyse(run, chunk, true);
  return chunk.map((q) => ({ questionId: q.question.questionId, number: q.number, ok: true, units: validatePicks(raw, q) }));
}

/** "q007.json": sorts in print order. */
export const fileName = (index: number) => `q${String(index + 1).padStart(3, '0')}.json`;

/** A temporary file's result, or null when it does not read as one. */
export function readResult(text: string): QuestionResult | null {
  try {
    const value = JSON.parse(text) as QuestionResult;
    return value && typeof value.questionId === 'string' && Array.isArray(value.units) ? value : null;
  } catch {
    return null;
  }
}

export async function runCoverage(
  questions: CoverageQuestion[],
  deps: CoverageDeps,
  scratch: ScratchRun,
  opts: { side: Side; whyLanguage: 'en' | 'zh'; signal: AbortSignal; onProgress?(done: number, total: number): void },
): Promise<CoverageRunOutcome> {
  const { signal } = opts;
  const order = new Map(questions.map((q, i) => [q.question.questionId, i]));
  const total = questions.length;
  let done = 0;
  opts.onProgress?.(0, total);
  const queue = chunkQuestions(questions);
  const run: Run = { deps, side: opts.side, whyLanguage: opts.whyLanguage, signal };
  let fatal: AiErrorInfo | undefined;
  let stopped = false;
  const save = async (results: QuestionResult[]) => {
    for (const result of results) await scratch.write(fileName(order.get(result.questionId)!), JSON.stringify(result));
    done += results.length;
    opts.onProgress?.(done, total);
  };
  const worker = async () => {
    while (queue.length && !fatal && !signal.aborted) {
      const chunk = queue.shift()!;
      try {
        await save(await analyse(run, chunk));
      } catch (error) {
        if (signal.aborted || (isAiError(error) && error.info.kind === 'cancelled')) {
          stopped = true;
          continue;
        }
        if (isAiError(error) && error.info.fatal) fatal ??= error.info;
        // Transport trouble after the client's retries: these questions fail, the run goes on.
        else await save(chunk.map(failed)).catch(() => undefined);
      }
    }
  };
  const workers = Math.max(1, Math.min(deps.preset.concurrency, queue.length));
  await Promise.all(Array.from({ length: workers }, worker));

  const results = (await scratch.readAll().catch(() => []))
    .map((file) => readResult(file.text))
    .filter((r): r is QuestionResult => r !== null && order.has(r.questionId))
    .sort((a, b) => order.get(a.questionId)! - order.get(b.questionId)!);
  return { total, results, stopped: stopped || signal.aborted, ...(fatal ? { fatal } : {}) };
}
