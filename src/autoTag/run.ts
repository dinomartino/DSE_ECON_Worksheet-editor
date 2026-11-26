import { AiError, isAiError, type AiErrorInfo } from '@/ai/types';
import { buildDecide, completeIn, suggestionsFromDecide } from './jev';
import { buildRequest, itemKey, parseTagReply, questionChars, questionItems, suggestionOf, TAG_CHUNK, TAG_CHUNK_CHARS } from './prompt';
import type { TagDeps, TagOutcome, TagQuestion, TagSuggestion } from './types';

/**
 * The run (k-0560): questions in chunks of up to ten items (a question with parts counts one
 * per part, u-g13t), each chunk one request, several at once as the provider allows
 * (`preset.concurrency`). A cut-off or unreadable reply is asked once more, then split in two.
 * Stop keeps every suggestion already back. Never rejects.
 *
 * On DSEcon Mentor credits (k-0567) a client with `decide` sends each chunk to Jev instead
 * (`jev.ts`), one request at a time: the TypeSafe key is shared with Mentor's student chat
 * router, so a 500-question run is 50 requests in a row, about one a second. When Mentor
 * doesn't offer it (an older Mentor, switched off) the run carries on with the prompt.
 */

export function chunkQuestions(questions: readonly TagQuestion[], max = TAG_CHUNK, maxChars = TAG_CHUNK_CHARS): TagQuestion[][] {
  const chunks: TagQuestion[][] = [];
  let current: TagQuestion[] = [];
  let chars = 0;
  let items = 0;
  for (const q of questions) {
    const size = questionChars(q);
    const count = questionItems(q);
    if (current.length && (items + count > max || chars + size > maxChars)) {
      chunks.push(current);
      current = [];
      chars = 0;
      items = 0;
    }
    current.push(q);
    chars += size;
    items += count;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

type Answer = TagSuggestion | null;

interface Run {
  deps: TagDeps;
  whyLanguage: 'en' | 'zh';
  signal: AbortSignal;
  /** Jev through Mentor's `/ai/decide` (k-0567); false once Mentor said it doesn't offer it. */
  jev: boolean;
}

/** One `/ai/decide` request for `chunk`, or null when Mentor doesn't offer it. Throws AiError. */
async function tagChunkJev(run: Run, chunk: TagQuestion[], retried = false): Promise<Map<string, Answer> | null> {
  if (run.signal.aborted) throw new AiError({ kind: 'cancelled', provider: run.deps.preset.id, message: 'Stopped.', fatal: false, actions: [] });
  const result = await run.deps.client.decide!(buildDecide(chunk, run.signal));
  if (!result) return null;
  const answers = suggestionsFromDecide(chunk, result);
  // A question (or part) left unanswered is asked once more on its own; the fuller answer is kept.
  const missing = chunk.filter((q) => !completeIn(q, answers.get(q.rootId)));
  if (missing.length && !retried) {
    for (const q of missing) {
      const again = await tagChunkJev(run, [q], true);
      const answer = again?.get(q.rootId);
      const before = answers.get(q.rootId);
      if (answer && (!before || (answer.parts?.length ?? 1) >= (before.parts?.length ?? 1))) answers.set(q.rootId, answer);
    }
  }
  return answers;
}

/** One request for `chunk`: each question's suggestion, or null. Throws AiError. */
async function tagChunk(run: Run, chunk: TagQuestion[], retried = false): Promise<Map<string, Answer>> {
  if (run.signal.aborted) throw new AiError({ kind: 'cancelled', provider: run.deps.preset.id, message: 'Stopped.', fatal: false, actions: [] });
  const result = await run.deps.client.complete(buildRequest(chunk, run.whyLanguage, run.deps.preset, run.signal));
  const split = async (): Promise<Map<string, Answer>> => {
    if (chunk.length === 1) return new Map([[chunk[0].rootId, null]]);
    const mid = Math.ceil(chunk.length / 2);
    return new Map([...(await tagChunk(run, chunk.slice(0, mid))), ...(await tagChunk(run, chunk.slice(mid)))]);
  };
  if (result.finish === 'length' || result.finish === 'safety') return split();
  const items = parseTagReply(result.text);
  if (!items) return retried ? split() : tagChunk(run, chunk, true);
  const byKey = new Map(items.map((item) => [itemKey(item.key), item]));
  const answers = new Map<string, Answer>();
  const missing: TagQuestion[] = [];
  for (const q of chunk) {
    const { suggestion, complete } = suggestionOf(q, (key) => byKey.get(key));
    if (suggestion) answers.set(q.rootId, suggestion);
    if (!complete) missing.push(q);
  }
  // A question the reply left out, gave no usable code, or left a part out of is asked again
  // once, on its own; the fuller answer of the two is kept.
  if (missing.length > 0 && !retried && (chunk.length > 1 || missing[0].parts)) {
    for (const [id, answer] of await tagChunk(run, missing, true)) {
      const before = answers.get(id);
      if (answer && (!before || (answer.parts?.length ?? 1) >= (before.parts?.length ?? 1))) answers.set(id, answer);
    }
  }
  for (const q of chunk) if (!answers.has(q.rootId)) answers.set(q.rootId, null);
  return answers;
}

export interface TagRunOptions {
  /** The language of each suggestion's reason: the teacher's interface language. */
  whyLanguage: 'en' | 'zh';
  signal: AbortSignal;
  /** Questions answered so far (suggested or failed), of all sent. */
  onProgress?: (done: number, total: number) => void;
  /** Each chunk's suggestions as they come back, so review can start before the run ends. */
  onSuggestions?: (suggestions: TagSuggestion[]) => void;
}

export async function runTagging(questions: readonly TagQuestion[], deps: TagDeps, options: TagRunOptions): Promise<TagOutcome> {
  const { signal, whyLanguage, onProgress = () => {}, onSuggestions = () => {} } = options;
  const answered = new Map<string, Answer>();
  onProgress(0, questions.length);
  const queue = chunkQuestions(questions);
  const run: Run = { deps, whyLanguage, signal, jev: typeof deps.client.decide === 'function' };
  let fatal: AiErrorInfo | undefined;
  let stopped = false;
  const worker = async () => {
    while (queue.length && !fatal && !signal.aborted) {
      const chunk = queue.shift()!;
      try {
        let answers = run.jev ? await tagChunkJev(run, chunk) : null;
        if (!answers) {
          run.jev = false;
          answers = await tagChunk(run, chunk);
        }
        const fresh: TagSuggestion[] = [];
        for (const q of chunk) {
          const answer = answers.get(q.rootId) ?? null;
          answered.set(q.rootId, answer);
          if (answer) fresh.push(answer);
        }
        if (fresh.length) onSuggestions(fresh);
      } catch (error) {
        if (signal.aborted || (isAiError(error) && error.info.kind === 'cancelled')) {
          stopped = true;
          continue;
        }
        if (isAiError(error) && error.info.fatal) fatal ??= error.info;
        else for (const q of chunk) answered.set(q.rootId, null);
      }
      onProgress(answered.size, questions.length);
    }
  };
  // Jev: one request at a time (the shared TypeSafe rate limit); the prompt: as the provider allows.
  const workers = run.jev ? 1 : Math.max(1, Math.min(deps.preset.concurrency, queue.length));
  await Promise.all(Array.from({ length: workers }, worker));

  const suggestions: TagSuggestion[] = [];
  const failed: string[] = [];
  for (const q of questions) {
    if (!answered.has(q.rootId)) continue;
    const answer = answered.get(q.rootId);
    if (answer) suggestions.push(answer);
    else failed.push(q.rootId);
  }
  return {
    suggestions,
    total: questions.length,
    failed,
    stopped: stopped || signal.aborted,
    ...(fatal ? { fatal } : {}),
  };
}
