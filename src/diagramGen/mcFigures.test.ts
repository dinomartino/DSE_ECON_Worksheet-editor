import { describe, expect, it } from 'vitest';
import { compileSpec } from './compile';
import { labelsIn } from './labels';
import { MC_CASES, mcCaseById, type McCase } from './mcFixtures';
import { evaluateReply, evaluateSpec } from './run';
import { parseSpec } from './schema';
import type { DiagramSpec } from './types';

/**
 * k-0534: an MCQ's figure must label everything its options name, number its ticks in
 * order, agree with the stem, and give the keyed answer when the key is worked out again
 * from the drawing. The cases are the user's (HKDSE Q16, the draft that showed Q₂ and Q₄
 * only) and the patterns the task names.
 */

const inputOf = (c: McCase, answer = c.answer) => ({
  sides: c.sides,
  key: `Correct answer: ${'ABCD'[answer]}. ${c.options[answer]}`,
  mcq: { stem: c.stem, statements: [], options: c.options, answer },
});
const clone = (s: DiagramSpec): DiagramSpec => JSON.parse(JSON.stringify(s)) as DiagramSpec;
const errorsOf = (c: McCase, spec = c.spec, answer = c.answer) => evaluateSpec(spec, inputOf(c, answer)).issues.filter((i) => i.level === 'error');

describe('every MC case compiles clean, labels what its options name and solves to its key', () => {
  for (const c of MC_CASES) {
    it(c.id, () => {
      const out = evaluateSpec(c.spec, inputOf(c));
      expect(out.compiled.diagram).not.toBeNull();
      expect(out.issues.filter((i) => i.level === 'error')).toEqual([]);
      if (c.spec.asks.what !== 'none') expect(out.solved?.option).toBe(c.answer);
    });
  }
});

describe('the label check (the draft showed Q2 and Q4 for options Q1–Q4)', () => {
  it('reads the labels a question names, in both languages, and not plain words', () => {
    expect(labelsIn('If the supply curve shifts from S_1 to S₂, the quantity at P1 is')).toEqual(['S1', 'S2', 'P1']);
    expect(labelsIn('面積 A + B 代表')).toEqual(['A', 'B']);
    expect(labelsIn('B + C + D')).toEqual(['B', 'C', 'D']);
    expect(labelsIn('Point A')).toEqual(['A']);
    expect(labelsIn('Pc and Qd')).toEqual(['PC', 'QD']);
    expect(labelsIn('Do the price and quantity rise? So we see')).toEqual([]);
  });

  it('options naming ticks the figure lacks fail, naming them', () => {
    const c = mcCaseById('hkdse-q16');
    const spec = clone(c.spec);
    spec.points = spec.points.filter((p) => p.xTick === 'Q_2' || p.xTick === 'Q_3');
    const issues = errorsOf(c, spec);
    expect(issues.find((i) => i.code === 'label.missing')?.text).toMatch(/Q1, Q4/);
  });

  it('ticks numbered out of order along the axis fail', () => {
    const c = mcCaseById('hkdse-q16');
    const spec = clone(c.spec);
    spec.points[0].xTick = 'Q_3';
    spec.points[2].xTick = 'Q_1';
    expect(errorsOf(c, spec).map((i) => i.code)).toContain('label.order');
  });
});

