import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramArea, DiagramCurve, DiagramPoint } from './diagram';
import { areaPolygon, areaReferences, curveCrossing, curveYAt, detachAreas, newPresetArea } from './diagramAreas';
import { copyHandles, deleteHandle, pasteInto } from './diagramDraw';
import {
  SHADE_PRESETS,
  guessRoles,
  onCurveAtLevelSupported,
  planPreset,
  presetAreas,
  presetIsAmbiguous,
  shadePreset,
  type PresetRoles,
  type ShadePresetId,
} from './diagramPresets';
import { shiftCurve } from './diagramShift';
import { DIAGRAM_TEMPLATES } from './diagramTemplates';

const K = 0.76 / 0.78; // the slope of the test D and S
const line = (id: string, points: Array<[number, number]>, label?: string): DiagramCurve => ({
  id,
  points: points.map(([x, y]) => ({ x, y })),
  shape: 'straight',
  ...(label ? { label: { en: [{ text: label }], zh: [{ text: label }] } } : {}),
});

/** Linear D and S crossing at (0.47, 0.5), plus any extra lines. */
function market(...extra: DiagramCurve[]): Diagram {
  return {
    x: {},
    y: {},
    curves: [line('D', [[0.08, 0.88], [0.86, 0.12]]), line('S', [[0.08, 0.12], [0.86, 0.88]]), ...extra],
    points: [],
    labels: [],
    arrows: [],
  };
}

/** S shifted up (a tax) or down (a subsidy) by 0.1 through the real shift action. */
function shifted(dy: number): Diagram {
  let n = 0;
  return shiftCurve(market(), 'S', { x: 0, y: dy }, () => `s${(n += 1)}`)!.diagram;
}

let ids = 0;
const mint = () => `a${(ids += 1)}`;

function build(diagram: Diagram, id: ShadePresetId, roles?: PresetRoles): DiagramArea[] | null {
  return presetAreas(diagram, id, roles ?? guessRoles(diagram, shadePreset(id)), mint);
}

function polygonOf(diagram: Diagram, id: ShadePresetId, roles?: PresetRoles): DiagramPoint[] {
  const areas = build(diagram, id, roles);
  expect(areas, id).not.toBeNull();
  expect(areas).toHaveLength(1);
  return areaPolygon(diagram, areas![0])!;
}

/** Shoelace area, for comparing regions that should add up. */
const size = (polygon: DiagramPoint[]) =>
  Math.abs(polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0)) / 2;

const close = (actual: DiagramPoint, expected: DiagramPoint) => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
};
/** The same polygon, whichever vertex it starts from. */
const closeAll = (actual: DiagramPoint[], expected: DiagramPoint[]) => {
  expect(actual).toHaveLength(expected.length);
  const near = (a: DiagramPoint, b: DiagramPoint) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
  const shift = actual.findIndex((p) => near(p, expected[0]));
  expect(shift, JSON.stringify(actual)).toBeGreaterThanOrEqual(0);
  expected.forEach((p, i) => close(actual[(i + shift) % actual.length], p));
};

/** Where S (or D) reaches price `p`, on the test lines. */
const onS = (p: number) => 0.08 + (p - 0.12) / K;
const onD = (p: number) => 0.08 + (0.88 - p) / K;

