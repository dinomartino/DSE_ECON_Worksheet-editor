import { aiErrorInfo, mapThrown } from '@/ai/errors';
import type { CompletionRequest, CompletionResult } from '@/ai/types';
import { DATA_CHART_WIDTH_PX, DEFAULT_DIAGRAM_SIZE, newId } from '@/model/factories';
import { defaultDiagramAltText } from '@/model/diagramTemplates';
import { bi } from '@/model/text';
import type { DiagramBlock, LanguageMode } from '@/model/types';
import type { Side } from '@/model/textSlots';
import { diagramSize } from '@/render/diagram';
import { compileSpec, type Compiled } from './compile';
import { buildDiagramRequest, buildRepairRequest } from './prompt';
import { parseSpec } from './schema';
import { phrase } from './text';
import { checkLabels } from './labels';
import { solveKey } from './solve';
import type { DiagramGenDeps, DiagramGenInput, DiagramGenOutcome, DiagramIssue, DiagramSpec, SolvedKey } from './types';
import { checkDiagram, checkStem } from './validate';
import type { SceneBuilt } from './scene';
import { checkSceneKey, checkSceneWords } from './sceneCheck';

/**
 * Question + key (+ a reference figure) → an editable diagram. Pure over injected deps,
 * never rejects, honours the signal. At most two requests: when the first reply fails a
 * check, the model is shown what failed and asked once for the whole spec again; the
 * better of the two is kept.
 */

export interface Evaluated {
  spec: DiagramSpec;
  compiled: Compiled;
  issues: DiagramIssue[];
  /** The key as the drawing gives it (k-0534), when the spec asks something the solver reads. */
  solved: SolvedKey | null;
  /** An edit reply's note on the words (`questionChange`); '' otherwise. */
  questionChange: string;
}

const errors = (issues: readonly DiagramIssue[]) => issues.filter((i) => i.level === 'error').length;

/** A reply checked end to end; null when it is not a spec at all. Exported for the harness and tests. */
export function evaluateReply(reply: string, input: Pick<DiagramGenInput, 'sides' | 'key' | 'mcq' | 'edit'> & { question?: string }): Evaluated | null {
  const parsed = parseSpec(reply);
  if (!parsed) return null;
  const evaluated = { ...evaluateSpec(parsed.spec, input, parsed.issues), questionChange: questionChangeOf(reply) };
  return input.edit ? editOutcome(evaluated, input) : evaluated;
}

/**
 * An edit may move the answer ("move P1 up" can make a ceiling stop binding): that is the
 * teacher's change, not a fault to repair. When the drawing gives another option as the
 * answer, the words follow it: the key-against-geometry error becomes `questionChange`.
 */
function editOutcome(evaluated: Evaluated, input: Pick<DiagramGenInput, 'mcq'>): Evaluated {
  const solved = evaluated.solved;
  if (!solved || solved.option < 0 || !input.mcq || solved.option === input.mcq.answer) return evaluated;
  const letter = 'ABCD'[solved.option];
  const move = `With the edited diagram the answer is ${solved.labels.join(' to ')} (option ${letter}): ${solved.why}. Make option ${letter} the key and rewrite the explanation; keep the stem and the options.`;
  return {
    ...evaluated,
    issues: evaluated.issues.filter((i) => i.code !== 'key.geometry'),
    questionChange: [evaluated.questionChange, move].filter(Boolean).join(' '),
  };
}

/** A spec checked end to end: compiled, its drawing checked, the question's labels and words against it, the key worked out again. */
export function evaluateSpec(spec: DiagramSpec, input: Pick<DiagramGenInput, 'sides' | 'key' | 'mcq'> & { question?: string }, parseIssues: DiagramIssue[] = []): Evaluated {
  const compiled = compileSpec(spec);
  if (spec.kind === 'scene') return evaluateScene(spec, compiled as SceneBuilt, input, parseIssues);
  const issues = [...parseIssues, ...compiled.issues, ...checkDiagram(spec, compiled, input.sides, input.key)];
  let solved: SolvedKey | null = null;
  if (compiled.diagram && input.mcq && spec.placement === 'question') {
    issues.push(...checkLabels(input.mcq, compiled.diagram), ...checkStem(spec, compiled, [input.mcq.stem, ...input.mcq.statements].join('\n')));
    const solvedKey = solveKey(spec, compiled, input.mcq);
    solved = solvedKey.solved;
    issues.push(...solvedKey.issues);
  }
  if (spec.kind !== 'none' && !compiled.diagram && !errors(issues)) {
    issues.push({ level: 'error', code: 'diagram.empty', text: 'Nothing could be drawn from that diagram.' });
  }
  return { spec, compiled, issues, solved, questionChange: '' };
}

/**
 * A scene (k-0577): drawn by code, so no axis or shift checks; the question's labels must be on
 * it, its words must fit the scene, and the answer worked out from its letters or ticks must be
 * the keyed option.
 */
