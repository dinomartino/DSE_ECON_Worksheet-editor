import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { CompletionRequest } from '@/ai/types';
import { mcCaseById } from '@/diagramGen/mcFixtures';
import { buildDiagramRequest } from '@/diagramGen/prompt';
import { scriptedClient } from '@/translate/testKit';
import { REQUEST, solver } from './fixtures';
import { EMPTY_CORPUS } from './nearCopy';
import { refine, writeDrafts } from './run';
import type { StudioDeps } from './types';

/**
 * k-0534 in the studio: a diagram is asked for only when the writer's "figure" says one is
 * needed, it is drawn before the blind solve (which reads it in words), a stem that narrates
 * its figure is sent back, and a follow-up edits the figure's spec instead of drawing anew.
 */

const preset = presetFor('gemini');
const floor = mcCaseById('floor-shift');
const floorZh = mcCaseById('floor-shift-zh');
const ctl = () => new AbortController().signal;
const deps = (client: StudioDeps['client']): StudioDeps => ({ client, preset, glossary: null, corpus: EMPTY_CORPUS, random: () => 0.3, diagrams: true });

const draft = (over: Record<string, unknown> = {}) => ({
  stem: { en: floor.stem, zh: floorZh.stem },
  statements: [],
  options: floor.options.map((o) => ({ en: o, zh: o })),
  answer: floor.answer,
  explanation: { en: 'After the shift the equilibrium price is above P1, so the floor no longer binds: Q2.', zh: '供應減少後，均衡價格高於 P1，最低價格不再生效：Q2。' },
  angle: 'floor stops binding',
  figure: floor.figure,
  changes: [],
  ...over,
});
const write = (...items: Array<Record<string, unknown>>) => JSON.stringify({ questions: items });
const specReply = (over: Record<string, unknown> = {}) => JSON.stringify({ ...floor.spec, ...over });
const payload = (req: CompletionRequest) => JSON.parse(req.turns.at(-1)!.content) as Record<string, unknown>;
const solveKey = (answer: number) => solver({ [floor.stem]: answer });

describe('a diagram only for a draft that needs one', () => {
  it('"figure": "" → no diagram request; the writer is told figures are drawn', async () => {
    const client = scriptedClient([write(draft({ figure: '' })), solveKey(1)]);
    const out = await writeDrafts({ ...REQUEST, count: 1 }, deps(client), { signal: ctl() });
    expect(out.ok && out.drafts[0].diagram).toBeFalsy();
    expect(client.requests).toHaveLength(2);
    expect((payload(client.requests[0]).make as Record<string, unknown>).figures).toBe(true);
  });

  it('a figure is drawn from the writer\'s note before the solve, which reads it in words; the spec is kept', async () => {
    const client = scriptedClient([write(draft()), specReply(), solveKey(1)]);
    const out = await writeDrafts({ ...REQUEST, count: 1 }, deps(client), { signal: ctl() });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const d = out.drafts[0];
    expect(d.figure).toBe(floor.figure);
    expect(d.diagram).toMatchObject({ status: 'ok', placement: 'question', solved: { labels: ['Q2'], option: 1 } });
    expect(d.diagram?.spec?.levels[0]).toMatchObject({ id: 'P1', kind: 'floor' });
    expect(payload(client.requests[1])).toMatchObject({ task: 'diagram', figure: floor.figure });
    const solveItem = (payload(client.requests[2]).questions as Array<{ figure?: string }>)[0];
    expect(solveItem.figure).toMatch(/Quantity ticks from the origin outward: Q1 \(S2 at the price P1\), Q2 \(where D1 meets S2\), Q3 \(D1 at the price P1\), Q4 \(S1 at the price P1\)/);
    expect(solveItem.figure).toMatch(/D1 and S1 cross \(not marked\) below P1/);
    expect(d.checks.find((c) => c.id === 'key')?.state).toBe('pass');
  });

  it('a diagram whose labels miss what the options name is repaired once, the problem named', async () => {
    const thin = { points: floor.spec.points.filter((p) => p.xTick === 'Q_2' || p.xTick === 'Q_4') };
    const client = scriptedClient([write(draft()), specReply(thin), specReply(), solveKey(1)]);
    const out = await writeDrafts({ ...REQUEST, count: 1 }, deps(client), { signal: ctl() });
    expect(out.ok && out.drafts[0].diagram?.status).toBe('ok');
    expect(client.requests[2].turns.at(-1)!.content).toMatch(/names Q1, Q3, but the diagram does not label them/);
  });

  it('a diagram that cannot be drawn to fit warns the draft (shape.figureFailed)', async () => {
    const wrongKey = { asks: { what: 'quantityTransacted', state: 'before' } };
    const client = scriptedClient([write(draft()), specReply(wrongKey), specReply(wrongKey), solveKey(1)]);
    const out = await writeDrafts({ ...REQUEST, count: 1 }, deps(client), { signal: ctl() });
    if (!out.ok) throw new Error('run failed');
    expect(out.drafts[0].diagram?.block).toBeNull();
    expect(out.drafts[0].checks.find((c) => c.id === 'shape')).toMatchObject({ state: 'fail', findings: [{ id: 'shape.figureFailed' }] });
  });
});

