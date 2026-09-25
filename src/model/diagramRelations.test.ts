import { describe, expect, it } from 'vitest';
import type { Diagram, DiagramCurve } from './diagram';
import { resolveDiagram } from './diagramAnchors';
import {
  applyDrag,
  attachPointOnDrop,
  attachSpanEndOnDrop,
  copyHandles,
  dragHandles,
  hitTest,
  pasteInto,
  snapPlace,
} from './diagramDraw';
import { shiftCurve } from './diagramShift';
import { buildFromTemplate } from './diagramTemplates';
import { migrate, serializeWorksheet } from './migrations';
import { createDiagramBlock, createMcqQuestion, createWorksheet } from './factories';
import type { DiagramBlock } from './types';

const line = (id: string, a: [number, number], b: [number, number], extra: Partial<DiagramCurve> = {}): DiagramCurve => ({
  id,
  points: [
    { x: a[0], y: a[1] },
    { x: b[0], y: b[1] },
  ],
  shape: 'straight',
  ...extra,
});

/** D and S meeting at (0.4, 0.5), with E anchored there. */
const market = (): Diagram =>
  resolveDiagram({
    x: {},
    y: {},
    curves: [line('d', [0, 0.9], [0.9, 0]), line('s', [0, 0.1], [0.9, 1])],
    points: [{ id: 'e', at: { x: 0, y: 0 }, anchor: { cross: ['d', 's'] }, dot: true }],
    labels: [],
    arrows: [],
  });

const counter = () => {
  let n = 0;
  return () => `id${(n += 1)}`;
};

describe('anchored points on the canvas', () => {
  it('follows its curves when one is dragged', () => {
    const moved = resolveDiagram(applyDrag(market(), { kind: 'curve', curveId: 'd' }, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }));
    const e = moved.points[0];
    expect(e.anchor).toEqual({ cross: ['d', 's'] });
    // D right by 0.1 → the crossing moves up S to (0.45, 0.55).
    expect(e.at.x).toBeCloseTo(0.45, 9);
    expect(e.at.y).toBeCloseTo(0.55, 9);
  });

  it('detaches when dragged away', () => {
    const moved = applyDrag(market(), { kind: 'point', pointId: 'e' }, { x: 0.4, y: 0.5 }, { x: 0.7, y: 0.2 });
    expect(moved.points[0].anchor).toBeUndefined();
    expect(moved.points[0].at).toEqual({ x: 0.7, y: 0.2 });
  });

  it('re-attaches when released on a crossing', () => {
    const free = applyDrag(market(), { kind: 'point', pointId: 'e' }, { x: 0.4, y: 0.5 }, { x: 0.41, y: 0.49 });
    const dropped = attachPointOnDrop(free, 'e', 0.03);
    expect(dropped.points[0].anchor).toBeTruthy();
    expect(dropped.points[0].at.x).toBeCloseTo(0.4, 9);
    expect(dropped.points[0].at.y).toBeCloseTo(0.5, 9);
    // Far from any crossing, it stays free where it was dropped.
    const away = attachPointOnDrop(applyDrag(free, { kind: 'point', pointId: 'e' }, { x: 0, y: 0 }, { x: 0.3, y: 0.3 }), 'e', 0.03);
    expect(away.points[0].anchor).toBeUndefined();
  });

  it('keeps its anchor when moved together with both curves', () => {
    const handles = [
      { kind: 'curve', curveId: 'd' },
      { kind: 'curve', curveId: 's' },
      { kind: 'point', pointId: 'e' },
    ] as const;
    const moved = dragHandles(market(), [...handles], { x: 0, y: 0 }, { x: 0.05, y: 0 });
    expect(moved.points[0].anchor).toEqual({ cross: ['d', 's'] });
  });
});

describe('derived curves on the canvas', () => {
  const withLevel = (): Diagram =>
    resolveDiagram({ ...market(), curves: [...market().curves, line('pc', [0, 0], [0, 0], { derive: { kind: 'level', y: 0.3 } })] });

  it('dragging a numeric level moves the number and keeps the relation', () => {
    const moved = applyDrag(withLevel(), { kind: 'curve', curveId: 'pc' }, { x: 0.5, y: 0.3 }, { x: 0.9, y: 0.4 });
    const pc = moved.curves[2];
    expect(pc.derive).toEqual({ kind: 'level', y: 0.4 });
    expect(pc.points.every((p) => Math.abs(p.y - 0.4) < 1e-12)).toBe(true);
  });

  it('dragging any other derived curve detaches it', () => {
    const diagram = resolveDiagram({
      ...market(),
      curves: [...market().curves, line('mr', [0, 0], [0, 0], { derive: { kind: 'marginalRevenue', of: 'd' } })],
    });
    const moved = applyDrag(diagram, { kind: 'curve', curveId: 'mr' }, { x: 0.1, y: 0.1 }, { x: 0.15, y: 0.1 });
    expect(moved.curves[2].derive).toBeUndefined();
    expect(moved.curves[2].points[0].x).toBeCloseTo(0.05, 9);
    // So does reshaping one end.
    const bent = applyDrag(diagram, { kind: 'vertex', curveId: 'mr', index: 0 }, { x: 0, y: 0 }, { x: 0.1, y: 0.8 });
    expect(bent.curves[2].derive).toBeUndefined();
  });

  it('a paste carries relations to the pasted copies, and drops ones that reach outside', () => {
    const diagram = market();
    const all = pasteInto(diagram, copyHandles(diagram, [
      { kind: 'curve', curveId: 'd' },
      { kind: 'curve', curveId: 's' },
      { kind: 'point', pointId: 'e' },
    ]), counter());
    const pasted = all.diagram.points[1];
    expect(pasted.anchor).toEqual({ cross: ['id1', 'id2'] });
    const lone = pasteInto(diagram, copyHandles(diagram, [{ kind: 'point', pointId: 'e' }]), counter());
    expect(lone.diagram.points[1].anchor).toBeUndefined();
  });
});

