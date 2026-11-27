/**
 * Audit k-0583 task A (k-0586): the audit's probe specs, and the fixed form of each, through the
 * real compiler and checks. `auditProbes.json` holds them: `from` says which came from the audit
 * (`Outbox/k-0583/evidence/probes`, the Fable review's p1/p2 sets) and which were added here;
 * `expect.errors` are the error codes a probe must fail with ([] = it draws).
 */
import { describe, expect, it } from 'vitest';
import { curveCrossing } from '@/model/diagramAreas';
import probes from './auditProbes.json';
import { GRAPH_LINES } from './compile';
import { evaluateSpec } from './run';
import { marketOfLabel } from './validate';
import { symbol } from './text';
import { emptyScene, emptySpec, parseSpec, DIAGRAM_SPEC_SCHEMA } from './schema';
import type { DiagramSpec, SpecScene } from './types';

type Probe = { id: string; from: string; expect: { status: 'ok' | 'failed'; errors: string[] }; sides?: Array<'en' | 'zh'>; spec: Partial<DiagramSpec> & { kind: DiagramSpec['kind'] } };

const specOf = (p: Probe): DiagramSpec => {
  const base = emptySpec(p.spec.kind);
  return { ...base, ...p.spec, scene: p.spec.scene ? { ...emptyScene(), ...(p.spec.scene as Partial<SpecScene>) } : base.scene } as DiagramSpec;
};
const run = (id: string) => {
  const p = (probes as Probe[]).find((x) => x.id === id)!;
  return evaluateSpec(specOf(p), { sides: p.sides ?? ['en'], key: '' });
};
const errorCodes = (issues: ReadonlyArray<{ level: string; code: string }>) => [...new Set(issues.filter((i) => i.level === 'error').map((i) => i.code))];

describe('the audit probes (k-0583) and their fixed forms', () => {
  for (const p of probes as Probe[]) {
    it(`${p.id} (${p.from}) ${p.expect.status === 'ok' ? 'draws' : `fails with ${p.expect.errors.join(', ')}`}`, () => {
      const evaluated = evaluateSpec(specOf(p), { sides: p.sides ?? ['en'], key: '' });
      expect(errorCodes(evaluated.issues)).toEqual(p.expect.errors);
      if (p.expect.status === 'ok') expect(evaluated.compiled.diagram).toBeTruthy();
    });
  }
});

describe('A2: things drawn on one spot fail', () => {
  it('names the two brackets, the two marks and the two lines, and says what to use instead', () => {
    const brackets = run('e-two-brackets').issues.find((i) => i.code === 'same.bracket')!;
    expect(brackets.text).toMatch(/"ex\. dd0" and "ex\. dd1"/);
    expect(brackets.text).toMatch(/"brackets"/);
    const marks = run('x-marks-along').issues.find((i) => i.code === 'same.spot')!;
    expect(marks.text).toMatch(/A and B/);
    expect(marks.text).toMatch(/guide levels/);
    const lines = run('x-taxpair-two').issues.find((i) => i.code === 'same.line')!;
    expect(lines.text).toMatch(/start .* or cap/);
    expect(run('y-lorenz-place').issues.find((i) => i.code === 'same.line')!.text).toMatch(/kind "lorenz"/);
  });

  it('points a data template to kind chart (pie) or kind flow (k-0588)', () => {
    expect(run('x-tmpl-pie').issues.find((i) => i.code === 'template.data')!.text).toMatch(/kind "chart", type "pie"/);
    expect(run('x-tmpl-flow').issues.find((i) => i.code === 'template.data')!.text).toMatch(/kind "flow"/);
  });

  it('two shifts of one curve by the same size and way are one line', () => {
    const spec = specOf({ id: '', from: '', expect: { status: 'failed', errors: [] }, spec: { kind: 'curves', xAxis: { en: 'Quantity', zh: '' }, yAxis: { en: 'Price', zh: '' }, curves: [{ id: 'D', role: 'demand', slope: 'normal', place: 'mid', label: 'D_0' }], shifts: [{ of: 'D', id: 'D1', direction: 'right', size: 'normal', label: 'D_1' }, { of: 'D', id: 'D2', direction: 'right', size: 'normal', label: 'D_2' }] } });
    expect(errorCodes(evaluateSpec(spec, { sides: ['en'], key: '' }).issues)).toContain('same.line');
  });

  it('a point and a reading at one spot with the same tick are not two things', () => {
    // n-two-shortages marks Q_d0 on D0×P; nothing else prints there.
    expect(errorCodes(run('n-two-shortages').issues)).toEqual([]);
  });
});

