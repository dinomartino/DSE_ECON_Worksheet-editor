/**
 * The flow figure fields and the saved-document promise (k-0588). A chart using a dashed
 * arrow, a loop, the grid or the key is written at 4, so every build before it (0.10.1 and
 * older read 3 at most) opens it read-only instead of rewriting it without them; a chart
 * using none is written exactly as before. The old builds' own reading is checked in
 * `flowCompat.test.ts` against files those builds wrote.
 */
import { describe, expect, it } from 'vitest';
import type { FlowArrow, FlowChart } from './diagram';
import { buildFromTemplate } from './diagramTemplates';
import { createDiagramBlock, createMcqQuestion, createWorksheet } from './factories';
import { migrate, serializeWorksheet, writtenSchemaVersion } from './migrations';
import { createGraph, parseGraph, stringifyGraph } from './graph';
import { bi } from './text';
import { mapDiagramTexts } from './diagramText';

const base = (): FlowChart => buildFromTemplate('flow').flow!;
const docWith = (flow: FlowChart) => {
  const worksheet = createWorksheet();
  const question = createMcqQuestion();
  const block = createDiagramBlock('flow');
  block.diagram = { ...block.diagram, flow };
  question.blocks = [block];
  return { ...worksheet, questions: [question], flow: [{ type: 'question' as const, id: question.id }] };
};
const withArrow = (change: Partial<FlowArrow>): FlowChart => {
  const flow = base();
  return { ...flow, arrows: flow.arrows.map((a, i) => (i === 1 ? { ...a, ...change } : a)) };
};

describe('which flow charts are written at 4', () => {
  it('a plain chart (every build since v0.8.7 draws it) is not marked', () => {
    expect(serializeWorksheet(docWith(base())).schemaVersion).toBe(1);
  });

  it.each([
    ['a dashed arrow', withArrow({ dashed: true })],
    ['a loop over the top', withArrow({ route: 'above' })],
    ['a loop underneath', withArrow({ route: 'below' })],
    ['the grid', { ...base(), layout: 'grid' as const }],
    ['a key', { ...base(), key: { solid: bi('Real flow', '實質流程') } }],
  ])('%s is', (_name, flow) => {
    expect(serializeWorksheet(docWith(flow)).schemaVersion).toBe(4);
  });

  it('a key with no words, or an unknown route, is not (nothing would draw differently)', () => {
    expect(serializeWorksheet(docWith({ ...base(), key: {} })).schemaVersion).toBe(1);
    expect(writtenSchemaVersion(4, { kind: 'diagram', diagram: { flow: { route: 'sideways', arrows: [{ route: 'sideways' }] } } })).toBe(1);
  });

  it('both templates are, and a saved graph of either is too', () => {
    for (const id of ['circular-flow', 'production-stages']) {
      const flow = buildFromTemplate(id).flow!;
      expect(serializeWorksheet(docWith(flow)).schemaVersion).toBe(4);
      const graph = createGraph(id, 'en');
      expect(JSON.parse(stringifyGraph(graph)).schemaVersion).toBe(4);
    }
  });

  it('drops back once the chart stops using them', () => {
    const doc = docWith({ ...base(), layout: 'grid' });
    const saved = migrate(JSON.parse(JSON.stringify(serializeWorksheet(doc))));
    expect(saved.schemaVersion).toBe(4);
    const block = saved.questions[0].blocks[0] as ReturnType<typeof createDiagramBlock>;
    const { layout: _l, ...plain } = block.diagram.flow!;
    void _l;
    block.diagram = { ...block.diagram, flow: plain };
    expect(serializeWorksheet(saved).schemaVersion).toBe(1);
  });
});

describe('every new field survives load → save → load', () => {
  it('in a worksheet', () => {
    const flow = buildFromTemplate('circular-flow').flow!;
    const stored = JSON.parse(JSON.stringify(serializeWorksheet(docWith(flow))));
    const loaded = migrate(stored);
    expect(loaded.__unknown).toBeUndefined();
    const block = loaded.questions[0].blocks[0] as ReturnType<typeof createDiagramBlock>;
    expect(block.diagram.flow).toEqual(flow);
    expect(JSON.parse(JSON.stringify(serializeWorksheet(loaded)))).toEqual(stored);
  });

  it('in a saved graph', () => {
    const graph = createGraph('production-stages', 'zh');
    const again = parseGraph(stringifyGraph(graph));
    expect(again.block.diagram.flow).toEqual(graph.block.diagram.flow);
  });

  it('the key’s words are translatable text like every other label', () => {
    const diagram = buildFromTemplate('circular-flow');
    const seen: string[] = [];
    mapDiagramTexts(diagram, (segment, text) => {
      seen.push(segment);
      return text;
    });
    expect(seen).toEqual(expect.arrayContaining(['flow/key/dashed', 'flow/key/solid']));
  });
});
