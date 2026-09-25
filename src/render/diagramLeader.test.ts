import { describe, expect, it } from 'vitest';
import { boxAround, boxInside, boxMeets, boxMeetsLine, interiorPoint, leaderLine, placeOutside } from './diagramLeader';

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

  it('runs from the label edge to just inside the region, never past the target', () => {
    const box = boxAround({ x: 100, y: 60 }, 30, 14);
    const line = leaderLine(box, { x: 100, y: 104 }, wedge, 2, 6)!;
    expect(line.from).toEqual({ x: 100, y: 69 });
    expect(line.tip.y).toBeCloseTo(104, 6); // 4px in reaches the target before the 6px reach
    const short = leaderLine(box, { x: 100, y: 140 }, [
      { x: 0, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 180 },
      { x: 0, y: 180 },
    ], 2, 6)!;
    expect(short.tip.y).toBeCloseTo(106, 6); // clamped: 6px past where it enters
  });

  it('draws no leader when the label already covers its target', () => {
    expect(leaderLine(boxAround({ x: 50, y: 50 }, 30, 14), { x: 50, y: 50 }, square, 2, 6)).toBeNull();
  });

  it('places a label clear of the region, inside the plot, avoiding a curve', () => {
    const plot = { x0: 0, y0: 0, x1: 400, y1: 300 };
    const options = { gap: 10, step: 2, reach: 200, plot, lines: [], regions: [] };
    const clear = placeOutside(wedge, { x: 100, y: 104 }, 30, 14, options);
    expect(boxMeets(boxAround(clear, 30, 14, 9.9), wedge)).toBe(false);
    // A curve through the first choice pushes the label somewhere else.
    const blocked = placeOutside(wedge, { x: 100, y: 104 }, 30, 14, {
      ...options,
      lines: [[{ x: clear.x - 40, y: clear.y }, { x: clear.x + 40, y: clear.y }]],
    });
    expect(blocked).not.toEqual(clear);
  });
});
