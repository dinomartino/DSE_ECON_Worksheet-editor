import { aiErrorInfo, mapThrown } from '@/ai/errors';
import type { AiErrorInfo, CompletionRequest } from '@/ai/types';
import type { McqDraft } from '@/generate/types';
import { toRuns } from '@/generate/validate';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import { makeBrief, type Brief } from './brief';
import { lintBatch } from './lint';
import type { CorpusDoc } from './nearCopy';
import {
  buildSolveRequest,
  buildWriteRequest,
  emptyJob,
  type DraftText,
  type SolveItem,
  type WriteJob,
} from './prompt';
import { corpusDocOfDraft, corpusDocOfSource } from './source';
import type { CheckRow, Finding, Refinement, SolveResult, StudioDeps, StudioDraft, StudioOutcome, StudioRequest, Usage } from './types';
import { cleanMcq, localChecks, parseWriteReply, statusOf, type CheckContext } from './validate';

/**
 * One click → checked drafts, in at most five requests: write; one rewrite of drafts that
 * failed a hard local check; the blind solve of what is left; one rewrite of drafts the
 * solver disagreed with; its solve. Nothing is ever repaired by hand: a draft that still
 * fails is reported, never inserted. Pure over injected deps (like `src/generate/run.ts`):
 * never rejects, honours the signal, and never touches a paper.
 */

export type Stage = 'write' | 'rewrite' | 'solve';

export interface RunHooks {
  signal: AbortSignal;
  /** `done` of `total` requests; `total` grows when a rewrite is needed. */
  progress?: (done: number, total: number, stage: Stage) => void;
}

/** Changes the teacher asks of one draft, or drafts to differ from (the ones already on the sheet). */
export interface RunOptions {
  avoid?: readonly StudioDraft[];
  rewrite?: { how: 'harder' | 'easier' | 'change'; target: StudioDraft; note?: string };
}

export const emptyUsage = (): Usage => ({ requests: 0, input: 0, output: 0, thinking: 0, ms: 0 });

let counter = 0;
const newId = () => `d${(counter += 1)}`;

interface Slot {
  id: string;
  draft: McqDraft;
  angle: string;
  attempt: 1 | 2;
  checks: CheckRow[];
  solve?: SolveResult;
}

type Asked = { ok: true; text: string; model: string } | { ok: false; error: AiErrorInfo };

const LETTERS = 'ABCD';
const letter = (index: number) => LETTERS[index] ?? '?';

const textOf = (slot: Slot | StudioDraft): DraftText => {
  const d = 'draft' in slot ? slot.draft : slot;
  return { stem: d.stem, statements: d.statements, options: d.options, answer: d.answerIndex, explanation: d.explanation };
};

/** The way a hard finding reads to the model: an instruction, in English whatever the paper's language. */
function problemOf(findings: readonly Finding[]): string {
  const parts = findings.map((f) => {
    if (f.id === 'copy.close') {
      return f.params?.verbatim
        ? 'It repeats a long passage of an existing question word for word. Write it again with new wording, a new context and different numbers.'
        : `It is too close to an existing question (${f.params?.percent ?? '?'}% of its wording is shared). Write it again with new wording, a new context and different numbers.`;
    }
    if (f.id === 'shape.optionCount') return `It has ${f.params?.count} options; it needs exactly 4.`;
    if (f.id === 'shape.keyRange') return '"answer" must be 0, 1, 2 or 3.';
    if (f.id === 'shape.optionsSame') return 'Two options say the same thing.';
    if (f.id === 'shape.notCombination') return 'Its options do not combine its statements as "(1) and (2) only" does.';
    if (f.id === 'shape.statementCount') return 'A combination item has two to four statements.';
    return 'It does not meet the format.';
  });
  return [...new Set(parts)].join(' ');
}

