import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramArrow } from './diagram';
import { resolveDiagram, shiftArrowEnds } from './diagramAnchors';
import { applyDrag, copyHandles, deleteHandle, dragHandles, pasteInto } from './diagramDraw';
import { buildFromTemplate } from './diagramTemplates';
import { shiftCurve } from './diagramShift';

/** "Shift a copy" draws an arrow that follows the curve and its copy (`DiagramArrow.follows`). */

const counter = () => {
  let n = 0;
  return () => `id${(n += 1)}`;
};

function shifted() {
  const diagram = buildFromTemplate('supply-demand');
  const demand = diagram.curves[0];
  const result = shiftCurve(diagram, demand.id, { x: 0.15, y: 0 }, counter())!;
  const arrow = result.diagram.arrows.at(-1)!;
  return { d: result.diagram, demand, copyId: result.curveId, arrow };
}

const arrowOf = (d: Diagram, id: string): DiagramArrow => d.arrows.find((a) => a.id === id)!;
const drag = (d: Diagram, curveId: string, dx: number, dy: number) =>
  resolveDiagram(applyDrag(d, { kind: 'curve', curveId }, { x: 0, y: 0 }, { x: dx, y: dy }));

describe('the shift arrow follows its curve and copy', () => {
  it('is created following the copy, at the ends the rule gives', () => {
    const { d, demand, copyId, arrow } = shifted();
    expect(arrow.follows).toBe(copyId);
    expect([arrow.from, arrow.to]).toEqual(shiftArrowEnds(demand.points, { x: 0.15, y: 0 }));
    // Already resolved: the stored ends are what an older build draws.
    expect(resolveDiagram(d)).toBe(d);
  });

  it('moves with the original when it is dragged', () => {
    const { d, demand, arrow } = shifted();
    const moved = drag(d, demand.id, 0.04, 0.06);
    const after = arrowOf(moved, arrow.id);
    expect(after.from.x).toBeCloseTo(arrow.from.x + 0.04, 9);
    expect(after.from.y).toBeCloseTo(arrow.from.y + 0.06, 9);
    expect(after.to.x).toBeCloseTo(arrow.to.x + 0.04, 9);
    expect(after.to.y).toBeCloseTo(arrow.to.y + 0.06, 9);
  });

  it('re-aims when the copy is dragged further (the shift grows)', () => {
    const { d, copyId, arrow } = shifted();
    const moved = drag(d, copyId, 0.05, 0);
    const after = arrowOf(moved, arrow.id);
    const by = moved.curves.find((c) => c.id === copyId)!.derive;
    expect(by).toEqual({ kind: 'shift', of: expect.any(String), by: { x: expect.closeTo(0.2, 9), y: 0 } });
    expect(after.from.x).toBeCloseTo(arrow.from.x + 0.05 * 0.15, 9);
    expect(after.to.x).toBeCloseTo(arrow.to.x + 0.05 * 0.85, 9);
  });

  it('keeps a hand nudge of the whole arrow, and keeps following after it', () => {
    const { d, demand, arrow } = shifted();
    const nudged = resolveDiagram(applyDrag(d, { kind: 'arrow', arrowId: arrow.id }, { x: 0, y: 0 }, { x: 0, y: -0.1 }));
    const placed = arrowOf(nudged, arrow.id);
    expect(placed.follows).toBeDefined();
    expect(placed.followOffset).toEqual({ x: 0, y: expect.closeTo(-0.1, 9) });
    expect(placed.from.y).toBeCloseTo(arrow.from.y - 0.1, 9);
    const moved = arrowOf(drag(nudged, demand.id, 0.03, 0), arrow.id);
    expect(moved.from.x).toBeCloseTo(arrow.from.x + 0.03, 9);
    expect(moved.from.y).toBeCloseTo(arrow.from.y - 0.1, 9);
  });

  it('is carried, not nudged twice, when dragged together with its curve', () => {
    const { d, demand, arrow } = shifted();
    const both = resolveDiagram(
      dragHandles(d, [{ kind: 'curve', curveId: demand.id }, { kind: 'arrow', arrowId: arrow.id }], { x: 0, y: 0 }, { x: 0.05, y: 0 }),
    );
    const after = arrowOf(both, arrow.id);
    expect(after.followOffset).toBeUndefined();
    expect(after.from.x).toBeCloseTo(arrow.from.x + 0.05, 9);
  });

  it('detaches when an end is placed by hand, or when its copy is deleted', () => {
    const { d, demand, copyId, arrow } = shifted();
    const reaimed = resolveDiagram(applyDrag(d, { kind: 'arrowTo', arrowId: arrow.id }, arrow.to, { x: 0.9, y: 0.9 }));
    expect(arrowOf(reaimed, arrow.id).follows).toBeUndefined();
    expect(arrowOf(drag(reaimed, demand.id, 0.05, 0), arrow.id).to).toEqual({ x: 0.9, y: 0.9 });

    const orphan = deleteHandle(d, { kind: 'curve', curveId: copyId });
    const kept = arrowOf(orphan, arrow.id);
    expect(kept.follows).toBeUndefined();
    expect([kept.from, kept.to]).toEqual([arrow.from, arrow.to]);
  });

  it('a pasted arrow follows the pasted copy only when it came with it', () => {
    const { d, demand, copyId, arrow } = shifted();
    const all = pasteInto(
      d,
      copyHandles(d, [
        { kind: 'curve', curveId: demand.id },
        { kind: 'curve', curveId: copyId },
        { kind: 'arrow', arrowId: arrow.id },
      ]),
      counter(),
    );
    const pastedCopy = all.diagram.curves.at(-1)!;
    expect(all.diagram.arrows.at(-1)!.follows).toBe(pastedCopy.id);

    const alone = pasteInto(d, copyHandles(d, [{ kind: 'arrow', arrowId: arrow.id }]), counter());
    expect(alone.diagram.arrows.at(-1)!.follows).toBeUndefined();
  });

  it('an arrow without `follows` (every older document) is untouched', () => {
    const d = buildFromTemplate('demand-shift');
    expect(d.arrows.length).toBeGreaterThan(0);
    const source = d.curves.find((c) => !c.derive)!;
    const moved = drag(d, source.id, 0.05, 0);
    expect(moved.arrows).toEqual(d.arrows);
  });
});
