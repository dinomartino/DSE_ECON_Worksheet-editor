import { describe, expect, it } from 'vitest';
import { diagramSize, diagramSvg, diagramPlot } from '@/render/diagram';
import { LORENZ_K } from './lorenz';
import { LORENZ_CASES, U25VR_WRONG, lorenzSpec } from './lorenz.fixture';
import { templateMenu } from './prompt';
import { blockOf, evaluateSpec } from './run';

/**
 * Lorenz curves (k-0584, u-25vr): the user's draft drew "A: before tax, B: after tax" for a
 * question about Economy X and Economy Y, with no box, a kinked curve and a floating key, and
 * passed. The HKDSE Equity MCQs (B_firms_micro.md) are the reference cases.
 */
const run = (c: (typeof LORENZ_CASES)[number], spec = c.spec) => evaluateSpec(spec, { sides: ['en', 'zh'], key: c.key, mcq: c.mcq });
const errors = (e: ReturnType<typeof run>) => e.issues.filter((i) => i.level === 'error').map((i) => i.code);

describe('the HKDSE Lorenz cases', () => {
  it.each(LORENZ_CASES.map((c) => [c.id, c] as const))('%s draws with no issue', (_, c) => {
    const e = run(c);
    expect(e.issues).toEqual([]);
    expect(e.compiled.diagram?.axes).toBe('none');
  });

  it('works the key out when the options compare economies or curves', () => {
    expect(run(LORENZ_CASES[0]).solved?.option).toBe(1);
    expect(run(LORENZ_CASES[1]).solved?.option).toBe(3);
  });
});

describe('the question against the figure', () => {
  it('fails the user’s draft: Economy X and Economy Y in the stem, "before tax / after tax" on the figure', () => {
    const e = run(LORENZ_CASES[0], U25VR_WRONG);
    expect(errors(e)).toContain('lorenz.names');
  });

  it('fails a figure whose more even economy is not the keyed one', () => {
    const c = LORENZ_CASES[0];
    const swapped = lorenzSpec({ ...c.spec.lorenz!, panels: c.spec.lorenz!.panels.map((p, i) => ({ ...p, curves: [{ ...p.curves[0], inequality: i === 0 ? 'moderate' : 'extreme' }] })) });
    expect(errors(run(c, swapped))).toContain('lorenz.key');
  });

  it('fails two curves of one box drawn alike (they would lie on top of each other)', () => {
    const c = LORENZ_CASES[2];
    const same = lorenzSpec({ ...c.spec.lorenz!, panels: [{ ...c.spec.lorenz!.panels[0], curves: c.spec.lorenz!.panels[0].curves.map((k) => ({ ...k, inequality: 'high' as const })) }] });
    expect(errors(run(c, same))).toContain('lorenz.same');
  });

  it('fails a curve letter the question names that the figure lacks', () => {
    const c = LORENZ_CASES[2];
    const one = lorenzSpec({ ...c.spec.lorenz!, panels: [{ ...c.spec.lorenz!.panels[0], curves: [c.spec.lorenz!.panels[0].curves[0]] }] });
    expect(errors(run(c, one))).toContain('lorenz.letters');
  });
});

describe('the curves and the box', () => {
  it('draws each curve smooth and convex through both corners, under the diagonal, and a box’s two curves never cross', () => {
    const d = run(LORENZ_CASES[2]).compiled.diagram!;
    const bows = d.curves.filter((c) => c.points.length > 20);
    expect(bows).toHaveLength(2);
    for (const c of bows) {
      const [first, last] = [c.points[0], c.points[c.points.length - 1]];
      const scale = (p: { x: number; y: number }) => ({ p: (p.x - first.x) / (last.x - first.x), q: (p.y - first.y) / (last.y - first.y) });
      const pts = c.points.map(scale);
      for (let i = 1; i < pts.length - 1; i += 1) {
        expect(pts[i].q).toBeLessThan(pts[i].p);
        // Convex: each slope at least the one before.
        expect(pts[i + 1].q - pts[i].q).toBeGreaterThanOrEqual(pts[i].q - pts[i - 1].q - 1e-9);
      }
    }
    const [a, b] = bows;
    // The shallower curve stays strictly above the deeper one between the corners.
    for (let i = 1; i < a.points.length - 1; i += 1) expect(a.points[i].y).toBeGreaterThan(b.points[i].y);
    expect(Object.values(LORENZ_K)).toEqual([...Object.values(LORENZ_K)].sort((x, y) => x - y));
  });

  it('prints the boxes square at the figure’s own aspect, with no axes or arrows', () => {
    for (const c of LORENZ_CASES) {
      const b = blockOf(run(c), ['en', 'zh'])!;
      const proj = diagramPlot(b.diagram, { widthPx: b.widthPx, heightPx: b.heightPx, language: 'bilingual' });
      const box = b.diagram.curves[0].points;
      const w = Math.abs(proj.px(box[1].x) - proj.px(box[0].x));
      const h = Math.abs(proj.py(box[2].y) - proj.py(box[1].y));
      expect(Math.abs(w - h), c.id).toBeLessThan(1);
      expect(diagramSvg(b.diagram, { widthPx: b.widthPx, heightPx: b.heightPx, language: 'en' })).not.toContain('data-arrowhead');
    }
    const pair = blockOf(run(LORENZ_CASES[0]), ['en', 'zh'])!;
    expect(pair.widthPx).toBe(600);
    expect(diagramSize(pair.diagram, 600, 'en').heightPx).toBe(pair.heightPx);
  });

  it('no longer offers the fixed-label Lorenz template to the model', () => {
    expect(templateMenu()).not.toMatch(/^- lorenz:/m);
  });
});
