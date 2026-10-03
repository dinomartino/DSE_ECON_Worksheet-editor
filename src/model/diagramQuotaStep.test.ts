import { describe, expect, it } from 'vitest';
import type { DiagramBlock, StructuredQuestion } from './types';
import type { Diagram, DiagramCurve } from './diagram';
import { curveXAt, renameAnchor, resolveAnchor, resolveDiagram } from './diagramAnchors';
import { applyDrag } from './diagramDraw';
import { spanGeometry } from './diagramSpans';
import { buildFromTemplate } from './diagramTemplates';
import { createDiagramBlock, createStructuredQuestion, createWorksheet } from './factories';
import { migrate, serializeWorksheet } from './migrations';
import { plain } from './text';

/** The import-quota template's Q_A measures the flat step, so it follows S, Pw and the quota. */

const name = (c: DiagramCurve) => plain(c.label?.en);
const step = (d: Diagram) => {
  const quota = d.curves.find((c) => c.derive?.kind === 'importQuota')!;
  const y = d.curves.find((c) => name(c) === 'Pw')!.points[0].y;
  const flat = quota.points.filter((p) => Math.abs(p.y - y) < 1e-9);
  return { quota, flat };
};
const qa = (d: Diagram) => (d.spans ?? []).find((s) => plain(s.label?.en) === 'QA')!;
const drag = (d: Diagram, curveId: string, dx: number, dy: number) =>
  resolveDiagram(applyDrag(d, { kind: 'curve', curveId }, { x: 0, y: 0 }, { x: dx, y: dy }));

describe('import-quota Q_A', () => {
  it('is a span over the flat step, not free text', () => {
    const d = buildFromTemplate('import-quota');
    expect(d.labels.map((l) => plain(l.text.en))).not.toContain('QA');
    const span = qa(d);
    expect(span).toBeDefined();
    const [a, b] = spanGeometry(d, span)!.base;
    const { flat } = step(d);
    expect(flat).toHaveLength(2);
    expect(a.x).toBeCloseTo(flat[0].x, 9);
    expect(b.x).toBeCloseTo(flat[1].x, 9);
  });

  it.each([
    ['Pw dragged down', 'Pw', 0, -0.08],
    ['S dragged right', 'S', 0.06, 0],
  ])('follows the step when %s', (_what, curveName, dx, dy) => {
    const d = buildFromTemplate('import-quota');
    const moved = drag(d, d.curves.find((c) => name(c) === curveName)!.id, dx, dy);
    const { flat } = step(moved);
    const [a, b] = spanGeometry(moved, qa(moved))!.base;
    expect(a.x).toBeCloseTo(flat[0].x, 9);
    expect(a.y).toBeCloseTo(flat[0].y, 9);
    expect(b.x).toBeCloseTo(flat[1].x, 9);
    expect(b.y).toBeCloseTo(flat[1].y, 9);
  });

  it('`last` reads the far end of a flat step; without it, the near end', () => {
    const d = buildFromTemplate('import-quota');
    const { quota, flat } = step(d);
    const y = flat[0].y;
    expect(curveXAt(quota, y)).toBeCloseTo(flat[0].x, 9);
    expect(curveXAt(quota, y, true)).toBeCloseTo(flat[1].x, 9);
    expect(resolveAnchor(d, { on: quota.id, y, last: true })!.x).toBeCloseTo(flat[1].x, 9);
    expect(renameAnchor({ on: quota.id, y, last: true }, new Map([[quota.id, 'q2']]))).toEqual({ on: 'q2', y, last: true });
  });

  it('survives a save and reload with its `last` end', () => {
    const worksheet = createWorksheet();
    const question = createStructuredQuestion();
    question.blocks = [createDiagramBlock('import-quota')];
    worksheet.questions.push(question);
    const saved = serializeWorksheet(worksheet);
    expect(saved.schemaVersion).toBe(2);
    const reloaded = migrate(JSON.parse(JSON.stringify(saved)));
    const block = (reloaded.questions[0] as StructuredQuestion).blocks[0] as DiagramBlock;
    expect(qa(block.diagram).to).toMatchObject({ last: true });
  });
});
