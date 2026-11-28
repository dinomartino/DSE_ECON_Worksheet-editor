import { describe, expect, it } from 'vitest';
import { areaPolygon } from '@/model/diagramAreas';
import { questionLayer } from '@/model/diagramAnswers';
import { resolveDiagram } from '@/model/diagramAnchors';
import { DIAGRAM_TEMPLATES } from '@/model/diagramTemplates';
import { GRAPH_CASES } from '../../evals/graphs/cases';
import { freeImports, quotaChangeIn, quotaFacts, quotaPrice, quotaVariants, type QuotaMarket } from './importQuota';
import { SCENE_TEMPLATES, sceneMenu, systemPrompt, templateMenu } from './prompt';
import { evaluateSpec } from './run';
import { compileScene } from './scene';
import { SCENE_SAMPLES } from './sceneSamples';
import { emptyScene, emptySpec, parseSpec } from './schema';
import { plainOf } from './text';
import { SIZES, SLOPES, type DiagramSpec, type SpecScene } from './types';
import { slopeSizeTriples } from '@/test/sample';

/**
 * The import quota scene (k-0589, audit k-0583 task C): S with the quota as the editor's kinked
 * relation at the world price, the price where D meets it, the brace and the step, the welfare
 * regions a partition, both states' market for statement keys (the change read from the stem on a
 * one-state figure), the stem's words, and a figure the student completes.
 */

const spec = (scene: Partial<SpecScene>, placement: DiagramSpec['placement'] = 'question'): DiagramSpec => ({ ...emptySpec('scene'), placement, scene: { ...emptyScene(), type: 'importQuota', ...scene } });
const lab = (pairs: Array<[string, string]>) => pairs.map(([part, label]) => ({ part, label }));
const L = (s: string) => ({ en: s, zh: s });
type Mcq = { stem: string; statements: string[]; options: string[]; answer: number };
const run = (s: DiagramSpec, mcq?: Mcq, key = '') => evaluateSpec(s, { sides: ['en', 'zh'], key, ...(mcq ? { mcq } : {}) });
const errors = (e: { issues: Array<{ level: string; code: string; text: string }> }) => e.issues.filter((i) => i.level === 'error');
const STAGES = ['none', 'raised', 'lowered', 'demandRise', 'demandFall'] as const;

describe('the economics', () => {
  // D: x = 1 − p, S: x = p, Pw 0.3: free trade Qs 0.3, Qd 0.7, imports 0.4.
  const m: QuotaMarket = { d: { m: -1, at: [0.5, 0.5] }, s: { m: 1, at: [0.5, 0.5] }, pw: 0.3 };
  it('free trade, and a quota of 0.2: the price where the gap between D and S is the quota', () => {
    expect(freeImports(m)).toBeCloseTo(0.4, 9);
    const free = quotaFacts(m, null);
    expect([free.price, free.domestic, free.quantity, free.imports, free.rent, free.dwl]).toEqual([0.3, expect.closeTo(0.3, 9), expect.closeTo(0.7, 9), expect.closeTo(0.4, 9), 0, 0]);
    const q = quotaFacts(m, 0.2);
    expect(q.price).toBeCloseTo(0.4, 9);
    expect(q.domestic).toBeCloseTo(0.4, 9);
    expect(q.quantity).toBeCloseTo(0.6, 9);
    expect(q.imports).toBeCloseTo(0.2, 9);
    expect(q.rent).toBeCloseTo(0.02, 9);
    // Two triangles, 0.1 high and 0.1 wide each.
    expect(q.dwl).toBeCloseTo(0.01, 9);
    // The surplus lost is the rent's gain plus the loss.
    expect(free.tss - q.tss).toBeCloseTo(q.dwl, 9);
  });
  it('a quota as large as the free-trade imports does not bind', () => {
    expect(quotaPrice(m, 0.4)).toBe(0.3);
    expect(quotaFacts(m, 0.5).binds).toBe(false);
  });
  it('the changes, on every slope and size: what always holds', () => {
    const always = (change: Parameters<typeof quotaVariants>[0], test: (b: ReturnType<typeof quotaFacts>, a: ReturnType<typeof quotaFacts>) => boolean) => quotaVariants(change).every((v) => test(v.before, v.after));
    expect(always('imposed', (b, a) => a.price > b.price && a.domestic! > b.domestic! && a.imports! < b.imports! && a.cs < b.cs && a.ps > b.ps && a.dwl > b.dwl)).toBe(true);
    expect(always('raised', (b, a) => a.price < b.price && a.domestic! < b.domestic! && a.quantity > b.quantity && a.imports! > b.imports!)).toBe(true);
    expect(always('lowered', (b, a) => a.price > b.price && a.domestic! > b.domestic! && a.quantity < b.quantity)).toBe(true);
    // Demand rising under a fixed quota: the imports stay, the price, domestic output and rent rise.
    expect(always('demandRise', (b, a) => Math.abs(a.imports! - b.imports!) < 1e-9 && a.price > b.price && a.domestic! > b.domestic! && a.rent! > b.rent!)).toBe(true);
    // The quota rent when the quota is raised depends on the slopes (HKDSE never keys it).
    const rentUp = quotaVariants('raised').map((v) => v.after.rent! > v.before.rent!);
    expect(new Set(rentUp).size).toBe(2);
  });
  it('the change a stem names', () => {
    expect(quotaChangeIn('If the government doubles the import quota, which of the following will happen?')).toBe('raised');
    expect(quotaChangeIn('The government reduces the quota on imported beef.')).toBe('lowered');
    expect(quotaChangeIn('Suppose the import quota is abolished.')).toBe('removed');
    expect(quotaChangeIn('The demand for Good X increases while the import quota stays unchanged.')).toBe('demandRise');
    expect(quotaChangeIn('An increase in demand under the import quota')).toBe('demandRise');
    expect(quotaChangeIn('政府取消進口配額。')).toBe('removed');
    expect(quotaChangeIn('政府把進口配額增加一倍。')).toBe('raised');
    expect(quotaChangeIn('The country imposes an import quota on Good Y.')).toBeNull();
  });
});

