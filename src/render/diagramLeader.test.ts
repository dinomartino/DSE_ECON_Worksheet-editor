import { describe, expect, it } from 'vitest';
import {
  boxAround,
  boxInside,
  boxMeets,
  boxMeetsLine,
  clearance,
  deepestPoint,
  interiorPoint,
  leaderCrossings,
  leaderLine,
  placeOutside,
} from './diagramLeader';

const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
/** A thin wedge: 200 wide, 8 tall. */
const wedge = [
  { x: 0, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 108 },
  { x: 0, y: 108 },
];

describe('the fit test', () => {
  it('fits a box wholly inside, and not one that pokes out', () => {
    expect(boxInside(boxAround({ x: 50, y: 50 }, 20, 14, 3), square)).toBe(true);
    expect(boxInside(boxAround({ x: 95, y: 50 }, 20, 14, 3), square)).toBe(false);
    // 14px of text plus margins in an 8px wedge.
    expect(boxInside(boxAround({ x: 100, y: 104 }, 20, 14, 3), wedge)).toBe(false);
  });

  it('catches a concave region whose edge cuts through an otherwise-inside box', () => {
    const notch = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 55, y: 100 },
      { x: 50, y: 40 },
      { x: 45, y: 100 },
      { x: 0, y: 100 },
    ];
    // All four corners are inside; the notch's tip is not.
    expect(boxInside(boxAround({ x: 50, y: 60 }, 60, 20), notch)).toBe(false);
  });

  it('tells overlap from clearance, for regions and lines', () => {
    expect(boxMeets(boxAround({ x: 110, y: 50 }, 30, 10), square)).toBe(true);
    expect(boxMeets(boxAround({ x: 130, y: 50 }, 30, 10), square)).toBe(false);
    expect(boxMeetsLine(boxAround({ x: 50, y: 50 }, 10, 10), [{ x: 0, y: 0 }, { x: 100, y: 100 }])).toBe(true);
    expect(boxMeetsLine(boxAround({ x: 80, y: 20 }, 10, 10), [{ x: 0, y: 0 }, { x: 100, y: 100 }])).toBe(false);
  });
});

describe('the leader', () => {
  it('aims at the centroid, or inside a region whose centroid is not', () => {
    expect(interiorPoint(square, { x: 50, y: 50 })).toEqual({ x: 50, y: 50 });
    const u = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 70 },
      { x: 70, y: 70 },
      { x: 70, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const at = interiorPoint(u, { x: 50, y: 40 });
    expect(at.x === 15 || at.x === 85).toBe(true);
  });

  const LEADER = { gap: 2, depth: 10, slack: 1, minShaft: 8, step: 0.5 };

  it('leaves the label box at its point nearest the target, 2px off the edge', () => {
    // Label to the right of the square: the tail is on the left edge, level with the target.
    expect(leaderLine(boxAround({ x: 160, y: 50 }, 30, 14), { x: 50, y: 50 }, square, LEADER)!.from).toEqual({
      x: 143,
      y: 50,
    });
    // Below and to the right: the tail is the box's top-left corner, not the centre's ray.
    expect(leaderLine(boxAround({ x: 160, y: 160 }, 30, 14), { x: 50, y: 50 }, square, LEADER)!.from).toEqual({
      x: 143,
      y: 151,
    });
  });

  it('ends the tip a full depth inside, from every edge, on the way to the target', () => {
    const line = leaderLine(boxAround({ x: 160, y: 160 }, 30, 14), { x: 50, y: 50 }, square, LEADER)!;
    expect(clearance(line.tip, square)).toBeGreaterThanOrEqual(10);
    expect(clearance(line.tip, square)).toBeLessThan(10.5); // the first such point, not the centre
    // On the tail→target line.
    const cross = (line.tip.x - line.from.x) * (50 - line.from.y) - (line.tip.y - line.from.y) * (50 - line.from.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });

  it('stops just short of the deepest point of a region too thin for the full depth', () => {
    const target = deepestPoint(wedge, { x: 100, y: 104 }, 10);
    expect(target.y).toBeCloseTo(104, 1);
    const line = leaderLine(boxAround({ x: 100, y: 60 }, 30, 14), target, wedge, LEADER)!;
    expect(line.from).toEqual({ x: 100, y: 69 });
    expect(line.tip.y).toBeGreaterThanOrEqual(102.9);
    expect(line.tip.y).toBeLessThan(104);
    expect(clearance(line.tip, wedge)).toBeGreaterThanOrEqual(2.9);
  });

  it('finds the deepest point of a small triangle, not its edge', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 0, y: 30 },
    ];
    const at = deepestPoint(triangle, { x: 10, y: 10 }, 10);
    // The incentre of a 30-30 right triangle sits 30 − 15√2 ≈ 8.79 from each leg.
    expect(clearance(at, triangle)).toBeGreaterThan(8.6);
    expect(deepestPoint(square, { x: 50, y: 50 }, 10)).toEqual({ x: 50, y: 50 });
  });

  it('draws no leader when the label already covers its target', () => {
    expect(leaderLine(boxAround({ x: 50, y: 50 }, 30, 14), { x: 50, y: 50 }, square, LEADER)).toBeNull();
  });

  it('counts what the leader crosses before it enters the region, not the entry itself', () => {
    const curve = [
      { x: 150, y: -50 },
      { x: 150, y: 200 },
    ];
    const edge = [
      { x: 100, y: -50 },
      { x: 100, y: 200 },
    ];
    expect(leaderCrossings({ x: 200, y: 50 }, { x: 50, y: 50 }, square, [curve, edge], [])).toBe(1);
    const text = [
      { x: 170, y: 40 },
      { x: 180, y: 40 },
      { x: 180, y: 60 },
      { x: 170, y: 60 },
    ];
    expect(leaderCrossings({ x: 200, y: 50 }, { x: 50, y: 50 }, square, [], [text])).toBe(1);
  });

  it('places a label clear of the region, inside the plot, avoiding a curve', () => {
    const plot = { x0: 0, y0: 0, x1: 400, y1: 300 };
    const options = { gap: 10, air: 0, tailGap: 2, step: 2, reach: 200, plot, lines: [], regions: [] };
    const clear = placeOutside(wedge, { x: 100, y: 104 }, 30, 14, options);
    expect(boxMeets(boxAround(clear, 30, 14, 9.9), wedge)).toBe(false);
    // A curve through the first choice pushes the label somewhere else.
    const blocked = placeOutside(wedge, { x: 100, y: 104 }, 30, 14, {
      ...options,
      lines: [[{ x: clear.x - 40, y: clear.y }, { x: clear.x + 40, y: clear.y }]],
    });
    expect(blocked).not.toEqual(clear);
  });

  it('prefers a spot whose leader crosses no curve, even a longer walk away', () => {
    const plot = { x0: -300, y0: -300, x1: 600, y1: 400 };
    // Curves just above and below the wedge: a label there would lead across one.
    const lines = [
      [{ x: 0, y: 90 }, { x: 200, y: 90 }],
      [{ x: 0, y: 118 }, { x: 200, y: 118 }],
    ];
    const options = { gap: 18, air: 0, tailGap: 2, step: 2, reach: 300, plot, regions: [] };
    const free = placeOutside(wedge, { x: 100, y: 104 }, 30, 14, { ...options, lines: [] });
    expect(Math.abs(free.x - 100)).toBeLessThan(1); // unobstructed, straight above or below
    const at = placeOutside(wedge, { x: 100, y: 104 }, 30, 14, { ...options, lines });
    expect(at.x).toBeGreaterThan(200);
    expect(at.y).toBeCloseTo(104, 6);
  });
});
