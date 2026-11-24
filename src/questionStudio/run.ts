import { aiErrorInfo, mapThrown } from '@/ai/errors';
import { supportsImages, supportsStreaming } from '@/ai/providers';
import type { AiErrorInfo, AiClient, CompletionRequest, CompletionResult } from '@/ai/types';
import type { McqDraft } from '@/generate/types';
import { toRuns } from '@/generate/validate';
import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import { makeBrief, referenceMode, type Brief } from './brief';
import { partialDrafts } from './partial';
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
import { corpusDocOfDraft, corpusDocOfSource, referenceFor } from './source';
import type { DiagramGenInput, DiagramSpec, SolvedKey } from '@/diagramGen/types';
import { figureWords } from '@/diagramGen/words';
import type { CheckRow, DraftChange, DraftDiagram, Finding, Refinement, Stage, StudioEvent, SolveResult, StudioDeps, StudioDraft, StudioOutcome, StudioRequest, Usage } from './types';
import { cleanMcq, localChecks, parseWriteReply, statusOf, type CheckContext, type RawDraft } from './validate';

/**
 * One click → checked drafts, in at most five requests: write; one rewrite of drafts that
 * failed a hard local check; the blind solve of what is left; one rewrite of drafts the
 * solver disagreed with; its solve. Nothing is ever repaired by hand: a draft that still
 * fails is reported, never inserted. Pure over injected deps (like `src/generate/run.ts`):
 * never rejects, honours the signal, and never touches a paper.
 */

export type { Stage } from './types';

export interface RunHooks {
  signal: AbortSignal;
  /** `done` of `total` requests; `total` grows when a rewrite is needed. */
  progress?: (done: number, total: number, stage: Stage) => void;
  /** What the run shows as it works (streamed words, checked drafts, figures; `StudioEvent`). Absent = none, and no stream is asked for. */
  onEvent?: (event: StudioEvent) => void;
}

/** Changes the teacher asks of one draft, or drafts to differ from (the ones already on the sheet). */
export interface RunOptions {
  avoid?: readonly StudioDraft[];
  rewrite?: { how: 'harder' | 'easier' | 'change'; target: StudioDraft; note?: string };
  /**
   * The figure to start from (k-0534): `keep` = the spec a follow-up already edited, used as
   * it is when the new words fit it (no request); `base` = the replaced draft's figure, a
   * starting point the diagram maker may change.
   */
  figure?: { spec: DiagramSpec; mode: 'keep' | 'base' };
}

export const emptyUsage = (): Usage => ({ requests: 0, input: 0, output: 0, thinking: 0, ms: 0 });

let counter = 0;
const newId = () => `d${(counter += 1)}`;

interface Slot {
  id: string;
  draft: McqDraft;
  angle: string;
  changes: DraftChange[];
  attempt: 1 | 2;
  checks: CheckRow[];
  solve?: SolveResult;
  diagram?: DraftDiagram;
  /** The writer's note to the diagram maker; '' = no figure; undefined = an older reply that did not say. */
  figure?: string;
}

type Asked = { ok: true; text: string; model: string } | { ok: false; error: AiErrorInfo };

const LETTERS = 'ABCD';
const letter = (index: number) => LETTERS[index] ?? '?';

const textOf = (slot: Slot | StudioDraft): DraftText => {
  const d = 'draft' in slot ? slot.draft : slot;
  const figure = slot.figure;
  return { stem: d.stem, statements: d.statements, options: d.options, answer: d.answerIndex, explanation: d.explanation, ...(figure ? { figure } : {}) };
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
    if (f.id === 'shape.narrates')
      return `Its stem describes the diagram in words ("${f.params?.words ?? ''}"). An HKDSE stem only refers to the diagram ("Refer to the following diagram.") and states the situation; put what to draw in "figure" and keep the same options and key.`;
    if (f.id === 'shape.figureFailed') return 'Its diagram could not be drawn to match it. Keep the question, and write "figure" again so it says exactly which point each label marks and which label is the key.';
    return 'It does not meet the format.';
  });
  return [...new Set(parts)].join(' ');
}

