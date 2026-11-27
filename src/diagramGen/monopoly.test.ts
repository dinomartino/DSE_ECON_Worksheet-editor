import { describe, expect, it } from 'vitest';
import { areaPolygon } from '@/model/diagramAreas';
import { questionLayer } from '@/model/diagramAnswers';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from '@/model/diagramTemplates';
import probes from './auditProbes.json';
import { mcFunction, monopolyFacts, monopolyPoint, monopolyStates, monopolyVariants } from './monopoly';
import { SCENE_TEMPLATES, sceneMenu, systemPrompt, templateMenu } from './prompt';
import { evaluateSpec } from './run';
import { compileScene } from './scene';
import { sameArea } from './sceneCheck';
import { SCENE_SAMPLES } from './sceneSamples';
import { emptyScene, emptySpec, parseSpec } from './schema';
import { plainOf } from './text';
import { MC_SHAPES, MONOPOLY_STAGES, SLOPES, SIZES, type DiagramSpec, type SpecScene } from './types';

/**
 * The monopoly scene (k-0589, audit k-0583 task C): MR derived from D, Qm where MR = MC and Pm on
 * D, the efficient output where D meets MC, the DWL regions a partition, both states' market for
 * statement keys, the stem's words, and a figure the student completes (`given` → answer layer).
 */

const spec = (scene: Partial<SpecScene>, placement: DiagramSpec['placement'] = 'question'): DiagramSpec => ({ ...emptySpec('scene'), placement, scene: { ...emptyScene(), type: 'monopoly', ...scene } });
const lab = (pairs: Array<[string, string]>) => pairs.map(([part, label]) => ({ part, label }));
const words = (region: string, en = '', zh = '') => ({ region, label: { en, zh } });
type Mcq = { stem: string; statements: string[]; options: string[]; answer: number };
const run = (s: DiagramSpec, mcq?: Mcq, key = '') => evaluateSpec(s, { sides: ['en', 'zh'], key, ...(mcq ? { mcq } : {}) });
const errors = (e: { issues: Array<{ level: string; code: string; text: string }> }) => e.issues.filter((i) => i.level === 'error');

const STAGES = ['none', ...MONOPOLY_STAGES] as const;
const COMBOS = MC_SHAPES.flatMap((mc) => STAGES.filter((stage) => mc !== 'zero' || stage === 'none' || stage === 'lumpSumTax').map((stage) => ({ mc, stage })));

describe('every MC shape, stage, slope and size draws', () => {
  for (const { mc, stage } of COMBOS) {
    it(`${mc} / ${stage}: no error, every region has area, the regions do not overlap`, () => {
      for (const demand of SLOPES)
        for (const supply of mc === 'rising' || mc === 'uShaped' ? SLOPES : (['normal'] as const))
          for (const size of SIZES) {
            const s = spec({ mc, stage, demand, supply, size });
            const def = compileScene(s);
            const where = `${mc}/${stage}/${demand}/${supply}/${size}`;
            expect(errors(def), where).toEqual([]);
            expect(def.diagram, where).toBeTruthy();
            const polys = [...def.regionPolygons.entries()];
            for (const [id, poly] of polys) expect(poly.length, `${where} ${id}`).toBeGreaterThanOrEqual(3);
            // A partition: no region is (nearly) inside another's outline.
            for (let i = 0; i < polys.length; i += 1)
              for (let j = i + 1; j < polys.length; j += 1) expect(sameArea(polys[i][1], [polys[j][1]]), `${where} ${polys[i][0]} vs ${polys[j][0]}`).toBe(false);
          }
    });
  }
});

