import { describe, expect, it } from 'vitest';
import { GRAPH_CASES } from '../../evals/graphs/cases';
import { inputOf } from '../../evals/graphs.eval';
import { tickKey } from './compile';
import { diagramLabels } from './labels';
import MM_LATTICE_2_LIVE from './mmLattice2.live.json';
import { evaluateReply, evaluateSpec } from './run';
import { plainOf } from './text';
import { emptyScene, emptySpec } from './schema';
import { readClaim, optionStatements } from './stageCheck';
import type { DiagramSpec, SpecScene } from './types';

/**
 * Two-state control scenes on the HKDSE questions the audit cites (k-0587): the figure, its
 * words and the key worked out from the drawing. Stems and keys are the papers' (the bank's);
 * the specs are what the model is asked to send.
 */

const spec = (scene: Partial<SpecScene>): DiagramSpec => ({ ...emptySpec('scene'), placement: 'question', scene: { ...emptyScene(), ...scene } });
const lab = (pairs: Array<[string, string]>) => pairs.map(([part, label]) => ({ part, label }));
const pts = (pairs: Array<[string, string]>) => pairs.map(([point, label]) => ({ point, label }));
type Mcq = { stem: string; statements: string[]; options: string[]; answer: number };
const run = (s: DiagramSpec, mcq: Mcq, key = '') => evaluateSpec(s, { sides: ['en', 'zh'], key, mcq });
const errors = (e: ReturnType<typeof run>) => e.issues.filter((i) => i.level === 'error');

const Q2021: Mcq = {
  stem: 'Refer to the following demand-supply diagram of Good Y. If the government lowers the price ceiling of Good Y from P1 to P2,',
  statements: [],
  options: ['the producer surplus will decrease.', 'the consumer surplus will increase.', 'the total social surplus will remain unchanged.', 'the excess supply of Good Y will be eliminated.'],
  answer: 0,
};
const LOWERED = spec({ type: 'priceCeiling', stage: 'lowered', binds: 'after', labels: lab([['Pc1', 'P_1'], ['Pc2', 'P_2']]) });

describe('HKDSE 2021 P1 Q17 / 2015 P1 Q19: a ceiling lowered from above to below equilibrium', () => {
  it('draws clean and the key (producer surplus decreases) is worked out from the two states', () => {
    const e = run(LOWERED, Q2021);
    expect(errors(e)).toEqual([]);
    expect(e.solved?.option).toBe(0);
  });

  it('a key that depends on the slopes (consumer surplus increases) is refused', () => {
    const e = run(LOWERED, { ...Q2021, answer: 1 });
    expect(errors(e).map((i) => i.code)).toContain('scene.statement');
    expect(errors(e)[0].text).toMatch(/depends on the slopes/);
  });

  it('2015 Q19: the quantity falls, so A and B are false and C is the key', () => {
    const q: Mcq = {
      stem: 'Refer to the following diagram. If the government lowers the price ceiling from Pa to Pb,',
      statements: [],
      options: ['the quantity transacted will increase.', 'the deadweight loss will decrease.', 'the producer surplus will decrease.', 'the consumer surplus will increase.'],
      answer: 2,
    };
    const e = run(spec({ type: 'priceCeiling', stage: 'lowered', binds: 'after', labels: lab([['Pc1', 'P_a'], ['Pc2', 'P_b']]) }), q);
    expect(errors(e)).toEqual([]);
    expect(e.solved?.option).toBe(2);
    expect(errors(run(spec({ type: 'priceCeiling', stage: 'lowered', binds: 'after', labels: lab([['Pc1', 'P_a'], ['Pc2', 'P_b']]) }), { ...q, answer: 0 })).map((i) => i.code)).toContain('scene.statement');
  });

  it('the stem\'s words: a one-state ceiling, the wrong stage or swapped labels are refused', () => {
    expect(errors(run(spec({ type: 'priceCeiling', labels: lab([['Pc', 'P_2']]) }), Q2021)).map((i) => i.code)).toContain('scene.stage');
    expect(errors(run(spec({ type: 'priceCeiling', stage: 'raised', binds: 'before', labels: lab([['Pc1', 'P_1'], ['Pc2', 'P_2']]) }), Q2021)).map((i) => i.code)).toContain('scene.stage');
    expect(errors(run(spec({ type: 'priceCeiling', stage: 'lowered', binds: 'after', labels: lab([['Pc1', 'P_2'], ['Pc2', 'P_1']]) }), Q2021)).map((i) => i.code)).toContain('scene.order');
  });

  it('P1 is drawn above the equilibrium and P2 below it', () => {
    const d = run(LOWERED, Q2021).compiled.diagram!;
    const levels = d.curves.filter((c) => c.derive?.kind === 'level').map((c) => c.points[0].y);
    const e0 = d.points.find((p) => 'cross' in (p.anchor ?? {}))!.at.y;
    expect(levels[0]).toBeGreaterThan(e0);
    expect(levels[1]).toBeLessThan(e0);
  });
});

