import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramCurve, DiagramSpan } from '@/model/diagram';
import { resolveDiagram } from '@/model/diagramAnchors';
import { applyDrag, hitTest } from '@/model/diagramDraw';
import { draggedSpanOffset, isShiftWedge, spanGeometry } from '@/model/diagramSpans';
import { buildFromTemplate } from '@/model/diagramTemplates';
import { axisSpanClearance, axisTickAnchor, diagramPlot, diagramSize, diagramSvg } from './diagram';
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
  it('projects onto an axis; the offset is measured outward from the rest past the labels', () => {
    const diagram = resolveDiagram(taxDiagram([]));
    const span: DiagramSpan = { id: 'p', from: { x: 0.5, y: 0.4 }, to: { point: 'e1' }, style: 'arrow', along: 'y', offset: 0.03 };
    const g = spanGeometry(diagram, span)!;
    expect(g.base[0]).toEqual({ x: 0, y: 0.4 });
    expect(g.base[1].x).toBe(0);
    expect(g.base[1].y).toBeCloseTo(0.6, 9);
    expect(g.ends[0].x).toBeCloseTo(-0.03, 9);
    expect(g.side).toEqual({ x: -1, y: 0 });
    // The renderer's clearance adds on top; a negative total turns the span inward.
    const moved = spanGeometry(diagram, span, () => 0.1)!;
    expect(moved.ends[0].x).toBeCloseTo(-0.13, 9);
    const inward = spanGeometry(diagram, { ...span, offset: -0.2 }, () => 0.1)!;
    expect(inward.ends[0].x).toBeCloseTo(0.1, 9);
    expect(inward.side.x).toBe(1);
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

/** E₀ (D × S₀) → E₁ (D × S₁), each with P and Q ticks, and the two axis arrows between them. */
const shiftDiagram = (spans: DiagramSpan[]): Diagram => {
  const d = taxDiagram(spans);
  const tick = (base: string, n: string) => ({ en: [{ text: base }, { text: n, vertAlign: 'subscript' as const }], zh: [] });
  d.points = [
    { id: 'e0', at: { x: 0, y: 0 }, anchor: { cross: ['d', 's0'] }, dot: true, xTickLabel: tick('Q', '0'), yTickLabel: tick('P', '0') },
    { id: 'e1', at: { x: 0, y: 0 }, anchor: { cross: ['d', 's1'] }, dot: true, xTickLabel: tick('Q', '1'), yTickLabel: tick('P', '1') },
  ];
  return resolveDiagram(d);
};
const qArrow: DiagramSpan = { id: 'q', from: { point: 'e0' }, to: { point: 'e1' }, style: 'arrow', along: 'x' };
const pArrow: DiagramSpan = { id: 'p', from: { point: 'e0' }, to: { point: 'e1' }, style: 'arrow', along: 'y' };

describe('axis spans rest outside the axes, past the tick labels', () => {
  const FONT = (10 * 96) / 72;

  it('a Q arrow sits under the Q labels and a P arrow left of the P labels, heads clear of both', () => {
    const diagram = shiftDiagram([qArrow, pArrow]);
    const proj = diagramPlot(diagram, OPTIONS);
    const clear = axisSpanClearance(diagram, proj, 1, 'en');
    const q = spanLayout(diagram, qArrow, proj, 1, clear)!;
    const p = spanLayout(diagram, pArrow, proj, 1, clear)!;
    // Q labels hang from `plot.bottom + 4` and are one line tall; the head reaches 5px.
    const qLabelBottom = proj.plot.bottom + 4 + FONT;
    expect(q.lines[0][0].y - 5).toBeGreaterThan(qLabelBottom);
    // Q₀ Q₁ are ~12.6px wide, right-aligned 6px left of the axis.
    const pLabelLeft = proj.plot.left - 6 - FONT * (0.55 + 0.4);
    expect(p.lines[0][0].x + 5).toBeLessThan(pLabelLeft);
    // Still exactly from the old value to the new, head at the new.
    expect(q.lines[0][0].x).toBeCloseTo(proj.px(diagram.points[0].at.x), 6);
    expect(q.heads[0].end.x).toBeCloseTo(proj.px(diagram.points[1].at.x), 6);
    expect(p.heads[0].end.y).toBeCloseTo(proj.py(diagram.points[1].at.y), 6);
  });

  it('a stored offset moves it further out (positive) or back in (negative)', () => {
    const diagram = shiftDiagram([qArrow]);
    const proj = diagramPlot(diagram, OPTIONS);
    const clear = axisSpanClearance(diagram, proj, 1, 'en');
    const y = (offset?: number) => spanLayout(diagram, { ...qArrow, offset }, proj, 1, clear)!.lines[0][0].y;
    expect(y(0.05)).toBeGreaterThan(y());
    expect(y(-0.05)).toBeLessThan(y());
    expect(y(-0.2)).toBeLessThan(proj.plot.bottom);
  });

  it('the measured canvas makes room for a labelled span, so nothing clips at the edge', () => {
    const label = { en: [{ text: 'shortage' }], zh: [] };
    const bare = shiftDiagram([]);
    const labelled = shiftDiagram([{ ...qArrow, style: 'bracket', label }, { ...pArrow, style: 'bracket', label }]);
    const before = diagramSize(bare, 400, 'en');
    const after = diagramSize(labelled, 400, 'en');
    expect(after.heightPx - diagramPlot(labelled, { ...after, language: "en" }).plot.bottom).toBeGreaterThan(46);
    const options = { ...after, language: 'en' as const };
    const proj = diagramPlot(labelled, options);
    expect(proj.plot.left).toBeGreaterThan(diagramPlot(bare, { ...before, language: 'en' }).plot.left);
    const clear = axisSpanClearance(labelled, proj, 1, 'en');
    const q = spanLayout(labelled, labelled.spans![0], proj, 1, clear)!;
    const p = spanLayout(labelled, labelled.spans![1], proj, 1, clear)!;
    expect(q.label.y + FONT).toBeLessThanOrEqual(after.heightPx);
    expect(p.label.x - FONT * 0.55 * 8).toBeGreaterThanOrEqual(0);
  });

  it('an unlabelled pair of axis arrows fits the ordinary pads', () => {
    const bare = shiftDiagram([]);
    expect(diagramSize(shiftDiagram([qArrow, pArrow]), 400, 'en')).toEqual(diagramSize(bare, 400, 'en'));
  });

  it('the canvas hits the span where it is drawn, and a downward drag moves a Q arrow out', () => {
    const diagram = shiftDiagram([qArrow]);
    const proj = diagramPlot(diagram, OPTIONS);
    const clear = axisSpanClearance(diagram, proj, 1, 'en');
    const shaft = spanLayout(diagram, qArrow, proj, 1, clear)!.lines[0];
    const mid = { x: proj.ux((shaft[0].x + shaft[1].x) / 2), y: proj.uy(shaft[0].y) };
    expect(hitTest(diagram, mid, 0.01, [], clear)).toEqual({ kind: 'span', spanId: 'q' });
    expect(draggedSpanOffset(diagram, qArrow, 0, -0.04)).toBeCloseTo(0.04, 9);
  });

  it('an x tick label under the axis arrowhead drops clear of it', () => {
    const proj = diagramPlot(shiftDiagram([]), OPTIONS);
    expect(axisTickAnchor({ at: 0.5 }, 'x', proj, 1, 20).y).toBe(proj.plot.bottom + 4);
    expect(axisTickAnchor({ at: 1 }, 'x', proj, 1, 20).y).toBeGreaterThan(proj.plot.bottom + 5);
    expect(axisTickAnchor({ at: 0.5 }, 'y', proj, 1).x).toBe(proj.plot.left - 6);
  });
});

describe('a tax or subsidy wedge is an arrow from S₀ to S₁', () => {
  const wedgeOf = (d: Diagram) => {
    const span = d.spans!.find((s) => isShiftWedge(d, s))!;
    const proj = diagramPlot(d, OPTIONS);
    return spanLayout(d, span, proj, 1)!;
  };
  /** Screen y grows downward: an upward arrow's head has the smaller y. */
  const pointsUp = (layout: ReturnType<typeof wedgeOf>) => layout.heads[0].end.y < layout.heads[0].from.y;

  it('points up under a tax and down under a subsidy, head on S₁', () => {
    const tax = buildFromTemplate('per-unit-tax');
    const subsidy = buildFromTemplate('per-unit-subsidy');
    expect(wedgeOf(tax).heads).toHaveLength(1);
    expect(pointsUp(wedgeOf(tax))).toBe(true);
    expect(pointsUp(wedgeOf(subsidy))).toBe(false);
    const s1 = tax.curves.find((c) => c.derive?.kind === 'shift')!;
    const span = tax.spans!.find((s) => isShiftWedge(tax, s))!;
    expect(span.to).toMatchObject({ on: s1.id });
  });

  it('flips when S₁ is dragged from above S₀ to below it', () => {
    const tax = buildFromTemplate('per-unit-tax');
    const s1 = tax.curves.find((c) => c.derive?.kind === 'shift')!;
    const below = resolveDiagram(applyDrag(tax, { kind: 'curve', curveId: s1.id }, { x: 0, y: 0 }, { x: 0, y: -0.45 }));
    expect(below.curves.find((c) => c.id === s1.id)!.derive).toMatchObject({ kind: 'shift' });
    expect(pointsUp(wedgeOf(below))).toBe(false);
  });

  it('is drawn as an arrow whatever style it was saved with; other spans keep theirs', () => {
    const tax = buildFromTemplate('per-unit-tax');
    const asDimension = { ...tax, spans: tax.spans!.map((s) => (isShiftWedge(tax, s) ? { ...s, style: 'dimension' as const } : s)) };
    expect(wedgeOf(asDimension).heads).toHaveLength(1);
    expect(wedgeOf(asDimension).lines).toHaveLength(1);
    const reversed = { ...tax, spans: tax.spans!.map((s) => (isShiftWedge(tax, s) ? { ...s, from: s.to, to: s.from } : s)) };
    expect(pointsUp(wedgeOf(reversed))).toBe(true);
    expect(isShiftWedge(tax, { id: 'b', from: { x: 0.2, y: 0.2 }, to: { x: 0.5, y: 0.2 }, style: 'bracket' })).toBe(false);
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