describe('a stem may not narrate its figure', () => {
  it('"dashed lines mark four quantities: Q1 is …" fails and is rewritten once, told to refer to the diagram', async () => {
    const narrated = draft({ stem: { en: `${floor.stem} On the horizontal axis, dashed lines mark four quantities: Q1 is the quantity supplied on S2 at P1.`, zh: floorZh.stem } });
    const client = scriptedClient([write(narrated), write(draft()), specReply(), solveKey(1)]);
    const out = await writeDrafts({ ...REQUEST, count: 1 }, deps(client), { signal: ctl() });
    expect(out.ok && out.drafts[0].draft.stem.en).toBe(floor.stem);
    const redo = payload(client.requests[1]).redo as Array<{ problem: string }>;
    expect(redo[0].problem).toMatch(/describes the diagram in words/);
  });
});

describe('a follow-up edits the figure, not a new draft', () => {
  const first = async () => {
    const client = scriptedClient([write(draft()), specReply(), solveKey(1)]);
    const out = await writeDrafts({ ...REQUEST, count: 1 }, deps(client), { signal: ctl() });
    if (!out.ok) throw new Error('run failed');
    return out.drafts[0];
  };

  it('an edit that cannot be drawn keeps the old figure and says so (k-0600: "regen the graph with the label")', async () => {
    const target = await first();
    // A point on a curve that is not drawn: nothing to put the letters on, twice.
    const broken = JSON.stringify({ ...floor.spec, points: [...floor.spec.points, { a: 'D9', b: 'S1', name: 'a', xTick: '', yTick: '', dot: true }], questionChange: '' });
    const client = scriptedClient([broken, broken]);
    const out = await refine(REQUEST, target, { kind: 'change', text: 'regen the graph with the labels' }, [], deps(client), { signal: ctl() });
    if (!out.ok) throw new Error('refine failed');
    expect(out.notes).toEqual([{ id: 'run.figureNotRedrawn' }]);
    expect(out.drafts[0].diagram?.block).toBe(target.diagram?.block);
    expect(out.drafts[0].diagram?.status).toBe('look');
  });

  it('an edit that draws reports nothing more', async () => {
    const target = await first();
    const client = scriptedClient([JSON.stringify({ ...floor.spec, questionChange: '' })]);
    const out = await refine(REQUEST, target, { kind: 'change', text: 'redraw it' }, [], deps(client), { signal: ctl() });
    expect(out.ok && out.notes).toEqual([]);
  });

  it('"move the arrow label": one edit request with the spec; the words stay byte for byte', async () => {
    const target = await first();
    const edited = { ...floor.spec, shifts: [{ ...floor.spec.shifts[0], size: 'small' }], questionChange: '' };
    const client = scriptedClient([JSON.stringify(edited)]);
    const out = await refine(REQUEST, target, { kind: 'change', text: 'make the shift smaller' }, [], deps(client), { signal: ctl() });
    expect(client.requests).toHaveLength(1);
    expect(payload(client.requests[0])).toMatchObject({ task: 'diagram-edit', edit: { note: 'make the shift smaller', spec: { levels: [{ id: 'P1' }] } } });
    if (!out.ok) throw new Error('refine failed');
    expect(out.drafts[0].draft).toEqual(target.draft);
    expect(out.drafts[0].id).not.toBe(target.id);
    expect(out.drafts[0].diagram?.spec?.shifts[0].size).toBe('small');
  });

  it('an edit that moves the answer ("move P1 up" past the new equilibrium) has the writer fix the key; the edited figure is kept without another request', async () => {
    const target = await first();
    // P1 above both equilibria: the floor binds after the shift; transacted = Qd at P1 = Q1 now.
    const moved = {
      ...floor.spec,
      levels: [{ ...floor.spec.levels[0], above: ['D1', 'S2'], below: [] }],
      points: [
        { a: 'D1', b: 'P1', name: '', xTick: 'Q_1', yTick: '', dot: false },
        { a: 'D1', b: 'S2', name: '', xTick: 'Q_2', yTick: '', dot: false },
        { a: 'S2', b: 'P1', name: '', xTick: 'Q_3', yTick: '', dot: false },
        { a: 'S1', b: 'P1', name: '', xTick: 'Q_4', yTick: '', dot: false },
      ],
      questionChange: '',
    };
    const rekeyed = draft({ answer: 0, explanation: { en: 'P1 is above the new equilibrium, so the floor binds: Q1 is demanded.', zh: 'P1 高於新均衡價格，最低價格生效：Q1。' } });
    const client = scriptedClient([JSON.stringify(moved), write(rekeyed), solver({ [floor.stem]: 0 })]);
    const out = await refine(REQUEST, target, { kind: 'change', text: 'move P1 up above the new equilibrium' }, [], deps(client), { signal: ctl() });
    if (!out.ok) throw new Error('refine failed');
    const rewrite = payload(client.requests[1]).rewrite as { note: string };
    expect(rewrite.note).toMatch(/answer is Q1 \(option A\)/);
    expect(client.requests).toHaveLength(3);
    expect(out.drafts[0].draft.answerIndex).toBe(0);
    expect(out.drafts[0].diagram).toMatchObject({ status: 'ok', solved: { labels: ['Q1'], option: 0 } });
  });
});

