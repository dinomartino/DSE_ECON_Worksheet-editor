import { describe, expect, it } from 'vitest';
import type { Diagram } from '@/model/diagram';
import { resolveDiagram } from '@/model/diagramAnchors';
import { applyDrag } from '@/model/diagramDraw';
import { buildFromTemplate } from '@/model/diagramTemplates';
import { plain } from '@/model/text';
import { curveLabelAnchor, diagramPlot } from './diagram';

/** A curve's name never lands on the y-axis: a sloped line ending there names itself inside. */

const curveNamed = (d: Diagram, text: string) => d.curves.find((c) => plain(c.label?.en) === text)!;
const plot = (d: Diagram) => diagramPlot(d, { widthPx: 480, heightPx: 360, language: 'en' });

describe('curve label clear of the y-axis', () => {
  it('CPF: dragging B up the concave PPF keeps its name inside the plot', () => {
    const d = buildFromTemplate('ppf-concave-trade');
    const b = d.points.find((p) => plain(p.label?.en) === 'B')!;
    // Far up the frontier, so the tangent meets the y-axis rather than the top.
    const moved = resolveDiagram(applyDrag(d, { kind: 'point', pointId: b.id }, b.at, { x: 0.18, y: 0.7 }));
    const cpf = curveNamed(moved, 'CPF');
    expect(cpf.points[0].x).toBeCloseTo(0, 9);
    const proj = plot(moved);
    const at = curveLabelAnchor(cpf, proj, 1)!;
    expect(at.anchor).toBe('start');
    expect(at.x).toBeGreaterThan(proj.plot.left + 3);
    // Above the line it names (screen y grows down; the CPF falls to the right).
    expect(at.y).toBeLessThan(proj.py(cpf.points[0].y));
  });

  it('as shipped, the CPF still names itself past its top end', () => {
    const d = buildFromTemplate('ppf-concave-trade');
    const cpf = curveNamed(d, 'CPF');
    expect(cpf.points[0].x).toBeGreaterThan(0.05);
    const proj = plot(d);
    const at = curveLabelAnchor(cpf, proj, 1)!;
    expect(at.anchor).toBe('end');
  });

  it('a flat price line keeps its name outside the axis, where a tick would be', () => {
    const d = buildFromTemplate('tariff');
    const pw = curveNamed(d, 'Pw');
    const proj = plot(d);
    const at = curveLabelAnchor(pw, proj, 1)!;
    expect(at.anchor).toBe('end');
    expect(at.x).toBeLessThan(proj.plot.left);
  });
});
