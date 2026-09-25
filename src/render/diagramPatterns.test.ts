import { describe, expect, it } from 'vitest';
import type { DiagramAreaPattern } from '@/model/diagram';
import { revenueArea } from '@/model/diagramAreas';
import { buildFromTemplate } from '@/model/diagramTemplates';
import { AREA_PALETTE, areaFillMarkup, diagramSvg } from './diagram';
import { clearance, inside, type Pt } from './diagramLeader';

/** A 100×60 box and an L (the gain of a both-ways rise), in pixels. */
const BOX: Pt[] = [
  { x: 10, y: 10 },
  { x: 110, y: 10 },
  { x: 110, y: 70 },
  { x: 10, y: 70 },
];
const L: Pt[] = [
  { x: 0, y: 40 },
  { x: 60, y: 40 },
  { x: 60, y: 100 },
  { x: 90, y: 100 },
  { x: 90, y: 0 },
  { x: 0, y: 0 },
];

type Segment = { a: Pt; b: Pt };

/** The `M x y L x y` segments of a line pattern's path. */
function segments(markup: string): Segment[] {
  const d = markup.match(/ d="([^"]*)"/)?.[1] ?? '';
  return [...d.matchAll(/M (-?[\d.]+) (-?[\d.]+) L (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({
    a: { x: Number(m[1]), y: Number(m[2]) },
    b: { x: Number(m[3]), y: Number(m[4]) },
  }));
}

/** The centres and radius of a dot pattern's circles (`M cx−r cy a r r …`). */
function dots(markup: string): Array<{ c: Pt; r: number }> {
  const d = markup.match(/ d="([^"]*)"/)?.[1] ?? '';
  return [...d.matchAll(/M (-?[\d.]+) (-?[\d.]+) a ([\d.]+) /g)].map((m) => ({
    c: { x: Number(m[1]) + Number(m[3]), y: Number(m[2]) },
    r: Number(m[3]),
  }));
}

const hatch = (pattern: DiagramAreaPattern, poly: Pt[] = BOX, density?: 'dense', scale = 1) =>
  areaFillMarkup(poly, { fill: 'hatch', pattern, density }, scale);

