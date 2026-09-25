import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramCurve } from './diagram';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from './diagramTemplates';
import { resolveAnchor, resolveDiagram } from './diagramAnchors';
import { areaPolygon } from './diagramAreas';
import { spanGeometry } from './diagramSpans';
import { applyDrag } from './diagramDraw';
import { presetStatus, shadePreset } from './diagramPresets';
import { plain } from './text';

/** The templates are written in relations, so a drag moves what the scheme marks. */

const DATA = new Set(['flow', 'pie', 'forum']);
const drawn = DIAGRAM_TEMPLATES.filter((t) => !DATA.has(t.id));

const name = (c: DiagramCurve) => plain(c.label?.en);
const curveNamed = (d: Diagram, text: string) => d.curves.find((c) => name(c) === text)!;
const pointNamed = (d: Diagram, text: string) => d.points.find((p) => plain(p.label?.en) === text)!;
const kinds = (d: Diagram) => d.curves.map((c) => c.derive?.kind).filter(Boolean);
const drag = (d: Diagram, curveId: string, dx: number, dy: number) =>
  resolveDiagram(applyDrag(d, { kind: 'curve', curveId }, { x: 0, y: 0 }, { x: dx, y: dy }));
const polygonsOf = (d: Diagram) => (d.areas ?? []).map((a) => JSON.stringify(areaPolygon(d, a)));

describe('template relations', () => {
  it('ships every relation already resolved, so older builds draw the same shape', () => {
    for (const t of drawn) {
      const d = t.build();
      expect(resolveDiagram(d), t.id).toBe(d);
    }
  });

  it('resolves every anchored point, derived curve and span', () => {
    for (const t of drawn) {
      const d = t.build();
      for (const p of d.points) if (p.anchor) expect(resolveAnchor(d, p.anchor), `${t.id} point`).not.toBeNull();
      for (const c of d.curves) if (c.derive) expect(c.points.length, `${t.id} curve`).toBeGreaterThanOrEqual(2);
      for (const s of d.spans ?? []) expect(spanGeometry(d, s), `${t.id} span`).not.toBeNull();
    }
  });

  it('anchors every equilibrium the market and macro templates mark', () => {
    for (const t of drawn.filter((x) => /^E/.test(plain(x.build().points[0]?.label?.en)))) {
      const d = t.build();
      for (const p of d.points.filter((q) => /^E\S/.test(plain(q.label?.en)))) {
        // ad-as keeps its free E₁ (a marked point, not a crossing).
        if (t.id === 'ad-as' && plain(p.label?.en) === 'E1') continue;
        expect(p.anchor, `${t.id} ${plain(p.label?.en)}`).toBeDefined();
      }
    }
  });

  it('draws shifted copies, price lines, MR, verticals and the CPF as derived curves', () => {
    const expect_ = (id: string, wanted: string[]) => {
      const got = kinds(buildFromTemplate(id));
      for (const kind of wanted) expect(got, `${id} ${kind}`).toContain(kind);
    };
    expect_('demand-shift', ['shift']);
    expect_('per-unit-tax', ['shift']);
    expect_('tariff', ['level', 'shift']);
    expect_('fixed-supply', ['vertical', 'shift']);
    expect_('money-supply-shift', ['vertical', 'shift']);
    expect_('lras-growth', ['vertical', 'shift']);
    expect_('self-adjustment', ['vertical', 'parallel']);
    expect_('price-ceiling', ['level']);
    expect_('ppf-concave-trade', ['tangent', 'parallel']);
    for (const id of ['monopoly', 'monopoly-mc-zero', 'monopoly-cost-fall', 'monopoly-rising-mc']) expect_(id, ['marginalRevenue']);
  });

  it('marks changes, gaps, imports and the tax wedge as spans', () => {
    const styles = (id: string) => (buildFromTemplate(id).spans ?? []).map((s) => `${s.style}:${s.along ?? '-'}`);
    expect(styles('demand-shift')).toEqual(['arrow:y', 'arrow:x']);
    expect(styles('per-unit-tax')).toContain('dimension:-');
    expect(styles('tariff')).toEqual(['bracket:x']);
    expect(styles('deflationary-gap')).toEqual(['doubleArrow:x']);
    expect(styles('gap-narrows')).toEqual(['doubleArrow:x', 'doubleArrow:x']);
    expect(styles('price-ceiling')).toEqual(['bracket:-']);
    expect(styles('shortage-change')).toHaveLength(2);
    expect(styles('ppf-linear-trade')).toEqual(['bracket:x', 'bracket:y']);
  });

  it('shades with the Shade presets: the tariff letters a–d are the welfare areas', () => {
    const d = buildFromTemplate('tariff-welfare');
    expect(d.labels).toHaveLength(0);
    expect((d.areas ?? []).map((a) => plain(a.label?.en))).toEqual(['a', 'b', 'c', 'd']);
    expect((d.areas ?? []).every((a) => a.band && a.fill === 'hatch')).toBe(true);
  });
});