describe('the economics on the drawing', () => {
  it('MR is derived from D (same intercept, twice the slope), so a drag keeps it right', () => {
    const built = compileScene(spec({}));
    const d = built.diagram!.curves.find((c) => c.id === built.curveIds.get('D'))!;
    const mr = built.diagram!.curves.find((c) => c.id === built.curveIds.get('MR'))!;
    expect(mr.derive).toEqual({ kind: 'marginalRevenue', of: d.id });
    const slope = (c: typeof d) => (c.points[1].y - c.points[0].y) / (c.points[1].x - c.points[0].x);
    expect(slope(mr)).toBeCloseTo(2 * slope(d), 5);
    expect(mr.points[0].y).toBeCloseTo(d.points[0].y, 5);
  });

  it('Qm is where MR meets MC, Pm on D above it; a flat MC has Qc = 2 Qm; MC = 0 has Qm at half of D’s intercept', () => {
    for (const mc of ['flat', 'rising', 'zero', 'uShaped'] as const) {
      const built = compileScene(spec({ mc, labels: lab([['Qc', 'Q_c']]) }));
      const dia = built.diagram!;
      const tickX = (label: string) => dia.points.find((p) => p.xTickLabel && plainOf(p.xTickLabel).replace(/\s/g, '') === label)!.at.x;
      const qm = tickX('Qm');
      const qc = tickX('Qc');
      const d = dia.curves.find((c) => c.id === built.curveIds.get('D'))!;
      const [a, z] = [d.points[0], d.points[d.points.length - 1]];
      const b = -(z.y - a.y) / (z.x - a.x);
      const mrAt = (x: number) => a.y - 2 * b * x;
      const pmPoint = dia.points.find((p) => p.yTickLabel && plainOf(p.yTickLabel).replace(/\s/g, '') === 'Pm')!;
      expect(pmPoint.at.y, mc).toBeCloseTo(a.y - b * qm, 3);
      if (mc === 'flat') expect(qc / qm, mc).toBeCloseTo(2, 2);
      if (mc === 'zero') {
        expect(mrAt(qm), mc).toBeCloseTo(0, 3);
        expect(qc, mc).toBeCloseTo(a.y / b, 3);
      }
      expect(qc, mc).toBeGreaterThan(qm + 0.05);
    }
  });

  it('each change moves the market the way the marking schemes say', () => {
    const m = { a: 0.9, b: 0.89, mc: mcFunction('rising', 0.15, 0.9) };
    const fall = monopolyStates('mcFall', m, 0.1);
    expect(fall.after.quantity).toBeGreaterThan(fall.before.quantity);
    expect(fall.after.price).toBeLessThan(fall.before.price);
    // DSE2019: the model answer shows the new DWL larger.
    expect(fall.after.dwl).toBeGreaterThan(fall.before.dwl);
    const rise = monopolyStates('mcRise', m, 0.1);
    expect(rise.after.quantity).toBeLessThan(rise.before.quantity);
    expect(rise.after.price).toBeGreaterThan(rise.before.price);
    const kept = monopolyStates('mcFallKept', m, 0.1);
    expect(kept.after.quantity).toBe(kept.before.quantity);
    expect(kept.after.price).toBe(kept.before.price);
    expect(kept.after.dwl).toBeGreaterThan(kept.before.dwl);
    const lump = monopolyStates('lumpSumTax', m, 0.1);
    expect(lump.after).toEqual(lump.before);
    // DSE2025: the new efficient output is the old monopoly output.
    const flat = { a: 0.9, b: 0.89, mc: mcFunction('flat', 0.3, 0) };
    const toPrice = monopolyStates('mcRiseToPrice', flat, 0);
    expect(toPrice.after.efficient!).toBeCloseTo(toPrice.before.quantity, 3);
    expect(monopolyFacts(flat).efficient! / monopolyFacts(flat).quantity).toBeCloseTo(2, 3);
    expect(monopolyPoint({ a: 0.9, b: 1, mc: mcFunction('zero', 0, 0) }).qm).toBeCloseTo(0.45, 3);
  });

  it('a U-shaped MC: Qm is where MR cuts its rising part', () => {
    const m = { a: 0.9, b: 0.89, mc: mcFunction('uShaped', 0.25, 2.5, 0.28) };
    const p = monopolyPoint(m);
    expect(p.qm).toBeGreaterThan(0.28);
    expect(0.9 - 2 * 0.89 * p.qm).toBeCloseTo(m.mc(p.qm), 3);
  });

  it('the variants cover every slope and keep the change’s direction', () => {
    for (const shape of ['flat', 'rising', 'uShaped'] as const) {
      const vs = monopolyVariants('mcFall', shape);
      expect(vs.length).toBeGreaterThan(5);
      for (const v of vs) expect(v.after.quantity).toBeGreaterThan(v.before.quantity);
    }
  });
});