describe('tax presets', () => {
  const diagram = shifted(0.1);
  const d = diagram.curves[0];
  const s1 = diagram.curves[2];
  const e1 = curveCrossing(d, s1)!;
  const seller = curveYAt(diagram.curves[1], e1.x)!;

  it("reads E₁ at P₁ = 0.55 and the sellers' price 0.45", () => {
    expect(e1.y).toBeCloseTo(0.55, 6);
    expect(seller).toBeCloseTo(0.45, 6);
  });

  it("derives the buyers' and sellers' burdens around P₀", () => {
    closeAll(polygonOf(diagram, 'buyersBurden'), [
      { x: 0, y: 0.55 },
      { x: e1.x, y: 0.55 },
      { x: e1.x, y: 0.5 },
      { x: 0, y: 0.5 },
    ]);
    closeAll(polygonOf(diagram, 'sellersBurden'), [
      { x: 0, y: 0.5 },
      { x: e1.x, y: 0.5 },
      { x: e1.x, y: 0.45 },
      { x: 0, y: 0.45 },
    ]);
  });

  it('adds the two burdens up to exactly the tax revenue', () => {
    const revenue = size(polygonOf(diagram, 'taxRevenue'));
    const burdens = size(polygonOf(diagram, 'buyersBurden')) + size(polygonOf(diagram, 'sellersBurden'));
    expect(burdens).toBeCloseTo(revenue, 9);
    expect(revenue).toBeCloseTo(0.1 * e1.x, 9);
  });

  it("shades the CS loss as one area: the buyers' burden plus its triangle", () => {
    const polygon = polygonOf(diagram, 'csLossTax');
    closeAll(polygon, [
      { x: 0, y: 0.55 },
      { x: 0.08, y: 0.55 },
      { x: e1.x, y: 0.55 },
      { x: 0.47, y: 0.5 },
      { x: e1.x, y: 0.5 },
      { x: 0.08, y: 0.5 },
      { x: 0, y: 0.5 },
    ]);
    const triangle = 0.5 * (0.47 - e1.x) * 0.05;
    expect(size(polygon)).toBeCloseTo(size(polygonOf(diagram, 'buyersBurden')) + triangle, 9);
  });

  it('keeps the original DWL of a tax: D and S from Q₁ to Q₀', () => {
    closeAll(polygonOf(diagram, 'deadweightLoss'), [e1, { x: 0.47, y: 0.5 }, { x: e1.x, y: seller }]);
  });

  it('refuses the subsidy presets on a tax', () => {
    for (const id of ['consumerBenefit', 'producerBenefit', 'subsidyDwl'] as const) {
      const plan = planPreset(diagram, shadePreset(id), guessRoles(diagram, shadePreset(id)), mint);
      expect('why' in plan && plan.why).toMatch(/below S/);
    }
  });

  it('derives the TSS loss of an MC rise: between S₀ and S₁ out to demand', () => {
    const polygon = polygonOf(diagram, 'tssLoss');
    // abE₁E₀: the band between the two S from their left end to Q₁, plus D's triangle.
    const band = 0.1 * (e1.x - 0.08);
    const triangle = 0.5 * (0.47 - e1.x) * (0.55 - 0.45);
    expect(size(polygon)).toBeCloseTo(band + triangle, 9);
    close(polygon[0], { x: 0.08, y: 0.22 });
    expect(polygon.some((p) => Math.hypot(p.x - 0.47, p.y - 0.5) < 1e-6)).toBe(true);
    expect(polygon.some((p) => Math.hypot(p.x - e1.x, p.y - e1.y) < 1e-6)).toBe(true);
  });
});

describe('subsidy presets', () => {
  const diagram = shifted(-0.1);
  const e1 = curveCrossing(diagram.curves[0], diagram.curves[2])!;
  const sellers = curveYAt(diagram.curves[1], e1.x)!;

  it('reads a lower buyers’ price and a higher sellers’ price', () => {
    expect(e1.y).toBeCloseTo(0.45, 6);
    expect(sellers).toBeCloseTo(0.55, 6);
  });

  it('derives consumer and producer benefit either side of P₀', () => {
    closeAll(polygonOf(diagram, 'consumerBenefit'), [
      { x: 0, y: 0.5 },
      { x: e1.x, y: 0.5 },
      { x: e1.x, y: 0.45 },
      { x: 0, y: 0.45 },
    ]);
    closeAll(polygonOf(diagram, 'producerBenefit'), [
      { x: 0, y: 0.55 },
      { x: e1.x, y: 0.55 },
      { x: e1.x, y: 0.5 },
      { x: 0, y: 0.5 },
    ]);
  });

  it('derives the overproduction DWL between S₀ and D from Q₀ to Q₁', () => {
    closeAll(polygonOf(diagram, 'subsidyDwl'), [{ x: 0.47, y: 0.5 }, { x: e1.x, y: sellers }, e1]);
  });

  it("refuses the tax presets on a subsidy", () => {
    expect(build(diagram, 'buyersBurden')).toBeNull();
    expect(build(diagram, 'csLossTax')).toBeNull();
  });
});

