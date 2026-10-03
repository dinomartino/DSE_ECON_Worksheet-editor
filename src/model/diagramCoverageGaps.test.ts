import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramCurve } from './diagram';
import { buildFromTemplate } from './diagramTemplates';
import { curvePath, curveYAt, resolveAnchor, resolveDiagram, splineSegments } from './diagramAnchors';
import { applyDrag } from './diagramDraw';
import { spanGeometry } from './diagramSpans';
import { areaPolygon, polygonCentroid } from './diagramAreas';
import { plain } from './text';

/** The templates that close the partial rows of `docs/Diagram_Requirements/COVERAGE.md`. */

const curveNamed = (d: Diagram, text: string) => d.curves.find((c) => plain(c.label?.en) === text)!;
const tick = (d: Diagram, axis: 'x' | 'y', text: string) =>
  d.points.find((p) => plain((axis === 'x' ? p.xTickLabel : p.yTickLabel)?.en) === text)!;
const areaNamed = (d: Diagram, text: string) => d.areas!.find((a) => plain(a.label?.en) === text)!;
const shoelace = (pts: Array<{ x: number; y: number }>) =>
  Math.abs(pts.reduce((sum, p, i) => sum + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2;

describe('curved curves are read as drawn', () => {
  const u: DiagramCurve = {
    id: 'u',
    shape: 'curved',
    points: [{ x: 0.1, y: 0.6 }, { x: 0.3, y: 0.2 }, { x: 0.6, y: 0.7 }],
  };

  it('samples the spline the renderer draws, through every control point', () => {
    const path = curvePath(u);
    expect(path.length).toBeGreaterThan(u.points.length * 10);
    for (const p of u.points) expect(path.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-12)).toBe(true);
    // The spline's midpoint (built in aspect space) lies on the path.
    const [first] = splineSegments(u.points.map((p) => ({ x: p.x, y: p.y * 0.75 })));
    const mid = {
      x: (first.p1.x + 3 * first.c1.x + 3 * first.c2.x + first.p2.x) / 8,
      y: (first.p1.y + 3 * first.c1.y + 3 * first.c2.y + first.p2.y) / 8 / 0.75,
    };
    expect(curveYAt(u, mid.x)).toBeCloseTo(mid.y, 3);
  });

  it('leaves straight curves and two-point curves as their points', () => {
    const straight = { ...u, shape: 'straight' as const };
    expect(curvePath(straight)).toBe(straight.points);
    expect(curvePath({ ...u, points: u.points.slice(0, 2) })).toHaveLength(2);
  });

  it('reads a height off the spline, not the control polygon', () => {
    // The polygon's corner is at (0.3, 0.2); the spline bottoms out beside it, not on a chord.
    const polygonY = 0.2 + ((0.45 - 0.3) * 0.5) / 0.3;
    expect(Math.abs(curveYAt(u, 0.45)! - polygonY)).toBeGreaterThan(0.005);
  });
});

describe('monopoly-u-mc', () => {
  const d = buildFromTemplate('monopoly-u-mc');
  const mc = curveNamed(d, 'MC');

  it('draws MC curved, U-shaped, and marks Qm on its rising arm', () => {
    expect(mc.shape).toBe('curved');
    const qm = tick(d, 'x', 'Qm').at.x;
    expect(curveYAt(mc, qm + 0.02)!).toBeGreaterThan(curveYAt(mc, qm)!);
    expect(curveYAt(mc, 0.06)!).toBeGreaterThan(curveYAt(mc, 0.3)!);
  });

  it('puts MR = MC and D = MC on the drawn MC', () => {
    const mrMc = d.points.find((p) => !p.xTickLabel && p.anchor && 'cross' in p.anchor)!;
    expect(mrMc.at.y).toBeCloseTo(curveYAt(mc, mrMc.at.x)!, 9);
    const c = tick(d, 'x', 'Qc').at;
    expect(c.y).toBeCloseTo(curveYAt(mc, c.x)!, 9);
    expect(tick(d, 'x', 'Qm').at.x).toBeCloseTo(mrMc.at.x, 9);
  });

  it('shades the DWL between D and MC from Qm to Qc', () => {
    const poly = areaPolygon(d, d.areas![0])!;
    const xs = poly.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(tick(d, 'x', 'Qm').at.x, 6);
    expect(Math.max(...xs)).toBeCloseTo(tick(d, 'x', 'Qc').at.x, 6);
  });
});

describe('unit-elastic-revenue', () => {
  const d = buildFromTemplate('unit-elastic-revenue');

  it('draws D as a curved rectangular hyperbola: P × Q is the same at both points', () => {
    expect(curveNamed(d, 'D').shape).toBe('curved');
    const [e1, e2] = d.points.map((p) => p.at);
    expect(e1.x * e1.y).toBeCloseTo(0.1, 2);
    expect(e2.x * e2.y).toBeCloseTo(0.1, 2);
  });

  it('makes the gain (+) and the loss (−) equal', () => {
    const gain = shoelace(areaPolygon(d, areaNamed(d, '+'))!);
    const loss = shoelace(areaPolygon(d, areaNamed(d, '−'))!);
    expect(gain).toBeGreaterThan(0.02);
    expect(gain / loss).toBeCloseTo(1, 1);
    expect(polygonCentroid(areaPolygon(d, areaNamed(d, '+'))!).x).toBeGreaterThan(polygonCentroid(areaPolygon(d, areaNamed(d, '−'))!).x);
  });

  it('keeps both points on the drawn D', () => {
    for (const p of d.points) expect(resolveAnchor(d, p.anchor!)!.y).toBeCloseTo(curveYAt(curveNamed(d, 'D'), p.at.x)!, 9);
  });
});

const drag = (d: Diagram, curveId: string, dx: number, dy: number) =>
  resolveDiagram(applyDrag(d, { kind: 'curve', curveId }, { x: 0, y: 0 }, { x: dx, y: dy }));
const pointNamed = (d: Diagram, text: string) => d.points.find((p) => plain(p.label?.en) === text)!;

describe('tax-efficiency', () => {
  const d = buildFromTemplate('tax-efficiency');
  const mb = pointNamed(d, 'MB');
  const mc = pointNamed(d, 'MC');

  it('marks MB on D above MC on S₀ at Q₁, and shades the DWL', () => {
    expect(mc.at.x).toBeCloseTo(mb.at.x, 9);
    expect(mb.at.y).toBeGreaterThan(mc.at.y + 0.1);
    expect(mc.at.y).toBeCloseTo(curveYAt(curveNamed(d, 'S0 = MC'), mc.at.x)!, 9);
    expect(areaPolygon(d, d.areas![0])).not.toBeNull();
  });

  it('keeps MC under MB when the tax grows', () => {
    const after = drag(d, curveNamed(d, 'S1').id, 0, 0.06);
    expect(pointNamed(after, 'MC').at.x).toBeCloseTo(pointNamed(after, 'MB').at.x, 9);
    expect(pointNamed(after, 'MB').at.x).toBeLessThan(mb.at.x);
  });
});

describe('tax-net-revenue', () => {
  const d = buildFromTemplate('tax-net-revenue');
  const box = (x: Diagram) => {
    const poly = areaPolygon(x, x.areas!.find((a) => plain(a.label?.en).startsWith('revenue'))!)!;
    return { w: Math.max(...poly.map((p) => p.x)), h: Math.max(...poly.map((p) => p.y)) };
  };
  const sellers = (x: Diagram) => tick(x, 'y', 'P1 − t').at;

  it('shades (P₁ − t) × Q₁ from the origin, with the tax revenue above it', () => {
    expect(box(d).w).toBeCloseTo(tick(d, 'x', 'Q1').at.x, 9);
    expect(box(d).h).toBeCloseTo(sellers(d).y, 9);
    expect(tick(d, 'y', 'P1').at.y - sellers(d).y).toBeCloseTo(0.26, 6);
    expect(d.areas).toHaveLength(2);
  });

  it('follows a drag of D', () => {
    const after = drag(d, curveNamed(d, 'D').id, 0.05, 0);
    expect(box(after).w).toBeGreaterThan(box(d).w);
    expect(box(after).h).toBeCloseTo(sellers(after).y, 9);
  });
});

describe('money-rate-change', () => {
  const d = buildFromTemplate('money-rate-change');
  const md = curveNamed(d, 'Md');
  const along = d.spans!.find((s) => !s.along)!;

  it('moves along one Md, from r₀ up to r₁, with no Md shift', () => {
    expect(md.derive).toBeUndefined();
    expect(d.curves.filter((c) => plain(c.label?.en).startsWith('Md'))).toHaveLength(1);
    const [e0, e1] = [tick(d, 'y', 'r0').at, tick(d, 'y', 'r1').at];
    expect(e1.y).toBeGreaterThan(e0.y);
    for (const e of [e0, e1]) expect(e.y).toBeCloseTo(curveYAt(md, e.x)!, 9);
  });

  it('draws the movement as an arrow from E₀ to E₁ that follows a drag of Ms', () => {
    const before = spanGeometry(d, along)!.base;
    expect(before[1].y).toBeCloseTo(tick(d, 'y', 'r1').at.y, 9);
    const after = drag(d, curveNamed(d, 'Ms1').id, -0.05, 0);
    expect(spanGeometry(after, along)!.base[1].y).toBeCloseTo(tick(after, 'y', 'r1').at.y, 9);
    expect(spanGeometry(after, along)!.base[1].y).toBeGreaterThan(before[1].y);
  });
});

describe('ceiling-demand-falls', () => {
  const d = buildFromTemplate('ceiling-demand-falls');
  const areas = (x: Diagram) => ['DWL0', 'DWL1'].map((n) => shoelace(areaPolygon(x, areaNamed(x, n))!));

  it('draws DWL₁ after D falls as a smaller triangle than DWL₀', () => {
    const [dwl0, dwl1] = areas(d);
    expect(dwl1).toBeGreaterThan(0.005);
    expect(dwl1).toBeLessThan(dwl0 * 0.6);
  });

  it('keeps both triangles on the quantity sold, read off S at Pc', () => {
    const qt = tick(d, 'x', 'Qt').at.x;
    for (const n of ['DWL0', 'DWL1']) expect(Math.min(...areaPolygon(d, areaNamed(d, n))!.map((p) => p.x))).toBeCloseTo(qt, 9);
  });

  it('grows DWL₁ back toward DWL₀ as D₁ is dragged back right', () => {
    const after = drag(d, curveNamed(d, 'D1').id, 0.1, 0);
    expect(areas(after)[1]).toBeGreaterThan(areas(d)[1]);
    expect(areas(after)[0]).toBeCloseTo(areas(d)[0], 9);
  });
});