describe('keys worked out from the drawing', () => {
  const FALL_MCQ: Mcq = {
    stem: 'The figure shows the demand and marginal cost curves of a monopolist. The marginal cost falls from MC1 to MC2. Which area shows the change in deadweight loss?',
    statements: [],
    options: ['C − B', 'A + B', 'B', 'A + C'],
    answer: 0,
  };
  it('lettered regions: the asked area must be the keyed letters', () => {
    const s = spec({ stage: 'mcFall', ask: 'dwlAfter', areas: [words('dwlKept', 'A', 'A'), words('dwlRemoved', 'B', 'B'), words('dwlAdded', 'C', 'C')] });
    const e = run(s, { ...FALL_MCQ, stem: FALL_MCQ.stem.replace('the change in', 'the new'), options: ['A + C', 'A + B', 'B', 'C'], answer: 0 });
    expect(errors(e)).toEqual([]);
    expect(e.solved?.option).toBe(0);
    const wrong = run(s, { ...FALL_MCQ, options: ['A + C', 'A + B', 'B', 'C'], answer: 1 });
    expect(errors(wrong).map((i) => i.code)).toContain('scene.key');
  });

  it('ticks: the monopoly output after a fall in MC is Q_2', () => {
    const s = spec({ stage: 'mcFall', ask: 'quantityAfter', labels: lab([['MC', 'MC_1'], ['MC2', 'MC_2'], ['Qm', 'Q_1'], ['Qm2', 'Q_2'], ['Qc', 'Q_3'], ['Qc2', 'Q_4']]) });
    const mcq: Mcq = { stem: 'MC falls from MC1 to MC2. The profit-maximising output becomes', statements: [], options: ['Q1.', 'Q2.', 'Q3.', 'Q4.'], answer: 1 };
    const e = run(s, mcq);
    expect(errors(e)).toEqual([]);
    expect(e.solved?.option).toBe(1);
  });

  it('statements: answered from both states, and a claim keyed wrong is refused', () => {
    const s = spec({ stage: 'mcFall', mc: 'rising', labels: lab([['MC', 'MC_1'], ['MC2', 'MC_2']]) });
    const base: Mcq = {
      stem: 'A monopolist’s marginal cost falls from MC1 to MC2 as components become cheaper. Which of the following is correct?',
      statements: [],
      options: ['The monopoly price will rise.', 'The output will increase.', 'The consumer surplus will decrease.', 'The output will remain unchanged.'],
      answer: 1,
    };
    const e = run(s, base);
    expect(errors(e)).toEqual([]);
    expect(e.solved?.option).toBe(1);
    expect(errors(run(s, { ...base, answer: 0 })).map((i) => i.code)).toContain('scene.statement');
  });

  it('DSE2025: the efficient output after the rise is the old monopoly output; "efficient output" is not the monopoly output', () => {
    const s = spec({ stage: 'mcRiseToPrice', labels: lab([['Qm', 'Q_0'], ['Pm', 'P_0'], ['Qc', 'Q_1']]) });
    const mcq: Mcq = { stem: 'The oil price rises, so the monopolist’s marginal cost rises to P0.', statements: [], options: ['The efficient output will decrease.', 'The efficient output will increase.', 'The monopoly price will fall.', 'The output will increase.'], answer: 0 };
    const e = run(s, mcq);
    expect(errors(e)).toEqual([]);
    expect(e.solved?.option).toBe(0);
  });

  it('a lump-sum tax changes nothing: output and price unchanged', () => {
    const s = spec({ stage: 'lumpSumTax' });
    const mcq: Mcq = { stem: 'The government imposes a lump-sum tax on the monopolist. Which of the following is correct?', statements: [], options: ['The output will decrease.', 'The output will remain unchanged.', 'The price will rise.', 'The deadweight loss will increase.'], answer: 1 };
    const e = run(s, mcq);
    expect(errors(e)).toEqual([]);
    expect(e.solved?.option).toBe(1);
  });
});

