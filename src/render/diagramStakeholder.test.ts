import { describe, expect, it } from 'vitest';
import { buildFromTemplate } from '@/model/diagramTemplates';
import { isPanelOnlyDiagram, MAX_STAKEHOLDERS, type Diagram, type StakeholderBox } from '@/model/diagram';
import { hasAnswerLayer } from '@/model/diagramAnswers';
import { createDiagramBlock, createSourceWith, createStructuredQuestion, createPart, createWorksheet, STAKEHOLDER_DIAGRAM_WIDTH_PX } from '@/model/factories';
import { serializeWorksheet, writtenSchemaVersion } from '@/model/migrations';
import { createGraph, serializeGraph } from '@/model/graph';
import { bi } from '@/model/text';
import type { LanguageMode } from '@/model/types';
import { diagramSize, diagramSvg, stakeholderCells, stakeholderChartLayout } from './diagram';

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
    expect(writtenSchemaVersion(4, {})).toBe(4);
  });

  it('saves a graph of one at schema 3 too', () => {
    expect(serializeGraph(createGraph('stakeholders')).schemaVersion).toBe(3);
    expect(serializeGraph(createGraph('pie')).schemaVersion).toBe(1);
  });
});
