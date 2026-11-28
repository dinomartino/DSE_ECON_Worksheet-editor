import { describe, expect, it } from 'vitest';
import { questionLayer } from '@/model/diagramAnswers';
import { GRAPH_CASES } from '../../evals/graphs/cases';
import { inputOf } from '../../evals/graphs/shared';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from '@/model/diagramTemplates';
import { SCENE_TEMPLATES, sceneMenu, systemPrompt, templateMenu } from './prompt';
import { evaluateSpec } from './run';
import { compileScene } from './scene';
import { SCENE_SAMPLES } from './sceneSamples';
import { emptyScene, emptySpec, parseSpec } from './schema';
import { plainOf } from './text';
import { concaveCost, interceptsIn, ratiosIn, tradeNumbers } from './trade';
import type { DiagramSpec, SpecScene, SpecTrade, SpecTradeCountry } from './types';

/**
 * The PPF / CPF trade scene (k-0589, audit k-0583 task C): the numbers worked out from the
 * question's (specialisation, the CPF, consumption, volumes, gain) on the Elective 2 papers, the
 * drawing (numbers on the axes, the CPF touching a concave PPF at the worked-out point), the stem's
 * numbers against the spec, numeric keys, and a figure the student completes.
 */

const nation = (c: Partial<SpecTradeCountry> & Pick<SpecTradeCountry, 'x' | 'y'>): SpecTradeCountry => ({ name: '', shape: 'linear', noTradeX: 0, noTradeCost: 0, trade: true, consume: 'none', amount: 0, brackets: false, gain: false, ...c });
const tradeOf = (t: Partial<SpecTrade> & Pick<SpecTrade, 'tot' | 'countries'>): SpecTrade => ({ totLine: false, grow: 0, xGood: { en: '', zh: '' }, yGood: { en: '', zh: '' }, ...t });
const spec = (trade: SpecTrade, scene: Partial<SpecScene> = {}, placement: DiagramSpec['placement'] = 'answer'): DiagramSpec => ({ ...emptySpec('scene'), placement, scene: { ...emptyScene(), type: 'ppfTrade', trade, ...scene } });
type Mcq = { stem: string; statements: string[]; options: string[]; answer: number };
const run = (s: DiagramSpec, mcq?: Mcq, key = '') => evaluateSpec(s, { sides: ['en', 'zh'], key, ...(mcq ? { mcq } : {}) });
const errors = (e: { issues: Array<{ level: string; code: string; text: string }> }) => e.issues.filter((i) => i.level === 'error');
const printed = (d: NonNullable<ReturnType<typeof compileScene>['diagram']>, axis: 'x' | 'y') =>
  d.points
    .map((p) => (axis === 'x' ? p.xTickLabel : p.yTickLabel))
    .filter(Boolean)
    .map((t) => plainOf(t))
    .sort((a, b) => Number(a) - Number(b));

const DSE2019 = tradeOf({ tot: 2, countries: [nation({ name: 'A', x: 20, y: 30, noTradeX: 10, consume: 'sameX', brackets: true, gain: true })] });

