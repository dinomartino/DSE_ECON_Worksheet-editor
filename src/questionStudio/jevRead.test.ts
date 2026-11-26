import { describe, expect, it } from 'vitest';
import type { DecideAnswer, DecideRequest } from '@/ai/types';
import { PAGE } from '@/components/studio/chat/intentPhrasings';
import { buildStudioRead, routeStudioRead, type StudioReadInput } from './jevRead';

/** k-0567 (u-5sy9): the studio pre-router's Jev request and the rules code applies to its answers. */

const choice = (p: Record<string, number>): DecideAnswer => {
  const top = Object.entries(p).sort((a, b) => b[1] - a[1])[0][0];
  return { type: 'choice', choice: top, confidence: p[top], probabilities: p };
};
const n = (x: number): DecideAnswer => ({ type: 'noul', noul: x });

/** Jev's answers: intent probabilities, draft Nouls, and any overrides (all / missing / harder / easier / part_*). */
function answers(intent: Record<string, number>, d: number[], over: Record<string, number> = {}) {
  const a: Record<string, DecideAnswer> = { intent: choice(intent), all: n(0.02), missing: n(0.03), harder: n(0.03), easier: n(0.03) };
  d.forEach((x, i) => (a[`d${i + 1}`] = n(x)));
  for (const [k, v] of Object.entries(over)) a[k] = n(v);
  return { answers: a, fallback: false };
}
const input = (o: Partial<StudioReadInput> = {}): StudioReadInput => ({ text: 'x', drafts: PAGE, recent: [1, 2, 3], ...o });
const EDIT = { edit: 0.97, another: 0.01, new: 0.01, ask: 0.01 };