describe('A3: through, brackets, tax start and cap, pie, subsidyChange', () => {
  it('a shift through AD×LRAS puts E1 on the LRAS; the same spec without it does not', () => {
    for (const [id, onLras] of [['n-self-adjust-through', true], ['e-self-adjust', false]] as const) {
      const d = run(id).compiled.diagram!;
      const lras = d.curves.find((c) => c.derive?.kind === 'vertical')!;
      const e1 = d.points.find((p) => p.label?.en.map((r) => r.text).join('') === 'E1')!;
      expect(Math.abs(e1.at.x - lras.points[0].x) < 0.005).toBe(onLras);
    }
  });

  it('a price line through a crossing sits at its height', () => {
    const evaluated = run('n-level-through');
    const d = evaluated.compiled.diagram!;
    const [d1, s] = ['D1', 'S'].map((id) => d.curves.find((c) => c.id === evaluated.compiled.curveIds.get(id))!);
    expect(evaluated.compiled.levels.get('P1')!.at).toBeCloseTo(curveCrossing(d1, s)!.y, 6);
  });

  it('brackets join two ticks on one axis, a second one on a shared stretch a row further out', () => {
    const spans = run('n-two-shortages').compiled.diagram!.spans!;
    expect(spans.map((s) => [s.style, s.along, s.offset ?? 0])).toEqual([
      ['bracket', 'x', 0],
      ['bracket', 'x', 0.09],
    ]);
    const gap = run('n-output-gap').compiled.diagram!.spans!;
    expect(gap).toHaveLength(1);
    expect(gap[0].label?.en.map((r) => r.text).join('')).toBe('Deflationary gap');
  });

  it('a bracket across axes, to a tick not drawn, or of no length fails', () => {
    const base = (brackets: DiagramSpec['brackets']) =>
      evaluateSpec({ ...specOf((probes as Probe[]).find((x) => x.id === 'n-output-gap')!), brackets }, { sides: ['en'], key: '' });
    expect(errorCodes(base([{ from: 'Y_0', to: 'P_0', label: { en: '', zh: '' } }]).issues)).toContain('bracket.axis');
    expect(errorCodes(base([{ from: 'Y_0', to: 'Y_9', label: { en: '', zh: '' } }]).issues)).toContain('bracket.ref');
    expect(errorCodes(base([{ from: 'Y_0', to: 'Y_0', label: { en: '', zh: '' } }]).issues)).toContain('bracket.empty');
  });

  it('a broken tax line keeps its stock geometry until start or cap is chosen', () => {
    const line = (curve: Partial<DiagramSpec['curves'][number]>) =>
      evaluateSpec({ ...emptySpec('curves'), xAxis: { en: 'Income', zh: '' }, yAxis: { en: 'Tax', zh: '' }, curves: [{ id: 'a', role: 'graph', slope: 'normal', place: 'mid', label: '', shape: 'zeroRisingFlat', rise: 'rising', ...curve }] }, { sides: ['en'], key: '' }).compiled.diagram!.curves[0].points.map((p) => [p.x, p.y]);
    expect(line({})).toEqual(GRAPH_LINES.zeroRisingFlat.rising);
    expect(line({ start: 'mid', cap: 'none' })).toEqual(GRAPH_LINES.zeroRisingFlat.rising);
    const later = line({ start: 'high' });
    const higher = line({ cap: 'high' });
    expect(later[1][0]).toBeGreaterThan(GRAPH_LINES.zeroRisingFlat.rising[1][0]);
    expect(higher[3][1]).toBeGreaterThan(GRAPH_LINES.zeroRisingFlat.rising[3][1]);
  });

  it('a pie is the editor pie chart, shares from the one series', () => {
    const d = run('n-pie').compiled.diagram!;
    expect(d.pie!.slices.map((s) => [s.label.en.map((r) => r.text).join(''), s.value])).toEqual([
      ['Direct tax', 46.2],
      ['Indirect tax', 22.8],
      ['Other revenue', 31],
    ]);
    const two = evaluateSpec({ ...specOf((probes as Probe[]).find((x) => x.id === 'n-pie')!), chart: { type: 'pie', categories: [{ en: 'A', zh: '' }, { en: 'B', zh: '' }], series: [{ label: { en: '', zh: '' }, values: [1, 2] }, { label: { en: '', zh: '' }, values: [3, 4] }], yTitle: { en: '', zh: '' }, xTitle: { en: '', zh: '' } } }, { sides: ['en'], key: '' });
    expect(errorCodes(two.issues)).toContain('chart.pieSeries');
  });

  it('subsidyChange (HKDSE 2024 P1 Q20): the increase in deadweight loss is worked out from the corners', () => {
    const mcq = {
      stem: 'The following diagram shows the supply and demand curves of Good Z. Suppose the government increases the per-unit subsidy on Good Z from $2 to $4. Which of the following statements is correct?',
      statements: [],
      options: ['The deadweight loss increases by area efih.', 'The new deadweight loss is area efih.', "The government's subsidy spending increases by area cdgf.", 'The deadweight loss increases by area cdi.'],
      answer: 0,
    };
    const key = 'With the $2 subsidy the deadweight loss is area cef. With the $4 subsidy it is area chi, so it increases by area efih. Area cdgf and area cdi are not the change in the deadweight loss.';
    const points = [
      { point: 'e0', label: 'c' },
      { point: 's2AtQ0', label: 'd' },
      { point: 's0AtQs1', label: 'e' },
      { point: 'e1', label: 'f' },
      { point: 's2AtQs1', label: 'g' },
      { point: 's0AtQs2', label: 'h' },
      { point: 'e2', label: 'i' },
    ];
    const spec: DiagramSpec = { ...emptySpec('scene'), scene: { ...emptyScene(), type: 'subsidyChange', ask: 'dwlChange', points } };
    const ok = evaluateSpec(spec, { sides: ['en'], key, mcq });
    expect(errorCodes(ok.issues)).toEqual([]);
    expect(ok.solved?.option).toBe(0);
    // h and e swapped: the keyed corners are no longer the change.
    const swapped = points.map((p) => (p.label === 'e' ? { ...p, label: 'h' } : p.label === 'h' ? { ...p, label: 'e' } : p));
    expect(errorCodes(evaluateSpec({ ...spec, scene: { ...spec.scene!, points: swapped } }, { sides: ['en'], key, mcq }).issues).length).toBeGreaterThan(0);
  });
});