describe('the stem’s words against the scene', () => {
  const codes = (s: DiagramSpec, stem: string) => run(s, { stem, statements: [], options: ['a', 'b', 'c', 'd'], answer: 0 }).issues.map((i) => `${i.level} ${i.code}`);
  it('a lump-sum tax drawn as an MC rise is an error', () => {
    expect(codes(spec({ stage: 'mcRise' }), 'The government imposes a lump-sum tax on the monopolist.')).toContain('error scene.stage');
  });
  it('a cost that rises is not drawn falling, nor back', () => {
    expect(codes(spec({ stage: 'mcFall' }), 'The price of fuel rises sharply.')).toContain('error scene.stage');
    expect(codes(spec({ stage: 'mcRise' }), 'Components become cheaper.')).toContain('error scene.stage');
    expect(codes(spec({ stage: 'mcRise' }), 'The price of fuel rises sharply.')).not.toContain('error scene.stage');
  });
  it('a per-unit tax on a monopoly is its MC rising, not a unit-tax scene', () => {
    expect(codes(spec({ stage: 'mcRise' }), 'A per-unit tax is imposed on the monopolist.')).not.toContain('error scene.policy');
    expect(codes(spec({ stage: 'none' }), 'A per-unit tax is imposed on the monopolist.')).toContain('error scene.policy');
  });
  it('a monopoly stem drawn as a market scene is looked at', () => {
    const s: DiagramSpec = { ...spec({}), scene: { ...emptyScene(), type: 'surplus' } };
    expect(codes(s, 'Firm X is a monopoly.')).toContain('look scene.policy');
  });
  it('a control stage on a monopoly and a monopoly stage on a control are refused with a reason', () => {
    expect(errors(compileScene(spec({ stage: 'lowered' })))[0].code).toBe('scene.stage');
    expect(errors(compileScene({ ...spec({}), scene: { ...emptyScene(), type: 'priceCeiling', stage: 'mcRise' } }))[0].code).toBe('scene.stage');
    expect(errors(compileScene(spec({ mc: 'zero', stage: 'mcFall' })))[0].text).toMatch(/MC = 0/);
  });
});

describe('areas in words may overlap, letters may not', () => {
  it('the original and the new DWL hatched both ways (DSE2019), each label on its own part', () => {
    const built = compileScene(spec({ stage: 'mcFall', areas: [words('dwlBefore'), words('dwlAfter')] }, 'answer'));
    expect(errors(built)).toEqual([]);
    const labelled = (built.diagram!.areas ?? []).filter((a) => a.label).map((a) => plainOf(a.label));
    expect(labelled.sort()).toEqual(['New deadweight loss', 'Original deadweight loss']);
  });
  it('two lettered areas over one region stay an error', () => {
    const built = compileScene(spec({ stage: 'mcFall', areas: [words('dwlBefore', 'A', 'A'), words('dwlAfter', 'B', 'B')] }));
    expect(errors(built).map((i) => i.code)).toContain('scene.overlap');
  });
});

describe('a figure the student completes (given → answer layer)', () => {
  it('DSE2018: given D only, the student’s MR, MC, ticks and DWL are the answer layer', () => {
    const built = compileScene(spec({ mc: 'rising', stage: 'mcRise', given: ['D'], areas: [words('dwlAfter')] }));
    expect(errors(built)).toEqual([]);
    const dia = built.diagram!;
    const d = built.curveIds.get('D')!;
    for (const c of dia.curves) expect(Boolean(c.answer), c.id).toBe(c.id !== d);
    expect((dia.areas ?? []).every((a) => a.answer)).toBe(true);
    expect(dia.points.filter((p) => p.xTickLabel || p.yTickLabel).every((p) => p.answer)).toBe(true);
    const student = questionLayer(dia);
    expect(student.curves.map((c) => c.id)).toEqual([d]);
    expect(student.areas ?? []).toEqual([]);
    expect(student.points.filter((p) => p.xTickLabel || p.yTickLabel)).toEqual([]);
  });
  it('given D and MC: those print for the student, MR and MC2 do not', () => {
    const built = compileScene(spec({ stage: 'mcFall', given: ['D', 'MC'] }));
    const student = questionLayer(built.diagram!);
    expect(student.curves.map((c) => c.id).sort()).toEqual([built.curveIds.get('D'), built.curveIds.get('MC')].sort());
  });
  it('needs placement question; an unknown part is named', () => {
    expect(errors(compileScene(spec({ given: ['D'] }, 'answer'))).map((i) => i.code)).toContain('scene.given');
    expect(errors(compileScene(spec({ given: ['S'] }))).map((i) => i.text).join(' ')).toMatch(/does not have/);
  });
  it('works on a market scene too (a tax on a given D and S)', () => {
    const built = compileScene({ ...spec({}), scene: { ...emptyScene(), type: 'unitTax', given: ['D', 'S0'], areas: [words('taxRevenue')] } });
    expect(errors(built)).toEqual([]);
    expect(questionLayer(built.diagram!).curves.length).toBe(2);
  });
});

