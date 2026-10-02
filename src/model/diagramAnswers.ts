import type { Diagram } from './diagram';
import type { ContentBlock, DiagramBlock } from './types';
import { anchorReferences, deriveReferences, spanReferences } from './diagramAnchors';
import { areaReferences } from './diagramAreas';

/**
 * The answer layer: elements of an axes diagram flagged `answer: true`, drawn (in red)
 * only in the teacher version and the answer key. The student version leaves them out,
 * and with them everything that leans on one (a point on an answer curve, an area it
 * edges, a span to it, a curve derived from it), so nothing dangles.
 */

/** The element lists that can carry `answer`. Pie, flow and forum never do. */
export type AnswerLayerKind = 'curves' | 'points' | 'labels' | 'arrows' | 'areas' | 'spans';

export type AnswerLayer = Record<AnswerLayerKind, Set<string>>;

type Flagged = { id: string; answer?: true };

function lists(diagram: Diagram): Record<AnswerLayerKind, Flagged[]> {
  return {
    curves: diagram.curves ?? [],
    points: diagram.points ?? [],
    labels: diagram.labels ?? [],
    arrows: diagram.arrows ?? [],
    areas: diagram.areas ?? [],
    spans: diagram.spans ?? [],
  };
}

const KINDS: AnswerLayerKind[] = ['curves', 'points', 'labels', 'arrows', 'areas', 'spans'];

/** Does this diagram draw anything only the teacher sees? */
export function hasAnswerLayer(diagram: Diagram): boolean {
  if (diagram.pie || diagram.flow || diagram.forum) return false;
  const all = lists(diagram);
  return KINDS.some((kind) => all[kind].some((element) => element.answer));
}

/**
 * What the student version leaves out, by kind: every answer element and everything
 * that depends on one. Null when the diagram has no answer layer, so an untouched
 * diagram takes the old path unchanged.
 */
export function answerLayer(diagram: Diagram): AnswerLayer | null {
  if (!hasAnswerLayer(diagram)) return null;
  const all = lists(diagram);
  const layer = Object.fromEntries(
    KINDS.map((kind) => [kind, new Set(all[kind].filter((e) => e.answer).map((e) => e.id))]),
  ) as AnswerLayer;
  // Anchors name curves and points; follow them to a fixed point (a point on a curve
  // derived from an answer curve is hidden too).
  const hiddenRef = (ids: string[]) => ids.some((id) => layer.curves.has(id) || layer.points.has(id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const curve of diagram.curves) {
      if (!layer.curves.has(curve.id) && curve.derive && hiddenRef(deriveReferences(curve.derive))) {
        layer.curves.add(curve.id);
        grew = true;
      }
    }
    for (const mark of diagram.points) {
      if (!layer.points.has(mark.id) && mark.anchor && hiddenRef(anchorReferences(mark.anchor))) {
        layer.points.add(mark.id);
        grew = true;
      }
    }
  }
  for (const area of diagram.areas ?? []) {
    if (hiddenRef(areaReferences(area))) layer.areas.add(area.id);
  }
  for (const span of diagram.spans ?? []) {
    if (hiddenRef(spanReferences(span))) layer.spans.add(span.id);
  }
  return layer;
}

/** The diagram as the student version draws it: the answer layer and its dependents removed. */
export function questionLayer(diagram: Diagram): Diagram {
  const layer = answerLayer(diagram);
  if (!layer) return diagram;
  const next: Diagram = {
    ...diagram,
    curves: diagram.curves.filter((c) => !layer.curves.has(c.id)),
    points: diagram.points.filter((p) => !layer.points.has(p.id)),
    labels: diagram.labels.filter((l) => !layer.labels.has(l.id)),
    arrows: diagram.arrows.filter((a) => !layer.arrows.has(a.id)),
  };
  if (diagram.areas) next.areas = diagram.areas.filter((a) => !layer.areas.has(a.id));
  if (diagram.spans) next.spans = diagram.spans.filter((s) => !layer.spans.has(s.id));
  return next;
}

/** Set or clear `answer` on these element ids. Only `true` is stored; clearing deletes the key. */
export function setAnswer(diagram: Diagram, ids: Iterable<string>, on: boolean): Diagram {
  const wanted = new Set(ids);
  const flip = <T extends Flagged>(element: T): T => {
    if (!wanted.has(element.id) || Boolean(element.answer) === on) return element;
    if (on) return { ...element, answer: true };
    const rest = { ...element };
    delete rest.answer;
    return rest;
  };
  const next: Diagram = {
    ...diagram,
    curves: diagram.curves.map(flip),
    points: diagram.points.map(flip),
    labels: diagram.labels.map(flip),
    arrows: diagram.arrows.map(flip),
  };
  if (diagram.areas) next.areas = diagram.areas.map(flip);
  if (diagram.spans) next.spans = diagram.spans.map(flip);
  return next;
}

/** Of these ids, the ones naming an element that can carry `answer`, and how many are on. */
export function answerState(diagram: Diagram, ids: Iterable<string>): { ids: string[]; on: number } {
  const wanted = new Set(ids);
  const all = lists(diagram);
  const found = KINDS.flatMap((kind) => all[kind].filter((e) => wanted.has(e.id)));
  return { ids: found.map((e) => e.id), on: found.filter((e) => e.answer).length };
}

/**
 * Every element in `after` that `before` lacks, flagged as an answer: how "Draw answer"
 * catches whatever made it (a tool, a shade preset, a shift, a paste) in one place.
 */
export function markNewAsAnswers(before: Diagram, after: Diagram): Diagram {
  const known = new Set(KINDS.flatMap((kind) => lists(before)[kind].map((e) => e.id)));
  const fresh = KINDS.flatMap((kind) => lists(after)[kind].filter((e) => !known.has(e.id) && !e.answer));
  return fresh.length === 0 ? after : setAnswer(after, fresh.map((e) => e.id), true);
}

/** The diagrams among these blocks (figure rows and sources included) that carry an answer layer. */
export function answeredDiagrams(blocks: ContentBlock[] | undefined): DiagramBlock[] {
  const found: DiagramBlock[] = [];
  for (const block of blocks ?? []) {
    if (block.kind === 'diagram') {
      if (hasAnswerLayer(block.diagram)) found.push(block);
    } else if (block.kind === 'figureRow') {
      if (block.figure.kind === 'diagram' && hasAnswerLayer(block.figure.diagram)) found.push(block.figure);
    } else if (block.kind === 'source') {
      found.push(...answeredDiagrams(block.blocks));
    }
  }
  return found;
}
