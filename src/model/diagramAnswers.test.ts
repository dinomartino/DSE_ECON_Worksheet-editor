import { describe, expect, it } from 'vitest';
import type { Diagram } from './diagram';
import {
  answerLayer,
  answerState,
  answeredDiagrams,
  hasAnswerLayer,
  markNewAsAnswers,
  questionLayer,
  setAnswer,
} from './diagramAnswers';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from './diagramTemplates';
import { migrate } from './migrations';
import { createGraph, migrateGraph, serializeGraph } from './graph';
import { copyHandles, pasteInto } from './diagramDraw';
import { bi } from './text';
import { buildAnswerLayerWorksheet, ppfAnswerDiagram } from '@/test/answerLayerFixture';
import type { DiagramBlock, StructuredQuestion } from './types';

/**
 * The answer layer (`model/diagramAnswers.ts`): what the student version leaves out,
 * how the flag is stored, and that it survives a save and a reload.
 */

/** Supply and demand with an answer D₁ and everything that could lean on it. */
function market(): Diagram {
  return {
    x: { title: bi('Q', 'Q') },
    y: { title: bi('P', 'P') },
    curves: [
      { id: 'd', points: [{ x: 0.1, y: 0.9 }, { x: 0.9, y: 0.1 }], shape: 'straight' },
      { id: 's', points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }], shape: 'straight' },
      { id: 'd1', points: [{ x: 0.2, y: 0.9 }, { x: 0.9, y: 0.2 }], shape: 'straight', answer: true },
      // Derived from the answer curve: hidden with it.
      { id: 'mr', points: [{ x: 0.2, y: 0.9 }, { x: 0.5, y: 0.2 }], shape: 'straight', derive: { kind: 'marginalRevenue', of: 'd1' } },
    ],
    points: [
      { id: 'e0', at: { x: 0.5, y: 0.5 }, anchor: { cross: ['d', 's'] } },
      // On the answer curve: hidden.
      { id: 'e1', at: { x: 0.55, y: 0.55 }, anchor: { cross: ['d1', 's'] } },
      // On a curve that is only hidden because it derives from the answer: hidden too.
      { id: 'm', at: { x: 0.3, y: 0.6 }, anchor: { cross: ['mr', 's'] } },
    ],
    labels: [{ id: 'note', at: { x: 0.8, y: 0.8 }, text: bi('a', 'a') }],
    arrows: [{ id: 'shift', from: { x: 0.6, y: 0.3 }, to: { x: 0.7, y: 0.4 }, answer: true }],
    areas: [
      { id: 'cs', band: { edges: [{ curve: 'd' }, { level: { point: 'e0' } }], from: 0, to: { point: 'e0' } } },
      { id: 'cs1', band: { edges: [{ curve: 'd1' }, { level: { point: 'e1' } }], from: 0, to: { point: 'e1' } } },
    ],
    spans: [
      { id: 'gap', from: { point: 'e0' }, to: { point: 'e1' }, style: 'arrow', along: 'x' },
      { id: 'plain', from: { x: 0.2, y: 0.2 }, to: { x: 0.3, y: 0.2 }, style: 'bracket' },
    ],
  };
}

describe('the answer layer', () => {
  it('is absent from every template', () => {
    for (const template of DIAGRAM_TEMPLATES) {
      expect(hasAnswerLayer(buildFromTemplate(template.id))).toBe(false);
      expect(answerLayer(buildFromTemplate(template.id))).toBeNull();
    }
  });

  it('is never offered on a pie, a flow chart or a forum', () => {
    const pie: Diagram = { ...market(), pie: { slices: [] } };
    expect(hasAnswerLayer(pie)).toBe(false);
  });

  it('takes every answer element and everything that depends on one', () => {
    const layer = answerLayer(market())!;
    expect([...layer.curves].sort()).toEqual(['d1', 'mr']);
    expect([...layer.points].sort()).toEqual(['e1', 'm']);
    expect([...layer.arrows]).toEqual(['shift']);
    expect([...layer.areas]).toEqual(['cs1']);
    expect([...layer.spans]).toEqual(['gap']);
    expect([...layer.labels]).toEqual([]);
  });

  it('leaves the question layer whole and nothing dangling', () => {
    const student = questionLayer(market());
    expect(student.curves.map((c) => c.id)).toEqual(['d', 's']);
    expect(student.points.map((p) => p.id)).toEqual(['e0']);
    expect(student.arrows).toEqual([]);
    expect(student.labels.map((l) => l.id)).toEqual(['note']);
    expect(student.areas!.map((a) => a.id)).toEqual(['cs']);
    expect(student.spans!.map((s) => s.id)).toEqual(['plain']);
    expect(hasAnswerLayer(student)).toBe(false);
  });

  it('hands back the same diagram when there is no answer layer', () => {
    const plain = buildFromTemplate('supply-demand');
    expect(questionLayer(plain)).toBe(plain);
  });
});