describe('routing and the wrong-figure guard', () => {
  it('the prompt offers scene monopoly and no longer the fixed-label monopoly templates (they stay in Insert → Diagram)', () => {
    expect(sceneMenu()).toMatch(/- monopoly:/);
    expect(systemPrompt()).toMatch(/MONOPOLY \(type monopoly\)/);
    const monopolyTemplates = DIAGRAM_TEMPLATES.filter((t) => t.id.startsWith('monopoly'));
    expect(monopolyTemplates.length).toBe(8);
    for (const t of monopolyTemplates) {
      expect(SCENE_TEMPLATES.has(t.id)).toBe(true);
      expect(templateMenu()).not.toMatch(new RegExp(`- ${t.id}:`));
      expect(buildFromTemplate(t.id)).toBeTruthy();
    }
  });
  it('an improvised MR in kind curves still fails (probe f-monopoly-try)', () => {
    const probe = (probes as Array<{ id: string; spec: unknown }>).find((p) => p.id === 'f-monopoly-try')!;
    const e = evaluateSpec(parseSpec(JSON.stringify(probe.spec))!.spec, { sides: ['en'], key: '' });
    expect(errors(e).map((i) => i.code)).toContain('curves.firm');
  });
});

describe('saved documents (k-0589): a monopoly figure stores no field an older build lacks', () => {
  const keys = (v: unknown, path: string, out: Set<string>) => {
    if (Array.isArray(v)) v.forEach((x) => keys(x, path, out));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        out.add(`${path}.${k}`);
        keys(x, `${path}.${k}`, out);
      }
  };
  it('every key is one the templates or the earlier scenes write; the answer layer only adds `answer` (stored since v0.10.0)', () => {
    const known = new Set<string>();
    for (const t of DIAGRAM_TEMPLATES) keys(buildFromTemplate(t.id), 'd', known);
    for (const s of SCENE_SAMPLES.filter((x) => !x.id.startsWith('mono-'))) keys(compileScene(s.spec).diagram, 'd', known);
    const used = new Set<string>();
    for (const s of SCENE_SAMPLES.filter((x) => x.id.startsWith('mono-'))) keys(compileScene(s.spec).diagram, 'd', used);
    for (const { mc, stage } of COMBOS) keys(compileScene(spec({ mc, stage, given: ['D'], areas: [words('dwl')] })).diagram, 'd', used);
    expect([...used].filter((k) => !known.has(k) && !k.endsWith('.answer'))).toEqual([]);
  });
  it('a spec saved before k-0589 (no mc, no given) reads as a flat MC and one layer', () => {
    const raw = { ...emptySpec('scene'), scene: { ...emptyScene(), type: 'monopoly' } } as Record<string, unknown>;
    const scene = raw.scene as Record<string, unknown>;
    delete scene.mc;
    delete scene.given;
    const parsed = parseSpec(JSON.stringify(raw))!;
    expect(parsed.spec.scene?.mc).toBe('flat');
    expect(parsed.spec.scene?.given).toEqual([]);
    expect(parsed.issues).toEqual([]);
  });
  it('the monopoly samples compile with no error and draw both languages', () => {
    for (const s of SCENE_SAMPLES.filter((x) => x.id.startsWith('mono-'))) {
      const e = run(s.spec);
      expect(errors(e), s.id).toEqual([]);
      expect((e.compiled.diagram?.areas ?? []).every((a) => !a.band || areaPolygon(e.compiled.diagram!, a)), s.id).toBe(true);
    }
  });
});