describe('every stage, slope and size draws', () => {
  for (const stage of STAGES) {
    it(`${stage}: no error, every region has area, the regions do not overlap`, () => {
      // Sampled in the fast lane, every triple under TEST_FULL (`src/test/sample.ts`).
      for (const { demand, supply, size } of slopeSizeTriples(SLOPES, SLOPES, SIZES)) {
            const where = `${stage}/${demand}/${supply}/${size}`;
            const built = compileScene(spec({ stage, demand, supply, size }));
            expect(errors(built), where).toEqual([]);
            // Crowded only where a flat demand must move far to raise the price clearly.
            if (!(stage === 'demandRise' && demand === 'flat' && supply === 'steep')) expect(built.issues.map((i) => i.code), where).toEqual([]);
            const d = built.diagram!;
            for (const [id, poly] of built.regionPolygons) expect(polyArea(poly), `${where} ${id}`).toBeGreaterThan(1e-4);
            const polys = [...built.regionPolygons.values()];
            for (let gx = 0.0137; gx < 1; gx += 0.031)
              for (let gy = 0.0091; gy < 1; gy += 0.029) expect(polys.filter((p) => inside(p, gx, gy)).length, `${where} at ${gx},${gy}`).toBeLessThanOrEqual(1);
            expect(d.curves.every((c) => c.points.every((p) => p.x >= -1e-9 && p.x <= 1 + 1e-9))).toBe(true);
          }
    });
  }
});