describe('the studio read on Jev (k-0567)', () => {
  it('asks the intent, every draft, every / missing, harder / easier and the parts; feature studio.read', () => {
    const req: DecideRequest = buildStudioRead({ text: '  Q2 太易 ', drafts: PAGE, recent: [2] }, new AbortController().signal);
    expect(req.feature).toBe('studio.read');
    expect(Object.keys(req.questions).sort()).toEqual(
      ['all', 'd1', 'd2', 'd3', 'easier', 'harder', 'intent', 'missing', 'part_answer', 'part_diagram', 'part_explanation', 'part_language', 'part_numbers', 'part_options', 'part_statements', 'part_stem', 'part_table'].sort(),
    );
    expect(req.state).toMatchObject({ request: 'Q2 太易', recent: [2] });
    expect((req.state as { drafts: unknown[] }).drafts).toHaveLength(3);
    // The drafts as the main read sees them: clipped, no explanation.
    expect(JSON.stringify(req.state)).not.toContain('explanation');
  });

  it('new and ask keep the main read; so does an unsure intent, a weak "another", a missing answer or the fallback model', () => {
    expect(routeStudioRead(answers({ new: 0.95, edit: 0.03, another: 0.01, ask: 0.01 }, [0, 0, 0]), input())).toEqual({ route: 'main', why: 'new' });
    expect(routeStudioRead(answers({ ask: 0.95, edit: 0.03, another: 0.01, new: 0.01 }, [0.99, 0, 0]), input())).toEqual({ route: 'main', why: 'ask' });
    expect(routeStudioRead(answers({ edit: 0.64, new: 0.3, another: 0.03, ask: 0.03 }, [0, 0.9, 0]), input())).toEqual({ route: 'main', why: 'doubt' });
    expect(routeStudioRead(answers({ another: 0.66, new: 0.22, edit: 0.12, ask: 0 }, [0.06, 0.08, 0.79]), input())).toEqual({ route: 'main', why: 'doubt' });
    const partial = answers(EDIT, [0, 0.9, 0]);
    delete partial.answers.d3;
    expect(routeStudioRead(partial, input())).toEqual({ route: 'main', why: 'doubt' });
    expect(routeStudioRead({ ...answers(EDIT, [0, 0.9, 0]), fallback: true }, input())).toEqual({ route: 'main', why: 'fallback' });
  });

  it('an edit of named drafts acts at once; another too', () => {
    expect(routeStudioRead(answers(EDIT, [0.9, 0.01, 0.97]), input())).toMatchObject({ route: 'act', kind: 'edit', drafts: [1, 3], wanted: 'edit' });
    expect(routeStudioRead(answers({ another: 0.99, edit: 0.01, new: 0, ask: 0 }, [0.92, 0.1, 0.1]), input())).toMatchObject({ route: 'act', kind: 'another', drafts: [1] });
  });

  it('"which draft?" when it may be one of several, names a draft not on the page, or names none after several', () => {
    // The k-0567 miss: the diagram draft at 0.40 — asked about, never guessed.
    expect(routeStudioRead(answers(EDIT, [0.06, 0.53, 0.4]), input())).toMatchObject({ route: 'act', kind: 'unsure', drafts: [2, 3] });
    expect(routeStudioRead(answers(EDIT, [0.03, 0.05, 0.03], { missing: 0.91 }), input())).toMatchObject({ route: 'act', kind: 'unsure', drafts: [1, 2, 3] });
    expect(routeStudioRead(answers(EDIT, [0.03, 0.02, 0.03]), input())).toMatchObject({ route: 'act', kind: 'unsure', drafts: [1, 2, 3] });
    expect(routeStudioRead(answers({ another: 0.99, edit: 0.01, new: 0, ask: 0 }, [0.9, 0.9, 0.1]), input())).toMatchObject({ kind: 'unsure', drafts: [1, 2], wanted: 'another' });
  });

  it('no draft named right after a reply that made one: that one; every draft = the open and accepted ones', () => {
    expect(routeStudioRead(answers(EDIT, [0.1, 0.04, 0.09]), input({ recent: [1] }))).toMatchObject({ kind: 'edit', drafts: [1] });
    const drafts = PAGE.map((d) => (d.no === 2 ? { ...d, state: 'rejected' as const } : d));
    expect(routeStudioRead(answers(EDIT, [0.03, 0.02, 0.03], { all: 0.98 }), input({ drafts }))).toMatchObject({ kind: 'edit', drafts: [1, 3] });
  });

  it('a draft already in the paper is never a target', () => {
    const drafts = PAGE.map((d) => (d.no === 3 ? { ...d, state: 'added' as const } : d));
    expect(routeStudioRead(answers(EDIT, [0.01, 0.01, 0.99]), input({ drafts }))).toMatchObject({ kind: 'unsure', drafts: [1, 2] });
  });

  it('harder / easier only when Jev is sure; parts it is sure of, keeping a diagram the words saw', () => {
    expect(routeStudioRead(answers(EDIT, [0, 0.99, 0], { harder: 0.96 }), input())).toMatchObject({ how: 'harder' });
    expect(routeStudioRead(answers(EDIT, [0, 0.99, 0], { easier: 0.37 }), input())).not.toHaveProperty('how');
    expect(routeStudioRead(answers(EDIT, [0, 0.99, 0], { harder: 0.8, easier: 0.5 }), input())).not.toHaveProperty('how');
    expect(routeStudioRead(answers(EDIT, [0, 0, 0.99], { part_options: 0.93, part_statements: 0.31 }), input())).toMatchObject({ parts: ['options'] });
    expect(routeStudioRead(answers(EDIT, [0, 0, 0.99]), input())).not.toHaveProperty('parts');
    expect(routeStudioRead(answers(EDIT, [0, 0, 0.84], { part_statements: 0.63, part_diagram: 0.44 }), input({ localParts: ['diagram', 'numbers'] }))).toMatchObject({ parts: ['statements', 'diagram'] });
    expect(routeStudioRead(answers(EDIT, [0, 0, 0.84], { part_statements: 0.63, part_diagram: 0.1 }), input({ localParts: ['diagram'] }))).toMatchObject({ parts: ['statements'] });
  });
});
