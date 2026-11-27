import { describe, expect, it } from 'vitest';
import { areaPolygon } from '@/model/diagramAreas';
import { buildFromTemplate, DIAGRAM_TEMPLATES } from '@/model/diagramTemplates';
import { checkCoincide } from './coincide';
import { SCENE_SAMPLES } from './sceneSamples';
import { compileScene } from './scene';
import { stageDef, stagePlan, isPlan } from './stageCatalogue';
import { emptyScene, emptySpec } from './schema';
import { plainOf } from './text';
import { SCENE_BINDS, SCENE_STAGES, SIZES, SLOPES, type DiagramSpec, type SpecScene } from './types';

/**
 * Two-state control scenes (k-0587, audit k-0583 task B): every drawable combination of
 * control, stage and binds, for every slope and size, compiles with its ticks apart and its
 * deadweight-loss regions a partition; the economics is in the geometry.
 */

const spec = (scene: Partial<SpecScene>, placement: DiagramSpec['placement'] = 'question'): DiagramSpec => ({ ...emptySpec('scene'), placement, scene: { ...emptyScene(), ...scene } });
const L = (l: string) => ({ en: l, zh: l });
const TYPES = ['priceCeiling', 'priceFloor', 'quota'] as const;

function pointInPolygon(p: { x: number; y: number }, poly: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Every drawable (type, stage, binds). */
export const STAGE_COMBOS: Array<Pick<SpecScene, 'type' | 'stage' | 'binds'>> = [];
for (const type of TYPES) for (const stage of SCENE_STAGES.filter((s) => s !== 'none')) for (const binds of SCENE_BINDS) if (isPlan(stagePlan({ type, stage, binds }))) STAGE_COMBOS.push({ type, stage, binds });

describe('two-state control scenes: which combinations draw (k-0587)', () => {
  it('impossible combinations say why', () => {
    const bad = stagePlan({ type: 'priceCeiling', stage: 'lowered', binds: 'before' });
    expect(bad && 'error' in bad && bad.error).toMatch(/stricter/);
    const bad2 = stagePlan({ type: 'priceCeiling', stage: 'demandFall', binds: 'after' });
    expect(bad2 && 'error' in bad2 && bad2.error).toMatch(/lowers the equilibrium price/);
    const bad3 = stagePlan({ type: 'unitTax', stage: 'lowered', binds: 'both' });
    expect(bad3 && 'error' in bad3 && bad3.error).toMatch(/priceCeiling, priceFloor or quota/);
    expect(stagePlan({ type: 'quota', stage: 'supplyRise', binds: 'both' })).toHaveProperty('error');
    const built = compileScene(spec({ type: 'priceFloor', stage: 'lowered', binds: 'after' }));
    expect(built.diagram).toBeNull();
    expect(built.issues.map((i) => i.code)).toContain('scene.stage');
  });

  it('a one-state scene is unchanged by the new fields', () => {
    const a = compileScene(spec({ type: 'priceCeiling' }));
    const b = compileScene(spec({ type: 'priceCeiling', stage: 'none', binds: 'both' }));
    const strip = (d: unknown) => JSON.stringify(d).replace(/"[A-Za-z0-9_-]{10}"/g, '""');
    expect(strip(b.diagram)).toEqual(strip(a.diagram));
  });

  it('covers the HKDSE forms', () => {
    const key = (c: (typeof STAGE_COMBOS)[number]) => `${c.type} ${c.stage} ${c.binds}`;
    const all = STAGE_COMBOS.map(key);
    for (const want of [
      'priceCeiling lowered after', // 2015 P1 Q19, 2021 P1 Q17
      'priceCeiling lowered both', // 2012 P2 Q5
      'priceFloor raised after', // 2020 P1 Q20
      'priceFloor raised neither', // 2023 P1 Q17
      'priceCeiling supplyRise before', // 2026 P1 Q16
      'priceCeiling demandRise after', // 2023 P1 Q21
      'quota raised both', // 2015 P2 Q3
      'quota demandRise both', // 2024 P2 Q3
      'priceFloor supplyFall before', // 2013 P2 Q10, 2018 P2 Q10 (labour)
    ])
      expect(all).toContain(want);
  });
});

describe('every two-state scene draws, for every slope and size (k-0587)', () => {
  const variants: Array<Partial<SpecScene>> = [];
  for (const c of STAGE_COMBOS) for (const demand of SLOPES) for (const supply of SLOPES) for (const size of SIZES) variants.push({ ...c, demand, supply, size });

  it.each(variants.map((v) => [`${v.type} ${v.stage} ${v.binds} D:${v.demand} S:${v.supply} ${v.size}`, v]))('%s', (_, v) => {
    const plan = stagePlan(v as SpecScene);
    if (!isPlan(plan)) throw new Error('not a plan');
    const def = stageDef({ ...emptyScene(), ...v } as SpecScene, plan);
    const areas = def.regions.map((r, i) => ({ region: r.id, label: L('ABCDEFGH'[i]) }));
    // The quantities the asks read labelled, as a Q1–Q4 question would.
    const read = [...new Set(Object.values(def.ticks).flat())].filter((id) => def.parts.find((p) => p.id === id)?.kind === 'xTick');
    const labels = read.map((part, i) => ({ part, label: `Q_${i + 1}` }));
    const built = compileScene(spec({ ...v, areas, labels, gap: true }));
    expect(built.issues.filter((i) => i.level === 'error')).toEqual([]);
    const diagram = built.diagram!;
    // Only a steep curve against a flat one (or both flat) may be too tight for every labelled quantity: drawn, and called crowded.
    const extreme = (v.demand === 'steep' && v.supply === 'flat') || (v.demand === 'flat' && v.supply !== 'normal');
    const crowded = built.issues.some((i) => i.code === 'scene.layout');
    if (!extreme) expect(crowded).toBe(false);
    if (!crowded) for (const axis of ['x', 'y'] as const) {
      const at = diagram.points
        .filter((p) => plainOf(axis === 'x' ? p.xTickLabel : p.yTickLabel).trim() && p.dropTo?.includes(axis))
        .map((p) => p.at[axis]);
      for (const c of diagram.curves) if (axis === 'y' && c.derive?.kind === 'level' && plainOf(c.label).trim()) at.push(c.points[0].y);
      const sorted = [...new Set(at.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
      for (const n of sorted) expect(n).toBeGreaterThan(0.02);
      for (const n of sorted) expect(n).toBeLessThan(0.96);
      for (let i = 1; i < sorted.length; i += 1) expect(sorted[i] - sorted[i - 1], `${axis} ticks ${sorted.join(', ')}`).toBeGreaterThanOrEqual(0.045);
    }
    const polys = [...built.regionAreas.values()].map((a) => areaPolygon(diagram, a)!);
    for (const poly of polys) expect(poly).toBeTruthy();
    for (let gx = 0.0137; gx < 1; gx += 0.0203) {
      for (let gy = 0.0091; gy < 1; gy += 0.0197) {
        const hits = polys.filter((poly) => pointInPolygon({ x: gx, y: gy }, poly)).length;
        expect(hits, `(${gx.toFixed(2)}, ${gy.toFixed(2)})`).toBeLessThanOrEqual(1);
      }
    }
    // The wrong-figure guard (k-0586 A2): nothing the question tells apart on one spot.
    expect(checkCoincide({ ...emptySpec('curves') }, diagram).filter((i) => i.level === 'error')).toEqual([]);
    // The facts agree with the plan.
    expect(built.stage!.before.binds).toBe(plan.b1);
    expect(built.stage!.after.binds).toBe(plan.b2);
  });
});

describe('saved documents (k-0587): a two-state figure stores no field an older build lacks', () => {
  it('every key it writes is one the one-state scenes or the editor templates already write', () => {
    const keys = (v: unknown, path: string, out: Set<string>) => {
      if (Array.isArray(v)) v.forEach((x) => keys(x, path, out));
      else if (v && typeof v === 'object')
        for (const [k, x] of Object.entries(v)) {
          out.add(`${path}.${k}`);
          keys(x, `${path}.${k}`, out);
        }
    };
    const known = new Set<string>();
    for (const t of DIAGRAM_TEMPLATES) keys(buildFromTemplate(t.id), 'd', known);
    for (const s of SCENE_SAMPLES.filter((x) => !x.id.startsWith('stage-'))) keys(compileScene(s.spec).diagram, 'd', known);
    const used = new Set<string>();
    for (const c of STAGE_COMBOS) keys(compileScene(spec({ ...c, gap: true, areas: [], points: [{ point: 'e0', label: 'a' }] })).diagram, 'd', used);
    for (const s of SCENE_SAMPLES.filter((x) => x.id.startsWith('stage-'))) keys(compileScene(s.spec).diagram, 'd', used);
    expect([...used].filter((k) => !known.has(k))).toEqual([]);
  });
});