describe('the numbers, as the marking schemes give them', () => {
  it('DSE2019 P2 Q14: C0 (10, 15), P1 (20, 0), CPF to 40, C1 (10, 20), exports 10X, imports 20Y, gain 5Y', () => {
    const [a] = tradeNumbers(DSE2019).countries;
    expect(a.e).toEqual({ x: 10, y: 15 });
    expect(a.p).toEqual({ x: 20, y: 0 });
    expect(a.cpf).toEqual({ x: 20, y: 40 });
    expect(a.c).toEqual({ x: 10, y: 20 });
    expect([a.exportsGood, a.exports, a.imports, a.gain]).toEqual(['x', 10, 20, 5]);
  });
  it('DSE2014 P2 Q14: A specialises in X, CPF to 15, consumption (6, 6) with 4X traded', () => {
    const [a] = tradeNumbers(tradeOf({ tot: 1.5, countries: [nation({ x: 10, y: 10, consume: 'tradedX', amount: 4 })] })).countries;
    expect(a.p).toEqual({ x: 10, y: 0 });
    expect(a.cpf).toEqual({ x: 10, y: 15 });
    expect(a.c!.x).toBeCloseTo(6);
    expect(a.c!.y).toBeCloseTo(6);
  });
  it('DSE2018 P2 Q15: B specialises in Y, C_B (30, 30); A exports 70–100 of X and imports 0–30 of Y', () => {
    const [a, b] = tradeNumbers(tradeOf({ tot: 1, countries: [nation({ name: 'A', x: 100, y: 80, consume: 'tradedX', amount: 30 }), nation({ name: 'B', x: 30, y: 60, consume: 'equal' })] })).countries;
    expect(b.p).toEqual({ x: 0, y: 60 });
    expect(b.c).toEqual({ x: 30, y: 30 });
    expect(a.c).toEqual({ x: 70, y: 30 });
    expect([a.exports, a.imports]).toEqual([30, 30]);
  });
  it('DSE2025 P2 Q13: B (cost 1.5Y > world 1Y) specialises in Y; 10X traded puts C_B at (10, 20), exports 10Y, imports 10X', () => {
    const [, b] = tradeNumbers(tradeOf({ tot: 1, countries: [nation({ name: 'A', shape: 'concave', x: 30, y: 30, noTradeCost: 0.5 }), nation({ name: 'B', x: 20, y: 30, consume: 'tradedX', amount: 10 })] })).countries;
    expect(b.p).toEqual({ x: 0, y: 30 });
    expect(b.c).toEqual({ x: 10, y: 20 });
    expect([b.exportsGood, b.exports, b.imports]).toEqual(['y', 10, 10]);
  });
  it('DSE2013 P2 Q14: labour doubles: PPF to (20, 8), CPF to (20, 20)', () => {
    const { grown } = tradeNumbers(tradeOf({ tot: 1, grow: 2, countries: [nation({ x: 10, y: 4 })] }));
    expect([grown!.X, grown!.Y]).toEqual([20, 8]);
    expect(grown!.cpf).toEqual({ x: 20, y: 20 });
  });
  it('a concave PPF: production with trade where its slope equals the world price, toward the good the country has the advantage in', () => {
    const right = tradeNumbers(tradeOf({ tot: 2.5, countries: [nation({ shape: 'concave', x: 20, y: 40, noTradeCost: 1, consume: 'sameX' })] })).countries[0];
    expect(concaveCost(20, 40, right.p!.x)).toBeCloseTo(2.5, 6);
    expect(right.p!.x).toBeGreaterThan(right.e!.x);
    expect(right.gain!).toBeGreaterThan(0);
    const left = tradeNumbers(tradeOf({ tot: 0.8, countries: [nation({ shape: 'concave', x: 30, y: 30, noTradeCost: 2, consume: 'tradedX', amount: 8 })] })).countries[0];
    expect(left.p!.x).toBeLessThan(left.e!.x);
    expect(left.exportsGood).toBe('y');
    expect(left.imports).toBeCloseTo(8);
  });
  it('refuses what cannot be drawn, saying why', () => {
    const msg = (t: SpecTrade) => tradeNumbers(t).errors.join(' ');
    expect(msg(tradeOf({ tot: 1.5, countries: [nation({ x: 20, y: 30 })] }))).toMatch(/equals its opportunity cost/);
    expect(msg(tradeOf({ tot: 2, countries: [nation({ x: 20, y: 30, consume: 'sameX' })] }))).toMatch(/needs the no-trade point/);
    expect(msg(tradeOf({ tot: 2, countries: [nation({ x: 20, y: 30, consume: 'x', amount: 25 })] }))).toMatch(/off the CPF/);
    expect(msg(tradeOf({ tot: 2, countries: [nation({ shape: 'concave', x: 20, y: 30, consume: 'tradedX', amount: 3 })] }))).toMatch(/needs the no-trade point/);
    expect(msg(tradeOf({ tot: 2, countries: [nation({ x: 20, y: 30, noTradeCost: 3 })] }))).toMatch(/1.5 Y per X everywhere/);
    expect(msg(tradeOf({ tot: 0, countries: [nation({ x: 20, y: 30 })] }))).toMatch(/positive number/);
    expect(errors(compileScene(spec(tradeOf({ tot: 1.5, countries: [nation({ x: 20, y: 30 })] }))))[0].code).toBe('scene.trade');
  });
});

