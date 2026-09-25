import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramCurve, DiagramPointMark } from './diagram';
import {
  curveCrossing,
  curveXAt,
  detachRelations,
  resolveAnchor,
  resolveDiagram,
  splineSegments,
} from './diagramAnchors';
import { deleteHandle } from './diagramDraw';

const line = (id: string, a: [number, number], b: [number, number], extra: Partial<DiagramCurve> = {}): DiagramCurve => ({
  id,
  points: [
    { x: a[0], y: a[1] },
    { x: b[0], y: b[1] },
  ],
  shape: 'straight',
  ...extra,
});

const base = (curves: DiagramCurve[], points: DiagramPointMark[] = []): Diagram => ({
  x: {},
  y: {},
  curves,
  points,
  labels: [],
  arrows: [],
});

const close = (a: { x: number; y: number } | null | undefined, b: { x: number; y: number }) => {
  expect(a).toBeTruthy();
  expect(a!.x).toBeCloseTo(b.x, 9);
  expect(a!.y).toBeCloseTo(b.y, 9);
};

// D falls from (0, 0.9) to (0.9, 0); S rises from (0, 0.1) to (0.9, 1). They meet at (0.4, 0.5).
const D = line('d', [0, 0.9], [0.9, 0]);
const S = line('s', [0, 0.1], [0.9, 1]);

describe('resolveAnchor', () => {
  it('resolves a crossing, and a point anchored to it', () => {
    const diagram = base([D, S], [{ id: 'e', at: { x: 0, y: 0 }, anchor: { cross: ['d', 's'] } }]);
    close(resolveAnchor(diagram, { cross: ['d', 's'] }), { x: 0.4, y: 0.5 });
    // `{ point }` follows the point's own anchor, not its stale `at`.
    close(resolveAnchor(diagram, { point: 'e' }), { x: 0.4, y: 0.5 });
  });

  it('reads a curve at a level ({ on, y }): Qd and Qs at a ceiling', () => {
    const diagram = base([D, S]);
    close(resolveAnchor(diagram, { on: 'd', y: 0.3 }), { x: 0.6, y: 0.3 });
    close(resolveAnchor(diagram, { on: 's', y: 0.3 }), { x: 0.2, y: 0.3 });
    // The level can itself be an anchor's y.
    close(resolveAnchor(diagram, { on: 's', y: { cross: ['d', 's'] } }), { x: 0.4, y: 0.5 });
    expect(resolveAnchor(diagram, { on: 's', y: 1.5 })).toBeNull();
  });

  it('keeps { on, x } unchanged: the curve under another anchor', () => {
    const diagram = base([D, S]);
    close(resolveAnchor(diagram, { on: 's', x: { cross: ['d', 's'] } }), { x: 0.4, y: 0.5 });
  });

  it('composes one anchor x with another y', () => {
    const diagram = base([D, S], [{ id: 'p', at: { x: 0.2, y: 0.7 } }]);
    close(resolveAnchor(diagram, { x: { cross: ['d', 's'] }, y: { point: 'p' } }), { x: 0.4, y: 0.7 });
    close(resolveAnchor(diagram, { x: 0.25, y: { cross: ['d', 's'] } }), { x: 0.25, y: 0.5 });
  });

  it('is cycle-safe: a point that refers back to itself resolves to its stored `at`', () => {
    const diagram = base(
      [D],
      [
        { id: 'a', at: { x: 0.1, y: 0.2 }, anchor: { point: 'b' } },
        { id: 'b', at: { x: 0.3, y: 0.4 }, anchor: { point: 'a' } },
        { id: 'self', at: { x: 0.5, y: 0.6 }, anchor: { on: 'd', y: { point: 'self' } } },
      ],
    );
    // a → b → a: a closes the loop, so it stays put and b follows it.
    close(resolveAnchor(diagram, { point: 'a' }), { x: 0.1, y: 0.2 });
    const resolved = resolveDiagram(diagram);
    close(resolved.points[0].at, { x: 0.1, y: 0.2 });
    close(resolved.points[1].at, { x: 0.1, y: 0.2 });
    // On D at its own level: the loop closes on itself, so it stays where it was stored.
    close(resolved.points[2].at, { x: 0.5, y: 0.6 });
    // Idempotent: resolving again changes nothing.
    expect(resolveDiagram(resolved)).toBe(resolved);
  });

  it('falls back to the stored position when curves no longer meet', () => {
    const apart = base([D, line('s', [0, 0.95], [0.1, 1])], [{ id: 'e', at: { x: 0.4, y: 0.5 }, anchor: { cross: ['d', 's'] } }]);
    expect(resolveDiagram(apart)).toBe(apart);
  });

  it('returns the very same object for a diagram with no relations', () => {
    const diagram = base([D, S], [{ id: 'e', at: { x: 0.4, y: 0.5 } }]);
    expect(resolveDiagram(diagram)).toBe(diagram);
  });
});

