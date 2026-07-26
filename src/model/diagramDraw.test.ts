import { describe, expect, it } from 'vitest';
import type { Diagram } from './diagram';
import {
  applyDrag,
  copyHandles,
  cursorFor,
  deleteHandle,
  deleteHandles,
  dragHandles,
  hitTest,
  insertVertex,
  isBody,
  isClipEmpty,
  pasteInto,
  pointAt,
  sameHandle,
  selectWithin,
  snapPoint,
  type DiagramHandle,
} from './diagramDraw';
import { diagramPlot } from '@/render/diagram';

const blank = (): Diagram => ({
  x: {},
  y: {},
  curves: [],
  points: [],
  labels: [],
  arrows: [],
});

/** Demand falling left-to-right and supply rising, crossing near the middle. */
const supplyDemand = (): Diagram => ({
  ...blank(),
  curves: [
    { id: 'd', points: [{ x: 0.1, y: 0.9 }, { x: 0.9, y: 0.1 }], shape: 'straight' },
    { id: 's', points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }], shape: 'straight' },
  ],
});

describe('hitTest', () => {
  it('finds a curve vertex before the curve body', () => {
    const handle = hitTest(supplyDemand(), { x: 0.1, y: 0.9 }, 0.05);
    expect(handle).toEqual({ kind: 'vertex', curveId: 'd', index: 0 });
  });

  it('finds the curve body away from any vertex', () => {
    // Midpoint of demand: (0.5, 0.5) — but supply crosses there too, so probe elsewhere.
    const handle = hitTest(supplyDemand(), { x: 0.3, y: 0.7 }, 0.05);
    expect(handle).toEqual({ kind: 'curve', curveId: 'd' });
  });

  it('returns null in empty space', () => {
    expect(hitTest(supplyDemand(), { x: 0.8, y: 0.85 }, 0.02)).toBeNull();
  });

  it('prefers a marked point over the curve it sits on', () => {
    const diagram: Diagram = {
      ...supplyDemand(),
      points: [{ id: 'e', at: { x: 0.5, y: 0.5 } }],
    };
    expect(hitTest(diagram, { x: 0.5, y: 0.5 }, 0.05)).toEqual({ kind: 'point', pointId: 'e' });
  });

  it('picks the topmost body when two overlap', () => {
    const diagram: Diagram = {
      ...blank(),
      curves: [
        { id: 'under', points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], shape: 'straight' },
        { id: 'over', points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], shape: 'straight' },
      ],
    };
    expect(hitTest(diagram, { x: 0.5, y: 0.5 }, 0.05)).toEqual({ kind: 'curve', curveId: 'over' });
  });
});

describe('isBody', () => {
  it('treats whole-element handles as bodies', () => {
    expect(isBody({ kind: 'curve', curveId: 'd' })).toBe(true);
    expect(isBody({ kind: 'arrow', arrowId: 'a' })).toBe(true);
  });

  it('does not treat a vertex of a curve as that curve', () => {
    // The canvas asks this when deciding whether a press landed on the current
    // selection. Answering "yes" for a vertex of a selected curve would drag the whole
    // line instead of the one endpoint the pointer is actually on.
    expect(isBody({ kind: 'vertex', curveId: 'd', index: 0 })).toBe(false);
    expect(isBody({ kind: 'arrowFrom', arrowId: 'a' })).toBe(false);
    expect(isBody({ kind: 'arrowTo', arrowId: 'a' })).toBe(false);
  });

  it('does not treat points or labels as bodies, so each is grabbed on its own', () => {
    expect(isBody({ kind: 'point', pointId: 'p' })).toBe(false);
    expect(isBody({ kind: 'label', labelId: 'l' })).toBe(false);
  });
});

