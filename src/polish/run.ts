import { AiError, isAiError, type AiErrorInfo } from '@/ai/types';
import { POLISH_CHUNK } from '@/ai/credits';
import { checkDseStyle, styleItemOf, type BankQuestion } from '@/dseStyle';
import { OPTION_LETTER, STATEMENT_NUMBER, STEM_NUMBER } from '@/generate/validate';
import { normalizeRuns, plain } from '@/model/text';
import { sameRuns, type Side } from '@/model/textSlots';
import type { BiText, McqQuestion, RichText } from '@/model/types';
import { normalizeEn, normalizeZh, traditionalize } from '@/translate/normalize';
import { decodeWire } from '@/translate/wire';
import { numbersMoved, orderMoved, questionWith } from './guard';
import { buildRequest, codecKey, parsePolishReply, questionChars, type Codecs, type RawPolishItem } from './prompt';
import type { PolishChange, PolishDeps, PolishField, PolishOutcome, PolishQuestion, PolishQuestionResult } from './types';

/**
 * The run (k-0549): whole questions in chunks to the model, each reply decoded against the
 * texts as sent, tidied as the Question studio tidies a draft (Hong Kong forms and full-width
 * punctuation in 中文), then guarded (numbers, order, key) and style-checked before and
 * after. Stop keeps what came back. Never rejects.
 */

export const MAX_CHUNK_QUESTIONS = POLISH_CHUNK;
export const MAX_CHUNK_CHARS = 5000;