describe('HKDSE 2020 P1 Q20 and 2023 P1 Q17: a floor changed', () => {
  it('2020: floor from below to above equilibrium, the deadweight loss increases', () => {
    const q: Mcq = {
      stem: 'Refer to the following supply-demand diagram for Good X. If the price floor of Good X changes from P1 to P2,',
      statements: [],
      options: ['producer surplus will increase.', 'quantity transacted of Good X will remain at Q1.', 'deadweight loss will increase.', 'excess demand of Good X will change to excess supply.'],
      answer: 2,
    };
    const s = spec({ type: 'priceFloor', stage: 'raised', binds: 'after', labels: lab([['Pc1', 'P_1'], ['Pc2', 'P_2'], ['Qs1', 'Q_1']]) });
    const e = run(s, q);
    expect(errors(e)).toEqual([]);
    expect(e.solved?.option).toBe(2);
    // The model chose a floor that binds both times: then "excess demand changes to excess supply" is still false, but the stage is checked against the key.
    expect(errors(run({ ...s, scene: { ...s.scene!, binds: 'neither', stage: 'raised' } }, q)).map((i) => i.code)).toContain('scene.statement');
  });

  it('2023: both floors below equilibrium, only "(4) nothing changes" holds', () => {
    const q: Mcq = {
      stem: 'The following diagram shows the supply and demand curves of a good. Suppose the government changes the price floor from P1 to P2. Which of the following statements is/are correct?',
      statements: ['The quantity transacted will decrease.', 'The deadweight loss will increase.', 'The producer surplus will increase.', 'The total social surplus will remain unchanged.'],
      options: ['(4) only', '(1) and (4) only', '(2) and (3) only', '(1), (2) and (3) only'],
      answer: 0,
    };
    const s = spec({ type: 'priceFloor', stage: 'lowered', binds: 'neither', labels: lab([['Pc1', 'P_1'], ['Pc2', 'P_2']]) });
    const e = run(s, q);
    expect(errors(e)).toEqual([]);
    expect(e.solved?.option).toBe(0);
    expect(errors(run(s, { ...q, answer: 1 })).map((i) => i.code)).toContain('scene.statement');
  });
});