/** A client that adds every reply's tokens to `usage` (the diagram requests count like the rest). */
function countingClient(client: AiClient, usage: Usage): AiClient {
  return {
    listModels: (s) => client.listModels(s),
    complete: async (req) => {
      const res = await client.complete(req);
      usage.requests += 1;
      usage.input += res.usage?.input ?? 0;
      usage.output += res.usage?.output ?? 0;
      usage.thinking += res.usage?.thinking ?? 0;
      usage.ms += res.ms;
      return res;
    },
  };
}

/** What the diagram maker reads of a draft: the question in one language (labels are the same in both), its key, the writer's note. */
function diagramInput(d: McqDraft, sides: readonly Side[], figure?: string): DiagramGenInput {
  const side: Side = sides.includes('en') ? 'en' : 'zh';
  const pick = (t: { en: string; zh: string }) => t[side] || t[side === 'en' ? 'zh' : 'en'];
  const question = [pick(d.stem), ...d.statements.map((t, i) => `(${i + 1}) ${pick(t)}`), ...d.options.map((t, i) => `${letter(i)}. ${pick(t)}`)].filter(Boolean).join('\n');
  const key = `Correct answer: ${letter(d.answerIndex)}. ${pick(d.options[d.answerIndex] ?? { en: '', zh: '' })}\n${pick(d.explanation)}`.trim();
  return {
    question,
    key,
    sides,
    ...(figure ? { figure } : {}),
    mcq: { stem: pick(d.stem), statements: d.statements.map(pick), options: d.options.map(pick), answer: d.answerIndex },
  };
}

