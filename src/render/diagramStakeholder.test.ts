import { describe, expect, it } from 'vitest';
import { buildFromTemplate } from '@/model/diagramTemplates';
import {
  isPanelOnlyDiagram,
  MAX_STAKEHOLDERS,
  type Diagram,
  type StakeholderBox,
  MAX_CHART_SERIES,
  type DataChart,
} from '@/model/diagram';
import { hasAnswerLayer } from '@/model/diagramAnswers';
import {
  createDiagramBlock,
  createSourceWith,
  createStructuredQuestion,
  createPart,
  createWorksheet,
  STAKEHOLDER_DIAGRAM_WIDTH_PX,
  createSourceBlock,
  DATA_CHART_WIDTH_PX,
} from '@/model/factories';
import { CURRENT_SCHEMA_VERSION, serializeWorksheet, writtenSchemaVersion } from '@/model/migrations';
import { createGraph, serializeGraph } from '@/model/graph';
import { bi } from '@/model/text';
import type { LanguageMode } from '@/model/types';
import {
  diagramSize,
  diagramSvg,
  stakeholderCells,
  stakeholderChartLayout,
  chartLayout,
  chartScale,
  chartTickLabel,
} from './diagram';

/** The stakeholder diagram (k-0469): a derived layout, drawn by the one diagram pipeline. */

const box = (i: number, view = `View number ${i} about the issue.`): StakeholderBox => ({
  id: `s${i}`,
  label: bi(`Stakeholder ${i}`, `持份者${i}`),
  view: bi(view, `意見${i}`),
});

function chartOf(count: number, links?: 'fromIssue' | 'toIssue' | 'lines'): Diagram {
  const base = buildFromTemplate('stakeholders');
  return {
    ...base,
    stakeholder: {
      issue: bi('Raising the statutory minimum wage', '調高法定最低工資'),
      stakeholders: Array.from({ length: count }, (_, i) => box(i + 1)),
      ...(links ? { links } : {}),
    },
  };
}

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('stakeholder diagram layout', () => {
  it('gives each count a distinct set of the eight cells around the issue', () => {
    for (let count = 0; count <= MAX_STAKEHOLDERS; count += 1) {
      const cells = stakeholderCells(count);
      expect(cells).toHaveLength(count);
      const keys = cells.map(([row, col]) => `${row}${col}`);
      expect(new Set(keys).size).toBe(count);
      expect(keys).not.toContain('11');
    }
  });

  it('never overlaps two boxes, and keeps every box inside the figure', () => {
    for (const language of ['en', 'zh', 'bilingual'] as LanguageMode[]) {
      for (const width of [300, 520, 640]) {
        for (let count = 0; count <= MAX_STAKEHOLDERS; count += 1) {
          const diagram = chartOf(count);
          const layout = stakeholderChartLayout(diagram, diagram.stakeholder!, width, language);
          const all = [layout.issue, ...layout.boxes];
          for (const [i, a] of all.entries()) {
            expect(a.x, `${language} ${width} ${count}`).toBeGreaterThanOrEqual(0);
            expect(a.y).toBeGreaterThanOrEqual(0);
            expect(a.x + a.w).toBeLessThanOrEqual(layout.width + 0.001);
            expect(a.y + a.h).toBeLessThanOrEqual(layout.height + 0.001);
            for (const b of all.slice(i + 1)) expect(overlaps(a, b), `${language} ${width} ${count}`).toBe(false);
          }
          expect(layout.links).toHaveLength(count);
        }
      }
    }
  });

  it('is measured: the block size is the layout, and more words make it taller', () => {
    const short = chartOf(4);
    const long = chartOf(4);
    long.stakeholder!.stakeholders[0] = box(1, 'A much longer view that has to wrap onto several lines inside its box.');
    const a = diagramSize(short, 520, 'en');
    const b = diagramSize(long, 520, 'en');
    expect(a.widthPx).toBe(520);
    expect(a.heightPx).toBe(Math.round(stakeholderChartLayout(short, short.stakeholder!, 520, 'en').height));
    expect(b.heightPx).toBeGreaterThan(a.heightPx);
  });

  it('never starts a Chinese line with closing punctuation', () => {
    const diagram = chartOf(5);
    diagram.stakeholder!.stakeholders[1] = { id: 'e', label: bi('', '僱主'), view: bi('', '我們的工資成本會上升。') };
    for (let width = 240; width <= 640; width += 4) {
      const layout = stakeholderChartLayout(diagram, diagram.stakeholder!, width, 'zh');
      for (const box of layout.boxes) {
        for (const line of [...box.boldLines, ...box.lines]) {
          expect(line.map((run) => run.text).join(''), `width ${width}`).not.toMatch(/^[。，、；：？！」』）]/);
        }
      }
    }
  });

  it('draws at most eight boxes', () => {
    const diagram = chartOf(MAX_STAKEHOLDERS + 2);
    const size = diagramSize(diagram, 520, 'en');
    const svg = diagramSvg(diagram, { ...size, language: 'en' });
    expect(svg.match(/data-stakeholder=""/g)).toHaveLength(MAX_STAKEHOLDERS);
  });

  it('draws an empty chart as the issue box alone', () => {
    const diagram: Diagram = { ...chartOf(0), stakeholder: { issue: bi('', ''), stakeholders: [] } };
    const size = diagramSize(diagram, 520, 'en');
    const svg = diagramSvg(diagram, { ...size, language: 'en' });
    expect(svg).toContain('data-stakeholder-issue=""');
    expect(svg).not.toContain('data-stakeholder=""');
    expect(size.heightPx).toBeGreaterThan(0);
  });
});

