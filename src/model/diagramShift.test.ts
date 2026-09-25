import { describe, expect, it } from 'vitest';
import type { Diagram } from './diagram';
import { curveCrossing } from './diagramAreas';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from './diagramTemplates';
import { equilibriumLabelSide, nextEquilibriumName, shiftCurve, shiftedLabel, translateCurvePoints, withPointLabel } from './diagramShift';
import { plain } from './text';

const counter = () => {
  let n = 0;
  return () => `id${(n += 1)}`;
};

const flat = (runs: Array<{ text: string; vertAlign?: string }> | undefined) =>
  (runs ?? []).map((run) => (run.vertAlign === 'subscript' ? `_${run.text}` : run.text)).join('');

describe('shifting a curve', () => {
  it('copies demand to the right, names it D₁, and marks the new equilibrium', () => {
    const diagram = buildFromTemplate('supply-demand');
    const [demand, supply] = diagram.curves;
    const result = shiftCurve(diagram, demand.id, { x: 0.15, y: 0 }, counter())!;
    const copy = result.diagram.curves.find((c) => c.id === result.curveId)!;

    expect(flat(copy.label?.en)).toBe('D_1');
    expect(copy.points[0].x).toBeCloseTo(demand.points[0].x + 0.15, 9);

    // The new equilibrium is exactly where D₁ meets S — above and right of E₀.
    const mark = result.diagram.points.find((p) => p.id === result.pointId)!;
    const expected = curveCrossing(copy, supply)!;
    expect(mark.at.x).toBeCloseTo(expected.x, 9);
    expect(mark.at.y).toBeCloseTo(expected.y, 9);
    expect(mark.at.x).toBeGreaterThan(0.47);
    expect(mark.at.y).toBeGreaterThan(0.5);

    // The template's own convention for E₀: dashed drops to both axes, P and Q ticks.
    expect(mark.dropTo).toEqual(['x', 'y']);
    expect(mark.label).toBeUndefined(); // named on request only
    expect(flat(mark.xTickLabel?.en)).toBe('Q_1');
    expect(flat(mark.yTickLabel?.en)).toBe('P_1');

    // And a shift arrow pointing the way the curve moved.
    const arrow = result.diagram.arrows.at(-1)!;
    expect(arrow.to.x).toBeGreaterThan(arrow.from.x);
    expect(arrow.to.y).toBeCloseTo(arrow.from.y, 9);
  });

  it('shifts supply left and finds the new equilibrium on demand', () => {
    const diagram = buildFromTemplate('supply-demand');
    const [demand, supply] = diagram.curves;
    const result = shiftCurve(diagram, supply.id, { x: -0.1, y: 0 }, counter())!;
    const mark = result.diagram.points.find((p) => p.id === result.pointId)!;
    const copy = result.diagram.curves.find((c) => c.id === result.curveId)!;
    const expected = curveCrossing(copy, demand)!;
    expect(mark.at.x).toBeCloseTo(expected.x, 9);
    expect(mark.at.x).toBeLessThan(0.47);
    expect(mark.at.y).toBeGreaterThan(0.5);
  });

  it('continues the numbering: D₁ shifts to D₂ and marks Q₂', () => {
    const diagram = buildFromTemplate('demand-shift');
    const d1 = diagram.curves[1];
    const result = shiftCurve(diagram, d1.id, { x: 0.05, y: 0 }, counter())!;
    const copy = result.diagram.curves.find((c) => c.id === result.curveId)!;
    expect(flat(copy.label?.en)).toBe('D_2');
    expect(flat(result.diagram.points.at(-1)?.xTickLabel?.en)).toBe('Q_2');
  });

  it('never reuses an equilibrium name: a second shift in one diagram takes the next number', () => {
    const diagram = buildFromTemplate('supply-demand');
    const [demand, supply] = diagram.curves;
    const mint = counter();
    const first = shiftCurve(diagram, demand.id, { x: 0.1, y: 0 }, mint)!;
    const second = shiftCurve(first.diagram, supply.id, { x: 0, y: 0.1 }, mint)!;
    expect(flat(second.diagram.curves.at(-1)?.label?.en)).toBe('S_1');
    const mark = second.diagram.points.find((p) => p.id === second.pointId)!;
    expect(mark.label).toBeUndefined();
    expect(flat(mark.yTickLabel?.en)).toBe('P_2');
  });

  it('keeps the slope when an end is pushed off the plot — trimmed, not clamped', () => {
    const points = translateCurvePoints([{ x: 0.08, y: 0.88 }, { x: 0.86, y: 0.12 }], { x: 0.3, y: 0 })!;
    const slope = (points[1].y - points[0].y) / (points[1].x - points[0].x);
    expect(slope).toBeCloseTo((0.12 - 0.88) / (0.86 - 0.08), 9);
    expect(points[1].x).toBeCloseTo(1, 9);
  });

  it('returns null for a shift that leaves nothing on the plot', () => {
    const diagram = buildFromTemplate('supply-demand');
    expect(shiftCurve(diagram, diagram.curves[0].id, { x: 1.5, y: 0 }, counter())).toBeNull();
  });

  it('adds no equilibrium when there is no counterpart to meet', () => {
    const diagram: Diagram = {
      ...buildFromTemplate('supply-demand'),
      curves: [buildFromTemplate('supply-demand').curves[0]],
    };
    const result = shiftCurve(diagram, diagram.curves[0].id, { x: 0.1, y: 0 }, counter())!;
    expect(result.pointId).toBeUndefined();
    expect(result.diagram.points).toEqual(diagram.points);
  });

  it('names a copy after the original, skipping labels already taken', () => {
    const d = { en: [{ text: 'D' }], zh: [{ text: 'D' }] };
    expect(plain(shiftedLabel(d, new Set())!.en)).toBe('D1');
    expect(plain(shiftedLabel(d, new Set(['D1']))!.en)).toBe('D2');
  });
});