describe('a change that touches only the words (k-0535 parts)', () => {
  it('goes to the writer and keeps the figure without a diagram request when the words still fit it', async () => {
    const client0 = scriptedClient([write(draft()), specReply(), solveKey(1)]);
    const first = await writeDrafts({ ...REQUEST, count: 1 }, deps(client0), { signal: ctl() });
    if (!first.ok) throw new Error('run failed');
    const target = first.drafts[0];
    const reworded = draft({ stem: { en: floor.stem.replace('Country B', 'Country C'), zh: floorZh.stem.replace('B 國', 'C 國') } });
    const client = scriptedClient([write(reworded), solveKey(1)]);
    const refinement = { kind: 'change' as const, text: 'call it Country C', parts: ['stem'] };
    const out = await refine(REQUEST, target, refinement, [], deps(client), { signal: ctl() });
    if (!out.ok) throw new Error('refine failed');
    expect(client.requests).toHaveLength(2);
    expect(out.drafts[0].draft.stem.en).toMatch(/Country C/);
    expect(out.drafts[0].diagram?.spec).toEqual(target.diagram?.spec);
  });
});

describe('the diagram instructions are a fixed prefix (Gemini implicit caching, u-gi2a)', () => {
  it('the system text is byte-identical for every question, edit and reference; the variable parts are in the user turn', () => {
    const signal = ctl();
    const a = buildDiagramRequest({ question: 'one', key: 'A', sides: ['en'] }, preset, signal, false);
    const b = buildDiagramRequest({ question: '另一題', key: 'B', sides: ['zh'], figure: 'x', reference: { text: 'ref' } }, preset, signal, true);
    const c = buildDiagramRequest({ question: 'q', key: 'k', sides: ['en', 'zh'], edit: { spec: floor.spec, note: 'label Q1' } }, preset, signal, false);
    expect(b.system).toBe(a.system);
    expect(c.system).toBe(a.system);
    for (const variable of ['另一題', 'label Q1', 'ref']) expect(a.system.includes(`"${variable}"`)).toBe(false);
    expect(a.system).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(a.turns).toHaveLength(1);
    expect(a.feature).toBe('studio.diagram');
  });
});