describe('storing the flag', () => {
  it('stores only `true`, and clearing deletes the key', () => {
    const on = setAnswer(market(), ['d', 'note'], true);
    expect(on.curves.find((c) => c.id === 'd')!.answer).toBe(true);
    expect(on.labels[0].answer).toBe(true);
    const off = setAnswer(on, ['d', 'note', 'd1'], false);
    expect('answer' in off.curves.find((c) => c.id === 'd')!).toBe(false);
    expect('answer' in off.curves.find((c) => c.id === 'd1')!).toBe(false);
    expect('answer' in off.labels[0]).toBe(false);
  });

  it('reports a selection as all, some or none on', () => {
    expect(answerState(market(), ['d1', 'shift'])).toEqual({ ids: ['d1', 'shift'], on: 2 });
    expect(answerState(market(), ['d1', 'd'])).toEqual({ ids: ['d', 'd1'], on: 1 });
    // Axis handles and titles name no element.
    expect(answerState(market(), ['axis-x'])).toEqual({ ids: [], on: 0 });
  });

  it('flags only what an edit created while Draw answer is on', () => {
    const before = market();
    const after: Diagram = {
      ...before,
      labels: [...before.labels, { id: 'new', at: { x: 0.5, y: 0.5 }, text: bi('b', 'b') }],
    };
    const marked = markNewAsAnswers(before, after);
    expect(marked.labels.find((l) => l.id === 'new')!.answer).toBe(true);
    expect('answer' in marked.labels.find((l) => l.id === 'note')!).toBe(false);
    expect(markNewAsAnswers(before, before)).toBe(before);
  });

  it('carries the flag through copy and paste', () => {
    const diagram = market();
    const { diagram: pasted, handles } = pasteInto(diagram, copyHandles(diagram, [{ kind: 'curve', curveId: 'd1' }]), () => 'copy');
    expect(handles).toEqual([{ kind: 'curve', curveId: 'copy' }]);
    expect(pasted.curves.find((c) => c.id === 'copy')!.answer).toBe(true);
  });
});

describe('save and reload', () => {
  it('keeps `answer` through a worksheet save and migrate', () => {
    const worksheet = buildAnswerLayerWorksheet();
    const reloaded = migrate(JSON.parse(JSON.stringify(worksheet)));
    const block = (reloaded.questions[0] as StructuredQuestion).parts[0].blocks[1] as DiagramBlock;
    expect(block.diagram.curves[0].answer).toBe(true);
    expect(block.diagram.points[0].answer).toBe(true);
    expect(reloaded.__unknown).toBeUndefined();
    expect(reloaded).toEqual(worksheet);
  });

  it('keeps `answer` through a saved graph', () => {
    const graph = createGraph('blank');
    graph.block = { ...graph.block, diagram: ppfAnswerDiagram() };
    const reloaded = migrateGraph(JSON.parse(JSON.stringify(serializeGraph(graph))));
    expect(reloaded.block.diagram.curves[0].answer).toBe(true);
    expect(reloaded.block.diagram).toEqual(graph.block.diagram);
  });

  it('finds answered diagrams in figure rows and sources', () => {
    const worksheet = buildAnswerLayerWorksheet();
    const block = (worksheet.questions[0] as StructuredQuestion).parts[0].blocks[1] as DiagramBlock;
    expect(answeredDiagrams([block])).toEqual([block]);
    expect(answeredDiagrams([{ kind: 'source', id: 's', blocks: [block] }])).toEqual([block]);
    expect(
      answeredDiagrams([{ kind: 'figureRow', id: 'f', figure: block, table: { kind: 'table', id: 't', rows: [] } } as never]),
    ).toEqual([block]);
    expect(answeredDiagrams([{ ...block, diagram: questionLayer(block.diagram) }])).toEqual([]);
  });
});