describe('derived curves', () => {
  it('MR shares D’s vertical intercept and is twice as steep', () => {
    const demand = line('d', [0.1, 0.8], [0.8, 0.1]); // y = 0.9 − x
    const diagram = resolveDiagram(base([demand, line('mr', [0, 0], [0, 0], { derive: { kind: 'marginalRevenue', of: 'd' } })]));
    const mr = diagram.curves[1].points;
    close(mr[0], { x: 0, y: 0.9 });
    close(mr[1], { x: 0.45, y: 0 });
    const slope = (mr[1].y - mr[0].y) / (mr[1].x - mr[0].x);
    expect(slope).toBeCloseTo(-2, 9);
  });

  it('MR follows D when D is dragged', () => {
    const demand = line('d', [0, 0.6], [0.6, 0]);
    const diagram = base([demand, line('mr', [0, 0], [1, 1], { derive: { kind: 'marginalRevenue', of: 'd' } })]);
    const mr = resolveDiagram(diagram).curves[1].points;
    close(mr[1], { x: 0.3, y: 0 });
  });

  it('draws a parallel through a point, across the plot', () => {
    const tot = line('tot', [0, 0.8], [0.8, 0]);
    const diagram = resolveDiagram(
      base(
        [tot, line('cpf', [0, 0], [0, 0], { derive: { kind: 'parallel', to: 'tot', through: { point: 'c' } } })],
        [{ id: 'c', at: { x: 0.5, y: 0.5 } }],
      ),
    );
    const [a, b] = diagram.curves[1].points;
    close(a, { x: 0, y: 1 });
    close(b, { x: 1, y: 0 });
  });

  it('a tangent to a straight curve is the curve’s own line', () => {
    const diagram = resolveDiagram(
      base([line('ppf', [0, 0.6], [0.3, 0]), line('t', [0, 0], [0, 0], { derive: { kind: 'tangent', to: 'ppf', at: { x: 0.1, y: 0.4 } } })]),
    );
    const [a, b] = diagram.curves[1].points;
    close(a, { x: 0, y: 0.6 });
    close(b, { x: 0.3, y: 0 });
  });

  it('a tangent to a concave PPF touches it at the nearest point', () => {
    const ppf: DiagramCurve = {
      id: 'ppf',
      shape: 'curved',
      points: [
        { x: 0, y: 0.8 },
        { x: 0.45, y: 0.62 },
        { x: 0.7, y: 0.3 },
        { x: 0.8, y: 0 },
      ],
    };
    const aspect = 0.75;
    const diagram = resolveDiagram(
      base([ppf, line('tot', [0, 0], [0, 0], { derive: { kind: 'tangent', to: 'ppf', at: { x: 0.45, y: 0.62 } } })]),
      aspect,
    );
    const [a, b] = diagram.curves[1].points;
    // Falling, and the vertex it was aimed at lies on it (a spline passes its vertices).
    expect(b.y).toBeLessThan(a.y);
    const yAt = a.y + ((0.45 - a.x) * (b.y - a.y)) / (b.x - a.x);
    expect(yAt).toBeCloseTo(0.62, 3);
    // Tangent, not secant: every sample of the drawn spline lies on or below the line.
    for (const seg of splineSegments(ppf.points.map((p) => ({ x: p.x, y: p.y * aspect })))) {
      for (let s = 0; s <= 20; s += 1) {
        const t = s / 20;
        const u = 1 - t;
        const px = u * u * u * seg.p1.x + 3 * u * u * t * seg.c1.x + 3 * u * t * t * seg.c2.x + t * t * t * seg.p2.x;
        const py = (u * u * u * seg.p1.y + 3 * u * u * t * seg.c1.y + 3 * u * t * t * seg.c2.y + t * t * t * seg.p2.y) / aspect;
        const lineY = a.y + ((px - a.x) * (b.y - a.y)) / (b.x - a.x);
        expect(py).toBeLessThanOrEqual(lineY + 2e-3);
      }
    }
  });

  it('draws a level and a vertical line, from a number or an anchor', () => {
    const diagram = resolveDiagram(
      base([
        D,
        S,
        line('pc', [0, 0], [0, 0], { derive: { kind: 'level', y: 0.3 } }),
        line('pe', [0, 0], [0, 0], { derive: { kind: 'level', y: { cross: ['d', 's'] }, from: 0, to: 0.4 } }),
        line('lras', [0, 0], [0, 0], { derive: { kind: 'vertical', x: 0.7 } }),
      ]),
    );
    expect(diagram.curves[2].points).toEqual([{ x: 0, y: 0.3 }, { x: 1, y: 0.3 }]);
    close(diagram.curves[3].points[0], { x: 0, y: 0.5 });
    close(diagram.curves[3].points[1], { x: 0.4, y: 0.5 });
    expect(diagram.curves[4].points).toEqual([{ x: 0.7, y: 0 }, { x: 0.7, y: 1 }]);
    // A point on S at the level line's price: `{ on, y }` through a derived curve.
    const qs = resolveAnchor(diagram, { on: 's', y: { cross: ['pc', 'd'] } });
    close(qs, { x: 0.2, y: 0.3 });
  });

  it('curveXAt reads a vertical segment', () => {
    expect(curveXAt(line('v', [0.4, 0], [0.4, 1]), 0.5)).toBeCloseTo(0.4, 9);
    expect(curveCrossing(D, S)).toBeTruthy();
  });
});

