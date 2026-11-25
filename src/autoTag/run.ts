import { AiError, isAiError, type AiErrorInfo } from '@/ai/types';
import { buildRequest, cleanSuggestion, parseTagReply, questionChars, TAG_CHUNK, TAG_CHUNK_CHARS } from './prompt';
import type { TagDeps, TagOutcome, TagQuestion, TagSuggestion } from './types';

/**
 * The run (k-0560): questions in chunks of up to ten, each chunk one request, several at
 * once as the provider allows (`preset.concurrency`). A cut-off or unreadable reply is asked
 * once more, then split in two. Stop keeps every suggestion already back. Never rejects.
 */

export function chunkQuestions(questions: readonly TagQuestion[], max = TAG_CHUNK, maxChars = TAG_CHUNK_CHARS): TagQuestion[][] {
  const chunks: TagQuestion[][] = [];
  let current: TagQuestion[] = [];
  let chars = 0;
  for (const q of questions) {
    const size = questionChars(q);
    if (current.length && (current.length >= max || chars + size > maxChars)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(q);
    chars += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

const normKey = (key: string) => key.toLowerCase().replace(/\s+/g, '');

type Answer = TagSuggestion | null;

interface Run {
  deps: TagDeps;
  whyLanguage: 'en' | 'zh';
  signal: AbortSignal;
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
  const byKey = new Map(items.map((item) => [normKey(item.key), item]));
  const answers = new Map<string, Answer>();
  const missing: TagQuestion[] = [];
  for (const q of chunk) {
    const item = byKey.get(normKey(q.key));
    const suggestion = item ? cleanSuggestion(item, q) : undefined;
    if (suggestion) answers.set(q.rootId, suggestion);
    else missing.push(q);
  }
  // A question the reply left out (or gave no usable code) is asked again once, on its own.
  if (missing.length > 0 && !retried && chunk.length > 1) {
    for (const [id, answer] of await tagChunk(run, missing, true)) answers.set(id, answer);
  } else {
    for (const q of missing) answers.set(q.rootId, null);
  }
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
  const run: Run = { deps, whyLanguage, signal };
  let fatal: AiErrorInfo | undefined;
  let stopped = false;
  const worker = async () => {
    while (queue.length && !fatal && !signal.aborted) {
      const chunk = queue.shift()!;
      try {
        const answers = await tagChunk(run, chunk);
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
  const workers = Math.max(1, Math.min(deps.preset.concurrency, queue.length));
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
