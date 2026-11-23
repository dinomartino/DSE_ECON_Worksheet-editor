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
import type { DiagramGenDeps, DiagramGenInput, DiagramGenOutcome, DiagramIssue, DiagramSpec } from './types';
import { checkDiagram } from './validate';

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
}

const errors = (issues: readonly DiagramIssue[]) => issues.filter((i) => i.level === 'error').length;

/** A reply checked end to end; null when it is not a spec at all. Exported for the harness and tests. */
export function evaluateReply(reply: string, input: Pick<DiagramGenInput, 'sides' | 'key'>): Evaluated | null {
  const parsed = parseSpec(reply);
  if (!parsed) return null;
  const compiled = compileSpec(parsed.spec);
  const issues = [...parsed.issues, ...compiled.issues, ...checkDiagram(parsed.spec, compiled, input.sides, input.key)];
  if (parsed.spec.kind !== 'none' && !compiled.diagram && !errors(issues)) {
    issues.push({ level: 'error', code: 'diagram.empty', text: 'Nothing could be drawn from that diagram.' });
  }
  return { spec: parsed.spec, compiled, issues };
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
    return { ok: true, status: 'none', block: null, spec: best.spec, issues: best.issues, attempt, imageSkipped, model };
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
  };
}
