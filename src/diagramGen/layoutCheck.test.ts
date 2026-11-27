import { describe, expect, it } from 'vitest';
import { AXIS, axes, curve, finish, shiftOf } from '@/model/diagramTemplateKit';
import { bi } from '@/model/text';
import type { Diagram } from '@/model/diagram';
import { diagramLabelBoxes, diagramSize } from '@/render/diagram';
import { checkLayout } from './layoutCheck';

/**
 * The figure as it prints (u-ewel): HKDSE 2024 Paper 1 Q29's option figures at an option's
 * width. The user's draft printed "Aggregate outp" and put AD₁ under the x-axis, and the
 * checker said "No problems found".
 */

const AD_AS = (title = 'Aggregate output'): Diagram => {
  const ad0 = curve([[0.1, 0.85], [0.72, 0.12]], bi('AD_0', 'AD_0'));
  const ad1 = shiftOf(ad0, -0.08, 0, bi('AD_1', 'AD_1'));
  const lras = curve([[0.5, 0], [0.5, 0.86]], bi('LRAS', 'LRAS'));
  return finish(axes(bi(title, '總產出'), AXIS.priceLevel, { curves: [ad0, ad1, lras] }));
};
const OPTION_WIDTH = 292;

describe('a long x-axis title on an option’s figure', () => {
  it('prints under the axis, right-aligned to its end, never cut off', () => {
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      const d = AD_AS();
      const size = diagramSize(d, OPTION_WIDTH, language);
      const title = diagramLabelBoxes(d, { ...size, language }).find((b) => b.kind === 'title' && b.id === 'x')!;
      expect(title.box.x1, language).toBeLessThanOrEqual(size.widthPx);
      expect(title.box.x0, language).toBeGreaterThan(0);
    }
    expect(checkLayout(AD_AS(), OPTION_WIDTH, ['en']).map((i) => i.code)).not.toContain('layout.clipped');
  });

  it('a short title still prints past the arrow', () => {
    const d = AD_AS('Output');
    const size = diagramSize(d, OPTION_WIDTH, 'en');
    const title = diagramLabelBoxes(d, { ...size, language: 'en' }).find((b) => b.kind === 'title' && b.id === 'x')!;
    const curves = diagramLabelBoxes(d, { ...size, language: 'en' }).filter((b) => b.kind === 'curve');
    expect(title.box.x0).toBeGreaterThan(Math.max(...curves.map((c) => c.box.x0)));
  });

  it('an explicit titleAt wins', () => {
    const d = { ...AD_AS('Output'), x: { ...AD_AS('Output').x, titleAt: 'below' as const } };
    const size = diagramSize(d, OPTION_WIDTH, 'en');
    const title = diagramLabelBoxes(d, { ...size, language: 'en' }).find((b) => b.kind === 'title' && b.id === 'x')!;
    expect(title.box.y0).toBeGreaterThan(size.heightPx * 0.7);
  });
});

describe('curve names stay by their curves', () => {
  it('two names crowding at the bottom stay above the x-axis, beside their curves', () => {
    const d = AD_AS();
    const size = diagramSize(d, OPTION_WIDTH, 'en');
    const boxes = diagramLabelBoxes(d, { ...size, language: 'en' });
    const axisY = boxes.find((b) => b.kind === 'origin')?.box.y0 ?? size.heightPx;
    for (const b of boxes.filter((x) => x.kind === 'curve')) expect(b.box.y1).toBeLessThan(axisY);
    expect(checkLayout(d, OPTION_WIDTH, ['en'])).toEqual([]);
  });

  it('flags a name dragged away from its curve', () => {
    const d = AD_AS();
    const moved: Diagram = { ...d, curves: d.curves.map((c, i) => (i === 1 ? { ...c, labelOffset: { x: 0.25, y: 0.7 } } : c)) };
    expect(checkLayout(moved, OPTION_WIDTH, ['en']).map((i) => i.code)).toEqual(['layout.nameAway']);
  });
});
