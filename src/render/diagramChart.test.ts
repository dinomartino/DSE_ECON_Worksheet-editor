import { describe, expect, it } from 'vitest';
import { buildFromTemplate } from '@/model/diagramTemplates';
import { isPanelOnlyDiagram, MAX_CHART_SERIES, type DataChart, type Diagram } from '@/model/diagram';
import { hasAnswerLayer } from '@/model/diagramAnswers';
import {
  createDiagramBlock,
  createPart,
  createSourceBlock,
  createStructuredQuestion,
  createWorksheet,
  DATA_CHART_WIDTH_PX,
} from '@/model/factories';
import { serializeWorksheet } from '@/model/migrations';
import { createGraph, serializeGraph } from '@/model/graph';
import { bi } from '@/model/text';
import { chartLayout, chartScale, chartTickLabel, diagramSize, diagramSvg } from './diagram';

/** The data chart (k-0474): bars or lines from a small table, drawn by the one diagram pipeline. */

function chartOf(chart: Partial<DataChart>, title?: string): Diagram {
  const base = buildFromTemplate('bar-chart');
  return {
    ...base,
    ...(title ? { title: bi(title, title) } : {}),
    chart: {
      kind: 'bar',
      categories: [bi('2022', '2022'), bi('2023', '2023'), bi('2024', '2024')],
      series: [{ id: 'a', label: bi('Exports', '出口'), values: [3, 7, 5] }],
      ...chart,
    },
  };
}

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h && b.y < a.y + a.h;

describe('data chart scale', () => {
  it('counts in round steps through zero', () => {
    expect(chartScale(chartOf({}).chart!)).toEqual({ min: 0, max: 8, step: 2 });
    const negative = chartScale(chartOf({ series: [{ id: 'a', label: bi('', ''), values: [12000, -85000] }] }).chart!);
    expect(negative.min).toBeLessThan(-85000);
    expect(negative.max).toBeGreaterThanOrEqual(12000);
    expect([1, 2, 2.5, 5].some((k) => Math.abs(negative.step / 10 ** Math.floor(Math.log10(negative.step)) - k) < 1e-9)).toBe(true);
  });

  it('lets a line chart of figures far from zero start above it, never a bar chart', () => {
    const series = [{ id: 'a', label: bi('', ''), values: [110, 125, 140] }];
    expect(chartScale(chartOf({ kind: 'line', series }).chart!).min).toBeGreaterThan(0);
    expect(chartScale(chartOf({ kind: 'bar', series }).chart!).min).toBe(0);
  });

  it('obeys a pinned range and step', () => {
    expect(chartScale(chartOf({ yMin: -10, yMax: 20, yStep: 5 }).chart!)).toEqual({ min: -10, max: 20, step: 5 });
  });

  it('prints ticks as the papers do', () => {
    expect(chartTickLabel(100000, 50000)).toBe('100 000');
    expect(chartTickLabel(-250000, 50000)).toBe('-250 000');
    expect(chartTickLabel(5000, 1000)).toBe('5000');
    expect(chartTickLabel(2.5, 0.5)).toBe('2.5');
    expect(chartTickLabel(3, 0.5)).toBe('3.0');
    expect(chartTickLabel(0, 0.25)).toBe('0.00');
  });
});

