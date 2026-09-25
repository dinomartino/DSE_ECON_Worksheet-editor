import { describe, expect, it } from 'vitest';
import { DIAGRAM_TEMPLATES, DIAGRAM_TEMPLATE_GROUPS, buildFromTemplate } from './diagramTemplates';
import { areaPolygon, curveCrossing, curveYAt } from './diagramAreas';
import { parseWorksheet } from '@/storage/document';
import { serializeWorksheet } from './migrations';
import { createDiagramBlock, createStructuredQuestion, createWorksheet } from './factories';
import { plain } from './text';
import type { BiText } from './types';
import type { Diagram } from './diagram';

const inUnit = (v: number) => v >= 0 && v <= 1;
const filled = (text: BiText | undefined) => Boolean(plain(text?.en).trim() && plain(text?.zh).trim());

/** The ids every document saved before the grouped catalogue may carry. */
const SHIPPED_IDS = [
  'blank', 'supply-demand', 'demand-shift', 'ad-as', 'money-market', 'tariff', 'import-quota',
  'proportional-tax', 'business-cycle', 'ppc', 'flow', 'pie', 'forum',
];

describe('diagram templates', () => {
  it('keeps every shipped template id', () => {
    const ids = DIAGRAM_TEMPLATES.map((t) => t.id);
    for (const id of SHIPPED_IDS) expect(ids).toContain(id);
  });

  it('has unique ids and a known group for each', () => {
    const ids = DIAGRAM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set(DIAGRAM_TEMPLATE_GROUPS.map((g) => g.id));
    for (const t of DIAGRAM_TEMPLATES) expect(groups.has(t.group), t.id).toBe(true);
  });

  it('puts at least one template in every group, listed in group order', () => {
    const order = DIAGRAM_TEMPLATE_GROUPS.map((g) => g.id);
    for (const g of order) expect(DIAGRAM_TEMPLATES.some((t) => t.group === g), g).toBe(true);
    const seen = DIAGRAM_TEMPLATES.map((t) => order.indexOf(t.group));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it('names every template, group, curve and point in both languages', () => {
    for (const g of DIAGRAM_TEMPLATE_GROUPS) expect(filled(g.name), g.id).toBe(true);
    for (const t of DIAGRAM_TEMPLATES) {
      expect(filled(t.name), t.id).toBe(true);
      expect(filled(t.hint), t.id).toBe(true);
      const d = t.build();
      for (const c of d.curves) if (c.label) expect(filled(c.label), `${t.id} curve`).toBe(true);
      for (const p of d.points) {
        for (const text of [p.label, p.xTickLabel, p.yTickLabel]) {
          if (text) expect(filled(text), `${t.id} point`).toBe(true);
        }
      }
      for (const l of d.labels) expect(filled(l.text), `${t.id} label`).toBe(true);
    }
  });

  it('builds every template inside the unit square, each curve with 2+ points', () => {
    for (const t of DIAGRAM_TEMPLATES) {
      const d = t.build();
      for (const c of d.curves) {
        expect(c.points.length, t.id).toBeGreaterThanOrEqual(2);
        for (const p of c.points) expect(inUnit(p.x) && inUnit(p.y), `${t.id} curve ${p.x},${p.y}`).toBe(true);
      }
      for (const p of d.points) expect(inUnit(p.at.x) && inUnit(p.at.y), `${t.id} point`).toBe(true);
      for (const l of d.labels) expect(inUnit(l.at.x) && inUnit(l.at.y), `${t.id} label`).toBe(true);
      for (const a of d.arrows) {
        for (const p of [a.from, a.to]) expect(inUnit(p.x) && inUnit(p.y), `${t.id} arrow`).toBe(true);
      }
    }
  });

  it('draws every shaded area it ships', () => {
    for (const t of DIAGRAM_TEMPLATES) {
      const d = t.build();
      for (const area of d.areas ?? []) expect(areaPolygon(d, area), `${t.id} area`).not.toBeNull();
    }
  });

  it('mints fresh ids on every build', () => {
    for (const t of DIAGRAM_TEMPLATES) {
      const ids = (d: Diagram) => [...d.curves, ...d.points, ...d.labels, ...d.arrows].map((x) => x.id);
      const a = ids(t.build());
      const b = new Set(ids(t.build()));
      expect(a.some((id) => b.has(id)), t.id).toBe(false);
    }
  });

  it('round-trips templateId through save and load', () => {
    const worksheet = createWorksheet();
    worksheet.questions = DIAGRAM_TEMPLATES.map((t) => {
      const q = createStructuredQuestion();
      q.blocks = [createDiagramBlock(t.id)];
      return q;
    });
    const back = parseWorksheet(JSON.stringify(serializeWorksheet(worksheet)));
    const ids = back.questions.map((q) => {
      const block = q.blocks[0];
      return block.kind === 'diagram' ? block.diagram.templateId : undefined;
    });
    expect(ids).toEqual(DIAGRAM_TEMPLATES.map((t) => t.id));
  });

  it('draws the tariff with imports: Pw < Pw + t < the domestic equilibrium, ticks on their curves', () => {
    const d = buildFromTemplate('tariff');
    const [demand, supply, pw, pwt] = d.curves;
    const autarky = curveCrossing(demand, supply)!;
    expect(pw.points[0].y).toBeLessThan(pwt.points[0].y);
    expect(pwt.points[0].y).toBeLessThan(autarky.y);
    for (const p of d.points) {
      const onS = Math.abs((curveYAt(supply, p.at.x) ?? -1) - p.at.y) < 1e-9;
      const onD = Math.abs((curveYAt(demand, p.at.x) ?? -1) - p.at.y) < 1e-9;
      expect(onS || onD).toBe(true);
    }
  });

  it('draws MR from D’s intercept at twice its slope', () => {
    for (const id of ['monopoly', 'monopoly-cost-fall', 'monopoly-mc-zero']) {
      const [demand, mr] = buildFromTemplate(id).curves;
      const slope = (c: typeof demand) =>
        (c.points[1].y - c.points[0].y) / (c.points[1].x - c.points[0].x);
      expect(mr.points[0]).toEqual(demand.points[0]);
      expect(slope(mr) / slope(demand), id).toBeCloseTo(2, 6);
    }
  });
});
