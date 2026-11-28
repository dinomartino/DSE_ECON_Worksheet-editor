import type { StudioDraft, StudioOutcome, StudioRequest } from '@/questionStudio/types';
import type { TraceInput } from './recorder';

/**
 * What a review record keeps of a request and of a draft (k-0598): the parts that explain a
 * reply, not the bulk. The reference questions go by label (their words are in the prompt the
 * call record keeps); a draft keeps its words, every check's verdict, the blind solve, its
 * attempt (2 = rewritten after a check failed) and its figure's spec and issues (the drawn
 * block is left out: the spec draws it again).
 */
export function requestNote(request: StudioRequest) {
  return {
    keyPoint: request.keyPoint,
    ...(request.alsoKeyPoints?.length ? { alsoKeyPoints: request.alsoKeyPoints } : {}),
    ...(request.points.length ? { points: request.points } : {}),
    examples: request.examples.map((e) => ({ label: e.label, id: e.id, ...(e.auto ? { auto: true } : {}), ...(e.hasFigure ? { hasFigure: true } : {}), ...(e.figures?.length ? { pictures: e.figures.length } : {}) })),
    strict: request.strict === true,
    count: request.count,
    level: request.level,
    shape: request.shape,
    sides: request.sides,
    note: request.note,
    ...(request.concept ? { concept: request.concept } : {}),
  };
}

const diagramNote = (d: NonNullable<StudioDraft['diagram']>) => ({
  status: d.status,
  placement: d.placement,
  issues: d.issues,
  ...(d.spec ? { spec: d.spec } : {}),
  ...(d.solved ? { solved: d.solved } : {}),
  ...(d.figureWords ? { figureWords: d.figureWords } : {}),
  ...(d.imageSkipped ? { imageSkipped: true } : {}),
  ...(d.error ? { error: { kind: d.error.kind, message: d.error.message } } : {}),
  ...(d.at ? { at: d.at } : {}),
});

export function draftNote(d: StudioDraft) {
  return {
    id: d.id,
    status: d.status,
    attempt: d.attempt,
    angle: d.angle,
    draft: d.draft,
    ...(d.changes?.length ? { changes: d.changes } : {}),
    checks: d.checks,
    ...(d.solve ? { solve: d.solve } : {}),
    ...(d.figure ? { figureAsk: d.figure } : {}),
    ...(d.figureSet ? { figureSet: d.figureSet } : {}),
    ...(d.diagram ? { diagram: diagramNote(d.diagram) } : {}),
    ...(d.diagramSet ? { diagramSet: { figures: d.diagramSet.figures.map(diagramNote), issues: d.diagramSet.issues, ...(d.diagramSet.solved ? { solved: d.diagramSet.solved } : {}) } } : {}),
  };
}

export function outcomeNote(kind: 'write' | 'refine', outcome: StudioOutcome): TraceInput {
  if (!outcome.ok) return { t: 'outcome', kind, ok: false, usage: outcome.usage, error: { kind: outcome.error.kind, message: outcome.error.message, ...(outcome.error.detail ? { detail: outcome.error.detail } : {}) } };
  return { t: 'outcome', kind, ok: true, model: outcome.model, usage: outcome.usage, notes: outcome.notes, drafts: outcome.drafts.map(draftNote) };
}
