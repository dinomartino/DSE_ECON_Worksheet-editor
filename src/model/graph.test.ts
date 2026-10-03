/**
 * Saved graphs. `src/test/corpus/graph-v1.json` was written once by the build that
 * introduced graphs and is **never regenerated**: it is the only graph this build did not
 * construct, so the only one that can catch a migration which drops geometry.
 */
import { describe, expect, it } from 'vitest';
import graphV1 from '@/test/corpus/graph-v1.json';
import { CURRENT_SCHEMA_VERSION } from './migrations';
import {
  createGraph,
  duplicateGraph,
  graphFileName,
  GraphSchemaError,
  isGraphNewerThanBuild,
  migrateGraph,
  parseGraph,
  serializeGraph,
  stringifyGraph,
  withGraphLanguage,
} from './graph';
import { diagramSize } from '@/render/diagram';

describe('the frozen graph corpus (v1)', () => {
  it('opens through migrateGraph with its geometry intact', () => {
    const graph = migrateGraph(graphV1);
    expect(graph.id).toBe('graph-corpus-v1');
    expect(graph.name).toBe('Rice market');
    expect(graph.language).toBe('bilingual');
    expect(graph.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    // No answer layer, so it is still written at 1 (§ writtenSchemaVersion).
    expect(serializeGraph(graph).schemaVersion).toBe(1);
    expect(graph.templateId).toBe('supply-demand');
    expect(graph.__unknown).toBeUndefined();
    const { block } = graph;
    expect(block.kind).toBe('diagram');
    expect(block.id).toBe('graph-corpus-block');
    expect([block.widthPx, block.heightPx]).toEqual([360, 354]);
    expect(block.altText.en[0].text).toBe('Demand and supply for rice');
    const diagram = block.diagram;
    expect(diagram.curves.map((curve) => curve.id)).toEqual(['4-GUNGOXzN', 'fPb_c6ZTnB']);
    expect(diagram.curves[0].points).toEqual([
      { x: 0.08, y: 0.88 },
      { x: 0.86, y: 0.12 },
    ]);
    expect(diagram.points.map((point) => point.id)).toEqual(['UnaC5P0I7e']);
    expect(diagram.points[0].anchor).toEqual({ cross: ['4-GUNGOXzN', 'fPb_c6ZTnB'] });
    expect(diagram.labels.map((label) => label.id)).toEqual(['corpus-label']);
    expect(diagram.title?.zh[0].text).toBe('白米市場');
    expect(diagram.x.title?.en[0].text).toBe('Quantity');
  });

  it('survives load → save → load', () => {
    const once = migrateGraph(graphV1);
    expect(parseGraph(stringifyGraph(once))).toEqual(once);
  });
});

describe('migrateGraph', () => {
  it('rejects what is not a graph', () => {
    expect(() => migrateGraph(null)).toThrow(GraphSchemaError);
    expect(() => migrateGraph({ id: 'x', block: { kind: 'paragraph' } })).toThrow(GraphSchemaError);
    expect(() => migrateGraph({ block: createGraph().block })).toThrow(GraphSchemaError);
  });

  it('keeps a newer build’s fields and version, and reads it as newer', () => {
    const raw = { ...serializeGraph(createGraph()), schemaVersion: CURRENT_SCHEMA_VERSION + 1, layers: [1, 2] };
    const graph = migrateGraph(raw);
    expect(graph.schemaVersion).toBe(CURRENT_SCHEMA_VERSION + 1);
    expect(isGraphNewerThanBuild(graph)).toBe(true);
    expect(graph.__unknown).toEqual({ layers: [1, 2] });
    expect(serializeGraph(graph).layers).toEqual([1, 2]);
  });

  it('defaults what an odd record lacks', () => {
    const graph = migrateGraph({ id: 'g', block: createGraph().block, language: 'fr' });
    expect(graph.name).toBe('Untitled graph');
    expect(graph.language).toBe('en');
    expect(graph.fonts.latin).toBe('Times New Roman');
  });

  it('never mutates its input', () => {
    const raw = serializeGraph(createGraph('supply-demand'));
    const before = JSON.stringify(raw);
    migrateGraph(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });
});

describe('a new graph', () => {
  it('starts from a template, named after it and measured for its language', () => {
    const graph = createGraph('supply-demand', 'en');
    expect(graph.name).toBe('Supply and demand');
    expect(graph.block.diagram.curves.length).toBeGreaterThan(0);
    expect(graph.block.heightPx).toBe(diagramSize(graph.block.diagram, graph.block.widthPx, 'en').heightPx);
    expect(createGraph().name).toBe('Untitled graph');
  });

  it('re-measures when its language changes', () => {
    const graph = withGraphLanguage(createGraph('supply-demand', 'en'), 'bilingual');
    expect(graph.language).toBe('bilingual');
    expect(graph.block.heightPx).toBe(diagramSize(graph.block.diagram, graph.block.widthPx, 'bilingual').heightPx);
  });

  it('duplicates under a new id, named apart', () => {
    const copy = duplicateGraph(createGraph('supply-demand'), 'copy-id');
    expect(copy.id).toBe('copy-id');
    expect(copy.name).toBe('Supply and demand (copy)');
  });

  it('saves and reopens every kind of figure: axes, pie, flow and forum', () => {
    for (const templateId of ['supply-demand', 'pie', 'flow', 'forum']) {
      const graph = createGraph(templateId);
      expect(parseGraph(stringifyGraph(graph)), templateId).toEqual(graph);
    }
    expect(createGraph('pie').block.diagram.pie?.slices.length).toBeGreaterThan(0);
    expect(createGraph('flow').block.diagram.flow?.nodes.length).toBeGreaterThan(0);
    expect(createGraph('forum').block.diagram.forum?.bubbles.length).toBeGreaterThan(0);
  });

  it('names its files safely', () => {
    expect(graphFileName({ name: 'Tax / subsidy: case' }, 'png')).toBe('Tax - subsidy- case.png');
    expect(graphFileName({ name: '   ' }, 'png')).toBe('Graph.png');
  });
});
