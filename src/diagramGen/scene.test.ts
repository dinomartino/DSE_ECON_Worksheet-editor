import { describe, expect, it } from 'vitest';
import { areaPolygon } from '@/model/diagramAreas';
import { plainOf } from './text';
import { checkLabels, diagramLabels } from './labels';
import { systemPrompt } from './prompt';
import { evaluateReply, evaluateSpec } from './run';
import { compileScene } from './scene';
import { SCENES } from './sceneCatalogue';
import { optionLetters, sceneWords } from './sceneCheck';
import { SCENE_SAMPLES } from './sceneSamples';
import { emptyScene, emptySpec, parseSpec } from './schema';
import { EXTERNALITIES, SIZES, SLOPES, type DiagramSpec, type SpecScene } from './types';
import { figureWords } from './words';

const spec = (scene: Partial<SpecScene>, placement: DiagramSpec['placement'] = 'question'): DiagramSpec => ({ ...emptySpec('scene'), placement, scene: { ...emptyScene(), ...scene } });
const L = (l: string) => ({ en: l, zh: l });
const TAX_LETTERS = ['csAfter', 'buyersBurden', 'sellersBurden', 'psAfter', 'dwlBuyers', 'dwlSellers'].map((region, i) => ({ region, label: L('ABCDEF'[i]) }));

