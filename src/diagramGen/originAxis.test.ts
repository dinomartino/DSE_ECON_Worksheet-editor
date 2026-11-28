import { describe, expect, it } from 'vitest';
import type { Diagram } from '@/model/diagram';
import { areaClaimsIn } from './areaClaims';
import { compileSpec } from './compile';
import fixture from './k0600Fixture.json';
import liveSpec from './k0600LiveSpec.json';
import { evaluateReply, evaluateSpec } from './run';
import { parseSpec } from './schema';
import { plainOf } from './text';
import type { DiagramSpec, SpecPoint } from './types';
import { figureWords } from './words';

/**
 * k-0600 follow-up (u-lze6 "fix all"): HKDSE 2025 P1 Q22's own lettering can be drawn — S0 from
 * the origin, a where S1 meets an axis — and passes the corner check; and what the explanation
 * and the statements say an area is gets checked against the market on the drawing.
 */

const P = (a: string, b: string, name: string): SpecPoint => ({ a, b, name, xTick: '', yTick: '', dot: false });
const labelsOf = (d: Diagram) => d.points.map((p) => plainOf(p.label ?? { en: [], zh: [] }));
const codes = (e: ReturnType<typeof evaluateSpec>, level?: 'error' | 'look') => e.issues.filter((i) => !level || i.level === level).map((i) => i.code);

/** The chat's plan, drawn as the question means it: S0 from 0, a where S1 starts on the quantity axis. */
function subsidyPlan(extra: SpecPoint[] = []): DiagramSpec {
  const spec = JSON.parse(JSON.stringify(fixture.spec)) as DiagramSpec;
  spec.curves[1].through = ['origin'];
  spec.points.push(P('S1', 'xAxis', 'a'), ...extra);
  return spec;
}
const mcq = fixture.mcq;
const RIGHT_KEY =
  'Correct answer: B. (1) and (3) only\nDemand is perfectly elastic, so the price stays at the same level and consumers enjoy no subsidy benefit: (1) is correct. Output rises from b to c beyond the efficient quantity, so there is a deadweight loss: (3) is correct. The decrease in total social surplus is only the deadweight loss, not area 0abc: (2) is incorrect.';

describe('drawing from the origin and on an axis', () => {
  it('reads through "origin" for a supply', () => {
    const parsed = parseSpec(JSON.stringify({ kind: 'curves', curves: [{ id: 'S0', role: 'supply', label: 'S_0', through: ['origin'] }, { id: 'S9', role: 'supply', label: 'S', through: '0' }] }))!;
    expect(parsed.spec.curves.map((c) => c.through)).toEqual([['origin'], ['origin']]);
  });

  it('starts S0 at the origin and puts a where S1 meets the quantity axis', () => {
    const compiled = compileSpec(subsidyPlan());
    const d = compiled.diagram!;
    const s0 = d.curves.find((c) => plainOf(c.label) === 'S0')!;
    expect(s0.points[0]).toEqual({ x: 0, y: 0 });
    const a = d.points.find((p) => plainOf(p.label ?? { en: [], zh: [] }) === 'a')!;
    expect(a.at.y).toBe(0);
    expect(a.at.x).toBeCloseTo(0.18, 3);
    expect(a.anchor).toEqual({ on: d.curves[2].id, y: 0 });
  });

  it('puts a on the price axis for a tax that moves a supply from the origin up', () => {
    const spec = subsidyPlan();
    spec.shifts[0] = { ...spec.shifts[0], direction: 'up' };
    spec.points[2] = P('S1', 'yAxis', 'a');
    const d = compileSpec(spec).diagram!;
    const a = d.points.find((p) => plainOf(p.label ?? { en: [], zh: [] }) === 'a')!;
    expect(a.at.x).toBe(0);
    expect(a.at.y).toBeGreaterThan(0.05);
  });

  it('refuses a demand drawn from the origin and a point on an axis its curve does not reach', () => {
    const spec = subsidyPlan();
    spec.curves[0].through = ['origin'];
    expect(compileSpec(spec).issues.map((i) => i.code)).toContain('curve.origin');
    const stray = subsidyPlan();
    stray.points[2] = P('S0', 'xAxis', 'a');
    expect(compileSpec(stray).issues.map((i) => i.code)).toContain('eq.cross');
  });

  it('says it in words, for the blind solve and the chat', () => {
    const e = evaluateSpec(subsidyPlan(), { sides: ['en'], key: RIGHT_KEY, mcq });
    const words = figureWords(e.spec, e.compiled.diagram!);
    expect(words).toMatch(/S0: a supply curve \(upward-sloping\) from the origin/);
    expect(words).toMatch(/a \(where S1 meets the quantity axis\)/);
  });
});