describe('the drawing', () => {
  it('every sample draws with no error; the axes read in the goods’ units', () => {
    for (const s of SCENE_SAMPLES.filter((x) => x.id.startsWith('ppf-'))) {
      const e = run(s.spec);
      expect(errors(e), s.id).toEqual([]);
      expect(e.compiled.diagram!.x.max, s.id).toBeGreaterThan(1);
    }
  });
  it('DSE2019: the numbers a scheme marks are on the axes, each once', () => {
    const d = compileScene(spec(DSE2019)).diagram!;
    expect(printed(d, 'x')).toEqual(['10', '20']);
    expect(printed(d, 'y')).toEqual(['15', '20', '30', '40']);
    expect((d.spans ?? []).length).toBe(3);
  });
  it('a concave PPF lies under its CPF everywhere and touches it at P', () => {
    const t = tradeOf({ tot: 2.5, countries: [nation({ shape: 'concave', x: 20, y: 40, noTradeCost: 1 })] });
    const built = compileScene(spec(t));
    const d = built.diagram!;
    const ppf = d.curves.find((c) => c.id === built.curveIds.get('PPF'))!;
    const cpf = d.curves.find((c) => c.id === built.curveIds.get('CPF'))!;
    const [a, b] = cpf.points;
    const cpfY = (x: number) => a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    for (const p of ppf.points) expect(p.y, `x ${p.x}`).toBeLessThanOrEqual(cpfY(p.x) + 1e-6);
    const P = d.points.find((p) => plainOf(p.label) === 'P')!;
    expect(P.at.y).toBeCloseTo(cpfY(P.at.x), 4);
  });
  it('two countries at one world price on one line: one CPF named for both (DSEPP Q16)', () => {
    const built = compileScene(spec(tradeOf({ tot: 1, countries: [nation({ name: 'A', x: 100, y: 50 }), nation({ name: 'B', x: 50, y: 100 })] })));
    const cpfs = built.diagram!.curves.filter((c) => plainOf(c.label).includes('CPF'));
    expect(cpfs.length).toBe(1);
    expect(plainOf(cpfs[0].label).replace(/\s/g, '')).toBe('CPFA=CPFB');
  });
  it('a concave CPF’s long decimal intercepts are not printed', () => {
    const d = compileScene(spec(tradeOf({ tot: 2.5, countries: [nation({ shape: 'concave', x: 20, y: 40, noTradeCost: 1 })] }))).diagram!;
    expect([...printed(d, 'x'), ...printed(d, 'y')].every((t) => /^\d+(\.5)?$/.test(t))).toBe(true);
  });
});

describe('a figure the student completes', () => {
  it('DSE2019: given PPF_A, the student sees only it and its intercepts', () => {
    const built = compileScene(spec(DSE2019, { given: ['PPF'] }, 'question'));
    expect(errors(built)).toEqual([]);
    const student = questionLayer(built.diagram!);
    expect(student.curves.map((c) => c.id)).toEqual([built.curveIds.get('PPF')]);
    expect(printed(student, 'x')).toEqual(['20']);
    expect(printed(student, 'y')).toEqual(['30']);
    expect(student.spans ?? []).toEqual([]);
    expect(student.points.filter((p) => p.label)).toEqual([]);
  });
  it('given PPF and E: the no-trade point and its numbers print too', () => {
    const built = compileScene(spec(DSE2019, { given: ['PPF', 'E'] }, 'question'));
    const student = questionLayer(built.diagram!);
    expect(printed(student, 'x')).toEqual(['10', '20']);
    expect(printed(student, 'y')).toEqual(['15', '30']);
  });
});