function pointInPolygon(p: { x: number; y: number }, poly: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

describe('every scene draws, for every slope and size (k-0577)', () => {
  const variants: Array<Partial<SpecScene>> = [];
  for (const def of SCENES) {
    const kinds = def.type === 'externality' ? EXTERNALITIES.filter((e) => e !== 'none') : ['none' as const];
    for (const externality of kinds) for (const demand of SLOPES) for (const supply of SLOPES) for (const size of SIZES) variants.push({ type: def.type, externality, demand, supply, size });
  }

  it.each(variants.map((v) => [`${v.type} ${v.externality} D:${v.demand} S:${v.supply} ${v.size}`, v]))('%s', (_, v) => {
    const def = SCENES.find((s) => s.type === v.type)!;
    const areas = def.regions.map((r, i) => ({ region: r.id, label: L('ABCDEFGH'[i]) }));
    const built = compileScene(spec({ ...v, areas }));
    expect(built.issues.filter((i) => i.level === 'error')).toEqual([]);
    const diagram = built.diagram!;
    // Ticks stand apart and stay on the plot.
    for (const axis of ['x', 'y'] as const) {
      const at = diagram.points
        .filter((p) => plainOf(axis === 'x' ? p.xTickLabel : p.yTickLabel).trim() && p.dropTo?.includes(axis))
        .map((p) => p.at[axis]);
      for (const c of diagram.curves) if (axis === 'y' && c.derive?.kind === 'level' && plainOf(c.label).trim()) at.push(c.points[0].y);
      const sorted = [...new Set(at.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
      for (const n of sorted) expect(n).toBeGreaterThan(0.02);
      for (const n of sorted) expect(n).toBeLessThan(0.96);
      for (let i = 1; i < sorted.length; i += 1) expect(sorted[i] - sorted[i - 1], `${axis} ticks ${sorted.join(', ')}`).toBeGreaterThanOrEqual(0.045);
    }
    // The regions are a partition: no point of the plot lies in two of them.
    const polys = [...built.regionAreas.values()].map((a) => areaPolygon(diagram, a)!);
    for (const poly of polys) expect(poly).toBeTruthy();
    // Off-grid samples, so a point on a shared edge is not counted twice.
    for (let gx = 0.0137; gx < 1; gx += 0.0203) {
      for (let gy = 0.0091; gy < 1; gy += 0.0197) {
        const hits = polys.filter((poly) => pointInPolygon({ x: gx, y: gy }, poly)).length;
        expect(hits, `(${gx.toFixed(2)}, ${gy.toFixed(2)})`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('every sample compiles clean', () => {
    for (const sample of SCENE_SAMPLES) {
      const out = evaluateSpec(sample.spec, { sides: ['en', 'zh'], key: '' });
      expect(out.issues.filter((i) => i.level === 'error'), sample.id).toEqual([]);
      expect(out.compiled.diagram, sample.id).toBeTruthy();
    }
  });
});

describe('the economics is in the geometry', () => {
  const at = (s: Partial<SpecScene>) => compileScene(spec(s));
  const y = (built: ReturnType<typeof compileScene>, label: string) => built.diagram!.points.find((p) => plainOf(p.yTickLabel) === label)!.at.y;
  const x = (built: ReturnType<typeof compileScene>, label: string) => built.diagram!.points.find((p) => plainOf(p.xTickLabel) === label)!.at.x;

  it('a tax: buyers pay more, sellers keep less, less is traded; inelastic demand puts more on buyers', () => {
    for (const demand of SLOPES) {
      const b = at({ type: 'unitTax', demand });
      expect(y(b, 'P1')).toBeGreaterThan(y(b, 'P0'));
      expect(y(b, 'P0')).toBeGreaterThan(y(b, 'P2'));
      expect(x(b, 'Q1')).toBeLessThan(x(b, 'Q0'));
    }
    const steep = at({ type: 'unitTax', demand: 'steep' });
    expect(y(steep, 'P1') - y(steep, 'P0')).toBeGreaterThan(y(steep, 'P0') - y(steep, 'P2'));
    const flat = at({ type: 'unitTax', demand: 'flat' });
    expect(y(flat, 'P1') - y(flat, 'P0')).toBeLessThan(y(flat, 'P0') - y(flat, 'P2'));
  });

  it('a subsidy: buyers pay less, sellers get more, more is traded', () => {
    const b = at({ type: 'unitSubsidy' });
    expect(y(b, 'P1')).toBeLessThan(y(b, 'P0'));
    expect(y(b, 'P2')).toBeGreaterThan(y(b, 'P0'));
    expect(x(b, 'Q1')).toBeGreaterThan(x(b, 'Q0'));
  });

  it('a ceiling binds below equilibrium (shortage), a floor above (surplus); a quota cuts output and raises the price', () => {
    const c = at({ type: 'priceCeiling' });
    expect(x(c, 'Qs')).toBeLessThan(x(c, 'Q0'));
    expect(x(c, 'Q0')).toBeLessThan(x(c, 'Qd'));
    const f = at({ type: 'priceFloor' });
    expect(x(f, 'Qd')).toBeLessThan(x(f, 'Q0'));
    expect(x(f, 'Q0')).toBeLessThan(x(f, 'Qs'));
    const q = at({ type: 'quota' });
    expect(x(q, 'Q1')).toBeLessThan(x(q, 'Q0'));
    expect(y(q, 'P1')).toBeGreaterThan(y(q, 'P0'));
  });

  it('externalities: a negative one over-produces, a positive one under-produces', () => {
    for (const externality of EXTERNALITIES.filter((e) => e !== 'none')) {
      const b = at({ type: 'externality', externality });
      const negative = externality.startsWith('negative');
      expect(x(b, 'Q*') < x(b, 'Qm'), externality).toBe(negative);
    }
  });
});

describe('the answer is worked out from the letters', () => {
  const stem = 'The government imposes a per-unit tax on good X. The supply curve shifts from S_0 to S_1. Which of the following areas represents the deadweight loss of the tax?';
  const mcq = (answer: number, options = ['B + C', 'E + F', 'B + E', 'C + F']) => ({ stem, statements: [], options, answer });
  const run = (s: Partial<SpecScene>, answer = 1, options?: string[]) => evaluateSpec(spec({ type: 'unitTax', ask: 'dwl', areas: TAX_LETTERS, ...s }), { sides: ['en', 'zh'], key: 'E + F', mcq: mcq(answer, options) });

  it('a right lettering passes and names the keyed option', () => {
    const out = run({});
    expect(out.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(out.solved).toMatchObject({ labels: ['E', 'F'], option: 1 });
  });

  it('a key that is not the asked area fails, saying what the letters give', () => {
    const out = run({}, 0);
    const issue = out.issues.find((i) => i.code === 'scene.key');
    expect(issue?.text).toMatch(/E \+ F/);
  });

  it('an asked region without a letter, a letter that spans more than the area, and two options alike all fail', () => {
    expect(run({ areas: TAX_LETTERS.filter((a) => a.region !== 'dwlSellers') }).issues.some((i) => i.code === 'scene.unlettered')).toBe(true);
    const merged = [...TAX_LETTERS.slice(0, 4), { region: 'tssLoss', label: L('E') }];
    expect(run({ areas: merged }, 1, ['B + C', 'E', 'B + E', 'C + D']).issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(run({ areas: [...TAX_LETTERS.slice(0, 3), { region: 'csLoss', label: L('E') }] }, 1, ['B + C', 'E', 'B + E', 'C + D']).issues.some((i) => i.code === 'scene.overlap')).toBe(true);
    const spanning = [TAX_LETTERS[0], TAX_LETTERS[2], TAX_LETTERS[3], { region: 'csLoss', label: L('E') }, { region: 'dwlSellers', label: L('F') }];
    expect(run({ areas: spanning }).issues.some((i) => i.code === 'scene.mixed')).toBe(true);
    expect(run({}, 1, ['B + C', 'E + F', 'F + E', 'C + F']).issues.some((i) => i.code === 'scene.twoKeys')).toBe(true);
  });

  it('a tick question reads the labels of its parts', () => {
    const shortage = evaluateSpec(spec({ type: 'priceCeiling', ask: 'shortage', labels: [{ part: 'Pc', label: 'P_1' }, { part: 'Qs', label: 'Q_1' }, { part: 'Q0', label: 'Q_2' }, { part: 'Qd', label: 'Q_3' }, { part: 'P0', label: '' }] }), {
      sides: ['en'],
      key: '',
      mcq: { stem: 'The government sets a maximum price of P_1 for good X. What is the shortage?', statements: [], options: ['Q_1Q_2', 'Q_1Q_3', 'Q_2Q_3', 'Q_3Q_4'], answer: 1 },
    });
    expect(shortage.issues.filter((i) => i.level === 'error').map((i) => i.code)).toEqual(['label.missing']);
    expect(shortage.solved).toMatchObject({ labels: ['Q_1', 'Q_3'], option: 1 });
  });

  it('option letters read in their usual forms', () => {
    expect(optionLetters('B + C')).toEqual(['B', 'C']);
    expect(optionLetters('Area a')).toEqual(['a']);
    expect(optionLetters('areas E and F')).toEqual(['E', 'F']);
    expect(optionLetters('面積 B + E')).toEqual(['B', 'E']);
    expect(optionLetters('Area A > area B, so total revenue rises')).toBeNull();
  });
});

describe("the question's words decide the scene", () => {
  const words = (s: Partial<SpecScene>, stem: string, key = '') => evaluateSpec(spec(s), { sides: ['en'], key, question: stem }).issues.filter((i) => i.level === 'error').map((i) => i.code);

  it('a policy in the stem needs its scene', () => {
    expect(words({ type: 'priceFloor' }, 'The government sets a price ceiling on rice.')).toContain('scene.policy');
    expect(words({ type: 'priceCeiling' }, 'The government sets a price ceiling on rice.')).toEqual([]);
    expect(words({ type: 'externality', externality: 'positiveProduction' }, 'Factories create external costs.')).toContain('scene.policy');
  });

  it('elasticity words set the slope; "perfectly inelastic" is not read', () => {
    expect(words({ type: 'unitTax' }, 'The demand for cigarettes is price inelastic. A unit tax is imposed.')).toContain('scene.elasticity');
    expect(words({ type: 'unitTax', demand: 'steep' }, 'The demand for cigarettes is price inelastic. A unit tax is imposed.')).toEqual([]);
    expect(words({ type: 'unitTax', demand: 'flat' }, 'A unit tax on a good with elastic demand.')).toEqual([]);
    expect(words({ type: 'surplus' }, 'Supply is perfectly inelastic.')).toEqual([]);
  });
});

describe('labels', () => {
  it('an area labelled "E + F" is one area, not E and F', () => {
    const out = evaluateSpec(spec({ type: 'unitTax', areas: [{ region: 'tssLoss', label: L('E + F') }] }), { sides: ['en'], key: '' });
    const printed = diagramLabels(out.compiled.diagram!);
    expect(printed.has('E')).toBe(false);
    expect(checkLabels({ stem: 'Which area is the DWL?', statements: [], options: ['B + C', 'E + F', 'B + E', 'C + F'] }, out.compiled.diagram!)[0]?.code).toBe('label.missing');
  });

  it('letters-only options name their letters, even single ones', () => {
    const out = evaluateSpec(spec({ type: 'surplus', areas: [{ region: 'cs', label: L('A') }, { region: 'ps', label: L('B') }] }), { sides: ['en'], key: '' });
    const issues = checkLabels({ stem: 'Which area is the producer surplus?', statements: [], options: ['A', 'B', 'A + B', 'C'] }, out.compiled.diagram!);
    expect(issues[0]?.text).toMatch(/names C/);
  });
});

describe('words for the blind solve never name the asked area', () => {
  it('describes the lines, the ticks in order and each lettered outline', () => {
    const s = spec({ type: 'unitTax', ask: 'dwl', areas: TAX_LETTERS });
    const out = evaluateSpec(s, { sides: ['en'], key: '' });
    const words = figureWords(s, out.compiled.diagram!);
    expect(words).toMatch(/S1: S0 shifted upward/);
    expect(words).toMatch(/Price ticks from the bottom up: P2 .*, P0 .*, P1/);
    expect(words).toMatch(/Area E: the triangle under D and above the P0 line, from Q1 to Q0/);
    expect(words).not.toMatch(/deadweight|tax revenue|surplus|burden/i);
    expect(sceneWords(s, compileScene(s), out.compiled.diagram!)).toBe(words);
  });
});

describe('the reply and the prompt', () => {
  it('a reply with a scene reads; a spec without one (saved before k-0577) reads as none', () => {
    const reply = JSON.stringify({ ...emptySpec('scene'), scene: { ...emptyScene(), type: 'quota', demand: 'steep', ask: 'dwl', labels: [{ part: 'Qq', label: 'Q_1' }], areas: [{ region: 'dwl', label: { en: '', zh: '' } }] } });
    const parsed = parseSpec(reply)!;
    expect(parsed.spec.scene).toMatchObject({ type: 'quota', demand: 'steep', ask: 'dwl' });
    const old = { ...emptySpec('curves') } as Partial<DiagramSpec>;
    delete old.scene;
    expect(parseSpec(JSON.stringify(old))!.spec.scene?.type).toBe('none');
    expect(evaluateReply(reply, { sides: ['en', 'zh'], key: '' })!.compiled.diagram).toBeTruthy();
  });

  it('the prompt lists every scene, part and region, and stays one fixed text', () => {
    const text = systemPrompt();
    for (const def of SCENES) {
      expect(text).toContain(`- ${def.type}:`);
      for (const p of def.parts) expect(text).toContain(p.id);
      for (const r of def.regions) expect(text).toContain(`${r.id} (`);
    }
    expect(systemPrompt()).toBe(text);
  });

  it('a model-answer area prints its EDB words in both languages', () => {
    const out = evaluateSpec(spec({ type: 'unitTax', areas: [{ region: 'dwl', label: { en: '', zh: '' } }, { region: 'taxRevenue', label: { en: '', zh: '' } }] }, 'answer'), { sides: ['en', 'zh'], key: '' });
    const labels = (out.compiled.diagram!.areas ?? []).filter((a) => a.label).map((a) => `${plainOf(a.label)}|${plainOf(a.label, 'zh')}`);
    expect(labels.sort()).toEqual(['Deadweight loss|效率損失', 'Tax revenue|政府稅收']);
  });
});