describe('span handles', () => {
  const withSpan = (): Diagram => ({
    ...market(),
    spans: [{ id: 'sp', from: { point: 'e' }, to: { x: 0.8, y: 0.5 }, style: 'bracket', offset: 0 }],
  });

  it('drags the body to change the offset, along the span’s normal', () => {
    const moved = applyDrag(withSpan(), { kind: 'span', spanId: 'sp' }, { x: 0.6, y: 0.5 }, { x: 0.65, y: 0.44 });
    expect(moved.spans![0].offset).toBeCloseTo(-0.06, 9);
  });

  it('frees a dragged end, and anchors it when released on a point or crossing', () => {
    const freed = applyDrag(withSpan(), { kind: 'spanTo', spanId: 'sp' }, { x: 0.8, y: 0.5 }, { x: 0.2, y: 0.3 });
    expect(freed.spans![0].to).toEqual({ x: 0.2, y: 0.3 });
    const onPoint = attachSpanEndOnDrop(freed, 'sp', 'to', { x: 0.405, y: 0.5 }, 0.02);
    expect(onPoint.spans![0].to).toEqual({ point: 'e' });
    const free = attachSpanEndOnDrop(freed, 'sp', 'to', { x: 0.2, y: 0.3 }, 0.02);
    expect(free.spans![0].to).toEqual({ x: 0.2, y: 0.3 });
  });

  it('hit-tests ends before the body', () => {
    const diagram = withSpan();
    expect(hitTest(diagram, { x: 0.8, y: 0.5 }, 0.02)).toEqual({ kind: 'spanTo', spanId: 'sp' });
    expect(hitTest(diagram, { x: 0.6, y: 0.505 }, 0.02)).toEqual({ kind: 'span', spanId: 'sp' });
  });

  it('snapPlace prefers a crossing it is nearer to, else stays free', () => {
    const diagram = { ...market(), points: [] };
    expect(snapPlace(diagram, { x: 0.401, y: 0.5 }, 0.02).place).toEqual({ cross: ['d', 's'] });
    expect(snapPlace(diagram, { x: 0.7, y: 0.7 }, 0.02).place).toEqual({ x: 0.7, y: 0.7 });
  });
});

describe('shiftCurve attaches the equilibria', () => {
  it('anchors the new equilibrium to the shifted curve and its counterpart, and E₀ to the original', () => {
    const diagram = buildFromTemplate('supply-demand');
    const [demand, supply] = diagram.curves;
    const result = shiftCurve(diagram, supply.id, { x: 0, y: 0.15 }, counter())!;
    const e1 = result.diagram.points.find((p) => p.id === result.pointId)!;
    expect(e1.anchor).toEqual({ cross: [result.curveId, demand.id] });
    const e0 = result.diagram.points[0];
    // The template anchors E₀ itself; the shift leaves that anchor alone.
    expect(e0.anchor).toEqual({ cross: [demand.id, supply.id] });

    // Dragging S₁ carries E₁ with it; E₀ stays on the original crossing.
    const dragged = resolveDiagram(
      applyDrag(result.diagram, { kind: 'curve', curveId: result.curveId }, { x: 0, y: 0 }, { x: 0, y: 0.05 }),
    );
    const moved = dragged.points.find((p) => p.id === result.pointId)!;
    expect(moved.at.y).toBeGreaterThan(e1.at.y);
    expect(dragged.points[0].at).toEqual(e0.at);
  });
});

describe('storage', () => {
  it('round-trips anchors, derived curves, spans and axis scales through save and load', () => {
    const worksheet = createWorksheet();
    const block = createDiagramBlock('supply-demand');
    const [demand, supply] = block.diagram.curves;
    block.diagram = {
      ...block.diagram,
      x: { ...block.diagram.x, max: 30 },
      curves: [...block.diagram.curves, line('mr', [0, 0], [1, 0], { derive: { kind: 'marginalRevenue', of: demand.id } })],
      points: block.diagram.points.map((p) => ({ ...p, anchor: { cross: [demand.id, supply.id] } })),
      spans: [
        {
          id: 'sp',
          from: { on: supply.id, y: 0.3 },
          to: { x: { point: block.diagram.points[0].id }, y: 0.3 },
          style: 'dimension',
          along: 'x',
          offset: -0.05,
          label: { en: [{ text: 't' }], zh: [{ text: 't' }] },
        },
      ],
    };
    const question = createMcqQuestion();
    question.blocks = [block];
    const doc = { ...worksheet, questions: [question] };
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(doc))));
    const saved = (reloaded.questions[0] as typeof question).blocks?.[0] as DiagramBlock;
    expect(saved.diagram).toEqual(block.diagram);
  });
});