describe('cursorFor', () => {
  it('offers grab for a whole curve and grabbing while it is dragged', () => {
    const d = supplyDemand();
    expect(cursorFor(d, { kind: 'curve', curveId: 'd' }, false, false)).toBe('grab');
    expect(cursorFor(d, { kind: 'curve', curveId: 'd' }, false, true)).toBe('grabbing');
  });

  it('offers grab for a multi-selection, which has no axis to reshape along', () => {
    const d = supplyDemand();
    expect(cursorFor(d, { kind: 'vertex', curveId: 'd', index: 0 }, true, false)).toBe('grab');
  });

  it('orients the resize arrow along the segment an endpoint stretches', () => {
    // Demand falls left-to-right: on screen that runs top-left to bottom-right.
    expect(cursorFor(supplyDemand(), { kind: 'vertex', curveId: 'd', index: 0 }, false, false))
      .toBe('nwse-resize');
    // Supply rises, so it runs bottom-left to top-right — the other diagonal.
    expect(cursorFor(supplyDemand(), { kind: 'vertex', curveId: 's', index: 0 }, false, false))
      .toBe('nesw-resize');
  });

  it('reads a horizontal line as east-west and a vertical one as north-south', () => {
    const flat: Diagram = {
      ...blank(),
      curves: [
        { id: 'h', points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }], shape: 'straight' },
        { id: 'v', points: [{ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }], shape: 'straight' },
      ],
    };
    expect(cursorFor(flat, { kind: 'vertex', curveId: 'h', index: 1 }, false, false)).toBe('ew-resize');
    expect(cursorFor(flat, { kind: 'vertex', curveId: 'v', index: 1 }, false, false)).toBe('ns-resize');
  });

  it('falls back to move for a point or label, which stretch nothing', () => {
    const d: Diagram = {
      ...blank(),
      points: [{ id: 'p', at: { x: 0.5, y: 0.5 }, labelSide: 'upRight', dot: true }],
      labels: [{ id: 'l', at: { x: 0.3, y: 0.3 }, text: { en: [], zh: [] } }],
    };
    expect(cursorFor(d, { kind: 'point', pointId: 'p' }, false, false)).toBe('move');
    expect(cursorFor(d, { kind: 'label', labelId: 'l' }, false, false)).toBe('move');
  });

  it('orients an arrow endpoint along the arrow itself', () => {
    const d: Diagram = {
      ...blank(),
      arrows: [{ id: 'a', from: { x: 0.2, y: 0.5 }, to: { x: 0.8, y: 0.5 } }],
    };
    expect(cursorFor(d, { kind: 'arrowFrom', arrowId: 'a' }, false, false)).toBe('ew-resize');
    expect(cursorFor(d, { kind: 'arrowTo', arrowId: 'a' }, false, false)).toBe('ew-resize');
  });
});

describe('applyDrag', () => {
  it('moves one vertex to the pointer, leaving the rest', () => {
    const next = applyDrag(
      supplyDemand(),
      { kind: 'vertex', curveId: 'd', index: 0 },
      { x: 0.1, y: 0.9 },
      { x: 0.2, y: 0.95 },
    );
    expect(next.curves[0].points).toEqual([{ x: 0.2, y: 0.95 }, { x: 0.9, y: 0.1 }]);
  });

  it('translates a whole curve by the pointer delta', () => {
    const next = applyDrag(
      supplyDemand(),
      { kind: 'curve', curveId: 's' },
      { x: 0.5, y: 0.5 },
      { x: 0.55, y: 0.5 },
    );
    // Parallel shift: both ends move by the same +0.05, which is what "S₁ → S₂" needs.
    expect(next.curves[1].points[0].x).toBeCloseTo(0.15);
    expect(next.curves[1].points[1].x).toBeCloseTo(0.95);
    expect(next.curves[1].points[0].y).toBeCloseTo(0.1);
  });

  it('clamps a drag that leaves the unit square', () => {
    const next = applyDrag(
      supplyDemand(),
      { kind: 'vertex', curveId: 'd', index: 0 },
      { x: 0.1, y: 0.9 },
      { x: -0.4, y: 1.6 },
    );
    expect(next.curves[0].points[0]).toEqual({ x: 0, y: 1 });
  });

  it('does not mutate the diagram it is given', () => {
    const diagram = supplyDemand();
    applyDrag(diagram, { kind: 'curve', curveId: 'd' }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 });
    expect(diagram.curves[0].points[0]).toEqual({ x: 0.1, y: 0.9 });
  });

  it('is idempotent from the same origin, so re-applying a move does not drift', () => {
    const diagram = supplyDemand();
    const handle = { kind: 'curve', curveId: 'd' } as const;
    const once = applyDrag(diagram, handle, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 });
    const again = applyDrag(diagram, handle, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 });
    expect(again.curves[0].points).toEqual(once.curves[0].points);
  });
});