/** Every segment lies in the polygon: its ends on or in it, its midpoint inside. */
function expectClipped(list: Segment[], poly: Pt[]) {
  expect(list.length).toBeGreaterThan(0);
  for (const { a, b } of list) {
    expect(inside({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, poly)).toBe(true);
    for (const end of [a, b]) {
      const xs = poly.map((p) => p.x);
      const ys = poly.map((p) => p.y);
      expect(end.x).toBeGreaterThanOrEqual(Math.min(...xs) - 0.01);
      expect(end.x).toBeLessThanOrEqual(Math.max(...xs) + 0.01);
      expect(end.y).toBeGreaterThanOrEqual(Math.min(...ys) - 0.01);
      expect(end.y).toBeLessThanOrEqual(Math.max(...ys) + 0.01);
    }
  }
}

/** Perpendicular distances between neighbouring parallel lines `a·x + b·y = c`. */
function spacings(list: Segment[], a: number, b: number): number[] {
  const norm = Math.hypot(a, b);
  const cs = [...new Set(list.map((s) => Math.round(((a * s.a.x + b * s.a.y) / norm) * 100) / 100))].sort(
    (p, q) => p - q,
  );
  return cs.slice(1).map((c, i) => c - cs[i]);
}

describe('hatch patterns: plain clipped segments, one orientation each', () => {
  it('draws "/" for diagonal: up to the right on screen', () => {
    const list = segments(hatch('diagonal'));
    expectClipped(list, BOX);
    for (const { a, b } of list) {
      expect(b.x).toBeGreaterThan(a.x);
      expect(b.y - a.y).toBeCloseTo(-(b.x - a.x), 1);
    }
  });

  it('draws "\\" for reverse: down to the right on screen', () => {
    const list = segments(hatch('reverse'));
    expectClipped(list, BOX);
    for (const { a, b } of list) {
      expect(b.x).toBeGreaterThan(a.x);
      expect(b.y - a.y).toBeCloseTo(b.x - a.x, 1);
    }
  });

  it('draws both diagonals for cross', () => {
    const list = segments(hatch('cross'));
    expectClipped(list, BOX);
    const up = list.filter(({ a, b }) => b.y < a.y);
    const down = list.filter(({ a, b }) => b.y > a.y);
    expect(up.length).toBeGreaterThan(5);
    expect(down.length).toBeGreaterThan(5);
    expect(up.length + down.length).toBe(list.length);
  });

  it('draws level lines for horizontal and upright ones for vertical', () => {
    const across = segments(hatch('horizontal'));
    expectClipped(across, BOX);
    for (const { a, b } of across) expect(a.y).toBe(b.y);
    const upright = segments(hatch('vertical'));
    expectClipped(upright, BOX);
    for (const { a, b } of upright) expect(a.x).toBe(b.x);
  });

  it('clips every line pattern to a concave L, never bridging its notch', () => {
    for (const pattern of ['diagonal', 'reverse', 'cross', 'horizontal', 'vertical'] as const) {
      expectClipped(segments(hatch(pattern, L)), L);
    }
    // A horizontal line through both arms is two segments, not one across the notch.
    const row = segments(hatch('horizontal', L)).filter(({ a }) => a.y === 60);
    expect(row).toHaveLength(1);
    expect(row[0].a.x).toBeGreaterThanOrEqual(60);
  });

  it('sets its lines 5px apart, or 3px when dense, scaled with the raster', () => {
    const normal = spacings(segments(hatch('horizontal')), 0, 1);
    const dense = spacings(segments(hatch('horizontal', BOX, 'dense')), 0, 1);
    expect(new Set(normal)).toEqual(new Set([5]));
    expect(new Set(dense)).toEqual(new Set([3]));
    for (const gap of spacings(segments(hatch('diagonal', BOX, 'dense')), 1, 1)) expect(gap).toBeCloseTo(3, 1);
    const scaled = spacings(segments(hatch('vertical', [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 180 }, { x: 0, y: 180 }], undefined, 3)), 1, 0);
    expect(new Set(scaled)).toEqual(new Set([15]));
    expect(hatch('horizontal', BOX, undefined, 3)).toContain('stroke-width="2.4"');
  });

  it('places dots wholly inside, filled in the hatch ink, closer when dense', () => {
    const normal = dots(hatch('dots', L));
    expect(normal.length).toBeGreaterThan(20);
    for (const { c, r } of normal) expect(clearance(c, L)).toBeGreaterThanOrEqual(r - 0.01);
    const dense = dots(hatch('dots', L, 'dense'));
    expect(dense.length).toBeGreaterThan(normal.length * 2);
    const markup = areaFillMarkup(BOX, { fill: 'hatch', pattern: 'dots', color: 'blue' }, 1);
    expect(markup).toContain(`fill="${AREA_PALETTE.blue.hatch}" stroke="none"`);
  });

  it('paints every pattern in the palette ink and never uses <pattern>, <marker> or url()', () => {
    for (const pattern of ['diagonal', 'reverse', 'cross', 'horizontal', 'vertical', 'dots'] as const) {
      const markup = areaFillMarkup(L, { fill: 'hatch', pattern, color: 'red' }, 1);
      expect(markup).toContain(AREA_PALETTE.red.hatch);
      expect(markup).not.toMatch(/<pattern|<marker|url\(/);
    }
  });

  it('emits nothing for a region too small to hold a line or a dot', () => {
    const sliver: Pt[] = [
      { x: 1, y: 1 },
      { x: 1.5, y: 1 },
      { x: 1.5, y: 1.5 },
    ];
    expect(hatch('horizontal', sliver)).toBe('');
    expect(hatch('dots', sliver)).toBe('');
  });
});

describe('revenue areas in the SVG', () => {
  it('draws TR, gain and loss after a shift through the one renderer, with no ids', () => {
    const base = buildFromTemplate('supply-demand');
    const e0 = base.points[0];
    const diagram = {
      ...base,
      points: [...base.points, { ...e0, id: 'E1', at: { x: 0.4, y: 0.62 } }],
    };
    const points = { before: { point: e0.id }, after: { point: 'E1' } };
    diagram.areas = [
      revenueArea('totalRevenue', points, 'tr')!,
      revenueArea('revenueGain', points, 'gain')!,
      revenueArea('revenueLoss', points, 'loss')!,
    ];
    const svg = diagramSvg(diagram, { widthPx: 400, heightPx: 320, language: 'en' });
    expect(svg).toContain('fill="#d9d9d9"');
    expect(svg).toMatch(/ a 0\.9 0\.9 0 1 0 1\.8 0/);
    expect(svg).toContain('>TR</tspan>');
    expect(svg).toContain('>Gain</tspan>');
    expect(svg).toContain('>Loss</tspan>');
    expect(svg).not.toMatch(/<pattern|<marker|url\(/);
  });
});