describe('detaching relations', () => {
  it('deleting a curve freezes what followed it where it last was', () => {
    const diagram = base(
      [D, S, line('mr', [0, 0], [0, 0], { derive: { kind: 'marginalRevenue', of: 'd' } })],
      [{ id: 'e', at: { x: 0, y: 0 }, anchor: { cross: ['d', 's'] } }],
    );
    const next = deleteHandle(diagram, { kind: 'curve', curveId: 'd' });
    const e = next.points[0];
    expect(e.anchor).toBeUndefined();
    close(e.at, { x: 0.4, y: 0.5 });
    const mr = next.curves.find((c) => c.id === 'mr')!;
    expect(mr.derive).toBeUndefined();
    close(mr.points[0], { x: 0, y: 0.9 });
  });

  it('a span end naming a deleted point becomes that point’s last position', () => {
    const diagram: Diagram = {
      ...base([D, S], [{ id: 'e', at: { x: 0.4, y: 0.5 } }]),
      spans: [{ id: 'sp', from: { point: 'e' }, to: { cross: ['d', 's'] }, style: 'arrow' }],
    };
    const next = detachRelations(diagram, { ...diagram, points: [] });
    close(next.spans![0].from as { x: number; y: number }, { x: 0.4, y: 0.5 });
    expect(next.spans![0].to).toEqual({ cross: ['d', 's'] });
  });
});