describe('price-control presets', () => {
  const ceiling = market(line('C', [[0, 0.35], [0.95, 0.35]], 'Pc'));
  const qs = onS(0.35);
  const qd = onD(0.35);

  it('reads Qs and Qd on the line and transacts the short side', () => {
    closeAll(polygonOf(ceiling, 'controlRevenue'), [
      { x: 0, y: 0 },
      { x: qs, y: 0 },
      { x: qs, y: 0.35 },
      { x: 0, y: 0.35 },
    ]);
    closeAll(polygonOf(ceiling, 'controlGap'), [
      { x: qs, y: 0 },
      { x: qd, y: 0 },
      { x: qd, y: 0.35 },
      { x: qs, y: 0.35 },
    ]);
  });

  it('derives the DWL between D and S from the transacted Q to Qe', () => {
    closeAll(polygonOf(ceiling, 'controlDwl'), [
      { x: qs, y: 0.88 - K * (qs - 0.08) },
      { x: 0.47, y: 0.5 },
      { x: qs, y: 0.35 },
    ]);
  });

  it('splits the CS change under a ceiling into + and −', () => {
    closeAll(polygonOf(ceiling, 'ceilingCsGain'), [
      { x: 0, y: 0.5 },
      { x: qs, y: 0.5 },
      { x: qs, y: 0.35 },
      { x: 0, y: 0.35 },
    ]);
    closeAll(polygonOf(ceiling, 'ceilingCsLoss'), [
      { x: qs, y: 0.88 - K * (qs - 0.08) },
      { x: 0.47, y: 0.5 },
      { x: qs, y: 0.5 },
    ]);
    expect(build(ceiling, 'wageBill')).toBeNull();
  });

  it('reads employment off demand for a minimum wage', () => {
    const floor = market(line('W', [[0, 0.65], [0.95, 0.65]], 'W'));
    const employed = onD(0.65);
    closeAll(polygonOf(floor, 'wageBill'), [
      { x: 0, y: 0 },
      { x: employed, y: 0 },
      { x: employed, y: 0.65 },
      { x: 0, y: 0.65 },
    ]);
    expect(size(polygonOf(floor, 'controlDwl'))).toBeCloseTo(0.5 * (0.47 - employed) * (0.65 - 0.35), 9);
    expect(build(floor, 'ceilingCsGain')).toBeNull();
  });

  it('is null without a price line, or with one at equilibrium', () => {
    expect(build(market(), 'controlRevenue')).toBeNull();
    expect(build(market(line('C', [[0, 0.5], [0.95, 0.5]])), 'controlDwl')).toBeNull();
  });
});