describe('the drawing', () => {
  it('S with the quota is the editor’s kinked relation on S at the world price: a drag of S keeps the kink at Pw', () => {
    const built = compileScene(spec({}));
    const d = built.diagram!;
    const sq = d.curves.find((c) => c.id === built.curveIds.get('Sq'))!;
    expect(sq.derive?.kind).toBe('importQuota');
    const pw = d.curves.find((c) => c.id === built.curveIds.get('Pw'))!;
    const kink = sq.points.find((p, i) => i > 0 && Math.abs(p.y - sq.points[i - 1].y) < 1e-9)!;
    expect(kink.y).toBeCloseTo(pw.points[0].y, 6);
    // Move S right: the kinked supply follows it.
    const sId = built.curveIds.get('S')!;
    const moved = resolveDiagram({ ...d, curves: d.curves.map((c) => (c.id === sId ? { ...c, points: c.points.map((p) => ({ x: p.x + 0.03, y: p.y })) } : c)) });
    const sq2 = moved.curves.find((c) => c.id === sq.id)!;
    expect(sq2.points[0].x).toBeCloseTo(sq.points[0].x + 0.03, 6);
  });
  it('the price with the quota is on D above Pw, the brace runs from S to D there and the step along Pw', () => {
    const built = compileScene(spec({ labels: lab([['quota', 'Import quota'], ['step', 'Q_A']]) }));
    const d = built.diagram!;
    const pq = d.points.find((p) => plainOf(p.yTickLabel) === 'Pq')!;
    const pw = d.curves.find((c) => c.id === built.curveIds.get('Pw'))!;
    expect(pq.at.y).toBeGreaterThan(pw.points[0].y + 0.04);
    const spans = d.spans ?? [];
    expect(spans.map((s) => s.style).sort()).toEqual(['bracket', 'doubleArrow']);
    const brace = spans.find((s) => s.style === 'bracket')!;
    expect(plainOf(brace.label)).toBe('Import quota');
    expect(plainOf(brace.label, 'zh')).toBe('進口配額');
    // The brace's right end is the price point on D; its left end on S at the same price.
    expect(brace.to).toEqual({ point: pq.id });
    const step = spans.find((s) => s.style === 'doubleArrow')!;
    expect(plainOf(step.label)).toBe('QA');
  });
  it('the brace form leaves Sq and Pw off: S, D, the price line and the brace (DSE2016 Q42)', () => {
    const built = compileScene(spec({ labels: lab([['Pw', ''], ['Sq', ''], ['Pq', 'P_0'], ['Qd', 'Q_0'], ['Qs', ''], ['quota', 'Import quota']]) }));
    const d = built.diagram!;
    expect(d.curves.map((c) => plainOf(c.label)).sort()).toEqual(['D', 'S']);
    expect(built.curveIds.has('Sq')).toBe(false);
    expect(built.curveIds.has('Pw')).toBe(false);
    expect(d.points.filter((p) => plainOf(p.xTickLabel)).map((p) => plainOf(p.xTickLabel))).toEqual(['Q0']);
    expect(d.spans?.length).toBe(1);
  });
  it('kinked supplies alone (DSE2017 Q42): S left off, S1 → S2 with a longer step and an arrow', () => {
    const built = compileScene(spec({ stage: 'raised', labels: lab([['S', ''], ['Pw', '']]) }));
    expect(errors(built)).toEqual([]);
    const d = built.diagram!;
    expect(d.curves.map((c) => plainOf(c.label)).sort()).toEqual(['D', 'S1', 'S2']);
    const step = (id: string) => {
      const c = d.curves.find((k) => k.id === built.curveIds.get(id))!;
      const i = c.points.findIndex((p, j) => j > 0 && Math.abs(p.y - c.points[j - 1].y) < 1e-9);
      return c.points[i].x - c.points[i - 1].x;
    };
    expect(step('Sq2')).toBeGreaterThan(step('Sq') + 0.03);
    expect(d.arrows.length).toBe(1);
    expect(d.arrows[0].to.x).toBeGreaterThan(d.arrows[0].from.x);
  });
  it('lettered regions: the quota rent is the rectangle between the two prices over the quota', () => {
    const built = compileScene(spec({ areas: [{ region: 'rent', label: L('C') }], ask: 'quotaRent' }));
    const poly = areaPolygon(built.diagram!, built.regionAreas.get('rent')!)!;
    const pq = built.diagram!.points.find((p) => plainOf(p.yTickLabel) === 'Pq')!;
    const ys = poly.map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(pq.at.y, 6);
  });
});

describe('the key from the drawing', () => {
  it('area letters: the quota rent and the deadweight loss', () => {
    const areas = ['psGain', 'dwlProduction', 'rent', 'dwlConsumption'].map((region, i) => ({ region, label: L('abcd'[i]) }));
    const rent = run(spec({ areas, ask: 'quotaRent' }), { stem: 'The import quota creates a quota rent. Which area shows it?', statements: [], options: ['a', 'b', 'c', 'b + d'], answer: 2 });
    expect(errors(rent)).toEqual([]);
    expect(rent.solved?.option).toBe(2);
    const dwl = run(spec({ areas, ask: 'dwl' }), { stem: 'Which area shows the deadweight loss of the import quota?', statements: [], options: ['a', 'c', 'b + d', 'a + b + c + d'], answer: 0 });
    expect(errors(dwl).map((i) => i.code)).toContain('scene.key');
  });
  it('ticks: imports with the quota are Q2 to Q3', () => {
    const ok = run(spec({ ask: 'importsAfter' }), { stem: 'With the import quota, the quantity imported is', statements: [], options: ['Q1Q4', 'Q2Q3', 'Q1Q2', 'Q3Q4'], answer: 1 });
    expect(errors(ok)).toEqual([]);
    expect(ok.solved?.option).toBe(1);
  });
});

