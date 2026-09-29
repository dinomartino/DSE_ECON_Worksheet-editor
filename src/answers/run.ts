import { AiError, isAiError, type AiErrorInfo, type AiErrorKind } from '@/ai/types';
import { buildRequest } from './prompt';
import type { AnswerPlan, AnswerProgress, AnswerResult, AnswersOutcome, AnswerWrite, RunDeps } from './types';
import { evaluateAnswer, parseAnswersReply, type ReplyItem } from './validate';

/**
 * Per chunk: one request → parse → evaluate each target. An unreadable reply is asked
 * once more; a cut-off or declined reply bisects to the single target. A fatal provider
 * error stops the remaining chunks; Stop keeps what finished. Never rejects.
 */

const MAX_DEPTH = 3;

const ROW_MESSAGES: Partial<Record<AiErrorKind, string>> = {
  truncated: 'The reply was cut off. Nothing inserted',
  safety: 'The provider declined this question. Nothing inserted',
  badOutput: "The reply couldn't be read. Nothing inserted",
};

interface Run {
  plan: AnswerPlan;
  deps: RunDeps;
  signal: AbortSignal;
  results: Map<string, AnswerResult>;
  tick: () => void;
}

function settle(run: Run, keys: readonly string[], items: ReplyItem[] | null, error?: string): void {
  for (const key of keys) {
    const result: AnswerResult = error
      ? { key, status: 'failed', notes: [error] }
      : evaluateAnswer(run.plan.targets.get(key)!, items!.find((item) => item.key === key), run.plan.sides, run.deps.glossary);
    run.results.set(key, result);
  }
  run.tick();
}

async function fetchChunk(run: Run, keys: string[], depth = 0, retried = false): Promise<void> {
  if (run.signal.aborted) throw new AiError({ kind: 'cancelled', provider: run.deps.preset.id, message: 'Stopped.', fatal: false, actions: [] });
  const request = buildRequest(run.plan, { targetKeys: keys }, run.deps.glossary, run.deps.preset, run.signal);
  const result = await run.deps.client.complete(request);
  const bisect = async (kind: AiErrorKind) => {
    if (keys.length === 1 || depth >= MAX_DEPTH) return settle(run, keys, null, ROW_MESSAGES[kind]);
    const mid = Math.ceil(keys.length / 2);
    await fetchChunk(run, keys.slice(0, mid), depth + 1, true);
    await fetchChunk(run, keys.slice(mid), depth + 1, true);
  };
  if (result.finish === 'length') return bisect('truncated');
  if (result.finish === 'safety') return bisect('safety');
  const items = parseAnswersReply(result.text);
  if (!items) return retried ? bisect('badOutput') : fetchChunk(run, keys, depth, true);
  settle(run, keys, items);
}

/** Never rejects. */
export async function runAnswers(
  plan: AnswerPlan,
  deps: RunDeps,
  signal: AbortSignal,
  onProgress: (p: AnswerProgress) => void = () => {},
): Promise<AnswersOutcome> {
  const results = new Map<string, AnswerResult>();
  const total = plan.targets.size;
  const run: Run = { plan, deps, signal, results, tick: () => onProgress({ done: results.size, total }) };
  const queue = [...plan.chunks];
  let fatal: AiErrorInfo | undefined;
  let stopped = false;
  const worker = async () => {
    while (queue.length && !fatal && !signal.aborted) {
      const chunk = queue.shift()!;
      try {
        await fetchChunk(run, chunk.targetKeys);
      } catch (error) {
        if (signal.aborted || (isAiError(error) && error.info.kind === 'cancelled')) stopped = true;
        else if (isAiError(error) && error.info.fatal) fatal ??= error.info;
        else {
          // Transport trouble after the client's retries: these targets fail; the run goes on.
          const message = isAiError(error) ? error.info.message : 'Something went wrong.';
          settle(run, chunk.targetKeys.filter((key) => !results.has(key)), null, `${message}. Nothing inserted`);
        }
      }
    }
  };
  onProgress({ done: 0, total });
  const workers = Math.max(1, Math.min(deps.preset.concurrency, plan.chunks.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return { results, ...(fatal ? { fatal } : {}), stopped: stopped || signal.aborted };
}

/** Every result with a fill, as writes carrying their stale guard. */
export function writesFor(plan: AnswerPlan, outcome: AnswersOutcome): AnswerWrite[] {
  const writes: AnswerWrite[] = [];
  for (const [key, target] of plan.targets) {
    const result = outcome.results.get(key);
    if (!result?.fill || result.status === 'failed') continue;
    writes.push({ key, questionId: target.questionId, leafKey: target.leaf.key, stamp: target.leaf.stamp, fill: result.fill });
  }
  return writes;
}