describe('trade presets', () => {
  const trade = market(line('W', [[0, 0.3], [0.95, 0.3]], 'Pw'), line('T', [[0, 0.4], [0.95, 0.4]], 'Pw+t'));
  const [q1, q2, q3, q4] = [onS(0.3), onS(0.4), onD(0.4), onD(0.3)];

  it('guesses Pw as the lower line and Pw + t as the one above it', () => {
    const roles = guessRoles(trade, shadePreset('tariffRevenue'));
    expect(roles).toMatchObject({ demand: 'D', supply: 'S', world: { curve: 'W' }, raised: { curve: 'T' } });
  });

  it('derives the tariff revenue rectangle t × imports', () => {
    closeAll(polygonOf(trade, 'tariffRevenue'), [
      { x: q2, y: 0.3 },
      { x: q3, y: 0.3 },
      { x: q3, y: 0.4 },
      { x: q2, y: 0.4 },
    ]);
  });

  it('derives the PS gain trapezium left of S', () => {
    const polygon = polygonOf(trade, 'tariffPsGain');
    expect(size(polygon)).toBeCloseTo((0.1 * (q1 + q2)) / 2, 9);
    close(polygon[0], { x: 0, y: 0.3 });
    expect(polygon.some((p) => Math.hypot(p.x - q2, p.y - 0.4) < 1e-6)).toBe(true);
  });

  it('adds both DWL triangles from one item, hatched apart', () => {
    const areas = build(trade, 'tariffDwl')!;
    expect(areas).toHaveLength(2);
    expect(areas[0].id).not.toBe(areas[1].id);
    expect(areas[0].pattern).not.toBe(areas[1].pattern);
    closeAll(areaPolygon(trade, areas[0])!, [{ x: q1, y: 0.3 }, { x: q2, y: 0.4 }, { x: q2, y: 0.3 }]);
    closeAll(areaPolygon(trade, areas[1])!, [{ x: q3, y: 0.4 }, { x: q4, y: 0.3 }, { x: q3, y: 0.3 }]);
  });

  it('makes the CS loss a + b + c + d', () => {
    const [b, d] = build(trade, 'tariffDwl')!.map((area) => size(areaPolygon(trade, area)!));
    const parts = size(polygonOf(trade, 'tariffPsGain')) + b + size(polygonOf(trade, 'tariffRevenue')) + d;
    expect(size(polygonOf(trade, 'tariffCsLoss'))).toBeCloseTo(parts, 9);
  });

  it('derives the quota rent over the same span as the tariff revenue', () => {
    expect(size(polygonOf(trade, 'quotaRent'))).toBeCloseTo(0.1 * (q3 - q2), 9);
  });

  it('refuses a world price above the domestic equilibrium', () => {
    const high = market(line('W', [[0, 0.6], [0.95, 0.6]]), line('T', [[0, 0.7], [0.95, 0.7]]));
    expect(build(high, 'tariffRevenue')).toBeNull();
    expect(build(market(line('W', [[0, 0.3], [0.95, 0.3]])), 'tariffRevenue')).toBeNull();
  });

  it('refuses Pw + t at or above the domestic equilibrium: nothing is imported', () => {
    const shut = market(line('W', [[0, 0.3], [0.95, 0.3]]), line('T', [[0, 0.55], [0.95, 0.55]]));
    const plan = planPreset(shut, shadePreset('tariffRevenue'), guessRoles(shut, shadePreset('tariffRevenue')), mint);
    expect('why' in plan && plan.why).toMatch(/below the domestic equilibrium/);
  });

  it('finds Pw and Pw + t in the import-tariff template', () => {
    const diagram = DIAGRAM_TEMPLATES.find((t) => t.id === 'tariff')!.build();
    const roles = guessRoles(diagram, shadePreset('tariffRevenue'));
    expect(roles.world).toEqual({ curve: diagram.curves[2].id });
    expect(roles.raised).toEqual({ curve: diagram.curves[3].id });
  });

  it('without the {on, y} anchor, a price taken from a point is refused', () => {
    const pointed: Diagram = { ...market(), points: [{ id: 'pw', at: { x: 0.2, y: 0.3 } }, { id: 'pt', at: { x: 0.2, y: 0.4 } }] };
    const roles: PresetRoles = { demand: 'D', supply: 'S', world: { level: { point: 'pw' } }, raised: { level: { point: 'pt' } } };
    const areas = build(pointed, 'tariffRevenue', roles);
    if (onCurveAtLevelSupported()) {
      expect(size(areaPolygon(pointed, areas![0])!)).toBeCloseTo(0.1 * (q3 - q2), 9);
    } else {
      expect(areas).toBeNull();
    }
  });

  it.skipIf(!onCurveAtLevelSupported())('needs {on, y} anchor: every trade preset reads a point-level price', () => {
    const pointed: Diagram = { ...market(), points: [{ id: 'pw', at: { x: 0.2, y: 0.3 } }, { id: 'pt', at: { x: 0.2, y: 0.4 } }] };
    const roles: PresetRoles = { demand: 'D', supply: 'S', world: { level: { point: 'pw' } }, raised: { level: { point: 'pt' } } };
    for (const id of ['tariffRevenue', 'tariffPsGain', 'tariffCsLoss', 'tariffDwl', 'quotaRent'] as const) {
      const lines = build(trade, id)!.map((area) => size(areaPolygon(trade, area)!));
      const points = build(pointed, id, roles)!.map((area) => size(areaPolygon(pointed, area)!));
      points.forEach((value, i) => expect(value, id).toBeCloseTo(lines[i], 9));
    }
  });

  it.skipIf(!onCurveAtLevelSupported())('needs {on, y} anchor: a price control reads a point-level ceiling', () => {
    const pointed: Diagram = { ...market(), points: [{ id: 'pc', at: { x: 0.2, y: 0.35 } }] };
    const roles: PresetRoles = { demand: 'D', supply: 'S', control: { level: { point: 'pc' } } };
    expect(size(areaPolygon(pointed, build(pointed, 'controlRevenue', roles)![0])!)).toBeCloseTo(0.35 * onS(0.35), 9);
  });
});

describe('monopoly preset', () => {
  const diagram: Diagram = {
    ...market(),
    curves: [
      line('AR', [[0, 0.9], [0.9, 0]], 'D = AR'),
      line('MR', [[0, 0.9], [0.45, 0]], 'MR'),
      line('MC', [[0, 0.3], [1, 0.3]], 'MC'),
    ],
  };

  it('guesses D, MR and MC by label', () => {
    expect(guessRoles(diagram, shadePreset('monopolyDwl'))).toEqual({ demand: 'AR', mr: 'MR', mc: 'MC' });
  });

  it('derives the DWL between D and MC from Qm to Qc', () => {
    closeAll(polygonOf(diagram, 'monopolyDwl'), [{ x: 0.3, y: 0.6 }, { x: 0.6, y: 0.3 }, { x: 0.3, y: 0.3 }]);
  });

  it('tells an unlabelled MR by its steeper slope', () => {
    const bare = { ...diagram, curves: diagram.curves.map((c) => ({ ...c, label: undefined })) };
    expect(guessRoles(bare, shadePreset('monopolyDwl'))).toEqual({ demand: 'AR', mr: 'MR', mc: 'MC' });
  });

  it('is null without an MR curve', () => {
    expect(build(market(), 'monopolyDwl')).toBeNull();
  });
});