export function chunkQuestions(questions: readonly PolishQuestion[]): PolishQuestion[][] {
  const chunks: PolishQuestion[][] = [];
  let current: PolishQuestion[] = [];
  let chars = 0;
  for (const q of questions) {
    const size = questionChars(q);
    if (current.length && (current.length >= MAX_CHUNK_QUESTIONS || chars + size > MAX_CHUNK_CHARS)) {
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

const STRIP: Record<PolishField['kind'], RegExp> = { stem: STEM_NUMBER, statement: STATEMENT_NUMBER, option: OPTION_LETTER };

/**
 * The studio's tidy (`generate/validate.ts:tidySide`) on runs: Hong Kong forms and full-width
 * punctuation for 中文. Typed spaces are kept: the house style spaces 物品 X and 2020 年.
 */
export function tidyRuns(runs: RichText, side: Side): RichText {
  return side === 'en' ? normalizeEn(runs).runs : normalizeZh(traditionalize(runs).runs, { keepSpaces: true }).runs;
}

/** One side of the model's text back to runs, or null when it cannot be read. */
function decodeSide(raw: string, field: PolishField, side: Side, codecs: Codecs): RichText | null {
  const codec = codecs.get(codecKey(field.key, side));
  if (!codec) return null;
  // A label the paper prints is dropped, unless the teacher's own text starts that way.
  const strip = STRIP[field.kind].test(plain(field.text[side])) ? raw.trim() : raw.trim().replace(STRIP[field.kind], '');
  const decoded = decodeWire(strip, codec, side, field.kind);
  if (!decoded.ok) return null;
  return normalizeRuns(tidyRuns(decoded.runs, side));
}

const normKey = (k: string) => k.toLowerCase().replace(/\s+/g, '');

/** A question's changes from its reply item; the guards marked, nothing applied. */
export function changesOf(q: PolishQuestion, item: RawPolishItem, codecs: Codecs): PolishChange[] {
  const fieldBy = new Map(q.fields.map((f) => [normKey(f.key), f]));
  const changes: PolishChange[] = [];
  const seen = new Set<string>();
  for (const raw of item.fields) {
    const field = fieldBy.get(normKey(raw.id));
    if (!field || seen.has(field.key)) continue;
    seen.add(field.key);
    const after: BiText = { en: field.text.en, zh: field.text.zh };
    const sides: Side[] = [];
    for (const side of q.sides) {
      if (!raw[side].trim()) continue;
      const runs = decodeSide(raw[side], field, side, codecs);
      if (!runs || sameRuns(runs, normalizeRuns(field.text[side]))) continue;
      after[side] = runs;
      sides.push(side);
    }
    if (!sides.length) continue;
    const change: PolishChange = {
      id: `polish:${q.questionId}:${field.key}`,
      questionId: q.questionId,
      path: field.path,
      ...(field.target ? { target: field.target } : {}),
      where: field.where,
      kind: field.kind,
      before: field.text,
      after,
      sides,
      why: raw.why,
    };
    for (const side of sides) {
      const moved = numbersMoved(field.text[side], after[side]);
      if (moved) {
        change.blocked = { reason: 'numbers', detail: [...moved.lost.map((n) => `−${n}`), ...moved.added.map((n) => `+${n}`)].join(' ') };
        break;
      }
    }
    changes.push(change);
  }

  // Order: options and statements, read with every change in place.
  const listMoved = (kind: 'option' | 'statement') => {
    const list = q.fields.filter((f) => f.kind === kind);
    const now = list.map((f) => changes.find((c) => c.path === f.path)?.after ?? f.text);
    return orderMoved(list.map((f) => f.text), now, q.sides);
  };
  for (const kind of ['option', 'statement'] as const) {
    if (!listMoved(kind)) continue;
    for (const c of changes) if (c.kind === kind && !c.blocked) c.blocked = { reason: 'order', detail: '' };
  }
  // The key: the model was told to return it unchanged; another letter means it read the question differently.
  if (item.answer && /^[A-H]$/.test(item.answer) && item.answer !== q.answer) {
    for (const c of changes) c.blocked = { reason: 'key', detail: `${q.answer} → ${item.answer}` };
  }
  return changes;
}

const styleOf = (question: McqQuestion, sides: readonly Side[]) => checkDseStyle(styleItemOf(question as unknown as BankQuestion), sides);

export function resultOf(q: PolishQuestion, changes: PolishChange[]): PolishQuestionResult {
  return {
    questionId: q.questionId,
    changes,
    styleBefore: styleOf(q.question, q.sides),
    styleAfter: styleOf(questionWith(q.question, changes.filter((c) => !c.blocked)), q.sides),
  };
}

type Reviewed = { ok: true; changes: PolishChange[] } | { ok: false };

interface Run {
  deps: PolishDeps;
  signal: AbortSignal;
}

/** One request for `chunk`; a cut-off or unreadable reply is retried once, then split in two. Throws AiError. */
async function polishChunk(run: Run, chunk: PolishQuestion[], retried = false): Promise<Map<string, Reviewed>> {
  if (run.signal.aborted) throw new AiError({ kind: 'cancelled', provider: run.deps.preset.id, message: 'Stopped.', fatal: false, actions: [] });
  const { request, codecs } = buildRequest(chunk, run.deps.preset, run.signal);
  const result = await run.deps.client.complete(request);
  const split = async (): Promise<Map<string, Reviewed>> => {
    if (chunk.length === 1) return new Map([[chunk[0].questionId, { ok: false }]]);
    const mid = Math.ceil(chunk.length / 2);
    return new Map([...(await polishChunk(run, chunk.slice(0, mid))), ...(await polishChunk(run, chunk.slice(mid)))]);
  };
  if (result.finish === 'length' || result.finish === 'safety') return split();
  const items = parsePolishReply(result.text);
  if (!items) return retried ? split() : polishChunk(run, chunk, true);
  const byKey = new Map(items.map((item) => [normKey(item.q), item]));
  return new Map(
    chunk.map((q): [string, Reviewed] => {
      const item = byKey.get(normKey(q.key));
      // A question the reply leaves out was read as needing nothing.
      return [q.questionId, { ok: true, changes: item ? changesOf(q, item, codecs) : [] }];
    }),
  );
}

export async function runPolish(
  questions: readonly PolishQuestion[],
  deps: PolishDeps,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<PolishOutcome> {
  const reviewed = new Map<string, Reviewed>();
  onProgress(0, questions.length);
  const queue = chunkQuestions(questions);
  const run: Run = { deps, signal };
  let fatal: AiErrorInfo | undefined;
  let stopped = false;
  const worker = async () => {
    while (queue.length && !fatal && !signal.aborted) {
      const chunk = queue.shift()!;
      try {
        for (const [id, r] of await polishChunk(run, chunk)) reviewed.set(id, r);
      } catch (error) {
        if (signal.aborted || (isAiError(error) && error.info.kind === 'cancelled')) {
          stopped = true;
          continue;
        }
        if (isAiError(error) && error.info.fatal) fatal ??= error.info;
        else for (const q of chunk) reviewed.set(q.questionId, { ok: false });
      }
      onProgress(reviewed.size, questions.length);
    }
  };
  const workers = Math.max(1, Math.min(deps.preset.concurrency, queue.length));
  await Promise.all(Array.from({ length: workers }, worker));

  const results: PolishQuestionResult[] = [];
  for (const q of questions) {
    const r = reviewed.get(q.questionId);
    if (r?.ok) results.push(resultOf(q, r.changes));
  }
  const values = [...reviewed.values()];
  return {
    results,
    total: questions.length,
    reviewed: values.filter((r) => r.ok).length,
    failed: values.filter((r) => !r.ok).length,
    stopped: stopped || signal.aborted,
    ...(fatal ? { fatal } : {}),
  };
}
