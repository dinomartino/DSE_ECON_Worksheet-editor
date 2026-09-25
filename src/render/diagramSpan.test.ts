import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramCurve, DiagramSpan } from '@/model/diagram';
import { resolveDiagram } from '@/model/diagramAnchors';
import { spanGeometry } from '@/model/diagramSpans';
import { diagramPlot, diagramSvg } from './diagram';
import { spanLayout } from './diagramSpan';

const line = (id: string, a: [number, number], b: [number, number], extra: Partial<DiagramCurve> = {}): DiagramCurve => ({
  id,
  points: [
    { x: a[0], y: a[1] },
    { x: b[0], y: b[1] },
  ],
  shape: 'straight',
  ...extra,
});

/** A per-unit tax: S₀, S₁ = S₀ + 0.2, D; E₁ anchored where D meets S₁. */
const taxDiagram = (spans: DiagramSpan[]): Diagram => ({
  x: { title: { en: [{ text: 'Quantity' }], zh: [] } },
  y: { title: { en: [{ text: 'Price' }], zh: [] } },
  curves: [line('d', [0, 0.9], [0.9, 0]), line('s0', [0, 0.1], [0.8, 0.9]), line('s1', [0, 0.3], [0.7, 1])],
  points: [{ id: 'e1', at: { x: 0, y: 0 }, anchor: { cross: ['d', 's1'] }, dot: true }],
  labels: [],
  arrows: [],
  spans,
});

const OPTIONS = { widthPx: 400, heightPx: 300, language: 'en' as const };

describe('span geometry', () => {
  it('projects onto an axis and offsets into the plot', () => {
    const diagram = resolveDiagram(taxDiagram([]));
    const span: DiagramSpan = { id: 'p', from: { x: 0.5, y: 0.4 }, to: { point: 'e1' }, style: 'arrow', along: 'y', offset: 0.03 };
    const g = spanGeometry(diagram, span)!;
    expect(g.base[0]).toEqual({ x: 0, y: 0.4 });
    expect(g.base[1].x).toBe(0);
    expect(g.base[1].y).toBeCloseTo(0.6, 9);
    expect(g.ends[0].x).toBeCloseTo(0.03, 9);
    expect(g.side).toEqual({ x: 1, y: 0 });
  });

  it('the tax wedge sits between S₀ and S₁ at the taxed quantity and follows a drag of S₁', () => {
    const wedge: DiagramSpan = {
      id: 't',
      from: { on: 's0', x: { point: 'e1' } },
      to: { point: 'e1' },
      style: 'dimension',
      label: { en: [{ text: 't' }], zh: [] },
    };
    const before = spanGeometry(resolveDiagram(taxDiagram([wedge])), wedge)!;
    expect(before.ends[1].y - before.ends[0].y).toBeCloseTo(0.2, 9);
    // S₁ raised further: the wedge grows with it, still measured at the new E₁.
    const raised = taxDiagram([wedge]);
    raised.curves[2] = line('s1', [0, 0.4], [0.6, 1]);
    const after = spanGeometry(resolveDiagram(raised), wedge)!;
    expect(after.ends[1].y - after.ends[0].y).toBeCloseTo(0.3, 9);
    expect(after.ends[0].x).toBeLessThan(before.ends[0].x);
  });

  it('a bracket’s ticks face back toward what it measures; the label sits on the offset side', () => {
    const diagram = resolveDiagram(taxDiagram([]));
    const proj = diagramPlot(diagram, OPTIONS);
    const bracket: DiagramSpan = { id: 'b', from: { x: 0.2, y: 0.3 }, to: { x: 0.6, y: 0.3 }, style: 'bracket', offset: -0.05 };
    const layout = spanLayout(diagram, bracket, proj, 1)!;
    const [shaft, tickA] = layout.lines;
    // Offset below the price line (screen y larger), ticks point up (screen y smaller).
    expect(shaft[0].y).toBeGreaterThan(proj.py(0.3));
    expect(tickA[1].y).toBeLessThan(tickA[0].y);
    expect(layout.label.y).toBeGreaterThan(shaft[0].y);
    expect(layout.heads).toHaveLength(0);
  });

  it('arrow styles draw heads: one for arrow, two for doubleArrow', () => {
    const diagram = resolveDiagram(taxDiagram([]));
    const proj = diagramPlot(diagram, OPTIONS);
    const at = (style: DiagramSpan['style']) =>
      spanLayout(diagram, { id: 'a', from: { x: 0.2, y: 0.2 }, to: { x: 0.5, y: 0.2 }, style }, proj, 1)!;
    expect(at('arrow').heads).toHaveLength(1);
    expect(at('doubleArrow').heads).toHaveLength(2);
    expect(at('dimension').lines).toHaveLength(3);
  });
});

describe('diagramSvg with relations', () => {
  it('draws spans inside the one SVG, with their labels', () => {
    const svg = diagramSvg(
      taxDiagram([
        { id: 't', from: { on: 's0', x: { point: 'e1' } }, to: { point: 'e1' }, style: 'dimension', label: { en: [{ text: 't' }], zh: [] } },
        { id: 'p', from: { cross: ['d', 's0'] }, to: { point: 'e1' }, style: 'arrow', along: 'y', offset: 0.03 },
      ]),
      OPTIONS,
    );
    expect(svg).toContain('>t</tspan>');
    // Axis ticks and heads: 2 axis heads + 1 span head.
    expect(svg.match(/data-arrowhead/g)).toHaveLength(3);
  });

  it('draws anchored points where their curves meet, whatever `at` says', () => {
    const svg = diagramSvg(taxDiagram([]), OPTIONS);
    const proj = diagramPlot(taxDiagram([]), OPTIONS);
    const e1 = resolveDiagram(taxDiagram([])).points[0].at;
    expect(svg).toContain(`cx="${Math.round(proj.px(e1.x) * 100) / 100}"`);
  });

  it('a resolved document reads the same to a build that ignores relations', () => {
    const resolved = resolveDiagram(taxDiagram([]));
    // What an older build sees: the stored geometry, relations stripped.
    const older = JSON.parse(JSON.stringify(resolved), (key, value) =>
      key === 'anchor' || key === 'derive' || key === 'spans' ? undefined : value,
    ) as Diagram;
    expect(diagramSvg(older, OPTIONS)).toBe(diagramSvg({ ...resolved, spans: [] }, OPTIONS));
  });

  it('prints a scaled axis tick’s value when its label is empty', () => {
    const diagram: Diagram = {
      ...taxDiagram([]),
      x: { max: 30, ticks: [{ id: 'q', at: 0.5, label: { en: [], zh: [] } }] },
    };
    expect(diagramSvg(diagram, OPTIONS)).toContain('>15</tspan>');
  });
});