describe('the key worked out again from the drawing', () => {
  it('HKDSE Q16: after S rises the ceiling no longer binds; the answer is D1×S2, Q3 (C)', () => {
    const c = mcCaseById('hkdse-q16');
    const out = evaluateSpec(c.spec, inputOf(c));
    expect(out.solved).toMatchObject({ labels: ['Q3'], option: 2 });
    expect(out.solved!.why).toMatch(/does not bind/);
  });

  it('a key the drawing contradicts fails, saying what the drawing gives', () => {
    const c = mcCaseById('hkdse-q16');
    const issue = errorsOf(c, c.spec, 1).find((i) => i.code === 'key.geometry');
    expect(issue?.text).toMatch(/Q3, option C. The key is B/);
  });

  it('before the shift the same ceiling binds: quantity transacted = quantity supplied at P1 (Q1)', () => {
    const c = mcCaseById('hkdse-q16');
    const spec = clone(c.spec);
    spec.asks = { what: 'quantityTransacted', state: 'before' };
    expect(evaluateSpec(spec, inputOf(c, 0)).solved).toMatchObject({ labels: ['Q1'], option: 0 });
    spec.asks = { what: 'shortage', state: 'before' };
    expect(evaluateSpec(spec, { ...inputOf(c), mcq: { ...inputOf(c).mcq, options: ['Q1Q2', 'Q2Q3', 'Q1Q4', 'Q3Q4'], answer: 0 } }).solved).toMatchObject({ labels: ['Q1', 'Q2'], option: 0 });
  });

  it('floor: after S falls the floor no longer binds (Q2); before, it binds at Qd (Q3 is not drawn there, so D1 at P1)', () => {
    const c = mcCaseById('floor-shift');
    expect(evaluateSpec(c.spec, inputOf(c)).solved).toMatchObject({ labels: ['Q2'], option: 1 });
    const spec = clone(c.spec);
    spec.asks = { what: 'quantityTransacted', state: 'before' };
    expect(evaluateSpec(spec, inputOf(c, 2)).solved).toMatchObject({ labels: ['Q3'], option: 2 });
  });

  it('tax: sellers get the price on S0 at the new quantity; subsidy: buyers pay the new price', () => {
    expect(evaluateSpec(mcCaseById('unit-tax').spec, inputOf(mcCaseById('unit-tax'))).solved?.labels).toEqual(['P1']);
    expect(evaluateSpec(mcCaseById('subsidy-zh').spec, inputOf(mcCaseById('subsidy-zh'))).solved?.labels).toEqual(['P1']);
    const spec = clone(mcCaseById('unit-tax').spec);
    spec.asks = { what: 'buyersPay', state: 'after' };
    expect(evaluateSpec(spec, inputOf(mcCaseById('unit-tax'), 2)).solved?.labels).toEqual(['P3']);
  });

  it('quota: the price is read off demand at the quota; the quantity is the quota itself', () => {
    const c = mcCaseById('quota');
    expect(evaluateSpec(c.spec, inputOf(c)).solved?.labels).toEqual(['P2']);
    const spec = clone(c.spec);
    spec.asks = { what: 'quantityTransacted', state: 'after' };
    expect(evaluateSpec(spec, inputOf(c, 2)).solved).toMatchObject({ labels: ['Q1'], option: 2 });
  });

  it('an answer with no tick at it fails as unlabelled', () => {
    const c = mcCaseById('hkdse-q16');
    const spec = clone(c.spec);
    spec.points = spec.points.filter((p) => p.xTick !== 'Q_3');
    expect(errorsOf(c, spec).map((i) => i.code)).toContain('key.unlabelled');
  });

  it('options in words are left to the blind solve', () => {
    const c = mcCaseById('hkdse-q16');
    const out = evaluateSpec(c.spec, { ...inputOf(c), mcq: { stem: c.stem, statements: [], options: ['rises', 'falls', 'stays', 'cannot tell'], answer: 0 } });
    expect(out.issues.filter((i) => i.code.startsWith('key.'))).toEqual([]);
  });
});

describe('the stem against the drawing', () => {
  it('a ceiling in the words but a floor on the figure fails', () => {
    const c = mcCaseById('hkdse-q16');
    const spec = clone(c.spec);
    spec.levels[0].kind = 'floor';
    expect(errorsOf(c, spec).map((i) => i.code)).toContain('stem.control');
  });

  it('"from S1 to S2" must be a shift drawn that way; a stated move must go the stated way', () => {
    const c = mcCaseById('hkdse-q16');
    const spec = clone(c.spec);
    spec.curves.push({ id: 'S2', role: 'supply', slope: 'normal', place: 'mid', label: 'S_2' });
    spec.shifts = [];
    const issues = errorsOf(c, spec).map((i) => i.code);
    expect(issues).toContain('stem.shift');
    const left = clone(c.spec);
    left.shifts[0].direction = 'left';
    const stem = { ...c, stem: `${c.stem} Supply increases.` };
    expect(errorsOf(stem, left).map((i) => i.code)).toContain('stem.opposite');
  });

  it('a level placed between crossings that cannot hold it fails (the stem and the figure disagreed on P1)', () => {
    const c = mcCaseById('floor-shift');
    const spec = clone(c.spec);
    // "above D1×S2 and below D1×S1": D1×S2 is the higher crossing after a decrease in supply.
    spec.levels[0].above = ['D1', 'S2'];
    spec.levels[0].below = ['D1', 'S1'];
    expect(compileSpec(spec).issues.map((i) => i.code)).toContain('level.band');
  });
});