describe('data chart layout', () => {
  it('puts a negative bar below the baseline and a positive one above it', () => {
    const diagram = chartOf({ series: [{ id: 'a', label: bi('', ''), values: [4, -2, 1] }] });
    const layout = chartLayout(diagram, diagram.chart!, 480, 'en');
    const [up, down] = layout.bars;
    expect(up.y + up.h).toBeCloseTo(layout.baseline);
    expect(down.y).toBeCloseTo(layout.baseline);
    expect(layout.baseline).toBeGreaterThan(layout.plot.top);
    expect(layout.baseline).toBeLessThan(layout.plot.bottom);
  });

  it('never overlaps two bars, and keeps every bar inside the plot', () => {
    for (let count = 1; count <= MAX_CHART_SERIES; count += 1) {
      const series = Array.from({ length: count }, (_, s) => ({ id: `s${s}`, label: bi(`S${s}`, `S${s}`), values: [1, 2, 3, 4, 5, 6] }));
      const categories = Array.from({ length: 6 }, (_, c) => bi(`C${c}`, `C${c}`));
      const diagram = chartOf({ series, categories });
      const layout = chartLayout(diagram, diagram.chart!, 400, 'en');
      expect(layout.bars).toHaveLength(count * 6);
      for (const [i, a] of layout.bars.entries()) {
        expect(a.x).toBeGreaterThanOrEqual(layout.plot.left);
        expect(a.x + a.w).toBeLessThanOrEqual(layout.plot.right + 1e-6);
        for (const b of layout.bars.slice(i + 1)) expect(overlaps(a, b)).toBe(false);
      }
    }
  });

  it('shows a legend only with two series or more', () => {
    const one = chartOf({});
    expect(chartLayout(one, one.chart!, 480, 'en').legend).toHaveLength(0);
    expect(diagramSvg(one, { ...diagramSize(one, 480, 'en'), language: 'en' })).not.toContain('data-chart-legend');
    const two = buildFromTemplate('bar-chart');
    expect(chartLayout(two, two.chart!, 480, 'en').legend).toHaveLength(2);
    expect(diagramSvg(two, { ...diagramSize(two, 480, 'en'), language: 'en' }).match(/data-chart-legend=/g)).toHaveLength(2);
  });

  it('draws no bar for a missing figure, and breaks the line there', () => {
    const bars = chartOf({ series: [{ id: 'a', label: bi('', ''), values: [3, null, 5] }] });
    expect(diagramSvg(bars, { ...diagramSize(bars, 480, 'en'), language: 'en' }).match(/data-chart-bar=/g)).toHaveLength(2);
    const line = chartOf({ kind: 'line', series: [{ id: 'a', label: bi('', ''), values: [3, null, 5] }] });
    const svg = diagramSvg(line, { ...diagramSize(line, 480, 'en'), language: 'en' });
    const path = svg.match(/<path d="([^"]*)"[^>]*data-chart-line=""/)![1];
    expect(path.match(/M /g)).toHaveLength(2);
    expect(svg.match(/data-chart-marker=/g)).toHaveLength(2);
  });

  it('tells the line series apart by dash and marker', () => {
    const diagram = buildFromTemplate('line-chart');
    const svg = diagramSvg(diagram, { ...diagramSize(diagram, 480, 'en'), language: 'en' });
    const lines = svg.match(/<path [^>]*data-chart-line=""/g)!;
    expect(lines).toHaveLength(2);
    expect(lines[0]).not.toContain('stroke-dasharray');
    expect(lines[1]).toContain('stroke-dasharray');
    expect(svg).toContain('<rect x="'); // square markers for series 1
    expect(svg).toContain('<circle '); // round markers for series 2
  });

  it('is measured: a title, two-line labels or a legend make it taller', () => {
    const plain = chartOf({});
    const titled = chartOf({}, 'Figure 1');
    const base = diagramSize(plain, 480, 'en').heightPx;
    expect(diagramSize(titled, 480, 'en').heightPx).toBeGreaterThan(base);
    const long = chartOf({ categories: [bi('A very long category name indeed', ''), bi('2023', ''), bi('2024', '')] });
    expect(diagramSize(long, 300, 'en').heightPx).toBeGreaterThan(diagramSize(plain, 300, 'en').heightPx);
    const block = createDiagramBlock('bar-chart');
    expect({ widthPx: block.widthPx, heightPx: block.heightPx }).toEqual(diagramSize(block.diagram, block.widthPx, 'bilingual'));
  });

  it('prints the language asked for', () => {
    const diagram = buildFromTemplate('bar-chart');
    const en = diagramSvg(diagram, { ...diagramSize(diagram, 480, 'en'), language: 'en' });
    const zh = diagramSvg(diagram, { ...diagramSize(diagram, 480, 'zh'), language: 'zh' });
    expect(en).toContain('Country A');
    expect(en).not.toContain('A國');
    expect(zh).toContain('A國');
    expect(zh).toContain('實質本地生產總值增長率');
  });

  it('escapes what a teacher types', () => {
    const diagram = chartOf({
      categories: [bi('<script>alert(1)</script>', '')],
      series: [{ id: 'a', label: bi('"><img src=x onerror=alert(1)>', ''), values: [1] }, { id: 'b', label: bi('&', ''), values: [2] }],
      yTitle: bi('<b>unit</b>', ''),
    });
    const svg = diagramSvg(diagram, { ...diagramSize(diagram, 480, 'en'), language: 'en' });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<img');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('survives a malformed stored chart', () => {
    const diagram = chartOf({ series: [{ id: 'a', label: bi('', ''), values: ['x' as unknown as number, Infinity, 4] }] });
    const svg = diagramSvg(diagram, { ...diagramSize(diagram, 480, 'en'), language: 'en' });
    expect(svg.match(/data-chart-bar=/g)).toHaveLength(1);
    const empty = chartOf({ categories: [], series: [] });
    expect(() => diagramSvg(empty, { ...diagramSize(empty, 480, 'en'), language: 'en' })).not.toThrow();
  });
});

describe('the data chart in a document', () => {
  it('opens no canvas and draws no answer layer', () => {
    for (const id of ['bar-chart', 'line-chart']) {
      const diagram = buildFromTemplate(id);
      expect(isPanelOnlyDiagram(diagram)).toBe(true);
      expect(hasAnswerLayer(diagram)).toBe(false);
    }
  });

  it('is inserted wide enough for its labels and legend', () => {
    expect(createDiagramBlock('bar-chart').widthPx).toBe(DATA_CHART_WIDTH_PX);
    expect(createDiagramBlock('line-chart').widthPx).toBe(DATA_CHART_WIDTH_PX);
  });

  it('writes schema 3 wherever it sits, and only then', () => {
    const worksheet = createWorksheet();
    const question = createStructuredQuestion();
    const part = createPart();
    question.parts = [part];
    worksheet.questions = [question];
    worksheet.flow = [{ type: 'question', id: question.id }];
    expect(serializeWorksheet(worksheet).schemaVersion).toBe(1);
    const source = createSourceBlock('A');
    source.blocks = [createDiagramBlock('line-chart')];
    part.blocks = [source];
    expect(serializeWorksheet(worksheet).schemaVersion).toBe(3);
    part.blocks = [createDiagramBlock('pie')];
    expect(serializeWorksheet(worksheet).schemaVersion).toBe(1);
  });

  it('saves a graph of one at schema 3 too', () => {
    expect(serializeGraph(createGraph('bar-chart')).schemaVersion).toBe(3);
  });
});