describe('found by the live run (k-0586, Gemini on the dev Mentor)', () => {
  // The model's own reply for the import-quota brace case: a world price, Q_0 marked at D × P_0, a gap labelled Import quota.
  const iqBrace = (): DiagramSpec => ({
    ...emptySpec('curves'),
    xAxis: { en: 'Quantity', zh: '數量' },
    yAxis: { en: 'Price ($)', zh: '價格（$）' },
    curves: [
      { id: 'D', role: 'demand', slope: 'normal', place: 'mid', label: 'D', through: [] },
      { id: 'S', role: 'supply', slope: 'normal', place: 'mid', label: 'S', through: [] },
    ],
    levels: [{ id: 'P0', kind: 'world', above: [], below: [], side: 'below', style: 'guide', label: 'P_0', through: [] }],
    points: [{ a: 'D', b: 'P0', name: '', yTick: '', xTick: 'Q_0', dot: false }],
    gaps: [{ level: 'P0', label: { en: 'Import quota', zh: '進口配額' } }],
  });
  const mcq = {
    stem: 'Refer to the following supply-demand diagram about Good Y in a small country. The country has imposed an import quota on Good Y and the price and quantity transacted are P_0 and Q_0 respectively. If the government doubles the import quota, which of the following will happen?',
    statements: [],
    options: ['The price of Good Y will rise.', 'The quantity of domestic production of Good Y will fall.', 'The total quantity transacted of Good Y will fall.', 'The quantity of domestic production of Good Y will rise.'],
    answer: 1,
  };

  it('a gap ending at a point already marked uses that point: no Q_d printed over Q_0', () => {
    const evaluated = evaluateSpec(iqBrace(), { sides: ['en', 'zh'], key: 'B', mcq });
    const ticks = evaluated.compiled.diagram!.points.map((p) => p.xTickLabel?.en.map((r) => r.text).join('')).filter(Boolean);
    expect(ticks.sort()).toEqual(['Q0', 'Qs']);
    expect(errorCodes(evaluated.issues)).toEqual([]);
  });

  it('an import quota drawn as a labelled bracket is the quota the stem names; with no bracket it is still missing', () => {
    expect(evaluateSpec(iqBrace(), { sides: ['en'], key: 'B', mcq }).issues.some((i) => i.code === 'stem.control')).toBe(false);
    expect(evaluateSpec({ ...iqBrace(), gaps: [] }, { sides: ['en'], key: 'B', mcq }).issues.some((i) => i.code === 'stem.control')).toBe(true);
  });

  it('the asset and transactions demand for money are money demand for the key check', () => {
    expect(marketOfLabel(symbol('M_a1'))).toBe('md');
    expect(marketOfLabel(symbol('M_t'))).toBe('md');
    expect(marketOfLabel(symbol('M_s0'))).toBe('ms');
  });
});