describe('dragging anchored text', () => {
  const labelled = (): Diagram => ({
    ...supplyDemand(),
    points: [
      {
        id: 'e',
        at: { x: 0.5, y: 0.5 },
        label: { en: [{ text: 'E₀' }], zh: [] },
        labelSide: 'upRight',
        xTickLabel: { en: [{ text: 'Q₀' }], zh: [] },
        yTickLabel: { en: [{ text: 'P₀' }], zh: [] },
        dot: true,
      },
    ],
    arrows: [{ id: 'a', from: { x: 0.2, y: 0.2 }, to: { x: 0.4, y: 0.4 } }],
  });

  it('writes an offset rather than moving the curve it names', () => {
    const before = labelled();
    const after = applyDrag(before, { kind: 'curveLabel', curveId: 'd' }, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.55 });
    const curve = after.curves.find((c) => c.id === 'd')!;
    expect(curve.labelOffset!.x).toBeCloseTo(0.1);
    expect(curve.labelOffset!.y).toBeCloseTo(0.05);
    // The line itself must not have moved: dragging a name is not dragging the curve.
    expect(curve.points).toEqual(before.curves.find((c) => c.id === 'd')!.points);
  });

  it('accumulates the delta so a second drag continues from the first', () => {
    let d = labelled();
    d = applyDrag(d, { kind: 'curveLabel', curveId: 'd' }, { x: 0, y: 0 }, { x: 0.1, y: 0 });
    d = applyDrag(d, { kind: 'curveLabel', curveId: 'd' }, { x: 0, y: 0 }, { x: 0.1, y: 0 });
    expect(d.curves.find((c) => c.id === 'd')!.labelOffset!.x).toBeCloseTo(0.2);
  });

  it('leaves a point where it is when its label is dragged', () => {
    const after = applyDrag(labelled(), { kind: 'pointLabel', pointId: 'e' }, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 });
    const mark = after.points[0];
    expect(mark.at).toEqual({ x: 0.5, y: 0.5 });
    expect(mark.labelOffset).toBeDefined();
    // The compass slot survives as the fallback the sidebar restores.
    expect(mark.labelSide).toBe('upRight');
  });

  it('slides a tick label along its own axis only', () => {
    const x = applyDrag(labelled(), { kind: 'pointTick', pointId: 'e', axis: 'x' }, { x: 0, y: 0 }, { x: 0.1, y: 0.4 });
    expect(x.points[0].xTickOffset).toBeCloseTo(0.1);
    // The cross-axis component of the drag is deliberately discarded.
    expect(x.points[0].yTickOffset).toBeUndefined();

    const y = applyDrag(labelled(), { kind: 'pointTick', pointId: 'e', axis: 'y' }, { x: 0, y: 0 }, { x: 0.4, y: 0.1 });
    expect(y.points[0].yTickOffset).toBeCloseTo(0.1);
    expect(y.points[0].xTickOffset).toBeUndefined();
  });

  it('nudges an axis title without touching the plot', () => {
    const base: Diagram = { ...blank(), x: { title: { en: [{ text: 'Quantity' }], zh: [] } } };
    const after = applyDrag(base, { kind: 'axisTitle', axis: 'x' }, { x: 0, y: 0 }, { x: 0.05, y: -0.02 });
    expect(after.x.titleOffset).toEqual({ x: 0.05, y: -0.02 });
    expect(after.y).toEqual(base.y);
  });

  it('slides an axis tick along its axis', () => {
    const base: Diagram = {
      ...blank(),
      x: { ticks: [{ id: 't', at: 0.5, label: { en: [{ text: 'Q₁' }], zh: [] } }] },
    };
    const after = applyDrag(base, { kind: 'axisTick', axis: 'x', tickId: 't' }, { x: 0, y: 0 }, { x: 0.07, y: 0.3 });
    expect(after.x.ticks![0].offset).toBeCloseTo(0.07);
    expect(after.x.ticks![0].at).toBe(0.5);
  });

  it('nudges an arrow label without re-aiming the arrow', () => {
    const before = labelled();
    const after = applyDrag(before, { kind: 'arrowLabel', arrowId: 'a' }, { x: 0, y: 0 }, { x: 0.03, y: 0.03 });
    const arrow = after.arrows[0];
    expect(arrow.labelOffset).toEqual({ x: 0.03, y: 0.03 });
    expect(arrow.from).toEqual(before.arrows[0].from);
    expect(arrow.to).toEqual(before.arrows[0].to);
  });

  it('deletes the text, never the thing it labels', () => {
    const after = deleteHandle(labelled(), { kind: 'curveLabel', curveId: 'd' });
    // The curve survives; only its name is gone.
    expect(after.curves.find((c) => c.id === 'd')).toBeDefined();
    expect(after.curves.find((c) => c.id === 'd')!.label).toBeUndefined();
  });

  it('drops a point label offset along with the label it positioned', () => {
    let d = applyDrag(labelled(), { kind: 'pointLabel', pointId: 'e' }, { x: 0, y: 0 }, { x: 0.2, y: 0.1 });
    d = deleteHandle(d, { kind: 'pointLabel', pointId: 'e' });
    expect(d.points[0]).toBeDefined();
    expect(d.points[0].label).toBeUndefined();
    expect(d.points[0].labelOffset).toBeUndefined();
  });

  it('copies the whole anchor when only its label is selected', () => {
    const clip = copyHandles(labelled(), [{ kind: 'curveLabel', curveId: 'd' }]);
    expect(clip.curves.map((c) => c.id)).toEqual(['d']);
  });

  it('addresses a pointticks pair separately per axis', () => {
    const x: DiagramHandle = { kind: 'pointTick', pointId: 'e', axis: 'x' };
    const y: DiagramHandle = { kind: 'pointTick', pointId: 'e', axis: 'y' };
    expect(sameHandle(x, x)).toBe(true);
    // Same point id, different axis: selecting one must not light up the other.
    expect(sameHandle(x, y)).toBe(false);
  });

  it('shows a constrained cursor for a tick and a free one for a label', () => {
    const d = labelled();
    expect(cursorFor(d, { kind: 'pointTick', pointId: 'e', axis: 'x' }, false, false)).toBe('ew-resize');
    expect(cursorFor(d, { kind: 'pointTick', pointId: 'e', axis: 'y' }, false, false)).toBe('ns-resize');
    expect(cursorFor(d, { kind: 'curveLabel', curveId: 'd' }, false, false)).toBe('move');
    expect(cursorFor(d, { kind: 'axisTitle', axis: 'x' }, false, false)).toBe('move');
  });

  it('finds a label by its rendered position, ahead of the curve underneath', () => {
    const d = labelled();
    const anchors = [{ handle: { kind: 'curveLabel', curveId: 'd' } as DiagramHandle, at: { x: 0.5, y: 0.52 } }];
    // Right on the label, which sits just above the crossing where both curves run.
    expect(hitTest(d, { x: 0.5, y: 0.52 }, 0.03, anchors)).toEqual({ kind: 'curveLabel', curveId: 'd' });
    // With no anchors supplied, the same spot falls through to the geometry as before.
    expect(hitTest(d, { x: 0.5, y: 0.52 }, 0.03)?.kind).not.toBe('curveLabel');
  });

  it('catches a label in a marquee drawn around it', () => {
    const anchors = [{ handle: { kind: 'axisTitle', axis: 'x' } as DiagramHandle, at: { x: 0.9, y: 0.05 } }];
    const caught = selectWithin(blank(), { from: { x: 0.8, y: 0 }, to: { x: 1, y: 0.1 } }, anchors);
    expect(caught).toContainEqual({ kind: 'axisTitle', axis: 'x' });
  });
});