describe('statements: both states worked out from the drawing', () => {
  // DSE2016 P1 Q42, as the k-0586 live run met it: the brace form, "doubles the import quota".
  const brace = spec({ labels: lab([['Pw', ''], ['Sq', ''], ['Pq', 'P_0'], ['Qd', 'Q_0'], ['Qs', ''], ['quota', 'Import quota']]) });
  const doubled = (answer: number): Mcq => ({
    stem: 'Refer to the following supply-demand diagram about Good Y in a small country. The country has imposed an import quota on Good Y and the price and quantity transacted are P_0 and Q_0 respectively. If the government doubles the import quota, which of the following will happen?',
    statements: [],
    options: ['The price of Good Y will rise.', 'The quantity of domestic production of Good Y will fall.', 'The total quantity transacted of Good Y will fall.', 'The quantity of domestic production of Good Y will rise.'],
    answer,
  });
  it('a one-state figure reads the change from the stem: the quota doubled, domestic production falls (key B)', () => {
    const ok = run(brace, doubled(1));
    expect(errors(ok)).toEqual([]);
    expect(ok.solved?.option).toBe(1);
    const wrong = run(brace, doubled(0));
    expect(errors(wrong).map((i) => i.code)).toContain('scene.statement');
    expect(errors(wrong)[0].text).toContain('the quota raised');
  });
  it('no change named: the quota imposed on free trade', () => {
    const mcq: Mcq = { stem: 'A small open economy imposes an import quota on Good X. Which of the following is correct?', statements: ['The domestic price of Good X will rise.', 'The quantity of imports will fall.', 'Domestic output will fall.'], options: ['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'], answer: 0 };
    const ok = run(spec({}), mcq);
    expect(errors(ok)).toEqual([]);
    expect(ok.solved?.option).toBe(0);
  });
  it('the quota abolished: the statements read the other way', () => {
    const mcq: Mcq = { stem: 'The government abolishes the import quota on Good X. Which of the following will happen?', statements: [], options: ['The quota rent will increase.', 'Consumer surplus will increase.', 'Domestic output will increase.', 'The quantity of imports will decrease.'], answer: 1 };
    const ok = run(spec({}), mcq);
    expect(errors(ok)).toEqual([]);
    expect(ok.solved?.option).toBe(1);
  });
  it('demand rising under the quota: imports unchanged, a claim on the quota rent after a raise refused as a key', () => {
    const rise: Mcq = { stem: 'The demand for Good X increases while the import quota stays unchanged. Which of the following is correct?', statements: [], options: ['The quantity of imports will remain unchanged.', 'The domestic price will fall.', 'Domestic output will fall.', 'The quantity of imports will increase.'], answer: 0 };
    const ok = run(spec({ stage: 'demandRise' }), rise);
    expect(errors(ok)).toEqual([]);
    expect(ok.solved?.option).toBe(0);
    const raised: Mcq = { stem: 'The government raises the import quota. Which of the following must be correct?', statements: [], options: ['The quota rent will increase.', 'The domestic price will rise.', 'Domestic output will rise.', 'The quantity transacted will fall.'], answer: 0 };
    const depends = run(spec({ stage: 'raised' }), raised);
    expect(errors(depends).map((i) => i.code)).toContain('scene.statement');
    expect(errors(depends)[0].text).toContain('depends on the slopes');
  });
});

describe('the stem’s words', () => {
  it('an import quota drawn as another scene, a tariff drawn as an import quota', () => {
    const quota = run({ ...spec({}), scene: { ...emptyScene(), type: 'quota' } }, { stem: 'The government imposes an import quota on rice. Which area shows the deadweight loss?', statements: [], options: ['A', 'B', 'C', 'D'], answer: 0 });
    expect(errors(quota).map((i) => i.code)).toContain('scene.policy');
    const tariff = run(spec({}), { stem: 'The government imposes a tariff on imported rice. Which of the following will happen?', statements: [], options: ['a', 'b', 'c', 'd'], answer: 0 });
    expect(errors(tariff).map((i) => i.code)).toContain('scene.policy');
    // A stem that compares the two keeps the import quota figure.
    const both = run(spec({}), { stem: 'The government replaces a tariff with an import quota that allows the same imports. Which of the following will happen?', statements: [], options: ['a', 'b', 'c', 'd'], answer: 0 });
    expect(errors(both).filter((i) => i.code === 'scene.policy')).toEqual([]);
  });
  it('a two-state figure whose change is not the stem’s, and "from S1 to S2" in the wrong order', () => {
    const cut = run(spec({ stage: 'raised' }), { stem: 'The government cuts the import quota on Good X. Which of the following will happen?', statements: [], options: ['a', 'b', 'c', 'd'], answer: 0 });
    expect(errors(cut).map((i) => i.code)).toContain('scene.stage');
    const order = run(spec({ stage: 'raised', labels: lab([['Sq', 'S_2'], ['Sq2', 'S_1']]) }), { stem: 'The kinked supply shifts from S_1 to S_2 when the quota is raised. Which of the following will happen?', statements: [], options: ['a', 'b', 'c', 'd'], answer: 0 });
    expect(errors(order).map((i) => i.code)).toContain('scene.order');
  });
});