describe('the catalogue', () => {
  it('is null when a required role is missing, for every preset', () => {
    const empty = { ...market(), curves: [] };
    for (const preset of SHADE_PRESETS) expect(build(empty, preset.id), preset.id).toBeNull();
  });

  it('stores references only: every preset area is a band, never vertices', () => {
    const diagrams = [shifted(0.1), shifted(-0.1), market(line('C', [[0, 0.35], [0.95, 0.35]]))];
    for (const preset of SHADE_PRESETS) {
      for (const diagram of diagrams) {
        for (const area of build(diagram, preset.id) ?? []) {
          expect(area.vertices, preset.id).toBeUndefined();
          expect(area.band, preset.id).toBeDefined();
          expect(area.fill).toBe('hatch');
        }
      }
    }
  });

  it('builds the four original presets exactly as before', () => {
    const diagram = shifted(0.1);
    const roles = guessRoles(diagram, shadePreset('consumerSurplus'));
    for (const id of ['consumerSurplus', 'producerSurplus', 'deadweightLoss', 'taxRevenue'] as const) {
      const [area] = presetAreas(diagram, id, roles, () => 'x')!;
      expect(area).toEqual(newPresetArea(id, { demand: roles.demand, supply: roles.supply, taxed: roles.shifted }, 'x'));
    }
  });

  it('asks for a pick only when a required role has more than one candidate', () => {
    expect(presetIsAmbiguous(market(), shadePreset('consumerSurplus'))).toBe(false);
    expect(presetIsAmbiguous(shifted(0.1), shadePreset('consumerSurplus'))).toBe(true);
    expect(presetIsAmbiguous(shifted(0.1), shadePreset('buyersBurden'))).toBe(true);
  });

  it('gives every preset a label in both languages', () => {
    const diagram = shifted(0.1);
    for (const preset of SHADE_PRESETS) {
      for (const area of build(diagram, preset.id) ?? []) {
        expect(area.label?.en[0].text, preset.id).toBeTruthy();
        expect(area.label?.zh[0].text, preset.id).toBeTruthy();
      }
    }
  });
});

describe('a capped band', () => {
  const diagram = shifted(0.1);
  const [cs] = build(diagram, 'csLossTax')!;
  const withArea = { ...diagram, areas: [cs] };

  it('names its cap among its references', () => {
    expect(areaReferences(cs)).toContain('D');
  });

  it('keeps its cap through copy and paste', () => {
    const clip = copyHandles(withArea, [
      ...withArea.curves.map((c) => ({ kind: 'curve' as const, curveId: c.id })),
      { kind: 'area', areaId: cs.id },
    ]);
    let n = 0;
    const { diagram: pasted } = pasteInto(withArea, clip, () => `p${(n += 1)}`);
    const copy = pasted.areas![1];
    expect(copy.band?.cap).toEqual({ curve: 'p1' });
    // The cap still bends the copy's top edge down D to the copied equilibrium.
    const e0 = curveCrossing(pasted.curves[3], pasted.curves[4])!;
    expect(areaPolygon(pasted, copy)!.some((p) => Math.hypot(p.x - e0.x, p.y - e0.y) < 1e-6)).toBe(true);
  });

  it('freezes at its capped shape when demand is deleted', () => {
    const before = areaPolygon(withArea, cs)!;
    const after = detachAreas(withArea, deleteHandle(withArea, { kind: 'curve', curveId: 'D' }) as Diagram);
    expect(after.areas?.[0].band).toBeUndefined();
    closeAll(after.areas![0].vertices!, before);
  });

  it('follows demand when it is dragged', () => {
    const moved: Diagram = {
      ...withArea,
      curves: withArea.curves.map((c) =>
        c.id === 'D' ? { ...c, points: c.points.map((p) => ({ x: p.x + 0.05, y: p.y })) } : c,
      ),
    };
    const e0 = curveCrossing(moved.curves[0], moved.curves[1])!;
    const polygon = areaPolygon(moved, cs)!;
    expect(polygon.some((p) => Math.hypot(p.x - e0.x, p.y - e0.y) < 1e-6)).toBe(true);
  });
});