export async function writeDrafts(
  request: StudioRequest,
  deps: StudioDeps,
  hooks: RunHooks,
  opts: RunOptions = {},
): Promise<StudioOutcome> {
  const usage = emptyUsage();
  const provider = deps.preset.id;
  const made = makeBrief(request, deps.random);
  if ('error' in made) return { ok: false, error: aiErrorInfo('badRequest', provider), usage };
  const brief: Brief = made;
  const { sides } = brief.request;
  const { signal } = hooks;
  let model = '';
  let total = 2;
  let done = 0;
  const step = (stage: Stage) => hooks.progress?.(done, total, stage);

  const ask = async (req: CompletionRequest): Promise<Asked> => {
    try {
      const res = await deps.client.complete(req);
      usage.requests += 1;
      usage.input += res.usage?.input ?? 0;
      usage.output += res.usage?.output ?? 0;
      usage.thinking += res.usage?.thinking ?? 0;
      usage.ms += res.ms;
      done += 1;
      if (res.finish === 'length') return { ok: false, error: aiErrorInfo('truncated', provider) };
      if (res.finish === 'safety') return { ok: false, error: aiErrorInfo('safety', provider) };
      return { ok: true, text: res.text, model: res.model };
    } catch (error) {
      return { ok: false, error: mapThrown(provider, error, signal.aborted ? 'user' : null) };
    }
  };

  // What a draft must not copy: the examples, and the drafts already on the sheet.
  const baseExtra: CorpusDoc[] = [
    ...brief.request.examples.map(corpusDocOfSource),
    ...(opts.avoid ?? []).map((d) => corpusDocOfDraft(d.id, d.draft)),
  ];
  const assess = (raw: McqDraft, angle: string, accepted: readonly CorpusDoc[], attempt: 1 | 2): Slot => {
    const draft = cleanMcq(raw, sides);
    const ctx: CheckContext = { sides, keyPoint: brief.keyPoint.code, asked: brief.request.shape, glossary: deps.glossary, corpus: deps.corpus, extra: [...baseExtra, ...accepted] };
    const id = newId();
    return { id, draft, angle, attempt, checks: localChecks(draft, ctx) };
  };
  const hardFailed = (slot: Slot) => slot.checks.some((c) => c.state === 'fail');
  const failingFindings = (slot: Slot) => slot.checks.filter((c) => c.state === 'fail').flatMap((c) => c.findings);
  const acceptedDocs = (slots: readonly Slot[]) => slots.filter((s) => !hardFailed(s)).map((s) => corpusDocOfDraft(s.id, s.draft));

  /** Assess a batch in order: each draft is compared with the ones before it. */
  const assessAll = (raws: ReadonlyArray<{ draft: McqDraft; angle: string }>, attempt: 1 | 2, before: readonly Slot[] = []): Slot[] => {
    const out: Slot[] = [];
    for (const raw of raws) out.push(assess(raw.draft, raw.angle, [...acceptedDocs(before), ...acceptedDocs(out)], attempt));
    return out;
  };

  const write = async (job: WriteJob, stage: Stage = 'write'): Promise<{ ok: true; drafts: Array<{ draft: McqDraft; angle: string }> } | { ok: false; error: AiErrorInfo }> => {
    step(stage);
    const got = await ask(buildWriteRequest(brief, job, deps.glossary, deps.preset, signal));
    if (!got.ok) return got;
    if (!model) model = got.model;
    const parsed = parseWriteReply(got.text);
    if (!parsed) return { ok: false, error: aiErrorInfo('badOutput', provider) };
    return { ok: true, drafts: parsed };
  };

  // 1. Write.
  const job: WriteJob = {
    ...emptyJob(brief),
    avoid: (opts.avoid ?? []).map(textOf),
    ...(opts.rewrite ? { rewrite: { how: opts.rewrite.how, draft: textOf(opts.rewrite.target), ...(opts.rewrite.note ? { note: opts.rewrite.note } : {}) } } : {}),
  };
  const first = await write(job);
  if (!first.ok) return { ok: false, error: first.error, usage };
  const wanted = opts.rewrite ? 1 : brief.request.count;
  const slots = assessAll(first.drafts.slice(0, wanted), 1);

  const notes: Finding[] = [];
  const finish = (): StudioOutcome => {
    const drafts: StudioDraft[] = slots.map((s) => ({ id: s.id, draft: s.draft, angle: s.angle, attempt: s.attempt, checks: s.checks, ...(s.solve ? { solve: s.solve } : {}), status: statusOf(s.checks) }));
    const kept = drafts.filter((d) => d.status !== 'failed');
    if (kept.length < wanted) notes.push({ id: 'run.fewer', params: { asked: wanted, got: kept.length } });
    notes.push(...lintBatch(kept.map((d) => d.draft.answerIndex)));
    return { ok: true, drafts, notes, model, usage };
  };
  const stopped = () => {
    notes.push({ id: 'run.stopped' });
    return finish();
  };
  if (signal.aborted) return stopped();

  // 2. One rewrite of drafts that failed a hard local check (a copy, a broken shape).
  const failedAt = slots.flatMap((s, i) => (hardFailed(s) ? [i] : []));
  if (failedAt.length && !opts.rewrite) {
    total += 1;
    const redo = failedAt.map((i) => ({ problem: problemOf(failingFindings(slots[i])), draft: textOf(slots[i]) }));
    const again = await write({ ...job, count: redo.length, keys: failedAt.map((i) => brief.keys[i] ?? 0), redo }, 'rewrite');
    if (again.ok) {
      failedAt.forEach((at, k) => {
        const replacement = again.drafts[k];
        if (!replacement) return;
        const next = assess(replacement.draft, replacement.angle, acceptedDocs(slots.filter((_, j) => j !== at)), 2);
        // The new draft stands even when it fails too: its own findings are the latest.
        slots[at] = next;
      });
    }
    if (signal.aborted) return stopped();
  }

  // 3. The blind solve of every draft still standing.
  const solveSide: Side = sides.includes('en') ? 'en' : 'zh';
  const solveOf = async (which: readonly Slot[]): Promise<Map<string, SolveResult> | AiErrorInfo> => {
    step('solve');
    const items: SolveItem[] = which.map((s) => ({
      id: s.id,
      stem: s.draft.stem[solveSide] || s.draft.stem[solveSide === 'en' ? 'zh' : 'en'],
      statements: s.draft.statements.map((t) => t[solveSide] || t[solveSide === 'en' ? 'zh' : 'en']),
      options: s.draft.options.map((t) => t[solveSide] || t[solveSide === 'en' ? 'zh' : 'en']),
    }));
    const got = await ask(buildSolveRequest(items, solveSide, deps.preset, signal));
    if (!got.ok) return got.error;
    return parseSolveReply(got.text) ?? aiErrorInfo('badOutput', provider);
  };
  const applySolve = (slot: Slot, result: SolveResult | undefined) => {
    const key = slot.checks.find((c) => c.id === 'key');
    if (!key) return;
    if (!result) {
      key.state = 'skipped';
      key.findings = [];
      delete slot.solve;
      return;
    }
    slot.solve = result;
    const findings: Finding[] = [];
    if (result.answer !== slot.draft.answerIndex) findings.push({ id: 'key.differs', params: { solver: letter(result.answer), key: letter(slot.draft.answerIndex) } });
    else if (result.ambiguous) findings.push({ id: 'key.ambiguous' });
    key.findings = findings;
    key.state = findings.length ? 'look' : 'pass';
  };

  const standing = slots.filter((s) => !hardFailed(s));
  if (standing.length) {
    const solved = await solveOf(standing);
    if (solved instanceof Map) standing.forEach((s) => applySolve(s, solved.get(s.id)));
    else if (!signal.aborted) notes.push({ id: 'run.keyNotChecked', params: { message: solved.message } });
    if (signal.aborted) return stopped();

    // 4. One rewrite of drafts whose key the solver disagreed with, and its solve.
    const differing = solved instanceof Map ? standing.filter((s) => s.solve && s.solve.answer !== s.draft.answerIndex) : [];
    if (differing.length && !opts.rewrite) {
      total += 2;
      const redo = differing.map((s) => ({
        problem: `A student solving it from the text alone chose option ${letter(s.solve!.answer)}, but you marked option ${letter(s.draft.answerIndex)}. Their working: ${plain(toRuns(s.solve!.working)).slice(0, 300)} Make exactly one option correct and the others clearly wrong.`,
        draft: textOf(s),
      }));
      const again = await write({ ...job, count: redo.length, keys: differing.map((s) => brief.keys[slots.indexOf(s)] ?? 0), redo }, 'rewrite');
      if (again.ok) {
        const replaced: Array<{ at: number; slot: Slot }> = [];
        differing.forEach((s, k) => {
          const replacement = again.drafts[k];
          if (!replacement) return;
          const at = slots.indexOf(s);
          const next = assess(replacement.draft, replacement.angle, acceptedDocs(slots.filter((_, j) => j !== at)), 2);
          // A replacement stands only if it passes the hard checks; else the original stays, flagged.
          if (!hardFailed(next)) replaced.push({ at, slot: next });
        });
        if (replaced.length && !signal.aborted) {
          const solvedAgain = await solveOf(replaced.map((r) => r.slot));
          for (const { at, slot } of replaced) {
            if (solvedAgain instanceof Map) applySolve(slot, solvedAgain.get(slot.id));
            slots[at] = slot;
          }
        } else {
          for (const { at, slot } of replaced) slots[at] = slot;
        }
      }
      if (signal.aborted) return stopped();
    }
  }
  return finish();
}

