import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramArea, DiagramPoint } from './diagram';
import {
  AREA_PRESETS,
  PRESET_PATTERNS,
  areaPolygon,
  guessMarketCurves,
  guessRevenuePoints,
  newPresetArea,
  presetArea,
  rectangleDifference,
  revenueArea,
} from './diagramAreas';
import { applyDrag, copyHandles, deleteHandle, hitTest, pasteInto } from './diagramDraw';
import { shiftCurve } from './diagramShift';
import { buildFromTemplate } from './diagramTemplates';

/** A diagram with two marked points, E₀ at `e0` and E₁ at `e1`, and nothing else. */
function twoPoints(e0: DiagramPoint, e1: DiagramPoint): Diagram {
  const runs = (text: string) => ({ en: [{ text }], zh: [{ text }] });
  return {
    x: {},
    y: {},
    curves: [],
    points: [
      { id: 'E0', at: e0, label: runs('E0') },
      { id: 'E1', at: e1, label: runs('E1') },
    ],
    labels: [],
    arrows: [],
  };
}

const before = { point: 'E0' };
const after = { point: 'E1' };
const gainOf = (d: Diagram) => areaPolygon(d, revenueArea('revenueGain', { before, after }, 'g')!);
const lossOf = (d: Diagram) => areaPolygon(d, revenueArea('revenueLoss', { before, after }, 'l')!);

const closeTo = (actual: DiagramPoint[] | null, expected: DiagramPoint[]) => {
  expect(actual).not.toBeNull();
  expect(actual).toHaveLength(expected.length);
  actual!.forEach((p, i) => {
    expect(p.x).toBeCloseTo(expected[i].x, 9);
    expect(p.y).toBeCloseTo(expected[i].y, 9);
  });
};

/** The x/y extent of a polygon, for rectangle checks that ignore vertex order. */
const extent = (poly: DiagramPoint[]) => ({
  x0: Math.min(...poly.map((p) => p.x)),
  x1: Math.max(...poly.map((p) => p.x)),
  y0: Math.min(...poly.map((p) => p.y)),
  y1: Math.max(...poly.map((p) => p.y)),
});

/** Twice the signed area → the absolute area. */
const areaOf = (poly: DiagramPoint[]) =>
  Math.abs(poly.reduce((sum, a, i) => sum + a.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * a.y, 0)) / 2;

