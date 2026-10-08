import { describe, expect, it } from 'vitest';
import { DIAGRAM_PLOT_ASPECT, type Diagram, type DiagramArea, type DiagramPoint } from '@/model/diagram';
import { curveCrossing, curvePath, resolveDiagram, splineSegments } from '@/model/diagramAnchors';
import { areaPolygon } from '@/model/diagramAreas';
import { diagramPlot, plotAspectOf } from './diagram';

/**
 * A `curved` curve is drawn as a spline through its points in *pixel* space, so its
 * shape depends on the plot's height ÷ width. Readings of it (crossings, areas) must
 * use the real plot's shape, not the 3:4 the templates are drawn against.
 */

// A bowed demand curve, a straight supply, their crossing, and CS under D down to it.
const diagram: Diagram = {
  x: {},
  y: {},
  curves: [
    {
      id: 'd',
      points: [
        { x: 0.05, y: 0.92 },
        { x: 0.1, y: 0.3 },
        { x: 0.5, y: 0.16 },
        { x: 0.95, y: 0.12 },
      ],
      shape: 'curved',
    },
    { id: 's', points: [{ x: 0.02, y: 0.02 }, { x: 0.6, y: 0.9 }], shape: 'straight' },
  ],
  points: [{ id: 'e', at: { x: 0, y: 0 }, anchor: { cross: ['d', 's'] } }],
  labels: [],
  arrows: [],
};
const cs: DiagramArea = {
  id: 'cs',
  band: { edges: [{ curve: 'd' }, { level: { point: 'e' } }], from: 0, to: { point: 'e' } },
};

/** The drawn curve: the renderer's spline through the projected points, finely sampled. */
function drawnCurve(proj: ReturnType<typeof diagramPlot>): DiagramPoint[] {
  const px = diagram.curves[0].points.map((p) => ({ x: proj.px(p.x), y: proj.py(p.y) }));
  const out: DiagramPoint[] = [];
  for (const { p1, c1, c2, p2 } of splineSegments(px)) {
    for (let s = 0; s <= 400; s += 1) {
      const t = s / 400;
      const u = 1 - t;
      const at = (a: number, b: number, c: number, d: number) =>
        u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
      out.push({ x: at(p1.x, c1.x, c2.x, p2.x), y: at(p1.y, c1.y, c2.y, p2.y) });
    }
  }
  return out;
}

/** Pixels from a unit-space point to the drawn curve. */
function offCurvePx(proj: ReturnType<typeof diagramPlot>, p: DiagramPoint): number {
  const q = { x: proj.px(p.x), y: proj.py(p.y) };
  return Math.min(...drawnCurve(proj).map((c) => Math.hypot(c.x - q.x, c.y - q.y)));
}

describe('a curve on a plot that is not 3:4 is read where it is drawn', () => {
  // Tall: the plot is far from 3:4, so the two readings visibly disagree.
  const proj = diagramPlot(diagram, { widthPx: 300, heightPx: 700, language: 'en' });
  const aspect = plotAspectOf(proj);

  it('is a plot well away from 3:4', () => {
    expect(aspect).toBeGreaterThan(1.3);
  });

  it('puts an anchored crossing on the drawn curve', () => {
    const at = resolveDiagram(diagram, aspect).points[0].at;
    // Under a pixel: the rest is the sampled path's chord at the knee.
    expect(offCurvePx(proj, at)).toBeLessThan(1);
    // Read at 3:4, the old way, it sat visibly off the line.
    expect(offCurvePx(proj, resolveDiagram(diagram).points[0].at)).toBeGreaterThan(2);
  });

  it('runs a shaded area along the drawn curve', () => {
    const resolved = resolveDiagram(diagram, aspect);
    const polygon = areaPolygon(resolved, cs, aspect)!;
    const e = resolved.points[0].at;
    const onEdge = polygon.filter((p) => p.x < e.x - 1e-6 && p.y > e.y + 1e-6);
    expect(onEdge.length).toBeGreaterThan(10);
    expect(Math.max(...onEdge.map((p) => offCurvePx(proj, p)))).toBeLessThan(1);
    const old = areaPolygon(resolveDiagram(diagram), cs)!.filter((p) => p.x > 0.06 && p.y > 0.3);
    expect(Math.max(...old.map((p) => offCurvePx(proj, p)))).toBeGreaterThan(2);
  });

  it('keeps 3:4 readings as they were: the default is the old constant, one cached path', () => {
    const d = diagram.curves[0];
    expect(curvePath(d)).toBe(curvePath(d, DIAGRAM_PLOT_ASPECT));
    expect(curvePath(d, aspect)).not.toBe(curvePath(d));
    expect(curvePath(d, aspect)).toBe(curvePath(d, aspect));
    expect(curveCrossing(d, diagram.curves[1])).toEqual(curveCrossing(d, diagram.curves[1], DIAGRAM_PLOT_ASPECT));
  });
});