/** The solver's replies by draft id; an entry with no usable answer is left out. */
export function parseSolveReply(text: string): Map<string, SolveResult> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: { answers?: unknown };
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as { answers?: unknown };
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.answers)) return null;
  const out = new Map<string, SolveResult>();
  for (const entry of parsed.answers) {
    const e = (entry ?? {}) as { id?: unknown; answer?: unknown; working?: unknown; ambiguous?: unknown };
    if (typeof e.id !== 'string' || typeof e.answer !== 'number' || !Number.isInteger(e.answer) || e.answer < 0 || e.answer > 3) continue;
    out.set(e.id, { answer: e.answer, working: typeof e.working === 'string' ? e.working.trim().slice(0, 1500) : '', ambiguous: e.ambiguous === true });
  }
  return out;
}

/**
 * A change to one draft: Harder, Easier, or the Change line rewrite it in place (the same
 * checks run on the new one); Another writes one more beside the drafts already there.
 * The outcome's `drafts` holds the one new draft.
 */
export function refine(
  request: StudioRequest,
  target: StudioDraft,
  refinement: Refinement,
  others: readonly StudioDraft[],
  deps: StudioDeps,
  hooks: RunHooks,
): Promise<StudioOutcome> {
  if (refinement.kind === 'another') {
    return writeDrafts({ ...request, count: 1 }, deps, hooks, { avoid: [target, ...others] });
  }
  const how = refinement.kind === 'change' ? 'change' : refinement.kind;
  return writeDrafts(
    { ...request, count: 1, level: refinement.kind === 'harder' ? 'harder' : refinement.kind === 'easier' ? 'easier' : request.level },
    deps,
    hooks,
    { avoid: others, rewrite: { how, target, ...(refinement.kind === 'change' ? { note: refinement.text.trim().slice(0, 400) } : {}) } },
  );
}