describe('insertVertex', () => {
  it('adds a kink at the click, on the nearest segment', () => {
    const next = insertVertex(supplyDemand(), 'd', { x: 0.5, y: 0.52 });
    expect(next.curves[0].points).toEqual([
      { x: 0.1, y: 0.9 },
      { x: 0.5, y: 0.52 },
      { x: 0.9, y: 0.1 },
    ]);
  });

  it('inserts into the correct segment of an already-kinked curve', () => {
    const kinked: Diagram = {
      ...blank(),
      curves: [
        {
          id: 'q',
          points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }, { x: 0.9, y: 0.4 }],
          shape: 'straight',
        },
      ],
    };
    const next = insertVertex(kinked, 'q', { x: 0.7, y: 0.4 });
    expect(next.curves[0].points[2]).toEqual({ x: 0.7, y: 0.4 });
    expect(next.curves[0].points).toHaveLength(4);
  });
});

describe('deleteHandle', () => {
  it('removes a vertex from a kinked curve', () => {
    const kinked: Diagram = {
      ...blank(),
      curves: [
        {
          id: 'q',
          points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }, { x: 0.9, y: 0.4 }],
          shape: 'straight',
        },
      ],
    };
    const next = deleteHandle(kinked, { kind: 'vertex', curveId: 'q', index: 1 });
    expect(next.curves[0].points).toHaveLength(2);
  });

  it('removes the whole curve when deleting a vertex would leave a single point', () => {
    const next = deleteHandle(supplyDemand(), { kind: 'vertex', curveId: 'd', index: 0 });
    expect(next.curves.map((c) => c.id)).toEqual(['s']);
  });
});