describe('HKDSE 2026 P1 Q16: a ceiling between the two equilibria, supply rises', () => {
  const q: Mcq = {
    stem: 'Refer to the following supply-demand diagram of good Z. Suppose Country A sets a price ceiling on good Z at P1. If the supply curve shifts from S1 to S2, the new quantity transacted will be at ____.',
    statements: [],
    options: ['Q1', 'Q2', 'Q3', 'Q4'],
    answer: 2,
  };
  const s = spec({
    type: 'priceCeiling',
    stage: 'supplyRise',
    binds: 'before',
    ask: 'quantityAfter',
    labels: lab([['D', 'D_1'], ['S', 'S_1'], ['S2', 'S_2'], ['Pc1', 'P_1'], ['Q0', 'Q_1'], ['Qd1', 'Q_2'], ['Qn', 'Q_3'], ['Qs2', 'Q_4']]),
  });
  it('the key Q3 is read off the drawing, with Q1–Q4 in order', () => {
    const e = run(s, q);
    expect(errors(e)).toEqual([]);
    expect(e.solved?.option).toBe(2);
    const xs = ['Q_1', 'Q_2', 'Q_3', 'Q_4'].map((t) => e.compiled.diagram!.points.find((p) => p.xTickLabel && tickKey(plainOf(p.xTickLabel)) === tickKey(t))!.at.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
  it('a wrong key is caught; "from S1 to S2" needs S1 on the old supply', () => {
    expect(errors(run(s, { ...q, answer: 3 })).map((i) => i.code)).toContain('scene.key');
    const swapped = { ...s, scene: { ...s.scene!, labels: s.scene!.labels.map((l) => (l.part === 'S' ? { ...l, label: 'S_2' } : l.part === 'S2' ? { ...l, label: 'S_1' } : l)) } };
    expect(errors(run(swapped, q)).map((i) => i.code)).toContain('scene.order');
  });
});

describe('HKDSE 2023 P1 Q21 through the generic stage (was ceilingDemandRise)', () => {
  it('area abc is the deadweight loss', () => {
    const q: Mcq = {
      stem: 'The diagram below shows the market for Good X.\nThe government sets a price ceiling at P_1. Demand for Good X then increases from D_1 to D_2. Which of the following is correct?',
      statements: [],
      options: ['There is over-production, and the deadweight loss is area abc.', 'There is over-production, and the deadweight loss is area acf.', 'There is under-production, and the deadweight loss is area abc.', 'There is under-production, and the deadweight loss is area acf.'],
      answer: 2,
    };
    const s = spec({ type: 'priceCeiling', stage: 'demandRise', binds: 'after', ask: 'dwl', labels: lab([['D', 'D_1'], ['D2', 'D_2'], ['Pc1', 'P_1']]), points: pts([['e0', 'a'], ['d2AtQ0', 'b'], ['en', 'c'], ['d2AtPc1', 'f']]) });
    const e = run(s, q, 'Sellers supply only the quantity at a; the units between a and c are not produced: the deadweight loss is area abc.');
    expect(errors(e)).toEqual([]);
    expect(e.solved?.labels).toEqual(['abc']);
    // f on the wrong point: the corner check catches it.
    const wrong = { ...s, scene: { ...s.scene!, points: pts([['e0', 'a'], ['d2AtQ0', 'b'], ['d2AtPc1', 'c'], ['en', 'f']]) } };
    expect(errors(run(wrong, q, 'the deadweight loss is area abc.')).length).toBeGreaterThan(0);
  });
});

describe('HKDSE 2015 P2 Q3 and 2024 P2 Q3: quotas', () => {
  it('quota enlarged: the deadweight loss falls by area WXYZ', () => {
    const q: Mcq = {
      stem: 'The government sets a quota at Q1 and then enlarges it to Q2. Which of the following is correct?',
      statements: [],
      options: ['The deadweight loss decreases by area WXYZ.', 'The deadweight loss increases by area WXYZ.', 'The deadweight loss falls to zero.', 'The deadweight loss is unchanged.'],
      answer: 0,
    };
    const s = spec({ type: 'quota', stage: 'raised', binds: 'both', ask: 'dwlChange', labels: lab([['Qq1', 'Q_1'], ['Qq2', 'Q_2']]), points: pts([['dAtQq1', 'W'], ['dAtQq2', 'X'], ['sAtQq2', 'Y'], ['sAtQq1', 'Z']]) });
    const e = run(s, q, 'With the quota at Q2 the loss no longer includes area WXYZ.');
    expect(errors(e)).toEqual([]);
    expect(e.solved?.labels).toEqual(['WXYZ']);
  });

  it('demand rises under a quota: the loss grows by the band between D0 and D1', () => {
    const e = evaluateSpec(spec({ type: 'quota', stage: 'demandRise', binds: 'both', areas: [{ region: 'dwlChange', label: { en: '', zh: '' } }], labels: lab([['D', 'D_0'], ['D2', 'D_1']]) }), { sides: ['en', 'zh'], key: '' });
    expect(errors(e)).toEqual([]);
    const area = e.compiled.diagram!.areas![0];
    expect(area.label?.en.map((r) => r.text).join('')).toBe('Increase in deadweight loss');
  });
});

describe('reading claims', () => {
  it('reads one plain claim, and leaves negations and pairs alone', () => {
    expect(readClaim('the producer surplus will decrease.')).toEqual({ m: 'ps', c: 'down' });
    expect(readClaim('the total social surplus will remain unchanged.')).toEqual({ m: 'tss', c: 'same' });
    expect(readClaim('the excess supply of Good Y will be eliminated.')).toEqual({ m: 'surplus', c: 'gone' });
    expect(readClaim('excess demand of Good X will change to excess supply.')).toEqual({ m: 'shortage', c: 'shortageToSurplus' });
    expect(readClaim('生產者盈餘將會減少。')).toEqual({ m: 'ps', c: 'down' });
    expect(readClaim('the producer surplus will not decrease.')).toBeNull();
    expect(readClaim('consumer surplus and producer surplus will both increase.')).toBeNull();
    expect(readClaim('quantity transacted of Good X will remain at Q1.')).toEqual({ m: 'quantity', c: 'same', at: 'Q1' });
    expect(optionStatements('(1) and (4) only')).toEqual([1, 4]);
    expect(optionStatements('(1), (2) and (3)')).toEqual([1, 2, 3]);
    expect(optionStatements('Q1')).toBeNull();
  });
});

describe('the frozen B eval cases are drawable (k-0587): the spec a right reply sends passes every check', () => {
  const S = (scene: Partial<SpecScene>) => spec(scene);
  const RIGHT: Record<string, DiagramSpec> = {
    'b-ceiling-lowered': S({ type: 'priceCeiling', stage: 'lowered', binds: 'after', labels: lab([['Pc1', 'P_1'], ['Pc2', 'P_2']]) }),
    'b-floor-changed': S({ type: 'priceFloor', stage: 'raised', binds: 'after', labels: lab([['Pc1', 'P_1'], ['Pc2', 'P_2'], ['Qs1', 'Q_1']]) }),
    'b-floor-both-below': S({ type: 'priceFloor', stage: 'lowered', binds: 'neither', labels: lab([['Pc1', 'P_1'], ['Pc2', 'P_2']]) }),
    'b-ceiling-supply-rise': S({ type: 'priceCeiling', stage: 'supplyRise', binds: 'before', ask: 'quantityAfter', labels: lab([['D', 'D_1'], ['S', 'S_1'], ['S2', 'S_2'], ['Pc1', 'P_1'], ['Q0', 'Q_1'], ['Qd1', 'Q_2'], ['Qn', 'Q_3'], ['Qs2', 'Q_4']]) }),
    'b-quota-enlarged': S({ type: 'quota', stage: 'raised', binds: 'both', ask: 'dwlChange', labels: lab([['Qq1', 'Q_1'], ['Qq2', 'Q_2']]), points: pts([['dAtQq1', 'W'], ['dAtQq2', 'X'], ['sAtQq2', 'Y'], ['sAtQq1', 'Z']]) }),
    'b-quota-demand-rise': S({ type: 'quota', stage: 'demandRise', binds: 'both', ask: 'dwlAfter', labels: lab([['D', 'D_0'], ['D2', 'D_1']]), areas: [{ region: 'dwlKept', label: { en: 'A', zh: 'A' } }, { region: 'dwlAdded', label: { en: 'B', zh: 'B' } }] }),
    'b-ceiling-lowered-dwl': S({ type: 'priceCeiling', stage: 'lowered', binds: 'both', ask: 'dwlChange', labels: lab([['Pc1', 'P_1'], ['Pc2', 'P_2']]), areas: [{ region: 'dwlKept', label: { en: 'A', zh: 'A' } }, { region: 'dwlAdded', label: { en: 'B', zh: 'B' } }] }),
    'b-min-wage-supply-fall': S({ type: 'priceFloor', market: 'labour', stage: 'supplyFall', binds: 'before', labels: lab([['S', 'S_1'], ['S2', 'S_2'], ['Pc1', 'W_m']]) }),
  };
  for (const c of GRAPH_CASES.filter((g) => g.id.startsWith('b-'))) {
    it(c.id, () => {
      const input = inputOf(c);
      const e = evaluateSpec(RIGHT[c.id], { sides: ['en', 'zh'], key: input.key, mcq: input.mcq });
      expect(errors(e)).toEqual([]);
      for (const l of c.labels) expect([...diagramLabels(e.compiled.diagram!)].map(tickKey), l).toContain(tickKey(l));
    });
  }
});

describe('what the first live run taught (k-0587)', () => {
  it('a reply listing every generic part with "" labels draws (e-ceiling-demand-rise needed a repair for it)', () => {
    const e = evaluateSpec(spec({ type: 'priceCeiling', stage: 'demandRise', binds: 'after', labels: lab([['D', 'D_1'], ['D2', 'D_2'], ['Pc1', 'P_1'], ['Qd1', ''], ['Qs1', ''], ['Qs2', ''], ['P0', '']]) }), { sides: ['en', 'zh'], key: '' });
    expect(errors(e)).toEqual([]);
  });
  it('a label on a part that sits on another moves there; two different labels on one point are refused', () => {
    const e = evaluateSpec(spec({ type: 'priceCeiling', stage: 'demandRise', binds: 'after', labels: lab([['Qs1', 'Q_1']]) }), { sides: ['en', 'zh'], key: '' });
    expect(errors(e)).toEqual([]);
    expect([...diagramLabels(e.compiled.diagram!)].map(tickKey)).toContain(tickKey('Q_1'));
    const bad = evaluateSpec(spec({ type: 'priceCeiling', stage: 'demandRise', binds: 'after', labels: lab([['Qs1', 'Q_1'], ['Q0', 'Q_2']]) }), { sides: ['en', 'zh'], key: '' });
    expect(errors(bad).map((i) => i.code)).toContain('scene.part');
  });
  it('mm-lattice-2: upright lines named M_s1, M_s0, M_s2 left to right are names, not ticks out of order', () => {
    const c = GRAPH_CASES.find((g) => g.id === 'mm-lattice-2')!;
    const reply = JSON.stringify(MM_LATTICE_2_LIVE);
    const input = inputOf(c);
    const e = evaluateReply(reply, input)!;
    expect(errors(e as ReturnType<typeof run>)).toEqual([]);
  });
});
