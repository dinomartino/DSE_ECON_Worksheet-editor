import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramArea } from './diagram';
import {
  areaPolygon,
  curveCrossing,
  curveYAt,
  detachAreas,
  guessMarketCurves,
  insidePolygon,
  polygonCentroid,
  presetArea,
} from './diagramAreas';
import {
  applyDrag,
  copyHandles,
  deleteHandle,
  handleText,
  hitTest,
  pasteInto,
  setHandleText,
} from './diagramDraw';
import { shiftCurve } from './diagramShift';

/** Linear D and S crossing at (0.47, 0.5), as the supply-demand template draws them. */
function market(): Diagram {
  return {
    x: {},
    y: {},
    curves: [
      { id: 'D', points: [{ x: 0.08, y: 0.88 }, { x: 0.86, y: 0.12 }], shape: 'straight' },
      { id: 'S', points: [{ x: 0.08, y: 0.12 }, { x: 0.86, y: 0.88 }], shape: 'straight' },
    ],
    points: [],
    labels: [],
    arrows: [],
  };
}

const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};

/** A market with a per-unit tax: S shifted up by 0.1 through the real shift action. */
function taxed(): { diagram: Diagram; taxedId: string } {
  let n = 0;
  const result = shiftCurve(market(), 'S', { x: 0, y: 0.1 }, () => `t${(n += 1)}`)!;
  return { diagram: result.diagram, taxedId: result.curveId };
}

describe('area polygons from curve references', () => {
  it('derives the consumer-surplus triangle from D and the equilibrium price', () => {
    const diagram = market();
    const cs = presetArea('consumerSurplus', { demand: 'D', supply: 'S' }, 'cs')!;
    const polygon = areaPolygon(diagram, cs)!;
    // D's own left end (it stops short of the y-axis), the equilibrium, and the price
    // line back at that x — a triangle, the apex visited once.
    expect(polygon).toHaveLength(3);
    close(polygon[0], { x: 0.08, y: 0.88 });
    close(polygon[1], { x: 0.47, y: 0.5 });
    close(polygon[2], { x: 0.08, y: 0.5 });
  });

  it('derives producer surplus below the price and above S', () => {
    const polygon = areaPolygon(market(), presetArea('producerSurplus', { demand: 'D', supply: 'S' }, 'ps')!)!;
    expect(polygon).toHaveLength(3);
    close(polygon[0], { x: 0.08, y: 0.5 });
    close(polygon[1], { x: 0.47, y: 0.5 });
    close(polygon[2], { x: 0.08, y: 0.12 });
  });

  it('stays attached: dragging demand re-derives the triangle', () => {
    const diagram = { ...market(), areas: [presetArea('consumerSurplus', { demand: 'D', supply: 'S' }, 'cs')!] };
    const moved = applyDrag(diagram, { kind: 'curve', curveId: 'D' }, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 });
    const polygon = areaPolygon(moved, moved.areas![0])!;
    const eq = curveCrossing(moved.curves[0], moved.curves[1])!;
    expect(eq.x).toBeGreaterThan(0.47);
    close(polygon[1], eq);
    expect(polygon[0].x).toBeCloseTo(0.18, 6); // D's left end moved with it
  });

  it('derives the tax-revenue rectangle between the two prices', () => {
    const { diagram, taxedId } = taxed();
    const curves = guessMarketCurves(diagram);
    expect(curves).toEqual({ demand: 'D', supply: 'S', taxed: taxedId });

    const polygon = areaPolygon(diagram, presetArea('taxRevenue', curves, 'tr')!)!;
    const buyers = curveCrossing(diagram.curves[0], diagram.curves.find((c) => c.id === taxedId)!)!;
    const sellers = curveYAt(diagram.curves[1], buyers.x)!;
    expect(polygon).toHaveLength(4);
    close(polygon[0], { x: 0, y: buyers.y });
    close(polygon[1], { x: buyers.x, y: buyers.y });
    close(polygon[2], { x: buyers.x, y: sellers });
    close(polygon[3], { x: 0, y: sellers });
    // The wedge is the tax: 0.1 of the axis.
    expect(buyers.y - sellers).toBeCloseTo(0.1, 6);
  });

  it('derives the deadweight-loss triangle from the taxed to the free quantity', () => {
    const { diagram, taxedId } = taxed();
    const polygon = areaPolygon(diagram, presetArea('deadweightLoss', guessMarketCurves(diagram), 'dwl')!)!;
    const buyers = curveCrossing(diagram.curves[0], diagram.curves.find((c) => c.id === taxedId)!)!;
    expect(polygon).toHaveLength(3);
    close(polygon[0], buyers);
    close(polygon[1], { x: 0.47, y: 0.5 });
    close(polygon[2], { x: buyers.x, y: curveYAt(diagram.curves[1], buyers.x)! });
  });

  it('refuses the tax presets without a taxed curve, and any preset without D and S', () => {
    expect(presetArea('deadweightLoss', { demand: 'D', supply: 'S' }, 'x')).toBeNull();
    expect(presetArea('taxRevenue', { demand: 'D', supply: 'S' }, 'x')).toBeNull();
    expect(presetArea('consumerSurplus', { supply: 'S' }, 'x')).toBeNull();
  });

  it('draws nothing for a reference that no longer resolves', () => {
    const area: DiagramArea = { id: 'a', band: { edges: [{ curve: 'gone' }, { level: 0.2 }], from: 0, to: 1 } };
    expect(areaPolygon(market(), area)).toBeNull();
  });

  it('computes a centroid and point-in-polygon for hit-testing', () => {
    const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    close(polygonCentroid(square), { x: 0.5, y: 0.5 });
    expect(insidePolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
    expect(insidePolygon({ x: 1.5, y: 0.5 }, square)).toBe(false);
  });
});