describe('stakeholder diagram drawing', () => {
  const heads = (diagram: Diagram) => {
    const size = diagramSize(diagram, 520, 'en');
    return (diagramSvg(diagram, { ...size, language: 'en' }).match(/data-arrowhead=""/g) ?? []).length;
  };

  it('puts one arrowhead on each link, or none for plain lines', () => {
    expect(heads(chartOf(5))).toBe(5);
    expect(heads(chartOf(5, 'toIssue'))).toBe(5);
    expect(heads(chartOf(5, 'lines'))).toBe(0);
  });

  it('points from the issue by default, and at the issue when asked', () => {
    const diagram = chartOf(1);
    const layout = stakeholderChartLayout(diagram, diagram.stakeholder!, 520, 'en');
    const link = layout.links[0];
    const tipOf = (svg: string) => {
      const d = /<path d="M [\d.-]+ [\d.-]+ L ([\d.-]+) ([\d.-]+)/.exec(svg.slice(svg.indexOf('data-arrowhead') - 200))!;
      return { x: Number(d[1]), y: Number(d[2]) };
    };
    const size = diagramSize(diagram, 520, 'en');
    const out = tipOf(diagramSvg(diagram, { ...size, language: 'en' }));
    const into = tipOf(diagramSvg({ ...diagram, stakeholder: { ...diagram.stakeholder!, links: 'toIssue' } }, { ...size, language: 'en' }));
    // The only box sits above the issue: out points up to it, into points down.
    expect(Math.abs(out.y - link.to.y)).toBeLessThan(3);
    expect(Math.abs(into.y - link.from.y)).toBeLessThan(3);
  });

  it('prints the language asked for, names in bold', () => {
    const diagram = chartOf(2);
    const size = diagramSize(diagram, 520, 'bilingual');
    const en = diagramSvg(diagram, { ...size, language: 'en' });
    const zh = diagramSvg(diagram, { ...size, language: 'zh' });
    const both = diagramSvg(diagram, { ...size, language: 'bilingual' });
    expect(en).toContain('Stakeholder 1');
    expect(en).not.toContain('持份者1');
    expect(zh).toContain('持份者1');
    expect(both).toContain('Stakeholder 1');
    expect(both).toContain('持份者1');
    expect(en).toMatch(/font-weight:bold[^>]*>[^<]*(<tspan[^>]*>)?Stakeholder 1/);
  });

  it('escapes what a teacher types', () => {
    const diagram = chartOf(1);
    diagram.stakeholder!.stakeholders[0].label = bi('<script>alert(1)</script>', '');
    diagram.stakeholder!.issue = bi('A & B "quoted"', '');
    const size = diagramSize(diagram, 520, 'en');
    const svg = diagramSvg(diagram, { ...size, language: 'en' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('A &amp; B');
  });
});

describe('the stakeholder diagram in a document', () => {
  it('opens no canvas and draws no answer layer', () => {
    const diagram = buildFromTemplate('stakeholders');
    expect(isPanelOnlyDiagram(diagram)).toBe(true);
    expect(isPanelOnlyDiagram(buildFromTemplate('supply-demand'))).toBe(false);
    expect(hasAnswerLayer(diagram)).toBe(false);
  });

  it('is inserted wide enough for three columns, and centred inside a source', () => {
    expect(createDiagramBlock('stakeholders').widthPx).toBe(STAKEHOLDER_DIAGRAM_WIDTH_PX);
    expect(createDiagramBlock('supply-demand').widthPx).toBe(400);
    const source = createSourceWith('stakeholders', 'B');
    expect(source.label?.en[0].text).toBe('Source B: ');
    expect(source.blocks).toHaveLength(1);
    expect(source.blocks[0]).toMatchObject({ kind: 'diagram', align: 'center' });
    expect(createSourceWith('table').blocks[0].kind).toBe('table');
    expect(createSourceWith('text').blocks[0].kind).toBe('paragraph');
  });

  it('writes schema 3 wherever it sits, and only then', () => {
    const worksheet = createWorksheet();
    const question = createStructuredQuestion();
    const part = createPart();
    question.parts = [part];
    worksheet.questions = [question];
    worksheet.flow = [{ type: 'question', id: question.id }];
    expect(serializeWorksheet(worksheet).schemaVersion).toBe(1);
    // A table in a source alone changes nothing an older build prints.
    question.blocks = [createSourceWith('table')];
    expect(serializeWorksheet(worksheet).schemaVersion).toBe(1);
    // Deep inside a part's source.
    part.blocks = [createSourceWith('stakeholders')];
    expect(serializeWorksheet(worksheet).schemaVersion).toBe(3);
    // A newer build's own version is still kept.
    expect(writtenSchemaVersion(CURRENT_SCHEMA_VERSION + 1, {})).toBe(CURRENT_SCHEMA_VERSION + 1);
  });

  it('saves a graph of one at schema 3 too', () => {
    expect(serializeGraph(createGraph('stakeholders')).schemaVersion).toBe(3);
    expect(serializeGraph(createGraph('pie')).schemaVersion).toBe(1);
  });
});

/** The data chart (k-0474): bars or lines from a small table, drawn by the one diagram pipeline. */

function chartOfCh(chart: Partial<DataChart>, title?: string): Diagram {
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

const overlapsCh = (a: Rect, b: Rect) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h && b.y < a.y + a.h;

describe('data chart scale', () => {
  it('counts in round steps through zero', () => {
    expect(chartScale(chartOfCh({}).chart!)).toEqual({ min: 0, max: 8, step: 2 });
    const negative = chartScale(chartOfCh({ series: [{ id: 'a', label: bi('', ''), values: [12000, -85000] }] }).chart!);
    expect(negative.min).toBeLessThan(-85000);
    expect(negative.max).toBeGreaterThanOrEqual(12000);
    expect([1, 2, 2.5, 5].some((k) => Math.abs(negative.step / 10 ** Math.floor(Math.log10(negative.step)) - k) < 1e-9)).toBe(true);
  });

  it('lets a line chart of figures far from zero start above it, never a bar chart', () => {
    const series = [{ id: 'a', label: bi('', ''), values: [110, 125, 140] }];
    expect(chartScale(chartOfCh({ kind: 'line', series }).chart!).min).toBeGreaterThan(0);
    expect(chartScale(chartOfCh({ kind: 'bar', series }).chart!).min).toBe(0);
  });

  it('obeys a pinned range and step', () => {
    expect(chartScale(chartOfCh({ yMin: -10, yMax: 20, yStep: 5 }).chart!)).toEqual({ min: -10, max: 20, step: 5 });
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
    const diagram = chartOfCh({ series: [{ id: 'a', label: bi('', ''), values: [4, -2, 1] }] });
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
      const diagram = chartOfCh({ series, categories });
      const layout = chartLayout(diagram, diagram.chart!, 400, 'en');
      expect(layout.bars).toHaveLength(count * 6);
      for (const [i, a] of layout.bars.entries()) {
        expect(a.x).toBeGreaterThanOrEqual(layout.plot.left);
        expect(a.x + a.w).toBeLessThanOrEqual(layout.plot.right + 1e-6);
        for (const b of layout.bars.slice(i + 1)) expect(overlapsCh(a, b)).toBe(false);
      }
    }
  });

  it('shows a legend only with two series or more', () => {
    const one = chartOfCh({});
    expect(chartLayout(one, one.chart!, 480, 'en').legend).toHaveLength(0);
    expect(diagramSvg(one, { ...diagramSize(one, 480, 'en'), language: 'en' })).not.toContain('data-chart-legend');
    const two = buildFromTemplate('bar-chart');
    expect(chartLayout(two, two.chart!, 480, 'en').legend).toHaveLength(2);
    expect(diagramSvg(two, { ...diagramSize(two, 480, 'en'), language: 'en' }).match(/data-chart-legend=/g)).toHaveLength(2);
  });

  it('draws no bar for a missing figure, and breaks the line there', () => {
    const bars = chartOfCh({ series: [{ id: 'a', label: bi('', ''), values: [3, null, 5] }] });
    expect(diagramSvg(bars, { ...diagramSize(bars, 480, 'en'), language: 'en' }).match(/data-chart-bar=/g)).toHaveLength(2);
    const line = chartOfCh({ kind: 'line', series: [{ id: 'a', label: bi('', ''), values: [3, null, 5] }] });
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
    const plain = chartOfCh({});
    const titled = chartOfCh({}, 'Figure 1');
    const base = diagramSize(plain, 480, 'en').heightPx;
    expect(diagramSize(titled, 480, 'en').heightPx).toBeGreaterThan(base);
    const long = chartOfCh({ categories: [bi('A very long category name indeed', ''), bi('2023', ''), bi('2024', '')] });
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
    const diagram = chartOfCh({
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
    const diagram = chartOfCh({ series: [{ id: 'a', label: bi('', ''), values: ['x' as unknown as number, Infinity, 4] }] });
    const svg = diagramSvg(diagram, { ...diagramSize(diagram, 480, 'en'), language: 'en' });
    expect(svg.match(/data-chart-bar=/g)).toHaveLength(1);
    const empty = chartOfCh({ categories: [], series: [] });
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
