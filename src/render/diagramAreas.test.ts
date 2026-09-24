import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import frozen from './diagramCorpus.frozen.json';
import { migrate } from '@/model/migrations';
import { presetArea } from '@/model/diagramAreas';
import { buildFromTemplate } from '@/model/diagramTemplates';
import type { Diagram } from '@/model/diagram';
import type { DiagramBlock } from '@/model/types';
import { areaLabelAnchor, diagramPlot, diagramSvg } from './diagram';

const SIZE = { widthPx: 400, heightPx: 320 };

function shaded(fill?: 'shade' | 'hatch'): Diagram {
  const diagram = buildFromTemplate('supply-demand');
  const [demand, supply] = diagram.curves;
  const area = presetArea('consumerSurplus', { demand: demand.id, supply: supply.id }, 'cs')!;
  return { ...diagram, areas: [{ ...area, fill }] };
}

describe('shaded areas in the SVG', () => {
  it('fills the region with the grey tint, under the axes and curves', () => {
    const svg = diagramSvg(shaded(), { ...SIZE, language: 'en' });
    const fill = svg.indexOf('fill="#d9d9d9"');
    expect(fill).toBeGreaterThan(0);
    // Drawn before the axes (their first arrowhead follows the x-axis line).
    expect(fill).toBeLessThan(svg.indexOf('data-arrowhead'));
    // The label prints on top, after everything else.
    expect(svg.lastIndexOf('>CS</tspan>')).toBeGreaterThan(svg.lastIndexOf('stroke-linecap="round"'));
  });

  it('hatches with plain clipped lines — no pattern ids to collide on the page', () => {
    const svg = diagramSvg(shaded('hatch'), { ...SIZE, language: 'en' });
    expect(svg).not.toContain('<pattern');
    expect(svg).not.toContain('#d9d9d9');
    const hatch = svg.match(/<path d="([^"]+)" fill="none" stroke="#000" stroke-width="0.8"/);
    expect(hatch).not.toBeNull();
    expect((hatch![1].match(/M /g) ?? []).length).toBeGreaterThan(5);
    // Letters on hatching get the white halo.
    expect(svg).toContain('paint-order:stroke');
  });

  it('scales with the export raster like every other stroke', () => {
    const svg = diagramSvg(shaded('hatch'), { ...SIZE, language: 'en', scale: 3 });
    expect(svg).toContain('stroke-width="2.4"');
  });

  it('places the label at the region centroid, nudged by its offset', () => {
    const diagram = shaded();
    const proj = diagramPlot(diagram, { ...SIZE, language: 'en' });
    const base = areaLabelAnchor(diagram, diagram.areas![0], proj)!;
    // The CS triangle (0.08,0.88)–(0.47,0.5)–(0.08,0.5): centroid at its mean.
    expect(base.x).toBeCloseTo(proj.px((0.08 + 0.47 + 0.08) / 3), 6);
    expect(base.y).toBeCloseTo(proj.py((0.88 + 0.5 + 0.5) / 3), 6);
    const nudged = { ...diagram.areas![0], labelOffset: { x: 0.1, y: 0.1 } };
    const moved = areaLabelAnchor(diagram, nudged, proj)!;
    expect(moved.x).toBeGreaterThan(base.x);
    expect(moved.y).toBeLessThan(base.y);
  });

  it('draws nothing for an area whose references are gone', () => {
    const diagram = shaded();
    const orphan = { ...diagram, curves: [] };
    expect(diagramSvg(orphan, { ...SIZE, language: 'en' })).not.toContain('#d9d9d9');
  });
});

describe('a diagram saved by the published build renders unchanged', () => {
  it('matches the SVG frozen before shaded areas existed, in every language and scale', () => {
    // `diagramCorpus.frozen.json` was written by the build *before* areas were added,
    // from the frozen v1 corpus. Never regenerate it to make this pass. Re-frozen once,
    // 2026-09-25, when arrowheads became triangles instead of `<marker>`s — after a
    // Chrome raster diff showed the two renderings match (at most a 1px base edge).
    const worksheet = migrate(structuredClone(v1Corpus));
    const blocks = worksheet.questions
      .flatMap((question) => question.blocks)
      .filter((block): block is DiagramBlock => block.kind === 'diagram');
    const expected = frozen as Record<string, string>;
    expect(blocks.length).toBeGreaterThan(0);
    let compared = 0;
    for (const block of blocks) {
      for (const language of ['en', 'zh', 'bilingual'] as const) {
        for (const scale of [1, 3]) {
          const key = `${block.id}|${language}|${scale}`;
          const svg = diagramSvg(block.diagram, {
            widthPx: block.widthPx,
            heightPx: block.heightPx,
            language,
            fonts: worksheet.fonts,
            scale,
          });
          expect(svg, key).toBe(expected[key]);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(Object.keys(expected).length);
  });
});