describe('drawing in the HKDSE MC look', () => {
  it('a guide price line is the HKDSE dashed drop from its furthest point, its tick printed once', () => {
    const { diagram } = compileSpec(mcCaseById('hkdse-q16').spec);
    expect(diagram!.curves.some((c) => c.derive?.kind === 'level')).toBe(false);
    const withP1 = diagram!.points.filter((p) => p.yTickLabel);
    expect(withP1).toHaveLength(1);
    const head = withP1[0];
    const onIt = diagram!.points.filter((p) => Math.abs(p.at.y - head.at.y) < 1e-6);
    expect(onIt).toHaveLength(3);
    expect(head.at.x).toBeCloseTo(Math.max(...onIt.map((p) => p.at.x)), 6);
    expect(head.dropTo).toEqual(['x', 'y']);
    // The others follow the head's height: drag it and P1 moves for all.
    for (const p of onIt.filter((m) => m !== head)) expect(p.anchor).toMatchObject({ y: { point: head.id } });
    expect(diagram!.points.every((p) => !p.dot)).toBe(true);
  });

  it('a guide a gap reads is drawn as a line after all', () => {
    const spec = clone(mcCaseById('hkdse-q16').spec);
    spec.gaps = [{ level: 'P1', label: { en: 'shortage', zh: '短缺' } }];
    spec.asks = { what: 'none', state: 'after' };
    expect(compileSpec(spec).diagram!.curves.some((c) => c.derive?.kind === 'level')).toBe(true);
  });

  it('the price line sits between the crossings it is placed against, and the ticks are apart', () => {
    const { diagram } = compileSpec(mcCaseById('hkdse-q16').spec);
    const xs = diagram!.points.map((p) => p.at.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i] - xs[i - 1]).toBeGreaterThan(0.035);
  });

  it('the shift arrow keeps clear of the price line and the points (it sat on P1 in the draft)', () => {
    for (const id of ['hkdse-q16', 'floor-shift']) {
      const { diagram, levels } = compileSpec(mcCaseById(id).spec);
      const arrow = diagram!.arrows[0];
      expect(Math.abs(arrow.from.y - levels.get('P1')!.at)).toBeGreaterThan(0.04);
      for (const p of diagram!.points) expect(Math.abs(arrow.from.y - p.at.y) > 0.04 || Math.min(arrow.from.x, arrow.to.x) > p.at.x + 0.04 || Math.max(arrow.from.x, arrow.to.x) < p.at.x - 0.04).toBe(true);
    }
  });
});

describe('the reply', () => {
  it('a reply in the pre-k-0534 shape (equilibria, levels by side) still reads', () => {
    const parsed = parseSpec(JSON.stringify({ kind: 'curves', equilibria: [{ a: 'D', b: 'S', name: 'E', yTick: 'P', xTick: 'Q' }], levels: [{ id: 'F', kind: 'floor', label: 'P_f' }] }))!;
    expect(parsed.spec.points).toEqual([{ a: 'D', b: 'S', name: 'E', yTick: 'P', xTick: 'Q', dot: true }]);
    expect(parsed.spec.levels[0]).toMatchObject({ side: 'above', style: 'line', above: [], below: [] });
  });

  it('a looser crossing reference ("D1×S1") reads as two ids', () => {
    const parsed = parseSpec(JSON.stringify({ kind: 'curves', levels: [{ id: 'P1', kind: 'ceiling', above: 'D1 × S2', below: 'D1,S1', label: 'P_1' }] }))!;
    expect(parsed.spec.levels[0]).toMatchObject({ above: ['D1', 'S2'], below: ['D1', 'S1'] });
  });

  it('an edit reply carries questionChange', () => {
    const c = mcCaseById('hkdse-q16');
    const out = evaluateReply(JSON.stringify({ ...c.spec, questionChange: 'the policy is now a floor' }), inputOf(c))!;
    expect(out.questionChange).toBe('the policy is now a floor');
  });
});