describe('the question against the figure', () => {
  const codes = (s: DiagramSpec, stem: string) => run(s, { stem, statements: [], options: ['a', 'b', 'c', 'd'], answer: 0 }).issues.map((i) => `${i.level} ${i.code}`);
  it('reads world prices and intercepts as HKDSE writes them', () => {
    expect(ratiosIn('The world price is 1X = 2Y.')).toEqual([2]);
    expect(ratiosIn('terms of trade: 1 unit of X = 1.5 units of Y')).toEqual([1.5]);
    expect(ratiosIn('the world price 1Y = 0.5X')).toEqual([2]);
    expect(interceptsIn('Country A can produce 30Y or 20X.')).toEqual([{ x: 20, y: 30 }]);
  });
  it('a world price or intercepts other than the question’s are errors; matching ones pass', () => {
    const s = spec(DSE2019, {}, 'question');
    expect(codes(s, 'Country A can produce 20X or 30Y. The world price is 1X = 1.5Y.')).toContain('error scene.trade');
    expect(codes(s, 'Country A can produce 25X or 30Y. The world price is 1X = 2Y.')).toContain('error scene.trade');
    expect(codes(s, 'Country A can produce 20X or 30Y. The world price is 1X = 2Y.')).not.toContain('error scene.trade');
  });
  it('constant against increasing opportunity cost', () => {
    expect(codes(spec(DSE2019, {}, 'question'), 'Country A faces increasing opportunity costs.')).toContain('error scene.trade');
  });
  it('a PPF question drawn as a market scene is looked at', () => {
    const s: DiagramSpec = { ...emptySpec('scene'), placement: 'question', scene: { ...emptyScene(), type: 'surplus' } };
    expect(codes(s, 'The diagram shows the PPF of Country A.')).toContain('look scene.policy');
  });
  it('a numeric MCQ: the keyed number must be the worked-out one', () => {
    const s = spec(DSE2019, { ask: 'imports', given: [], labels: [] }, 'question');
    const mcq: Mcq = { stem: 'Country A can produce 20X or 30Y. The world price is 1X = 2Y and A consumes 10X after trade. How many units of Y does A import?', statements: [], options: ['5', '10', '15', '20'], answer: 3 };
    const ok = run(s, mcq);
    expect(errors(ok)).toEqual([]);
    expect(ok.solved?.option).toBe(3);
    expect(errors(run(s, { ...mcq, answer: 1 })).map((i) => i.code)).toContain('scene.key');
    const gain = run({ ...s, scene: { ...s.scene!, ask: 'gainFromTrade' } }, { ...mcq, stem: 'What is the gain from trade (in units of Y)?', answer: 0 });
    expect(gain.solved?.option).toBe(0);
  });
});

describe('the eval cases, drawn as the model is asked to', () => {
  it('c-ppf-imports: the PPF given, the key worked out (20Y)', () => {
    const c = inputOf(GRAPH_CASES.find((g) => g.id === 'c-ppf-imports')!);
    const s = spec(DSE2019, { ask: 'imports', given: ['PPF'], labels: [{ part: 'PPF', label: 'PPF_A' }] }, 'question');
    const e = evaluateSpec(s, { sides: c.sides, key: c.key, mcq: c.mcq });
    expect(errors(e)).toEqual([]);
    expect(e.solved?.option).toBe(3);
  });
  it('c-ppf-concave-exports: E and TT′ drawn, P up-left of E', () => {
    const c = inputOf(GRAPH_CASES.find((g) => g.id === 'c-ppf-concave-exports')!);
    const s = spec(tradeOf({ tot: 1, totLine: true, countries: [nation({ shape: 'concave', x: 30, y: 30, noTradeCost: 2 })] }), { labels: [{ part: 'TOT', label: "TT'" }] }, 'question');
    const e = evaluateSpec(s, { sides: c.sides, key: c.key, mcq: c.mcq });
    expect(errors(e)).toEqual([]);
    const [k] = tradeNumbers(s.scene!.trade!).countries;
    expect(k.p!.x).toBeLessThan(k.e!.x);
  });
});

