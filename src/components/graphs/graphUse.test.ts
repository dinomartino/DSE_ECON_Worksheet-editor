import { describe, expect, it } from 'vitest';
import { docWith, partsQuestion } from '@/library/testKit';
import { buildFromTemplate } from '@/model/diagramTemplates';
import { createDiagramBlock } from '@/model/factories';
import { flowOf } from '@/model/flow';
import { createGraph, graphBlockCopy, graphFromBlock, isGraphNewerThanBuild, rebaseOnGraph } from '@/model/graph';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import { bi } from '@/model/text';
import type { DiagramBlock } from '@/model/types';
import { diagramSize } from '@/render/diagram';
import { useWorksheetStore } from '@/store/worksheetStore';
import { questionChoices, searchSummaries } from './graphList';
import { newQuestionTypeFor, placeGraphInOpenDocument } from './placeGraph';

const store = () => useWorksheetStore.getState();

describe('a graph copied into a worksheet', () => {
  const graph = createGraph('supply-demand', 'en');
  graph.block.widthPx = 360;
  graph.block.diagram.title = bi('Rice market', '白米市場');

  it('is a deep copy under a fresh block id, at the graph’s width, measured for the worksheet’s language', () => {
    const copy = graphBlockCopy(graph, 'bilingual');
    expect(copy.id).not.toBe(graph.block.id);
    expect(copy.widthPx).toBe(360);
    expect({ widthPx: copy.widthPx, heightPx: copy.heightPx }).toEqual(diagramSize(copy.diagram, 360, 'bilingual'));
    expect(copy.diagram).toEqual(graph.block.diagram);
    // No link back: editing the copy never reaches the saved graph.
    copy.diagram.curves[0].points[0].x = 0.99;
    expect(graph.block.diagram.curves[0].points[0].x).not.toBe(0.99);
  });

  it('takes a slot’s width when given one (an MCQ option)', () => {
    expect(graphBlockCopy(graph, 'en', 240).widthPx).toBe(240);
  });

  it('re-bases a diagram on the graph’s geometry, keeping the block’s id, width and alt text', () => {
    const block: DiagramBlock = { ...createDiagramBlock('blank', 320), altText: bi('Mine', '我的') };
    const next = rebaseOnGraph(block, graph, 'en');
    expect(next.id).toBe(block.id);
    expect(next.widthPx).toBe(320);
    expect(next.altText).toEqual(block.altText);
    expect(next.diagram).toEqual(graph.block.diagram);
    expect(next.diagram).not.toBe(graph.block.diagram);
  });
});