describe('snapPoint', () => {
  it('snaps to the intersection of two curves', () => {
    const snapped = snapPoint(supplyDemand(), { x: 0.52, y: 0.48 }, 0.05);
    expect(snapped.x).toBeCloseTo(0.5);
    expect(snapped.y).toBeCloseTo(0.5);
  });

  it('leaves a position alone when nothing is within tolerance', () => {
    const at = { x: 0.2, y: 0.2 };
    expect(snapPoint(supplyDemand(), at, 0.01)).toEqual(at);
  });

  it('ignores the curve being dragged, so it cannot snap to itself', () => {
    const at = { x: 0.51, y: 0.49 };
    expect(snapPoint(supplyDemand(), at, 0.05, 'd')).toEqual(at);
  });

  it('snaps to an existing marked point', () => {
    const diagram: Diagram = { ...supplyDemand(), points: [{ id: 'e', at: { x: 0.3, y: 0.7 } }] };
    expect(snapPoint(diagram, { x: 0.31, y: 0.69 }, 0.05)).toEqual({ x: 0.3, y: 0.7 });
  });
});

describe('pointAt', () => {
  // Regression: snapping a new point at an already-marked intersection used to stack a
  // second point exactly on the first — invisible on screen and in the exported PNG,
  // but really in the model and impossible to select or delete by clicking.
  it('finds the point a snapped position landed on', () => {
    const diagram: Diagram = { ...supplyDemand(), points: [{ id: 'e', at: { x: 0.5, y: 0.5 } }] };
    const snapped = snapPoint(diagram, { x: 0.505, y: 0.495 }, 0.05);
    expect(pointAt(diagram, snapped)?.id).toBe('e');
  });

  it('returns nothing where no point has been marked', () => {
    const diagram: Diagram = { ...supplyDemand(), points: [{ id: 'e', at: { x: 0.5, y: 0.5 } }] };
    expect(pointAt(diagram, { x: 0.2, y: 0.8 })).toBeUndefined();
  });
});