describe('dragging a template keeps the scheme', () => {
  it("per-unit tax: dragging S₁ up moves E₁, the wedge t, the P arrow and both burdens", () => {
    const d = buildFromTemplate('per-unit-tax');
    const s1 = curveNamed(d, 'S1');
    const after = drag(d, s1.id, 0, 0.06);
    const e1 = (x: Diagram) => pointNamed(x, 'E1').at;
    expect(e1(after).y).toBeGreaterThan(e1(d).y);
    expect(after.curves.find((c) => c.id === s1.id)!.derive?.kind).toBe('shift');
    const wedge = (x: Diagram) => {
      const g = spanGeometry(x, x.spans!.find((s) => s.style === 'dimension')!)!;
      return Math.abs(g.base[0].y - g.base[1].y);
    };
    expect(wedge(after)).toBeCloseTo(wedge(d) + 0.06, 6);
    const pArrow = (x: Diagram) => spanGeometry(x, x.spans!.find((s) => s.along === 'y')!)!.base[1].y;
    expect(pArrow(after)).toBeCloseTo(e1(after).y, 9);
    expect(polygonsOf(after)).not.toEqual(polygonsOf(d));
  });

  it('per-unit tax: dragging S₀ carries S₁ with it, the tax unchanged', () => {
    const d = buildFromTemplate('per-unit-tax');
    const after = drag(d, curveNamed(d, 'S0').id, 0.05, 0);
    const gap = (x: Diagram) => curveNamed(x, 'S1').points[0].y - curveNamed(x, 'S0').points[0].y;
    expect(curveNamed(after, 'S1').points[0].x).toBeCloseTo(curveNamed(d, 'S1').points[0].x + 0.05, 9);
    expect(gap(after)).toBeCloseTo(gap(d), 9);
  });

  it('tariff: dragging D moves the imports bracket and the tariff revenue', () => {
    const d = buildFromTemplate('tariff');
    const after = drag(d, curveNamed(d, 'D').id, 0.05, 0);
    const end = (x: Diagram) => spanGeometry(x, x.spans![0])!.base[1].x;
    expect(end(after)).toBeCloseTo(end(d) + 0.05, 9);
    expect(polygonsOf(after)).not.toEqual(polygonsOf(d));
  });

  it('tariff welfare: dragging Pw moves Pw + t one-for-one and redraws a–d', () => {
    const d = buildFromTemplate('tariff-welfare');
    const pw = curveNamed(d, 'Pw');
    const after = drag(d, pw.id, 0, -0.04);
    expect(curveNamed(after, 'Pw + t').points[0].y).toBeCloseTo(curveNamed(d, 'Pw + t').points[0].y - 0.04, 9);
    expect(polygonsOf(after)).not.toEqual(polygonsOf(d));
  });

  it('monopoly: dragging D moves MR, Qm/Pm and the DWL', () => {
    const d = buildFromTemplate('monopoly');
    const after = drag(d, curveNamed(d, 'D').id, 0, 0.05);
    expect(curveNamed(after, 'MR').points[0].y).toBeCloseTo(curveNamed(d, 'MR').points[0].y + 0.05, 9);
    expect(after.points[0].at.y).not.toBeCloseTo(d.points[0].at.y, 6);
    expect(polygonsOf(after)).not.toEqual(polygonsOf(d));
  });

  it('concave PPF: moving production B re-draws the tangent CPF, C stays on it', () => {
    const d = buildFromTemplate('ppf-concave-trade');
    const b = pointNamed(d, 'B');
    const moved = resolveDiagram(applyDrag(d, { kind: 'point', pointId: b.id }, b.at, { x: b.at.x - 0.08, y: b.at.y + 0.08 }));
    const cpf = (x: Diagram) => curveNamed(x, 'CPF').points;
    expect(cpf(moved)).not.toEqual(cpf(d));
    const c = pointNamed(moved, 'C').at;
    const [p, q] = cpf(moved);
    const onLine = p.y + ((c.x - p.x) * (q.y - p.y)) / (q.x - p.x);
    expect(c.y).toBeCloseTo(onLine, 6);
  });

  it('deflationary gap: dragging AD moves the gap’s Y₀ end, its Yf end stays on LRAS', () => {
    const d = buildFromTemplate('deflationary-gap');
    const after = drag(d, curveNamed(d, 'AD').id, 0.05, 0);
    const ends = (x: Diagram) => spanGeometry(x, x.spans![0])!.base.map((p) => p.x);
    expect(ends(after)[0]).toBeGreaterThan(ends(d)[0]);
    expect(ends(after)[1]).toBeCloseTo(ends(d)[1], 9);
  });
});

describe('the Shade menu on a template', () => {
  it('offers the tax, tariff and monopoly presets without a picker: the relations name the roles', () => {
    const cases: Array<[string, Parameters<typeof shadePreset>[0]]> = [
      ['per-unit-tax', 'buyersBurden'],
      ['per-unit-tax', 'deadweightLoss'],
      ['per-unit-subsidy', 'consumerBenefit'],
      ['tariff', 'tariffRevenue'],
      ['tariff-welfare', 'tariffDwl'],
      ['monopoly', 'monopolyDwl'],
      ['price-ceiling', 'controlDwl'],
    ];
    for (const [id, preset] of cases) {
      const status = presetStatus(buildFromTemplate(id), shadePreset(preset));
      expect(status.pick, `${id} ${preset}`).toBe(false);
      expect(status.blocked, `${id} ${preset}: ${status.why}`).toBe(false);
    }
  });

  it('picks S₀ as supply and S₁ as shifted from the relation, not from drawing order', () => {
    const d = buildFromTemplate('per-unit-subsidy');
    const status = presetStatus(d, shadePreset('producerBenefit'));
    expect(status.roles.supply).toBe(curveNamed(d, 'S0').id);
    expect(status.roles.shifted).toBe(curveNamed(d, 'S1').id);
  });
});