describe('the chat’s question, drawn right', () => {
  it('passes with a right explanation: 0abc printed by its corners, every side on a line', () => {
    const e = evaluateSpec(subsidyPlan(), { sides: ['en'], key: RIGHT_KEY, mcq });
    expect(e.issues).toEqual([]);
    expect(labelsOf(e.compiled.diagram!)).toEqual(['b', 'c', 'a']);
  });

  it('flags the chat’s own explanation: area 0abc is not the increase in producer surplus (8 against 10)', () => {
    const e = evaluateSpec(subsidyPlan(), { sides: ['en'], key: fixture.key, mcq });
    expect(codes(e, 'error')).toEqual([]);
    const claim = e.issues.find((i) => i.code === 'area.claim');
    expect(claim?.level).toBe('look');
    expect(claim?.text).toMatch(/explanation says Area 0abc is the increase in producer surplus/);
    expect(claim?.text).toMatch(/cost S_0/);
  });

  it('checks a statement against the key: the deadweight loss is area bcd (d on S0 above c)', () => {
    const spec = subsidyPlan([P('S0', 'c', 'd')]);
    const asTrue = { ...mcq, statements: [mcq.statements[0], 'The deadweight loss is area bcd.', mcq.statements[2]], answer: 3 };
    expect(codes(evaluateSpec(spec, { sides: ['en'], key: '', mcq: asTrue }))).not.toContain('area.statement');
    const asFalse = { ...asTrue, answer: 1 };
    const e = evaluateSpec(spec, { sides: ['en'], key: '', mcq: asFalse });
    expect(e.issues.find((i) => i.code === 'area.statement')?.text).toMatch(/Statement \(2\) says The deadweight loss is area bcd\. On the figure that is true, but the key \(\(1\) and \(3\) only\) treats it as false/);
  });

  it('agrees with HKDSE’s tax version: 0abc (between S0 and S1) is the producers’ loss, same size', () => {
    const spec = subsidyPlan();
    spec.shifts[0] = { ...spec.shifts[0], direction: 'up' };
    spec.points[2] = P('S1', 'yAxis', 'a');
    const tax = {
      stem: mcq.stem.replace('provides a per-unit subsidy on', 'imposes a per-unit tax on'),
      statements: ['The consumers bear no tax burden.', 'The decrease in total social surplus is area 0abc.', 'There is deadweight loss after the imposition of the tax.'],
      options: mcq.options,
      answer: 1,
    };
    const e = evaluateSpec(spec, { sides: ['en'], key: 'The price stays, so producers bear all the tax. Area 0abc is the decrease in producer surplus; the decrease in total social surplus is only the deadweight loss.', mcq: tax });
    expect(codes(e)).not.toContain('area.claim');
    expect(codes(e)).not.toContain('area.statement');
  });
});

describe('reading what the words say an area is', () => {
  it('reads plain claims in either order and language', () => {
    expect(areaClaimsIn('Area 0abc represents the increase in producer surplus rather than the decrease in total social surplus, so (2) is incorrect.')).toEqual([
      { area: 'Area 0abc', what: 'ps', state: 'change', words: 'the increase in producer surplus' },
    ]);
    expect(areaClaimsIn('The decrease in total social surplus is area 0abc.')).toMatchObject([{ what: 'dwl', state: 'after' }]);
    expect(areaClaimsIn('面積 0abc 是生產者盈餘的增加。')).toMatchObject([{ area: '面積 0abc', what: 'ps' }]);
    expect(areaClaimsIn("The government's expenditure on the subsidy is area A.")).toMatchObject([{ what: 'taxRevenue' }]);
  });

  it('leaves alone what is not a plain claim', () => {
    expect(areaClaimsIn('Area 0abc is not the deadweight loss.')).toEqual([]);
    expect(areaClaimsIn('Statement (2) says the decrease in total social surplus is area 0abc.')).toEqual([]);
    expect(areaClaimsIn('The deadweight loss is the triangle between S0 and D to the right of b.')).toEqual([]);
    expect(areaClaimsIn('Areas abc and bcd lie between the curves.')).toEqual([]);
  });
});

describe('the live plan from the follow-up run (dev Mentor, 2026-11-28, 34.79 credits)', () => {
  // The AI's own reply: D horizontal, S0 through ["origin"], S1 = S0 shifted down, a on the x-axis.
  const live = JSON.stringify(liveSpec);

  it('draws S1 down from S0 to start at a on the quantity axis, every letter printed, corners on lines', () => {
    const e = evaluateReply(live, { sides: ['en'], key: RIGHT_KEY, mcq })!;
    expect(e.issues).toEqual([]);
    const d = e.compiled.diagram!;
    expect(labelsOf(d).sort()).toEqual(['a', 'b', 'c']);
    expect(d.points.find((p) => plainOf(p.label ?? { en: [], zh: [] }) === 'a')!.at.y).toBe(0);
  });

  it('as the reply to "help me regen the graph with the label": drawn, and the chat’s explanation flagged', () => {
    const e = evaluateReply(live, { sides: ['en'], key: `Correct answer: B. (1) and (3) only\n${fixture.key}`, mcq, edit: { spec: fixture.spec as unknown as DiagramSpec, note: 'help me regen the graph with the label' } })!;
    expect(codes(e, 'error')).toEqual([]);
    expect(codes(e)).toEqual(['area.claim']);
  });
});
