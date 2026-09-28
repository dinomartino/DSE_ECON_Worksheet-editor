import { AiError, isAiError, type AiErrorInfo } from '@/ai/types';
import type { QualityAnchor } from '@/registry/types';
import { deterministicFindings, whereOf } from './checks';
import { anchorEmpty, anchorText, questionEmpty } from './collect';
import { anchorKey, buildRequest, parseFindings, questionChars, questionKey, type RawFinding } from './prompt';
import type { ModelIssue, QualityDeps, QualityFinding, QualityOutcome, QualityProgress, QualityQuestion } from './types';

/**
 * The check: deterministic findings first (no call), then whole questions in chunks to
 * the model, parsed and validated. Stop keeps every finished finding. Never rejects.
 */

export const MAX_CHUNK_CHARS = 6000;
export const MAX_CHUNK_QUESTIONS = 6;
/** More than this many model findings on one question is noise; 'fix' ones are kept first. */
export const MAX_PER_QUESTION = 4;
const MAX_WORDS = 600;

interface Keyed { question: QualityQuestion; key: string }

/** Whole questions, in order, under both budgets (one oversized question goes alone). */
export function chunkQuestions(items: Keyed[]): Keyed[][] {
  const chunks: Keyed[][] = [];
  let current: Keyed[] = [];
  let chars = 0;
  for (const item of items) {
    const size = questionChars(item.question);
    if (current.length && (current.length >= MAX_CHUNK_QUESTIONS || chars + size > MAX_CHUNK_CHARS)) {
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

const OPTION_ISSUES: ReadonlySet<ModelIssue> = new Set(['twoAnswers', 'wrongKey', 'weakDistractor', 'combination']);
const norm = (key: string) => key.toLowerCase().replace(/\s+/g, '').replace(/^(q\d+)[:/]/, '$1.');
const clip = (text: string) => (text.length > MAX_WORDS ? `${text.slice(0, MAX_WORDS - 1)}…` : text);
const bothSides = (anchor: QualityAnchor) => anchorText(anchor, 'en') !== '' && anchorText(anchor, 'zh') !== '';

/**
 * The model's findings that anchor to something sent: a known question or entry key, an
 * entry with words, an option issue only where there are options. Duplicates and a
 * question's surplus are dropped.
 */
export function validateFindings(raw: RawFinding[], chunk: Keyed[]): QualityFinding[] {
  const index = new Map<string, { question: QualityQuestion; anchor?: QualityAnchor }>();
  for (const { question, key } of chunk) {
    index.set(norm(key), { question });
    for (const anchor of question.anchors) index.set(norm(anchorKey(key, anchor)), { question, anchor });
  }
  const seen = new Set<string>();
  const perQuestion = new Map<string, QualityFinding[]>();
  for (const item of raw) {
    const hit = index.get(norm(item.key));
    if (!hit) continue;
    const { question, anchor } = hit;
    if (anchor && anchorEmpty(anchor)) continue;
    if (OPTION_ISSUES.has(item.issue) && !question.anchors.some((a) => a.role === 'option')) continue;
    if (item.issue === 'bilingual' && anchor && !bothSides(anchor)) continue;
    const dedupe = `${norm(item.key)}|${item.issue}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const list = perQuestion.get(question.questionId) ?? [];
    list.push({
      id: `model:${question.questionId}:${anchor?.ref ?? ''}:${item.issue}:${list.length}`,
      questionId: question.questionId,
      ...(anchor ? { anchor } : {}),
      where: whereOf(question, anchor),
      issue: item.issue,
      severity: item.severity,
      message: clip(item.text),
      ...(item.suggestion ? { suggestion: clip(item.suggestion) } : {}),
      from: 'model',
    });
    perQuestion.set(question.questionId, list);
  }
  return [...perQuestion.values()].flatMap((list) =>
    list.length <= MAX_PER_QUESTION
      ? list
      : [...list.filter((f) => f.severity === 'fix'), ...list.filter((f) => f.severity !== 'fix')].slice(0, MAX_PER_QUESTION),
  );
}

type Reviewed = { ok: true; findings: QualityFinding[] } | { ok: false };

interface Run {
  deps: QualityDeps;
  signal: AbortSignal;
}

/** One request for `chunk`; a cut-off, blocked or unreadable reply splits it in two. Throws AiError. */
async function review(run: Run, chunk: Keyed[], retried = false): Promise<Map<string, Reviewed>> {
  if (run.signal.aborted) throw new AiError({ kind: 'cancelled', provider: run.deps.preset.id, message: 'Stopped.', fatal: false, actions: [] });
  const request = buildRequest(chunk.map((c) => c.question), chunk.map((c) => c.key), run.deps.preset, run.signal);
  const result = await run.deps.client.complete(request);
  const split = async (): Promise<Map<string, Reviewed>> => {
    if (chunk.length === 1) return new Map([[chunk[0].question.questionId, { ok: false }]]);
    const mid = Math.ceil(chunk.length / 2);
    return new Map([...(await review(run, chunk.slice(0, mid))), ...(await review(run, chunk.slice(mid)))]);
  };
  if (result.finish === 'length' || result.finish === 'safety') return split();
  const raw = parseFindings(result.text);
  if (!raw) return retried ? split() : review(run, chunk, true);
  const findings = validateFindings(raw, chunk);
  return new Map(chunk.map(({ question }) => [
    question.questionId,
    { ok: true, findings: findings.filter((f) => f.questionId === question.questionId) },
  ]));
}

export async function runQuality(
  questions: QualityQuestion[],
  deps: QualityDeps,
  signal: AbortSignal,
  onProgress: (progress: QualityProgress) => void = () => {},
): Promise<QualityOutcome> {
  const sent: Keyed[] = questions.filter((q) => !questionEmpty(q)).map((question, i) => ({ question, key: questionKey(i) }));
  const reviewed = new Map<string, Reviewed>();
  const progress: QualityProgress = { done: 0, total: sent.length };
  onProgress({ ...progress });

  const queue = chunkQuestions(sent);
  const run: Run = { deps, signal };
  let fatal: AiErrorInfo | undefined;
  let stopped = false;
  const worker = async () => {
    while (queue.length && !fatal && !signal.aborted) {
      const chunk = queue.shift()!;
      try {
        for (const [id, result] of await review(run, chunk)) reviewed.set(id, result);
      } catch (error) {
        if (signal.aborted || (isAiError(error) && error.info.kind === 'cancelled')) {
          stopped = true;
          continue;
        }
        if (isAiError(error) && error.info.fatal) fatal ??= error.info;
        // Transport trouble after the client's retries: these questions fail, the run goes on.
        else for (const { question } of chunk) reviewed.set(question.questionId, { ok: false });
      }
      progress.done = reviewed.size;
      onProgress({ ...progress });
    }
  };
  const workers = Math.max(1, Math.min(deps.preset.concurrency, queue.length));
  await Promise.all(Array.from({ length: workers }, worker));

  const order = new Map(questions.map((q, i) => [q.questionId, i]));
  const anchorIndex = (f: QualityFinding) => {
    const q = questions[order.get(f.questionId)!];
    return f.anchor ? q.anchors.indexOf(f.anchor) : -1;
  };
  const findings = [
    ...questions.flatMap(deterministicFindings),
    ...[...reviewed.values()].flatMap((r) => (r.ok ? r.findings : [])),
  ].sort((a, b) =>
    order.get(a.questionId)! - order.get(b.questionId)! ||
    anchorIndex(a) - anchorIndex(b) ||
    (a.from === b.from ? 0 : a.from === 'check' ? -1 : 1),
  );
  const values = [...reviewed.values()];
  return {
    findings,
    total: sent.length,
    reviewed: values.filter((r) => r.ok).length,
    failed: values.filter((r) => !r.ok).length,
    stopped: stopped || signal.aborted,
    ...(fatal ? { fatal } : {}),
  };
}