describe('revenue gain and loss: the four ways price and quantity move', () => {
  it('price up, quantity down: gain is [0,Q₁]×[P₀,P₁], loss is [Q₁,Q₀]×[0,P₀]', () => {
    const d = twoPoints({ x: 0.6, y: 0.4 }, { x: 0.45, y: 0.6 });
    const gain = gainOf(d)!;
    const loss = lossOf(d)!;
    expect(gain).toHaveLength(4);
    expect(extent(gain)).toEqual({ x0: 0, x1: 0.45, y0: 0.4, y1: 0.6 });
    expect(loss).toHaveLength(4);
    expect(extent(loss)).toEqual({ x0: 0.45, x1: 0.6, y0: 0, y1: 0.4 });
  });

  it('price down, quantity up: gain is [Q₀,Q₁]×[0,P₁], loss is [0,Q₀]×[P₁,P₀]', () => {
    const d = twoPoints({ x: 0.45, y: 0.6 }, { x: 0.6, y: 0.4 });
    expect(extent(gainOf(d)!)).toEqual({ x0: 0.45, x1: 0.6, y0: 0, y1: 0.4 });
    expect(extent(lossOf(d)!)).toEqual({ x0: 0, x1: 0.45, y0: 0.4, y1: 0.6 });
  });

  it('both up: the gain is one L-shaped region, and there is no loss', () => {
    const d = twoPoints({ x: 0.4, y: 0.4 }, { x: 0.55, y: 0.6 });
    closeTo(gainOf(d), [
      { x: 0, y: 0.4 },
      { x: 0.4, y: 0.4 },
      { x: 0.4, y: 0 },
      { x: 0.55, y: 0 },
      { x: 0.55, y: 0.6 },
      { x: 0, y: 0.6 },
    ]);
    // New rectangle less the old one, exactly.
    expect(areaOf(gainOf(d)!)).toBeCloseTo(0.55 * 0.6 - 0.4 * 0.4, 9);
    expect(lossOf(d)).toBeNull();
  });

  it('both down: the loss is the L, and there is no gain', () => {
    const d = twoPoints({ x: 0.55, y: 0.6 }, { x: 0.4, y: 0.4 });
    expect(gainOf(d)).toBeNull();
    const loss = lossOf(d)!;
    expect(loss).toHaveLength(6);
    expect(areaOf(loss)).toBeCloseTo(0.55 * 0.6 - 0.4 * 0.4, 9);
  });

  it('only one of P or Q moving leaves a single rectangle, and no move leaves nothing', () => {
    const quantityOnly = twoPoints({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 });
    expect(extent(gainOf(quantityOnly)!)).toEqual({ x0: 0.4, x1: 0.6, y0: 0, y1: 0.5 });
    expect(lossOf(quantityOnly)).toBeNull();
    const still = twoPoints({ x: 0.4, y: 0.5 }, { x: 0.4, y: 0.5 });
    expect(gainOf(still)).toBeNull();
    expect(lossOf(still)).toBeNull();
    expect(rectangleDifference({ x: 0, y: 0.5 }, { x: 0, y: 0 })).toBeNull();
  });

  it('carries one label per gain or loss, hatched so it reads in monochrome', () => {
    const gain = revenueArea('revenueGain', { before, after }, 'g')!;
    const loss = revenueArea('revenueLoss', { before, after }, 'l')!;
    expect(gain).toMatchObject({ fill: 'hatch', pattern: 'dots', label: { en: [{ text: 'Gain' }], zh: [{ text: '收益增加' }] } });
    expect(loss).toMatchObject({ fill: 'hatch', pattern: 'cross', label: { en: [{ text: 'Loss' }], zh: [{ text: '收益減少' }] } });
    expect(revenueArea('revenueGain', { before }, 'g')).toBeNull();
  });
});

describe('total revenue', () => {
  it('is the band under E’s price out to E’s quantity, following the point', () => {
    const d = twoPoints({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.3 });
    const tr = revenueArea('totalRevenue', { before }, 'tr')!;
    expect(tr.band).toBeDefined();
    expect(tr.label).toEqual({ en: [{ text: 'TR' }], zh: [{ text: '總收益' }] });
    expect(extent(areaPolygon(d, tr)!)).toEqual({ x0: 0, x1: 0.4, y0: 0, y1: 0.5 });
    const moved = applyDrag(d, { kind: 'point', pointId: 'E0' }, { x: 0.4, y: 0.5 }, { x: 0.5, y: 0.7 });
    const box = extent(areaPolygon(moved, tr)!);
    expect(box.x1).toBeCloseTo(0.5, 9);
    expect(box.y1).toBeCloseTo(0.7, 9);
  });
});