/** A diagram outcome as the draft keeps it: the block, the spec a follow-up edits, and the figure in words for the blind solve. */
function figureOf(out: { status: DraftDiagram['status']; block: DraftDiagram['block']; spec: DiagramSpec; issues: DraftDiagram['issues']; solved: SolvedKey | null; imageSkipped?: boolean }): DraftDiagram {
  return {
    status: out.status,
    block: out.block,
    placement: out.block ? out.spec.placement : null,
    issues: out.issues,
    spec: out.spec,
    ...(out.block ? { figureWords: figureWords(out.spec, out.block.diagram) } : {}),
    ...(out.solved ? { solved: out.solved } : {}),
    ...(out.imageSkipped ? { imageSkipped: true } : {}),
  };
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
  const step = (stage: Stage) => {
    hooks.progress?.(done, total, stage);
    emit({ type: 'stage', stage });
  };

  const account = (res: CompletionResult): Asked => {
    usage.requests += 1;
    usage.input += res.usage?.input ?? 0;
    usage.output += res.usage?.output ?? 0;
    usage.thinking += res.usage?.thinking ?? 0;
    usage.ms += res.ms;
    done += 1;
    if (typeof res.text !== 'string') return { ok: false, error: aiErrorInfo('badOutput', provider) };
    if (res.finish === 'length') return { ok: false, error: aiErrorInfo('truncated', provider) };
    if (res.finish === 'safety') return { ok: false, error: aiErrorInfo('safety', provider) };
    return { ok: true, text: res.text, model: res.model };
  };

  const ask = async (req: CompletionRequest): Promise<Asked> => {
    try {
      return account(await deps.client.complete(req));
    } catch (error) {
      return { ok: false, error: mapThrown(provider, error, signal.aborted ? 'user' : null) };
    }
  };

  /** Streams only when someone listens, the provider streams and the client can; any stream trouble that is not fatal falls back to the whole reply. */
  const canStream = Boolean(hooks.onEvent && deps.client.stream && supportsStreaming(deps.preset));
  const askStreamed = async (req: CompletionRequest, onText: (reply: string) => void): Promise<Asked> => {
    try {
      return account(await deps.client.stream!(req, onText));
    } catch (error) {
      const info = mapThrown(provider, error, signal.aborted ? 'user' : null);
      if (info.fatal || signal.aborted || info.kind === 'cancelled') return { ok: false, error: info };
      return ask(req);
    }
  };

  const emit = (event: StudioEvent) => {
    try {
      hooks.onEvent?.(event);
    } catch {
      // A listener that throws must not take the run down.
    }
  };
  const draftOf = (s: Slot): StudioDraft => ({ id: s.id, draft: s.draft, angle: s.angle, changes: s.changes, attempt: s.attempt, checks: s.checks, ...(s.solve ? { solve: s.solve } : {}), ...(s.diagram ? { diagram: s.diagram } : {}), ...(s.figure ? { figure: s.figure } : {}), status: statusOf(s.checks) });
  const emitDrafts = (all: readonly Slot[]) => all.forEach((s, index) => emit({ type: 'draft', index, draft: draftOf(s) }));

  // What a draft must not copy: the examples, and the drafts already on the sheet.
  // Close to each picked example on purpose (strict mode): those are left out of the limit, not compared with.
  const exempt: CorpusDoc[] = referenceMode(brief.request) === 'pattern' ? brief.request.examples.map(corpusDocOfSource) : [];
  const baseExtra: CorpusDoc[] = [
    ...(exempt.length ? [] : brief.request.examples.map(corpusDocOfSource)),
    ...(opts.avoid ?? []).map((d) => corpusDocOfDraft(d.id, d.draft)),
  ];
  /** Whether a draft gets a diagram request: diagrams on, and the writer asked for one (an older reply that did not say: always, as before k-0534). */
  const wantsFigure = (slot: Slot) => Boolean(deps.diagrams) && (slot.figure === undefined || slot.figure.length > 0);
  const assess = (raw: RawDraft, accepted: readonly CorpusDoc[], attempt: 1 | 2): Slot => {
    const draft = cleanMcq(raw.draft, sides);
    const figure = deps.diagrams ? raw.figure : undefined;
    const ctx: CheckContext = { sides, keyPoint: brief.keyPoint.code, asked: brief.request.shape, glossary: deps.glossary, corpus: deps.corpus, extra: [...baseExtra, ...accepted], exempt, figure: Boolean(figure) };
    const id = newId();
    return { id, draft, angle: raw.angle, changes: raw.changes, attempt, checks: localChecks(draft, ctx), ...(figure !== undefined ? { figure } : {}) };
  };
  const hardFailed = (slot: Slot) => slot.checks.some((c) => c.state === 'fail');
  const failingFindings = (slot: Slot) => slot.checks.filter((c) => c.state === 'fail').flatMap((c) => c.findings);
  const acceptedDocs = (slots: readonly Slot[]) => slots.filter((s) => !hardFailed(s)).map((s) => corpusDocOfDraft(s.id, s.draft));

  /** Assess a batch in order: each draft is compared with the ones before it. */
  const assessAll = (raws: readonly RawDraft[], attempt: 1 | 2, before: readonly Slot[] = []): Slot[] => {
    const out: Slot[] = [];
    for (const raw of raws) out.push(assess(raw, [...acceptedDocs(before), ...acceptedDocs(out)], attempt));
    return out;
  };

  const write = async (job: WriteJob, stage: Stage = 'write', slotOf: (k: number) => number = (k) => k): Promise<{ ok: true; drafts: RawDraft[] } | { ok: false; error: AiErrorInfo }> => {
    step(stage);
    const attempt: 1 | 2 = stage === 'write' ? 1 : 2;
    const request = buildWriteRequest(brief, job, deps.glossary, deps.preset, signal);
    emit({ type: 'write', mode: canStream ? 'streamed' : 'whole', attempt });
    // Words go out as they arrive: only a draft whose text changed since the last event.
    const sent = new Map<number, string>();
    const show = (text: string, finished: boolean) => {
      for (const partial of partialDrafts(text, finished)) {
        const key = JSON.stringify([partial.stem, partial.statements, partial.options, partial.answer, partial.explanation, partial.angle, partial.complete]);
        if (sent.get(partial.index) === key) continue;
        sent.set(partial.index, key);
        emit({ type: 'text', index: slotOf(partial.index), draft: { ...partial, index: slotOf(partial.index) }, attempt });
      }
    };
    const got = canStream ? await askStreamed(request, (reply) => show(reply, false)) : await ask(request);
    if (!got.ok) return got;
    if (!model) model = got.model;
    show(got.text, true);
    const parsed = parseWriteReply(got.text);
    if (!parsed) return { ok: false, error: aiErrorInfo('badOutput', provider) };
    return { ok: true, drafts: parsed };
  };

  /** The figure for one draft: its words, its key, the writer's note and the reference's figure. Never throws; a failed request is a `failed` figure. */
  const diagramFor = async (slot: Slot, index: number): Promise<DraftDiagram> => {
    const { generateDiagram, evaluateSpec, blockOf } = await import('@/diagramGen');
    const input = diagramInput(slot.draft, sides, slot.figure);
    // A follow-up's edited figure stands as it is when the new words fit it: no request.
    if (opts.figure?.mode === 'keep') {
      const kept = evaluateSpec(opts.figure.spec, input);
      if (!kept.issues.some((i) => i.level === 'error')) {
        return figureOf({ status: kept.issues.length ? 'look' : 'ok', block: blockOf(kept, sides), spec: kept.spec, issues: kept.issues, solved: kept.solved });
      }
    }
    const vision = supportsImages(deps.preset);
    try {
      const out = await generateDiagram(
        { ...input, reference: referenceFor(brief.request.examples, index, vision), ...(opts.figure ? { base: opts.figure.spec } : {}) },
        { client: countingClient(deps.client, usage), preset: deps.preset, ...(vision ? { completeWithImages: (req, images) => countingClient(deps.client, usage).complete({ ...req, images }) } : {}) },
        signal,
      );
      if (!out.ok) return { status: 'failed', block: null, placement: null, issues: [], error: out.error };
      return figureOf(out);
    } catch {
      return { status: 'failed', block: null, placement: null, issues: [], error: aiErrorInfo('badOutput', provider) };
    }
  };

  /** Figures for these drafts, one request each, in order, each shown as it lands. A draft whose writer asked for a figure and got none is warned. */
  const drawFigures = async (which: ReadonlyArray<{ slot: Slot; index: number }>): Promise<boolean> => {
    const needing = which.filter(({ slot }) => wantsFigure(slot));
    if (!needing.length) return true;
    total += needing.length;
    step('diagram');
    for (const { slot, index } of needing) {
      if (signal.aborted) return false;
      emit({ type: 'diagram', index, state: 'working' });
      slot.diagram = await diagramFor(slot, index);
      if (slot.figure && !slot.diagram.block) {
        const shape = slot.checks.find((c) => c.id === 'shape');
        if (shape && !shape.findings.some((f) => f.id === 'shape.figureFailed')) {
          shape.findings = [...shape.findings, { id: 'shape.figureFailed' }];
          shape.state = 'fail';
        }
      }
      done += 1;
      hooks.progress?.(done, total, 'diagram');
      emit({ type: 'draft', index, draft: draftOf(slot) });
      emit({ type: 'diagram', index, state: 'done' });
    }
    return true;
  };

  // 1. Write.
  const job: WriteJob = {
    ...emptyJob(brief),
    ...(deps.diagrams ? { figures: true } : {}),
    avoid: (opts.avoid ?? []).map(textOf),
    ...(opts.rewrite ? { rewrite: { how: opts.rewrite.how, draft: textOf(opts.rewrite.target), ...(opts.rewrite.note ? { note: opts.rewrite.note } : {}) } } : {}),
  };
  const first = await write(job);
  if (!first.ok) return { ok: false, error: first.error, usage };
  const wanted = opts.rewrite ? 1 : brief.request.count;
  const slots = assessAll(first.drafts.slice(0, wanted), 1);
  emitDrafts(slots);

  const notes: Finding[] = [];
  const finish = (): StudioOutcome => {
    const drafts: StudioDraft[] = slots.map(draftOf);
    // Every draft is shown, a warned one too (k-0531): fewer only when the model wrote fewer.
    if (drafts.length < wanted) notes.push({ id: 'run.fewer', params: { asked: wanted, got: drafts.length } });
    notes.push(...lintBatch(drafts.map((d) => d.draft.answerIndex)));
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
    const again = await write({ ...job, count: redo.length, keys: failedAt.map((i) => brief.keys[i] ?? 0), redo }, 'rewrite', (k) => failedAt[k] ?? k);
    if (again.ok) {
      failedAt.forEach((at, k) => {
        const replacement = again.drafts[k];
        if (!replacement) return;
        const next = assess(replacement, acceptedDocs(slots.filter((_, j) => j !== at)), 2);
        // The new draft stands even when it fails too: its own findings are the latest.
        slots[at] = next;
      });
      emitDrafts(slots);
    }
    if (signal.aborted) return stopped();
  }

  // 3. A figure for each draft that asks for one (k-0534: before the solve, which reads it; no request for a draft without one).
  if (!(await drawFigures(slots.map((slot, index) => ({ slot, index }))))) return stopped();

  // 4. The blind solve of every draft (a warned one too: the teacher may still use it, k-0531).
  const solveSide: Side = sides.includes('en') ? 'en' : 'zh';
  const solveOf = async (which: readonly Slot[]): Promise<Map<string, SolveResult> | AiErrorInfo> => {
    step('solve');
    const items: SolveItem[] = which.map((s) => ({
      id: s.id,
      stem: s.draft.stem[solveSide] || s.draft.stem[solveSide === 'en' ? 'zh' : 'en'],
      statements: s.draft.statements.map((t) => t[solveSide] || t[solveSide === 'en' ? 'zh' : 'en']),
      options: s.draft.options.map((t) => t[solveSide] || t[solveSide === 'en' ? 'zh' : 'en']),
      ...(s.diagram?.figureWords ? { figure: s.diagram.figureWords } : {}),
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

  const standing = [...slots];
  if (standing.length) {
    const solved = await solveOf(standing);
    if (solved instanceof Map) standing.forEach((s) => applySolve(s, solved.get(s.id)));
    else if (!signal.aborted) notes.push({ id: 'run.keyNotChecked', params: { message: solved.message } });
    emitDrafts(slots);
    if (signal.aborted) return stopped();

    // 5. One rewrite of drafts whose key the solver disagreed with, their figures, and their solve.
    const differing = solved instanceof Map ? standing.filter((s) => s.solve && s.solve.answer !== s.draft.answerIndex) : [];
    if (differing.length && !opts.rewrite) {
      total += 2;
      const redo = differing.map((s) => ({
        problem: `A student solving it from the text alone chose option ${letter(s.solve!.answer)}, but you marked option ${letter(s.draft.answerIndex)}. Their working: ${plain(toRuns(s.solve!.working)).slice(0, 300)} Make exactly one option correct and the others clearly wrong.`,
        draft: textOf(s),
      }));
      const again = await write({ ...job, count: redo.length, keys: differing.map((s) => brief.keys[slots.indexOf(s)] ?? 0), redo }, 'rewrite', (k) => (differing[k] ? slots.indexOf(differing[k]) : k));
      if (again.ok) {
        const replaced: Array<{ at: number; slot: Slot }> = [];
        differing.forEach((s, k) => {
          const replacement = again.drafts[k];
          if (!replacement) return;
          const at = slots.indexOf(s);
          const next = assess(replacement, acceptedDocs(slots.filter((_, j) => j !== at)), 2);
          // A replacement stands only if it passes the hard checks; else the original stays, flagged.
          if (!hardFailed(next)) replaced.push({ at, slot: next });
        });
        if (replaced.length && !signal.aborted) {
          if (!(await drawFigures(replaced.map(({ at, slot }) => ({ slot, index: at }))))) return stopped();
          const solvedAgain = await solveOf(replaced.map((r) => r.slot));
          for (const { at, slot } of replaced) {
            if (solvedAgain instanceof Map) applySolve(slot, solvedAgain.get(slot.id));
            slots[at] = slot;
          }
        } else {
          for (const { at, slot } of replaced) slots[at] = slot;
        }
        emitDrafts(slots);
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
  // A draft with a figure keeps it as the starting point: its spec, not a new drawing (k-0534).
  const spec = deps.diagrams ? target.diagram?.spec : undefined;
  // What the words touch (k-0535's `parts`): absent = unknown. A change that touches the
  // diagram, or may, edits its spec; one that touches only the words keeps the figure when the
  // new words still fit it.
  const parts = refinement.kind === 'change' ? (refinement as { parts?: readonly string[] }).parts : undefined;
  // A figure the teacher redrew by hand (k-0530) is not its spec any more: a change of the words
  // only keeps that drawing as it is, and asks for no new one. (A change of the diagram itself
  // starts from the spec; the hand-drawn version stays in the draft's version list.)
  const handDrawn = target.diagram?.edited && target.diagram.block ? target.diagram : undefined;
  if (handDrawn && refinement.kind === 'change' && parts && !parts.includes('diagram')) {
    return writeDrafts({ ...request, count: 1 }, { ...deps, diagrams: false }, hooks, { avoid: others, rewrite: { how: 'change', target, note: refinement.text.trim().slice(0, 400) } }).then((out) =>
      out.ok ? { ...out, drafts: out.drafts.map((d) => ({ ...d, diagram: handDrawn })) } : out,
    );
  }
  if (refinement.kind === 'change' && spec && (!parts || parts.includes('diagram'))) return changeWithFigure(request, target, refinement.text, spec, others, deps, hooks);
  const figure = spec ? { figure: { spec, mode: refinement.kind === 'change' ? ('keep' as const) : ('base' as const) } } : {};
  if (refinement.kind === 'another') {
    return writeDrafts({ ...request, count: 1 }, deps, hooks, { avoid: [target, ...others], ...figure });
  }
  const how = refinement.kind === 'change' ? 'change' : refinement.kind;
  return writeDrafts(
    { ...request, count: 1, level: refinement.kind === 'harder' ? 'harder' : refinement.kind === 'easier' ? 'easier' : request.level },
    deps,
    hooks,
    { avoid: others, rewrite: { how, target, ...(refinement.kind === 'change' ? { note: refinement.text.trim().slice(0, 400) } : {}) }, ...figure },
  );
}

/**
 * A change in words to a draft with a figure (k-0534): "label Q1 and Q3", "move P1 up",
 * "make it a floor". One request edits the figure's spec and says whether the question's
 * words must change. When they need not, the draft's words stay exactly as they were and only
 * the figure is replaced (no text is rewritten to describe the figure). When they must (a
 * new policy, or the edit moved the answer), the writer rewrites the draft with that note and
 * the edited figure is kept if it fits the new words. The same checks run either way.
 */
async function changeWithFigure(
  request: StudioRequest,
  target: StudioDraft,
  note: string,
  spec: DiagramSpec,
  others: readonly StudioDraft[],
  deps: StudioDeps,
  hooks: RunHooks,
): Promise<StudioOutcome> {
  const usage = emptyUsage();
  const emit = (event: StudioEvent) => {
    try {
      hooks.onEvent?.(event);
    } catch {
      // A listener that throws must not take the run down.
    }
  };
  const sides = request.sides;
  const { generateDiagram } = await import('@/diagramGen');
  emit({ type: 'stage', stage: 'diagram' });
  hooks.progress?.(0, 1, 'diagram');
  emit({ type: 'diagram', index: 0, state: 'working' });
  const input = diagramInput(target.draft, sides, target.figure);
  const out = await generateDiagram(
    { ...input, edit: { spec, note: note.trim().slice(0, 400) } },
    { client: countingClient(deps.client, usage), preset: deps.preset },
    hooks.signal,
  );
  if (!out.ok) return { ok: false, error: out.error, usage };
  const edited = figureOf(out);
  if (out.questionChange) {
    // The words must change too: the writer rewrites them; the edited figure is the one to keep.
    const rewritten = await writeDrafts({ ...request, count: 1 }, deps, hooks, {
      avoid: others,
      rewrite: { how: 'change', target, note: `${note.trim()}\n${out.questionChange}`.slice(0, 900) },
      figure: { spec: out.spec, mode: 'keep' },
    });
    if (rewritten.ok) {
      rewritten.usage.requests += usage.requests;
      rewritten.usage.input += usage.input;
      rewritten.usage.output += usage.output;
      rewritten.usage.thinking += usage.thinking;
      rewritten.usage.ms += usage.ms;
    }
    return rewritten;
  }
  // Only the figure changed: the same words, checks and solve; a new figure.
  // An edit that could not be drawn leaves the figure as it was, with what went wrong to read.
  const checks = target.checks.map((row) => ({ ...row, findings: [...row.findings] }));
  const shape = checks.find((c) => c.id === 'shape');
  if (shape && edited.block && shape.findings.some((f) => f.id === 'shape.figureFailed')) {
    shape.findings = shape.findings.filter((f) => f.id !== 'shape.figureFailed');
    if (!shape.findings.length) shape.state = 'pass';
  }
  const draft: StudioDraft = {
    ...target,
    id: newId(),
    checks,
    diagram: edited.block || !target.diagram ? edited : { ...target.diagram, status: 'look', issues: edited.issues },
    status: statusOf(checks),
  };
  emit({ type: 'draft', index: 0, draft });
  emit({ type: 'diagram', index: 0, state: 'done' });
  hooks.progress?.(1, 1, 'diagram');
  return { ok: true, drafts: [draft], notes: [], model: out.model, usage };
}
