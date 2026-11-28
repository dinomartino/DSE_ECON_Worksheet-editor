import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { CompletionRequest } from '@/ai/types';
import fixture from '@/diagramGen/k0600Fixture.json';
import type { DiagramSpec } from '@/diagramGen/types';
import { scriptedClient } from '@/translate/testKit';
import { REQUEST, solver } from './fixtures';
import { EMPTY_CORPUS } from './nearCopy';
import { writeDrafts } from './run';
import type { StudioDeps } from './types';

/**
 * k-0600 follow-up: a draft whose explanation misnames an area on its own figure (the studio
 * review: "Area 0abc represents the increase in producer surplus", with a subsidy and perfectly
 * elastic demand it is that increase less the deadweight loss) is written again once, told what
 * is wrong; when the rewrite is still wrong it is flagged on the key's row, never shown as ok.
 */

const preset = presetFor('gemini');
const ctl = () => new AbortController().signal;
const deps = (client: StudioDeps['client']): StudioDeps => ({ client, preset, glossary: null, corpus: EMPTY_CORPUS, random: () => 0.3, diagrams: true });
const payload = (req: CompletionRequest) => JSON.parse(req.turns.at(-1)!.content) as Record<string, unknown>;

const WRONG = fixture.key;
const RIGHT =
  'Demand is perfectly elastic, so the price stays at the same level and consumers enjoy no subsidy benefit: (1) is correct. Output rises from b to c beyond the efficient quantity, so there is a deadweight loss: (3) is correct. The decrease in total social surplus is only the deadweight loss, not area 0abc: (2) is incorrect.';
const draft = (explanation: string) => ({
  stem: { en: fixture.mcq.stem, zh: '' },
  statements: fixture.mcq.statements.map((en) => ({ en, zh: '' })),
  options: fixture.mcq.options.map((en) => ({ en, zh: '' })),
  answer: 1,
  explanation: { en: explanation, zh: '' },
  angle: 'per-unit subsidy with perfectly elastic demand',
  figure: 'Horizontal D; S0 from the origin meeting D at b; S1 from a on the quantity axis meeting D at c.',
  changes: [],
});
const write = (explanation: string) => JSON.stringify({ questions: [draft(explanation)] });
/** The figure drawn right: S0 from 0, a where S1 starts on the quantity axis. */
const plan = (() => {
  const spec = JSON.parse(JSON.stringify(fixture.spec)) as DiagramSpec;
  spec.curves[1].through = ['origin'];
  spec.points.push({ a: 'S1', b: 'xAxis', name: 'a', xTick: '', yTick: '', dot: false });
  return JSON.stringify(spec);
})();
const solve = solver({ [fixture.mcq.stem]: 1 });
const request = { ...REQUEST, count: 1, sides: ['en' as const] };

describe('an explanation that misnames an area on its figure', () => {
  it('is written again once, told what is wrong; the rewrite stands with its key row clear', async () => {
    const client = scriptedClient([write(WRONG), plan, solve, write(RIGHT), plan, solve]);
    const out = await writeDrafts(request, deps(client), { signal: ctl() });
    if (!out.ok) throw new Error('run failed');
    expect(client.requests).toHaveLength(6);
    const redo = payload(client.requests[3]).redo as Array<{ problem: string }>;
    expect(redo[0].problem).toMatch(/On its diagram: The explanation says Area 0abc is the increase in producer surplus, but on the figure it is not/);
    const d = out.drafts[0];
    expect(d.draft.explanation.en).toBe(RIGHT);
    expect(d.checks.find((c) => c.id === 'key')).toMatchObject({ state: 'pass', findings: [] });
    expect(d.diagram?.status).toBe('ok');
  });

  it('still wrong after the rewrite: flagged on the key row and the diagram, not ok', async () => {
    const client = scriptedClient([write(WRONG), plan, solve, write(WRONG), plan, solve]);
    const out = await writeDrafts(request, deps(client), { signal: ctl() });
    if (!out.ok) throw new Error('run failed');
    const d = out.drafts[0];
    expect(d.checks.find((c) => c.id === 'key')).toMatchObject({ state: 'look', findings: [{ id: 'key.areaClaim', params: { kind: 'explanation' } }] });
    expect(d.diagram?.status).toBe('look');
    expect(d.status).toBe('look');
  });
});