describe('areas on the drawing canvas', () => {
  const withCs = (): Diagram => ({
    ...market(),
    areas: [presetArea('consumerSurplus', { demand: 'D', supply: 'S' }, 'cs')!],
  });

  it('is selectable by clicking inside it, below every other body', () => {
    expect(hitTest(withCs(), { x: 0.2, y: 0.6 }, 0.01)).toEqual({ kind: 'area', areaId: 'cs' });
    // On demand itself, the curve wins.
    expect(hitTest(withCs(), { x: 0.275, y: 0.69 }, 0.01)).toEqual({ kind: 'curve', curveId: 'D' });
  });

  it('drags its label as an offset from the centroid, and edits its text', () => {
    const moved = applyDrag(withCs(), { kind: 'areaLabel', areaId: 'cs' }, { x: 0, y: 0 }, { x: 0.03, y: -0.02 });
    expect(moved.areas![0].labelOffset).toEqual({ x: 0.03, y: -0.02 });
    const handle = { kind: 'areaLabel', areaId: 'cs' } as const;
    const renamed = setHandleText(moved, handle, { en: [{ text: 'a' }], zh: [{ text: 'a' }] });
    expect(handleText(renamed, handle)?.en[0].text).toBe('a');
  });

  it('freezes an area whose curve is deleted, at the shape it had', () => {
    const before = withCs();
    const polygon = areaPolygon(before, before.areas![0])!;
    const after = deleteHandle(before, { kind: 'curve', curveId: 'D' });
    expect(after.areas).toHaveLength(1);
    expect(after.areas![0].band).toBeUndefined();
    expect(after.areas![0].vertices).toEqual(polygon);
    expect(after.areas![0].label).toEqual(before.areas![0].label);
  });

  it('leaves an unrelated delete alone', () => {
    const before = { ...withCs(), labels: [{ id: 'L', at: { x: 0.5, y: 0.5 }, text: { en: [], zh: [] } }] };
    const after = deleteHandle(before, { kind: 'label', labelId: 'L' });
    expect(after.areas).toBe(before.areas);
  });

  it('pastes an area with its curves re-pointed at the pasted copies', () => {
    const diagram = withCs();
    let n = 0;
    const clip = copyHandles(diagram, [
      { kind: 'curve', curveId: 'D' },
      { kind: 'curve', curveId: 'S' },
      { kind: 'area', areaId: 'cs' },
    ]);
    const { diagram: pasted } = pasteInto(diagram, clip, () => `p${(n += 1)}`);
    const copy = pasted.areas![1];
    expect(JSON.stringify(copy.band)).not.toContain('"D"');
    expect(areaPolygon(pasted, copy)).not.toBeNull();
  });

  it('freezes a copied area whose curves stay behind', () => {
    const clip = copyHandles(withCs(), [{ kind: 'area', areaId: 'cs' }]);
    expect(clip.areas![0].band).toBeUndefined();
    expect(clip.areas![0].vertices).toHaveLength(3);
  });

  it('keeps a diagram without areas free of the field through every edit', () => {
    const diagram = market();
    const after = deleteHandle(diagram, { kind: 'curve', curveId: 'D' });
    expect('areas' in after).toBe(false);
    expect(detachAreas(diagram, after)).toBe(after);
  });
});