/** A diagram with one of everything, spread so a marquee can isolate parts of it. */
const populated = (): Diagram => ({
  ...blank(),
  curves: [
    // Wholly inside the lower-left quadrant.
    { id: 'small', points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 }], shape: 'straight' },
    // Spans the whole plot, so it is only ever partially inside a small box.
    { id: 'wide', points: [{ x: 0.05, y: 0.95 }, { x: 0.95, y: 0.05 }], shape: 'straight' },
  ],
  points: [{ id: 'p1', at: { x: 0.2, y: 0.2 } }, { id: 'p2', at: { x: 0.8, y: 0.8 } }],
  labels: [{ id: 'l1', at: { x: 0.15, y: 0.25 }, text: { en: [{ text: 'a' }], zh: [] } }],
  arrows: [{ id: 'a1', from: { x: 0.12, y: 0.12 }, to: { x: 0.28, y: 0.12 } }],
});

describe('selectWithin', () => {
  it('catches every element fully inside the box', () => {
    const found = selectWithin(populated(), { from: { x: 0, y: 0 }, to: { x: 0.4, y: 0.4 } });
    expect(found).toEqual([
      { kind: 'curve', curveId: 'small' },
      { kind: 'point', pointId: 'p1' },
      { kind: 'label', labelId: 'l1' },
      { kind: 'arrow', arrowId: 'a1' },
    ]);
  });

  it('leaves out a curve that only crosses the box', () => {
    // `wide` passes through the lower-left box but its endpoints are far outside it.
    const found = selectWithin(populated(), { from: { x: 0, y: 0 }, to: { x: 0.4, y: 0.4 } });
    expect(found.some((h) => h.kind === 'curve' && h.curveId === 'wide')).toBe(false);
  });

  it('normalises a box dragged up-and-left', () => {
    const downRight = selectWithin(populated(), { from: { x: 0, y: 0 }, to: { x: 0.4, y: 0.4 } });
    const upLeft = selectWithin(populated(), { from: { x: 0.4, y: 0.4 }, to: { x: 0, y: 0 } });
    expect(upLeft).toEqual(downRight);
  });

  it('selects nothing for a box drawn in empty space', () => {
    expect(selectWithin(populated(), { from: { x: 0.5, y: 0.4 }, to: { x: 0.6, y: 0.5 } })).toEqual([]);
  });
});