describe('the reply shape', () => {
  it('asks for through, brackets, start, cap and a pie, every key required', () => {
    const props = DIAGRAM_SPEC_SCHEMA.properties as Record<string, { items?: { required?: string[] }; properties?: Record<string, { enum?: string[] }> }>;
    expect(props.shifts.items!.required).toContain('through');
    expect(props.levels.items!.required).toContain('through');
    expect(props.curves.items!.required).toEqual(expect.arrayContaining(['start', 'cap']));
    expect(props.brackets.items!.required).toEqual(['from', 'to', 'label']);
    expect(props.chart.properties!.type.enum).toContain('pie');
  });

  it('reads the new fields, and a reply written before them as it always was', () => {
    const reply = JSON.stringify({
      kind: 'curves',
      curves: [{ id: 'a', role: 'graph', label: '', shape: 'zeroThenRising', rise: 'rising', start: 'high', cap: 'bogus' }],
      shifts: [{ of: 'a', id: 'b', direction: 'right', size: 'small', label: '', through: 'AD × LRAS' }],
      levels: [{ id: 'P', kind: 'fixed', label: 'P', through: ['D', 'S'] }],
      brackets: [{ from: 'Y_0', to: 'Y_f', label: { en: 'gap', zh: '' } }],
      chart: { type: 'pie', categories: [], series: [] },
    });
    const parsed = parseSpec(reply)!;
    expect(parsed.spec.curves[0]).toMatchObject({ start: 'high', cap: 'none' });
    expect(parsed.issues.map((i) => i.code)).toContain('spec.value');
    expect(parsed.spec.shifts[0].through).toEqual(['AD', 'LRAS']);
    expect(parsed.spec.levels[0].through).toEqual(['D', 'S']);
    expect(parsed.spec.brackets).toEqual([{ from: 'Y_0', to: 'Y_f', label: { en: 'gap', zh: '' } }]);
    expect(parsed.spec.chart.type).toBe('pie');
    const old = parseSpec(JSON.stringify({ kind: 'curves', shifts: [{ of: 'a', id: 'b', direction: 'right', size: 'small', label: '' }] }))!;
    expect(old.spec.shifts[0].through).toEqual([]);
    expect(old.spec.brackets).toEqual([]);
    // A spec saved before k-0586 (no brackets key at all) still compiles.
    const saved = { ...emptySpec('curves'), xAxis: { en: 'Q', zh: '' }, yAxis: { en: 'P', zh: '' }, curves: [{ id: 'D', role: 'demand' as const, slope: 'normal' as const, place: 'mid' as const, label: 'D' }] };
    delete (saved as Partial<DiagramSpec>).brackets;
    expect(evaluateSpec(saved, { sides: ['en'], key: '' }).compiled.diagram).toBeTruthy();
  });
});