describe('routing, stored keys, old specs', () => {
  it('the prompt offers scene ppfTrade and hides the fixed-label trade templates (still in Insert → Diagram)', () => {
    expect(sceneMenu()).toMatch(/- ppfTrade:/);
    expect(systemPrompt()).toMatch(/TRADE \(type ppfTrade/);
    for (const id of ['ppf-linear-trade', 'ppf-two-countries', 'ppf-concave-trade', 'ppf-shift', 'ppf-growth-trade']) {
      expect(SCENE_TEMPLATES.has(id)).toBe(true);
      expect(templateMenu()).not.toMatch(new RegExp(`- ${id}:`));
      expect(buildFromTemplate(id)).toBeTruthy();
    }
    // The single PPC stays a kind "curves" figure.
    expect(templateMenu()).toMatch(/- ppc:/);
  });
  it('every key a trade figure writes is one the templates or earlier scenes write (plus the answer layer’s `answer`)', () => {
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
    for (const s of SCENE_SAMPLES.filter((x) => !x.id.startsWith('ppf-') && !x.id.startsWith('mono-'))) keys(compileScene(s.spec).diagram, 'd', known);
    const used = new Set<string>();
    for (const s of SCENE_SAMPLES.filter((x) => x.id.startsWith('ppf-'))) keys(compileScene(s.spec).diagram, 'd', used);
    expect([...used].filter((k) => !known.has(k) && !k.endsWith('.answer'))).toEqual([]);
  });
  it('a spec saved before k-0589 (no trade) reads with an empty trade; a reply with trade reads whole', () => {
    const raw = { ...emptySpec('scene'), scene: { ...emptyScene(), type: 'surplus' } } as Record<string, unknown>;
    delete (raw.scene as Record<string, unknown>).trade;
    const old = parseSpec(JSON.stringify(raw))!;
    expect(old.spec.scene?.trade?.countries).toEqual([]);
    expect(old.issues).toEqual([]);
    const reply = parseSpec(JSON.stringify(spec(DSE2019)))!;
    expect(reply.spec.scene?.trade).toEqual(DSE2019);
  });
});

describe('a world price line with no trade drawn (k-0589 live run: DSE2017 TT\')', () => {
  it('TT\' is drawn outside the frontier at the world price slope, with no CPF or production point', async () => {
    const { compileScene } = await import('./scene');
    const { emptyScene, emptySpec } = await import('./schema');
    const built = compileScene({
      ...emptySpec('scene'),
      placement: 'question',
      scene: { ...emptyScene(), type: 'ppfTrade', labels: [{ part: 'TOT', label: "TT'" }], trade: { tot: 1, totLine: true, grow: 0, xGood: { en: '', zh: '' }, yGood: { en: '', zh: '' }, countries: [{ name: '', shape: 'concave', x: 10, y: 10, noTradeX: 0, noTradeCost: 2, trade: false, consume: 'none', amount: 0, brackets: false, gain: false }] } },
    });
    const d = built.diagram!;
    const tt = d.curves.find((c) => c.id === built.curveIds.get('TOT'))!;
    expect(tt).toBeTruthy();
    expect(built.curveIds.has('CPF')).toBe(false);
    const [p, q] = tt.points;
    // Slope −1 in goods units on equal axes, and every point of it outside the quarter circle.
    expect((q.y - p.y) / (q.x - p.x)).toBeCloseTo(-1, 6);
    for (const pt of tt.points) expect(Math.hypot(pt.x, pt.y)).toBeGreaterThan(0.86 + 0.02);
  });
});