function evaluateScene(spec: DiagramSpec, compiled: SceneBuilt, input: Pick<DiagramGenInput, 'key' | 'mcq'> & { question?: string }, parseIssues: DiagramIssue[]): Evaluated {
  const issues = [...parseIssues, ...compiled.issues];
  const stem = input.mcq ? [input.mcq.stem, ...input.mcq.statements].join('\n') : (input.question ?? '');
  issues.push(...checkSceneWords(spec, stem, input.key));
  let solved: SolvedKey | null = null;
  if (compiled.diagram && input.mcq && spec.placement === 'question') {
    issues.push(...checkLabels(input.mcq, compiled.diagram, { order: false }));
    const key = checkSceneKey(spec, compiled, input.mcq);
    solved = key.solved;
    issues.push(...key.issues);
  }
  if (!compiled.diagram && !errors(issues)) issues.push({ level: 'error', code: 'diagram.empty', text: 'Nothing could be drawn from that diagram.' });
  return { spec, compiled, issues, solved, questionChange: '' };
}

/** An edit reply's `questionChange`, '' when absent. */
function questionChangeOf(reply: string): string {
  try {
    const raw = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)) as { questionChange?: unknown };
    return typeof raw.questionChange === 'string' ? raw.questionChange.trim().slice(0, 600) : '';
  } catch {
    return '';
  }
}

export function languageOf(sides: readonly Side[]): LanguageMode {
  if (sides.includes('en') && sides.includes('zh')) return 'bilingual';
  return sides.includes('zh') ? 'zh' : 'en';
}

/** The figure as a block, measured for the paper's language. */
export function blockOf(evaluated: Evaluated, sides: readonly Side[], widthPx?: number): DiagramBlock | null {
  const diagram = evaluated.compiled.diagram;
  if (!diagram) return null;
  const width = widthPx ?? (diagram.chart ? DATA_CHART_WIDTH_PX : DEFAULT_DIAGRAM_SIZE.widthPx);
  const { spec } = evaluated;
  const altText =
    phrase(spec.title) ?? (spec.kind === 'template' ? defaultDiagramAltText(spec.template) : diagram.chart ? bi('Chart', '圖表') : bi('Diagram', '圖示'));
  return {
    kind: 'diagram',
    id: newId(),
    diagram,
    ...diagramSize(diagram, width, languageOf(sides)),
    altText,
  };
}

export async function generateDiagram(input: DiagramGenInput, deps: DiagramGenDeps, signal: AbortSignal): Promise<DiagramGenOutcome> {
  const provider = deps.preset.id;
  const image = input.reference?.image;
  const withImages = image && deps.completeWithImages ? deps.completeWithImages : null;
  const send = (req: CompletionRequest): Promise<CompletionResult> => (withImages && image ? withImages(req, [image]) : deps.client.complete(req));

  const ask = async (req: CompletionRequest) => {
    try {
      const res = await send(req);
      if (res.finish === 'length') return { error: aiErrorInfo('truncated', provider) } as const;
      if (res.finish === 'safety') return { error: aiErrorInfo('safety', provider) } as const;
      return { text: res.text, model: res.model } as const;
    } catch (error) {
      return { error: mapThrown(provider, error, signal.aborted ? 'user' : null) } as const;
    }
  };

  const first = buildDiagramRequest(input, deps.preset, signal, Boolean(withImages));
  const reply = await ask(first);
  if ('error' in reply) return { ok: false, error: reply.error! };
  if (signal.aborted) return { ok: false, error: aiErrorInfo('cancelled', provider) };
  let model = reply.model;
  let best = evaluateReply(reply.text, input);
  let attempt: 1 | 2 = 1;

  const needsRepair = !best || errors(best.issues) > 0;
  if (needsRepair) {
    const issues = best?.issues ?? [{ level: 'error' as const, code: 'spec.json', text: 'The reply was not the JSON object asked for.' }];
    const second = await ask(buildRepairRequest(first, reply.text, issues));
    if (signal.aborted) return { ok: false, error: aiErrorInfo('cancelled', provider) };
    if (!('error' in second)) {
      const again = evaluateReply(second.text, input);
      if (again && (!best || errors(again.issues) < errors(best.issues))) {
        best = again;
        model = second.model;
        attempt = 2;
      }
    } else if (!best) {
      return { ok: false, error: second.error! };
    }
  }
  if (!best) return { ok: false, error: aiErrorInfo('badOutput', provider) };

  const imageSkipped = Boolean(image && !withImages);
  if (best.spec.kind === 'none') {
    return { ok: true, status: 'none', block: null, spec: best.spec, issues: best.issues, attempt, imageSkipped, model, questionChange: best.questionChange, solved: null };
  }
  const failed = errors(best.issues) > 0;
  const status = failed ? 'failed' : best.issues.length ? 'look' : 'ok';
  return {
    ok: true,
    status,
    block: failed ? null : blockOf(best, input.sides, input.widthPx),
    spec: best.spec,
    issues: best.issues,
    attempt,
    imageSkipped,
    model,
    questionChange: best.questionChange,
    solved: best.solved,
  };
}