describe('naming an equilibrium on request', () => {
  it('templates ship their equilibria unnamed (option letters and MB readings stay)', () => {
    for (const t of DIAGRAM_TEMPLATES) {
      for (const p of t.build().points) expect(plain(p.label?.en), t.id).not.toMatch(/^E/);
    }
    for (const p of buildFromTemplate('demand-shift').points) expect(p.label).toBeUndefined();
  });

  it('offers E₀ then E₁, taking the point’s own tick number when it is free', () => {
    const diagram = buildFromTemplate('demand-shift');
    const [e0, e1] = diagram.points;
    expect(flat(nextEquilibriumName(diagram, e1).en)).toBe('E_1');
    const named = { ...diagram, points: [withPointLabel(diagram, e0, nextEquilibriumName(diagram, e0)), e1] };
    expect(flat(named.points[0].label?.en)).toBe('E_0');
    const free = { ...e1, xTickLabel: undefined, yTickLabel: undefined };
    expect(flat(nextEquilibriumName(named, free).en)).toBe('E_1');
  });

  it('puts a new name right of a D × S crossing, up-right on a lone falling D, and keeps a dragged spot', () => {
    const cross = buildFromTemplate('demand-shift');
    for (const p of cross.points) expect(equilibriumLabelSide(cross, p)).toBe('right');
    const along = buildFromTemplate('elastic-revenue');
    for (const p of along.points.filter((p) => p.anchor && 'on' in p.anchor)) {
      expect(equilibriumLabelSide(along, p)).toBe('upRight');
    }
    // A horizontal price line through a falling D: "right" would run along the line.
    const base = buildFromTemplate('supply-demand');
    const level = base.points[0].at.y;
    const line: Diagram['curves'][number] = { id: 'p', points: [{ x: 0, y: level }, { x: 1, y: level }], shape: 'straight' };
    const onLine: Diagram = {
      ...base,
      curves: [base.curves[0], line],
      points: [{ ...base.points[0], anchor: { cross: [base.curves[0].id, 'p'] } }],
    };
    expect(equilibriumLabelSide(onLine, onLine.points[0])).toBe('upRight');
    const dragged = { ...cross.points[0], labelOffset: { x: 0.1, y: 0.1 }, labelSide: 'left' as const };
    expect(withPointLabel(cross, dragged, nextEquilibriumName(cross, dragged)).labelSide).toBe('left');
    const fresh = withPointLabel(cross, { ...cross.points[0], labelSide: 'left' }, nextEquilibriumName(cross, cross.points[0]));
    expect(fresh.labelSide).toBe('right');
  });
});