describe('Save to Graphs', () => {
  it('names the graph from the diagram title in the worksheet’s language', () => {
    const block = createDiagramBlock('supply-demand');
    block.diagram.title = bi('Rice   market', '白米市場');
    const graph = graphFromBlock(block, 'zh', { latin: 'Arial', eastAsia: 'DFKai-SB' }, 'g1', '2026-10-02T00:00:00.000Z');
    expect(graph.name).toBe('白米市場');
    expect(graphFromBlock(block, 'en').name).toBe('Rice market');
    expect(graph).toMatchObject({ id: 'g1', language: 'zh', fonts: { latin: 'Arial', eastAsia: 'DFKai-SB' }, templateId: 'supply-demand' });
    expect(graph.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(isGraphNewerThanBuild(graph)).toBe(false);
    expect(graph.block.id).not.toBe(block.id);
    expect(graph.block.diagram).toEqual(block.diagram);
    expect(graph.block.diagram).not.toBe(block.diagram);
  });

  it('falls back to "Untitled graph" with no title', () => {
    expect(graphFromBlock(createDiagramBlock('blank'), 'en').name).toBe('Untitled graph');
  });
});

describe('Use in a worksheet…', () => {
  it('lists worksheets by every word of the name, newest first', () => {
    const rows = [
      { id: 'a', title: 'S4 Demand quiz', updatedAt: '2026-01-01' },
      { id: 'b', title: 'S5 demand test', updatedAt: '2026-02-01' },
      { id: 'c', title: 'Elasticity', updatedAt: '2026-03-01' },
    ];
    expect(searchSummaries(rows, 'demand').map((row) => row.id)).toEqual(['b', 'a']);
    expect(searchSummaries(rows, 'S4 DEMAND').map((row) => row.id)).toEqual(['a']);
    expect(searchSummaries(rows, '').map((row) => row.id)).toEqual(['c', 'b', 'a']);
  });

  it('lists the questions numbered as printed, with an excerpt', () => {
    const doc = docWith([partsQuestion('Explain the shortage.'), partsQuestion('Draw the market.')], { layout: [] });
    const choices = questionChoices(doc);
    expect(choices.map((choice) => choice.label)).toEqual(['Q1', 'Q2']);
    expect(choices[1].excerpt).toContain('Draw the market.');
  });

  it('appends a copy to the chosen question’s stem in one commit, and selects it', () => {
    const doc = docWith([partsQuestion('One'), partsQuestion('Two')], { layout: [] });
    store().replaceWorksheet(doc);
    const graph = createGraph('supply-demand');
    const target = doc.questions[1];
    const placed = placeGraphInOpenDocument(graph, target.id);
    expect(placed?.questionId).toBe(target.id);
    const blocks = store().worksheet.questions[1].blocks;
    expect(blocks).toHaveLength(target.blocks.length + 1);
    expect(blocks.at(-1)).toMatchObject({ kind: 'diagram', id: placed?.blockId });
    expect(placed?.blockId).not.toBe(graph.block.id);
    expect(store().selectedQuestionId).toBe(target.id);
    expect(store().blockSelectRequest).toBe(placed?.blockId);
    expect(store().dirty).toBe(true);
    store().undo();
    expect(store().worksheet.questions[1].blocks).toHaveLength(target.blocks.length);
  });

  it('adds a new question at the end, of the last question’s type, holding the graph', () => {
    const doc = docWith([partsQuestion('One')], { layout: [] });
    store().replaceWorksheet(doc);
    const placed = placeGraphInOpenDocument(createGraph('supply-demand'));
    const worksheet = store().worksheet;
    expect(worksheet.questions).toHaveLength(2);
    const added = worksheet.questions.find((question) => question.id === placed?.questionId);
    expect(added?.type).toBe(newQuestionTypeFor(doc));
    expect(added?.blocks.at(-1)?.id).toBe(placed?.blockId);
    expect(flowOf(worksheet).at(-1)?.id).toBe(placed?.questionId);
  });

  it('adds nothing to a read-only document', () => {
    const doc = { ...docWith([partsQuestion('One')], { layout: [] }), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    store().replaceWorksheet(doc);
    expect(placeGraphInOpenDocument(createGraph('supply-demand'))).toBeUndefined();
    expect(store().worksheet).toBe(doc);
  });

  it('forgets a pending block selection when another document opens', () => {
    store().requestBlockSelection('x');
    store().replaceWorksheet(docWith([], { layout: [] }));
    expect(store().blockSelectRequest).toBeUndefined();
  });
});

describe('every kind of chart', () => {
  const kinds = ['supply-demand', 'pie', 'flow', 'forum'];

  it('re-bases a block of one kind on a graph of another as picking that template would', () => {
    for (const from of kinds) {
      for (const to of kinds) {
        const block: DiagramBlock = { ...createDiagramBlock(from, 360), altText: bi('Mine', '我的') };
        const graph = createGraph(to, 'en');
        const picked = buildFromTemplate(to);
        const viaTemplate = { ...block, ...diagramSize(picked, block.widthPx, 'bilingual'), diagram: picked };
        const viaGraph = rebaseOnGraph(block, graph, 'bilingual');
        expect(viaGraph, `${from} → ${to}`).toEqual({ ...viaTemplate, diagram: graph.block.diagram });
        expect({ widthPx: viaGraph.widthPx, heightPx: viaGraph.heightPx }).toEqual(diagramSize(graph.block.diagram, 360, 'bilingual'));
      }
    }
  });

  it('saves any worksheet diagram to Graphs and copies it back unchanged', () => {
    for (const kind of kinds) {
      const block = createDiagramBlock(kind, 420);
      const graph = graphFromBlock(block, 'en');
      expect(graph.block.diagram, kind).toEqual(block.diagram);
      const copy = graphBlockCopy(graph, 'en');
      expect(copy.diagram, kind).toEqual(block.diagram);
      expect({ widthPx: copy.widthPx, heightPx: copy.heightPx }).toEqual(diagramSize(block.diagram, 420, 'en'));
    }
  });

  it('places a pie graph in a worksheet like any other', () => {
    const doc = docWith([partsQuestion('One')], { layout: [] });
    store().replaceWorksheet(doc);
    const placed = placeGraphInOpenDocument(createGraph('pie'), doc.questions[0].id);
    const added = store().worksheet.questions[0].blocks.at(-1);
    expect(added).toMatchObject({ kind: 'diagram', id: placed?.blockId });
    expect(added?.kind === 'diagram' && added.diagram.pie?.slices.length).toBeGreaterThan(0);
  });
});