describe('copy and paste', () => {
  const counter = () => {
    let n = 0;
    return () => `new${(n += 1)}`;
  };

  it('copies whole elements and pastes them offset with fresh ids', () => {
    const diagram = populated();
    const clip = copyHandles(diagram, selectWithin(diagram, { from: { x: 0, y: 0 }, to: { x: 0.4, y: 0.4 } }));
    expect(clip.curves.map((c) => c.id)).toEqual(['small']);

    const { diagram: next, handles } = pasteInto(diagram, clip, counter());
    expect(next.curves).toHaveLength(3);
    // Fresh ids, so a second paste cannot collide with the first.
    expect(next.curves[2].id).toBe('new1');
    expect(next.curves[2].points[0].x).toBeCloseTo(0.14);
    expect(next.curves[2].points[0].y).toBeCloseTo(0.06);
    expect(handles).toContainEqual({ kind: 'curve', curveId: 'new1' });
  });

  it('pastes the same clip twice without colliding', () => {
    const diagram = populated();
    const clip = copyHandles(diagram, [{ kind: 'curve', curveId: 'small' }]);
    const mint = counter();
    const once = pasteInto(diagram, clip, mint).diagram;
    const twice = pasteInto(once, clip, mint).diagram;
    const ids = twice.curves.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('copies the whole curve when only a vertex is selected', () => {
    // A single point of a polyline is not a thing that can exist on its own.
    const clip = copyHandles(populated(), [{ kind: 'vertex', curveId: 'small', index: 0 }]);
    expect(clip.curves).toHaveLength(1);
    expect(clip.curves[0].points).toHaveLength(2);
  });

  it('collapses duplicate handles for one element', () => {
    const clip = copyHandles(populated(), [
      { kind: 'arrowFrom', arrowId: 'a1' },
      { kind: 'arrowTo', arrowId: 'a1' },
    ]);
    expect(clip.arrows).toHaveLength(1);
  });

  it('clamps a paste that would land outside the plot', () => {
    const diagram = populated();
    const clip = copyHandles(diagram, [{ kind: 'point', pointId: 'p2' }]);
    // p2 is at 0.8,0.8; the default offset pushes x to 0.84 and y down to 0.76.
    const { diagram: next } = pasteInto(diagram, clip, counter(), { x: 0.5, y: 0.5 });
    expect(next.points[2].at).toEqual({ x: 1, y: 1 });
  });

  it('reports an empty clip', () => {
    expect(isClipEmpty(null)).toBe(true);
    expect(isClipEmpty({ curves: [], points: [], labels: [], arrows: [] })).toBe(true);
    expect(isClipEmpty(copyHandles(populated(), [{ kind: 'point', pointId: 'p1' }]))).toBe(false);
  });
});

describe('deleteHandles', () => {
  it('removes every selected element', () => {
    const diagram = populated();
    const next = deleteHandles(diagram, selectWithin(diagram, { from: { x: 0, y: 0 }, to: { x: 0.4, y: 0.4 } }));
    expect(next.curves.map((c) => c.id)).toEqual(['wide']);
    expect(next.points.map((p) => p.id)).toEqual(['p2']);
    expect(next.labels).toEqual([]);
    expect(next.arrows).toEqual([]);
  });

  it('deletes several vertices of one curve without index drift', () => {
    const kinked: Diagram = {
      ...blank(),
      curves: [
        {
          id: 'q',
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.3, y: 0.3 },
            { x: 0.5, y: 0.3 },
            { x: 0.7, y: 0.5 },
          ],
          shape: 'straight',
        },
      ],
    };
    // Removing index 1 first would make index 2 name a different point.
    const next = deleteHandles(kinked, [
      { kind: 'vertex', curveId: 'q', index: 1 },
      { kind: 'vertex', curveId: 'q', index: 2 },
    ]);
    expect(next.curves[0].points).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.7, y: 0.5 }]);
  });
});

describe('dragHandles', () => {
  it('moves every selected element by the same delta', () => {
    const diagram = populated();
    const handles = selectWithin(diagram, { from: { x: 0, y: 0 }, to: { x: 0.4, y: 0.4 } });
    const next = dragHandles(diagram, handles, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.2 });
    expect(next.curves[0].points[0].x).toBeCloseTo(0.2);
    expect(next.points[0].at.x).toBeCloseTo(0.3);
    expect(next.arrows[0].from.x).toBeCloseTo(0.22);
    // Anything outside the marquee stays put.
    expect(next.curves[1].points[0]).toEqual({ x: 0.05, y: 0.95 });
    expect(next.points[1].at).toEqual({ x: 0.8, y: 0.8 });
  });
});

describe('projection inverse', () => {
  it('round-trips unit space through pixels', () => {
    // The canvas relies on this: a pointer position mapped back to unit space and
    // forward again must land on the same pixel, or dropped geometry drifts.
    const proj = diagramPlot(supplyDemand(), { widthPx: 480, heightPx: 360, language: 'en' });
    for (const value of [0, 0.25, 0.5, 0.75, 1]) {
      expect(proj.ux(proj.px(value))).toBeCloseTo(value);
      expect(proj.uy(proj.py(value))).toBeCloseTo(value);
    }
  });

  it('accounts for the room a long axis title takes, not just the padding constants', () => {
    const short = diagramPlot(supplyDemand(), { widthPx: 480, heightPx: 360, language: 'en' });
    const long = diagramPlot(
      { ...supplyDemand(), x: { title: { en: [{ text: 'Quantity of Good X per period' }], zh: [] } } },
      { widthPx: 480, heightPx: 360, language: 'en' },
    );
    expect(long.plot.right).toBeLessThan(short.plot.right);
  });
});