describe('a figure the student completes (DSE2021 P2 Q9(b))', () => {
  const given = spec({ stage: 'demandRise', given: ['D', 'S', 'Pw'], labels: lab([['D', 'D_0'], ['D2', 'D_1'], ['S', 'S_0'], ['Sq', 'S_q'], ['Pq', 'P_A'], ['step', 'Q_A']]), areas: [{ region: 'quotaRent', label: L('') }] });
  it('D_0, S_0 and P_w are printed; S with the quota, D_1, the prices, the step and the rent are the answer layer', () => {
    const built = compileScene(given);
    expect(errors(built)).toEqual([]);
    const d = built.diagram!;
    const answer = (id: string) => d.curves.find((c) => c.id === built.curveIds.get(id))?.answer;
    expect(['D', 'S', 'Pw'].map(answer)).toEqual([undefined, undefined, undefined]);
    expect(['Sq', 'D2'].map(answer)).toEqual([true, true]);
    expect(d.spans?.every((s) => s.answer)).toBe(true);
    expect(d.areas?.every((a) => a.answer)).toBe(true);
    const student = questionLayer(d);
    expect(student.curves.map((c) => plainOf(c.label)).sort()).toEqual(['D0', 'Pw', 'S0']);
    expect(student.points.some((p) => plainOf(p.yTickLabel) === 'PA')).toBe(false);
  });
});

describe('routing and the stored form', () => {
  it('the prompt sends import quota figures to the scene; the templates stay in the Insert menu', () => {
    for (const id of ['import-quota', 'import-quota-demand', 'import-quota-increase']) {
      expect(SCENE_TEMPLATES.has(id)).toBe(true);
      expect(DIAGRAM_TEMPLATES.some((t) => t.id === id)).toBe(true);
      expect(templateMenu()).not.toContain(`- ${id}:`);
    }
    const prompt = systemPrompt();
    expect(prompt).toContain('IMPORT QUOTA (type importQuota)');
    expect(prompt).not.toContain('Import quota at a world price with no kinked supply');
    expect(sceneMenu()).toContain('- importQuota:');
  });
  it('a spec saved before (no import quota fields) parses as it did; one with the scene round-trips', () => {
    const old = parseSpec(JSON.stringify({ kind: 'scene', placement: 'question', scene: { type: 'tariff', labels: [], areas: [], ask: 'dwl' } }));
    expect(old?.spec?.scene?.type).toBe('tariff');
    const s = spec({ stage: 'raised', labels: lab([['S', '']]), ask: 'quotaRent' });
    const back = parseSpec(JSON.stringify(s));
    expect(back?.spec?.scene?.type).toBe('importQuota');
    expect(back?.spec?.scene?.stage).toBe('raised');
    expect(back?.spec?.scene?.ask).toBe('quotaRent');
  });
  it('every sample draws without an issue, and the eval cases are well formed', () => {
    for (const sample of SCENE_SAMPLES.filter((s) => s.id.startsWith('iq-'))) expect(run(sample.spec).issues, sample.id).toEqual([]);
    const cases = GRAPH_CASES.filter((c) => c.id.startsWith('c-iq-'));
    expect(cases.length).toBe(3);
    for (const c of cases) expect(c.options[c.answer]).toBeTruthy();
  });
});

function polyArea(points: Array<{ x: number; y: number }>): number {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

function inside(poly: Array<{ x: number; y: number }>, x: number, y: number): boolean {
  let inPoly = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inPoly = !inPoly;
  }
  return inPoly;
}