describe('revenue areas on a real shift', () => {
  function shifted(): Diagram {
    let n = 0;
    const base = buildFromTemplate('supply-demand');
    const demand = base.curves[0].id;
    return shiftCurve(base, demand, { x: 0.15, y: 0 }, () => `s${(n += 1)}`)!.diagram;
  }

  it('picks E₀ and E₁ from the shift, and a demand increase gains an L with no loss', () => {
    const d = shifted();
    const points = guessRevenuePoints(d);
    expect(points.before).toEqual({ point: d.points[0].id });
    expect(points.after).toEqual({ point: d.points[1].id });
    expect(areaPolygon(d, revenueArea('revenueGain', points, 'g')!)).toHaveLength(6);
    expect(areaPolygon(d, revenueArea('revenueLoss', points, 'l')!)).toBeNull();
  });

  it('needs two points for a change, one for TR', () => {
    const one = buildFromTemplate('supply-demand');
    const points = guessRevenuePoints(one);
    expect(points.after).toBeUndefined();
    expect(revenueArea('totalRevenue', points, 'tr')).not.toBeNull();
    expect(revenueArea('revenueLoss', points, 'l')).toBeNull();
  });

  it('follows a drag of E₁, turning the L into a rectangle and back', () => {
    const d = twoPoints({ x: 0.4, y: 0.4 }, { x: 0.55, y: 0.6 });
    const withGain: Diagram = { ...d, areas: [revenueArea('revenueGain', { before, after }, 'g')!] };
    expect(areaPolygon(withGain, withGain.areas![0])).toHaveLength(6);
    // Drag E₁ below E₀'s price: price down, quantity up — one rectangle.
    const dragged = applyDrag(withGain, { kind: 'point', pointId: 'E1' }, { x: 0.55, y: 0.6 }, { x: 0.55, y: 0.3 });
    expect(extent(areaPolygon(dragged, dragged.areas![0])!)).toEqual({ x0: 0.4, x1: 0.55, y0: 0, y1: 0.3 });
  });

  it('is selected by clicking inside, never dragged by its corners', () => {
    const d = twoPoints({ x: 0.4, y: 0.4 }, { x: 0.55, y: 0.6 });
    const withGain: Diagram = { ...d, areas: [revenueArea('revenueGain', { before, after }, 'g')!] };
    expect(hitTest(withGain, { x: 0.47, y: 0.2 }, 0.01)).toEqual({ kind: 'area', areaId: 'g' });
    const moved = applyDrag(withGain, { kind: 'area', areaId: 'g' }, { x: 0.47, y: 0.2 }, { x: 0.6, y: 0.3 });
    expect(moved.areas).toEqual(withGain.areas);
  });

  it('freezes to a free shape at its last outline when a point it names is deleted', () => {
    const d = twoPoints({ x: 0.4, y: 0.4 }, { x: 0.55, y: 0.6 });
    const withGain: Diagram = { ...d, areas: [revenueArea('revenueGain', { before, after }, 'g')!] };
    const outline = areaPolygon(withGain, withGain.areas![0]);
    const remaining = deleteHandle(withGain, { kind: 'point', pointId: 'E1' });
    const frozen = remaining.areas![0] as DiagramArea;
    expect(frozen.revenue).toBeUndefined();
    expect(frozen.vertices).toEqual(outline);
    expect(frozen.label).toEqual(withGain.areas![0].label);
  });

  it('pastes with its points renamed, or frozen when copied without them', () => {
    const d = twoPoints({ x: 0.4, y: 0.4 }, { x: 0.55, y: 0.6 });
    const withGain: Diagram = { ...d, areas: [revenueArea('revenueGain', { before, after }, 'g')!] };
    let n = 0;
    const clip = copyHandles(withGain, [
      { kind: 'point', pointId: 'E0' },
      { kind: 'point', pointId: 'E1' },
      { kind: 'area', areaId: 'g' },
    ]);
    const pasted = pasteInto(withGain, clip, () => `p${(n += 1)}`).diagram;
    const copy = pasted.areas![1];
    expect(copy.revenue?.from).toEqual({ point: 'p1' });
    expect(copy.revenue?.to).toEqual({ point: 'p2' });

    const alone = copyHandles(withGain, [{ kind: 'area', areaId: 'g' }]);
    expect(alone.areas![0].revenue).toBeUndefined();
    expect(alone.areas![0].vertices).toHaveLength(6);
  });
});

describe('welfare presets read apart in monochrome', () => {
  it('creates CS, PS, DWL and tax revenue hatched in four different patterns', () => {
    let n = 0;
    const base = buildFromTemplate('supply-demand');
    const taxedMarket = shiftCurve(base, base.curves[1].id, { x: 0, y: 0.1 }, () => `t${(n += 1)}`)!.diagram;
    const curves = guessMarketCurves(taxedMarket);
    const created = AREA_PRESETS.map((preset) => newPresetArea(preset.id, curves, preset.id)!);
    expect(created.every((area) => area.fill === 'hatch')).toBe(true);
    const patterns = created.map((area) => area.pattern ?? 'diagonal');
    expect(new Set(patterns).size).toBe(4);
    expect(patterns).toEqual(['diagonal', 'reverse', 'cross', 'dots']);
    expect(PRESET_PATTERNS.taxRevenue).toBe('dots');
  });

  it('leaves presetArea — the stored shape older documents were built from — unchanged', () => {
    const cs = presetArea('consumerSurplus', { demand: 'D', supply: 'S' }, 'cs')!;
    expect(cs.fill).toBeUndefined();
    expect(cs.pattern).toBeUndefined();
  });
});
