import { aiErrorInfo, mapThrown } from '@/ai/errors';
import type { CompletionRequest, CompletionResult } from '@/ai/types';
import { DATA_CHART_WIDTH_PX, DEFAULT_DIAGRAM_SIZE, newId } from '@/model/factories';
import { defaultDiagramAltText } from '@/model/diagramTemplates';
import { bi } from '@/model/text';
import type { DiagramBlock, LanguageMode } from '@/model/types';
import type { Diagram } from '@/model/diagram';
import type { Side } from '@/model/textSlots';
import { diagramSize } from '@/render/diagram';
import { compileSpec, tickKey, type Compiled } from './compile';
import { buildDiagramRequest, buildRepairRequest } from './prompt';
import { parseSpec } from './schema';
import { phrase, plainOf } from './text';
import { checkLabels, labelsIn } from './labels';
import { solveKey } from './solve';
import type { DiagramGenDeps, DiagramGenInput, DiagramGenOutcome, DiagramIssue, DiagramSpec, SolvedKey } from './types';
import { checkDiagram, checkStem } from './validate';
import { checkLayout, separateNames } from './layoutCheck';
import { checkCoincide } from './coincide';
import { checkPlanAreas } from './market';
import { checkAreaClaims } from './areaClaims';
import { checkFlow } from './flow';
import { checkLorenz, lorenzWidth } from './lorenz';
import type { SceneBuilt } from './scene';
import { checkCornerLettersDrawn, checkSceneCorners, checkSceneKey, checkSceneLook, checkSceneWords, cornerLettersIn } from './sceneCheck';
import { checkStageStatements, checkStageWords } from './stageCheck';

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
export function evaluateReply(reply: string, input: Pick<DiagramGenInput, 'sides' | 'key' | 'mcq' | 'edit' | 'widthPx'> & { question?: string }): Evaluated | null {
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
export function evaluateSpec(spec: DiagramSpec, input: Pick<DiagramGenInput, 'sides' | 'key' | 'mcq' | 'widthPx'> & { question?: string }, parseIssues: DiagramIssue[] = []): Evaluated {
  const evaluated = evaluateDrawing(spec, input, parseIssues);
  // The figure as it prints, at its width (u-ewel): nothing cut off, every name by its curve.
  const diagram = evaluated.compiled.diagram;
  if (diagram && !errors(evaluated.issues)) {
    separateNames(diagram, input.widthPx ?? naturalWidth(spec, diagram), input.sides);
    evaluated.issues.push(...checkLayout(diagram, input.widthPx ?? naturalWidth(spec, diagram), input.sides));
  }
  return evaluated;
}

/**
 * A plan's point names the question never uses ("e_1", kept by the plan to end a band) are
 * not printed (k-0596 live run: e_f, e_1, e_0 on a figure whose question names Q_1 and Q_0);
 * the points stay, so their bands and ticks still hold.
 */
function hideUnnamedPoints(spec: DiagramSpec, compiled: Compiled, words: string): Compiled {
  const diagram = compiled.diagram;
  if (!diagram || !words.trim()) return compiled;
  const named = new Set(labelsIn(words));
  const corners = new Set(cornerLettersIn(words));
  // Only the plan's own point names; a PPC's marks (A, B, C) are left alone.
  const planNames = new Set(spec.points.map((p) => tickKey(p.name)).filter(Boolean));
  const extra = (p: Diagram['points'][number]) => {
    const raw = plainOf(p.label ?? { en: [], zh: [] }).trim();
    if (!raw || !planNames.has(tickKey(raw))) return false;
    // A lowercase letter is a corner ("area abc", "point a"); the keys are upper case, so area A is not point a.
    if (/^[a-z]$/.test(raw)) return !corners.has(raw);
    return !named.has(tickKey(raw));
  };
  if (!diagram.points.some(extra)) return compiled;
  return { ...compiled, diagram: { ...diagram, points: diagram.points.map((p) => (extra(p) ? { ...p, label: undefined, labelOffset: undefined } : p)) } };
}

function evaluateDrawing(spec: DiagramSpec, input: Pick<DiagramGenInput, 'sides' | 'key' | 'mcq'> & { question?: string }, parseIssues: DiagramIssue[]): Evaluated {
  let compiled = compileSpec(spec);
  if (spec.kind === 'curves' && spec.placement === 'question' && input.mcq) {
    compiled = hideUnnamedPoints(spec, compiled, [input.mcq.stem, ...input.mcq.statements, ...input.mcq.options, input.key].join('\n'));
  }
  if (spec.kind === 'scene') return evaluateScene(spec, compiled as SceneBuilt, input, parseIssues);
  if (spec.kind === 'lorenz') {
    // Lorenz curves (k-0584): drawn by code, so only the question's words against the figure.
    const issues = [...parseIssues, ...compiled.issues];
    let solved: SolvedKey | null = null;
    if (compiled.diagram && spec.placement === 'question') {
      const checked = checkLorenz(spec, input.mcq, input.key);
      issues.push(...checked.issues);
      solved = checked.solved;
    }
    if (!compiled.diagram && !errors(issues)) issues.push({ level: 'error', code: 'diagram.empty', text: 'Nothing could be drawn from that diagram.' });
    return { spec, compiled, issues, solved, questionChange: '' };
  }
  const issues = [...parseIssues, ...compiled.issues, ...checkDiagram(spec, compiled, input.sides, input.key), ...checkCoincide(spec, compiled.diagram)];
  let solved: SolvedKey | null = null;
  if (compiled.diagram && input.mcq && spec.placement === 'question') {
    issues.push(
      ...checkLabels(input.mcq, compiled.diagram),
      ...checkStem(spec, compiled, [input.mcq.stem, ...input.mcq.statements].join('\n')),
      ...checkCornerLettersDrawn(compiled.diagram, input.mcq, input.key),
    );
    if (spec.kind === 'flow') issues.push(...checkFlow(compiled.diagram, input.mcq, input.sides));
    const solvedKey = solveKey(spec, compiled, input.mcq);
    solved = solvedKey.solved;
    issues.push(...solvedKey.issues);
    // The plan path's areas (k-0596): options naming areas run only behind an answer worked out from the market.
    const areas = checkPlanAreas(spec, compiled, input.mcq);
    issues.push(...areas.issues);
    solved = areas.solved ?? solved;
    // What the explanation and the statements say an area is, against the market (k-0600 follow-up).
    issues.push(...checkAreaClaims(spec, compiled, input.mcq, input.key));
  } else if (spec.kind === 'curves' && compiled.diagram) {
    issues.push(...checkPlanAreas(spec, compiled, undefined).issues);
  }
  // A model answer's flow chart: only its languages are checked (k-0588).
  if (spec.kind === 'flow' && compiled.diagram && !(input.mcq && spec.placement === 'question')) {
    issues.push(...checkFlow(compiled.diagram, undefined, input.sides));
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
function evaluateScene(spec: DiagramSpec, compiledIn: SceneBuilt, input: Pick<DiagramGenInput, 'key' | 'mcq'> & { question?: string }, parseIssues: DiagramIssue[]): Evaluated {
  let compiled = compiledIn;
  // Nothing extra (u-fbsp): a lettered point no word of the question or its key names is dropped, not printed.
  const words = input.mcq ? [input.mcq.stem, ...input.mcq.statements, ...input.mcq.options, input.key] : [input.question ?? '', input.key];
  const named = new Set(words.flatMap(cornerLettersIn));
  const points = spec.scene?.points ?? [];
  // With no words at all (a sample drawn alone) there is nothing to read: keep every letter.
  if (spec.placement === 'question' && words.join('').trim() && points.some((p) => !named.has(p.label.trim()))) {
    spec = { ...spec, scene: { ...spec.scene!, points: points.filter((p) => named.has(p.label.trim())) } };
    compiled = compileSpec(spec) as SceneBuilt;
  }
  const issues = [...parseIssues, ...compiled.issues];
  const stem = input.mcq ? [input.mcq.stem, ...input.mcq.statements].join('\n') : (input.question ?? '');
  issues.push(...checkSceneWords(spec, stem, input.key), ...checkSceneLook(spec), ...checkStageWords(spec, compiled, stem));
  let solved: SolvedKey | null = null;
  if (compiled.diagram && input.mcq && spec.placement === 'question') {
    // A label no part of the scene can carry (a ceiling question's distractor Q₄): the scene cannot draw it, kind "curves" can.
    issues.push(
      ...checkLabels(input.mcq, compiled.diagram, { order: false }).map((i) =>
        i.code === 'label.missing'
          ? { ...i, text: `${i.text} Scene ${spec.scene?.type} has only the parts listed for it: give the label to one of them (a price ceiling's Qx is a fourth quantity on D; a second control price or a shifted curve is a two-state scene: stage and binds), and when none can carry it, draw it with kind "curves" instead (levels and points can mark every quantity and price).` }
          : i,
      ),
    );
    // Areas named by their corners (k-0577 round 2) are checked by their corners; lettered regions by their letters.
    const corners = checkSceneCorners(spec, compiled, input.mcq, input.key);
    issues.push(...corners.issues);
    if (corners.solved) solved = corners.solved;
    else if (!corners.used || !corners.issues.length) {
      const key = checkSceneKey(spec, compiled, input.mcq, corners.used);
      solved = key.solved;
      issues.push(...key.issues);
    }
    // Two states (k-0587): a statement question ("the producer surplus will decrease") is answered from both states' markets.
    if (compiled.stage && spec.scene?.ask === 'none') {
      const statements = checkStageStatements(spec, compiled, input.mcq);
      issues.push(...statements.issues);
      solved = statements.solved ?? solved;
    }
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

/** The width a figure prints at when its place sets none: a data chart's, two Lorenz boxes', else the default. */
function naturalWidth(spec: DiagramSpec, diagram: Diagram): number {
  if (diagram.chart) return DATA_CHART_WIDTH_PX;
  if (spec.kind === 'lorenz') return lorenzWidth(spec);
  return DEFAULT_DIAGRAM_SIZE.widthPx;
}

/** The figure as a block, measured for the paper's language. */
export function blockOf(evaluated: Evaluated, sides: readonly Side[], widthPx?: number): DiagramBlock | null {
  const diagram = evaluated.compiled.diagram;
  if (!diagram) return null;
  const { spec } = evaluated;
  const width = widthPx ?? naturalWidth(spec, diagram);
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
