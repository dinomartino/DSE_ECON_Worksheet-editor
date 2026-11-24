import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { CompletionRequest } from '@/ai/types';
import fixtureFile from '@/diagramGen/setFixtures.json';
import { materialize } from './deliver';
import { scriptedClient } from '@/translate/testKit';
import type { McqQuestion } from '@/model/types';
import { applyEdit } from './edit';
import { REQUEST, solver } from './fixtures';
import { studioBuilds } from './insert';
import { keyCheckOf } from './keyCheck';
import { buildCorpusIndex, EMPTY_CORPUS } from './nearCopy';
import { refine, writeDrafts } from './run';
import { figuresOf } from './validate';
import type { StudioDeps, StudioDraft } from './types';

/**
 * k-0545 in the studio: a question with several figures (a grid "(1)"–"(4)", a diagram under
 * every option) is written with a "figures" list, drawn in ONE diagram request, solved with
 * every figure in words, checked against the key the drawings give, inserted as a figure grid
 * or option diagrams, and edited one figure at a time.
 */

type Fixture = (typeof fixtureFile.fixtures)[number];
const fixture = (id: string) => fixtureFile.fixtures.find((f) => f.id === id) as Fixture;
const preset = presetFor('gemini');
const ctl = () => new AbortController().signal;
const deps = (client: StudioDeps['client']): StudioDeps => ({ client, preset, glossary: null, corpus: EMPTY_CORPUS, random: () => 0.3, diagrams: true });
const writeOf = (f: Fixture, over: Record<string, unknown> = {}) => JSON.stringify({ questions: [{ ...f.question, changes: [], ...over }] });
const payload = (req: CompletionRequest) => JSON.parse(req.turns.at(-1)!.content) as Record<string, unknown>;
const solveKey = (f: Fixture, answer = f.question.answer) => solver({ [f.question.stem.en]: answer });

async function run(f: Fixture, replies: Parameters<typeof scriptedClient>[0] = [writeOf(f), JSON.stringify(f.reply), solveKey(f)]) {
  const client = scriptedClient(replies);
  const out = await writeDrafts({ ...REQUEST, count: 1 }, deps(client), { signal: ctl() });
  if (!out.ok) throw new Error(JSON.stringify(out.error));
  return { client, draft: out.drafts[0] };
}

describe('the writer\'s "figures"', () => {
  it('reads one stem figure as before, several as a set, [] as none, and the old "figure" line', () => {
    expect(figuresOf({ figures: [{ at: 'stem', note: 'D and S' }] })).toEqual({ figure: 'D and S' });
    expect(figuresOf({ figures: [] })).toEqual({ figure: '' });
    expect(figuresOf({ figure: 'old' })).toEqual({ figure: 'old' });
    expect(figuresOf({})).toEqual({});
    expect(figuresOf({ figures: [{ at: 'B', note: 'b' }, { at: 'A', note: 'a' }, { at: '(9)', note: 'x' }, { at: 'A', note: 'again' }] })).toEqual({
      figureSet: [{ at: 'A', note: 'a' }, { at: 'B', note: 'b' }],
    });
  });
});

describe('a grid of tax graphs (like HKDSE 2023 Q36)', () => {
  it('one write, ONE diagram request for all four, one solve that reads each figure by its label', async () => {
    const f = fixture('grid-regressive');
    const { client, draft } = await run(f);
    expect(client.requests).toHaveLength(3);
    expect(payload(client.requests[1])).toMatchObject({ task: 'diagram-set', figures: f.question.figures });
    const item = (payload(client.requests[2]).questions as Array<{ figure?: string; options: string[] }>)[0];
    expect(item.figure).toMatch(/^\(1\) Axes: Tax payment/);
    expect(item.figure).toMatch(/\(2\) Axes: Average tax rate [\s\S]*falling/);
    expect(item.options[0]).toBe('(1) and (2) only');
    expect(draft.figureSet).toHaveLength(4);
    expect(draft.diagram).toBeUndefined();
    expect(draft.diagramSet?.figures.map((x) => [x.at, x.status])).toEqual([['(1)', 'ok'], ['(2)', 'ok'], ['(3)', 'ok'], ['(4)', 'ok']]);
    expect(draft.diagramSet?.solved?.option).toBe(0);
    expect(keyCheckOf(draft)).toEqual({ state: 'ok' });
    expect(draft.checks.find((c) => c.id === 'shape')?.state).toBe('pass');
    expect(draft.checks.find((c) => c.id === 'key')?.state).toBe('pass');
  });

  it('goes into the paper as one figure grid (1)-(4), two to a row', async () => {
    const { draft } = await run(fixture('grid-proportional'));
    const q = materialize(studioBuilds([draft], 'G.tax')[0]) as McqQuestion;
    const grid = q.blocks.find((b) => b.kind === 'figureGrid');
    expect(grid?.kind === 'figureGrid' && grid.cells.map((c) => c.label.en[0].text)).toEqual(['(1)', '(2)', '(3)', '(4)']);
    expect(grid?.kind === 'figureGrid' && grid.cells.every((c) => c.figure.kind === 'diagram')).toBe(true);
    expect(q.options.every((o) => !o.blocks)).toBe(true);
  });

  it('says when the drawings give another key, and checks again after a hand edit', async () => {
    const f = fixture('grid-regressive');
    const { draft } = await run(f, [writeOf(f, { answer: 2 }), JSON.stringify(f.reply), JSON.stringify(f.reply), solveKey(f, 2)]);
    expect(keyCheckOf(draft)).toEqual({ state: 'differs', gives: 'A' });
    const block = draft.diagramSet!.figures[1].block!;
    const edited = applyEdit(draft, { rich: { stem: { en: [], zh: [] }, statements: [], options: [], explanation: { en: [], zh: [] } }, answerIndex: 2, figures: [{ at: '(2)', block: { ...block, widthPx: 200 } }] } as never, REQUEST, [], { glossary: null, corpus: null }, 'v2');
    expect(edited.diagramSet?.figures[1]).toMatchObject({ edited: true, block: { widthPx: 200 } });
    expect(edited.diagramSet?.figures[0].edited).toBeUndefined();
    expect(keyCheckOf(edited)).toEqual({ state: 'again' });
  });

  it('a grid numbered wrong is a format warning, rewritten once', () => {
    const f = fixture('grid-regressive');
    const bad = { figures: [{ at: '(1)', note: 'a' }, { at: '(3)', note: 'b' }] };
    return run(f, [writeOf(f, bad), writeOf(f), JSON.stringify(f.reply), solveKey(f)]).then(({ client, draft }) => {
      expect(String(payload(client.requests[1]).redo ? JSON.stringify(payload(client.requests[1]).redo) : '')).toMatch(/2 to 4 cells numbered/);
      expect(draft.figureSet).toHaveLength(4);
    });
  });
});

describe('a diagram under every option (like HKDSE 2024 Q11, Q29)', () => {
  for (const id of ['options-labour', 'options-adas']) {
    it(`${id}: empty option words pass the format, the diagrams go under A–D, two to a row`, async () => {
      const f = fixture(id);
      const { client, draft } = await run(f);
      expect(client.requests).toHaveLength(3);
      expect(draft.checks.find((c) => c.id === 'shape')?.findings).toEqual([]);
      const item = (payload(client.requests[2]).questions as Array<{ options: string[] }>)[0];
      expect(item.options.every((o) => o.startsWith('[its diagram] Axes:'))).toBe(true);
      const q = materialize(studioBuilds([draft], 'C.x')[0]) as McqQuestion;
      expect(q.optionLayout).toBe('columns2');
      expect(q.options.map((o) => o.blocks?.[0]?.kind)).toEqual(['diagram', 'diagram', 'diagram', 'diagram']);
      expect(q.blocks.some((b) => b.kind === 'figureGrid')).toBe(false);
    });
  }

  it('three option diagrams of four is a format warning', async () => {
    const f = fixture('options-labour');
    const three = { figures: f.question.figures.slice(0, 3) };
    const client = scriptedClient([writeOf(f, three), writeOf(f, three), JSON.stringify(f.reply), solveKey(f)]);
    const out = await writeDrafts({ ...REQUEST, count: 1 }, deps(client), { signal: ctl() });
    if (!out.ok) throw new Error('failed');
    expect(out.drafts[0].checks.find((c) => c.id === 'shape')?.findings.map((x) => x.params?.problem)).toContain('optionsAll');
  });
});

describe('follow-ups on a draft with several figures', () => {
  it('Harder redraws them in one request from the old ones; a change of the words only keeps them, no diagram request', async () => {
    const f = fixture('options-labour');
    const { draft } = await run(f);
    const harder = scriptedClient([writeOf(f), JSON.stringify(f.reply), solveKey(f)]);
    const out = await refine(REQUEST, draft, { kind: 'harder' }, [], deps(harder), { signal: ctl() });
    expect(out.ok).toBe(true);
    const sent = payload(harder.requests[1]);
    expect(sent.task).toBe('diagram-set');
    expect((sent.previous as Array<{ at: string }>).map((p) => p.at)).toEqual(['A', 'B', 'C', 'D']);

    const words = scriptedClient([writeOf(f, { figures: [] }), solveKey(f)]);
    const kept = await refine(REQUEST, draft as StudioDraft, { kind: 'change', text: 'shorter stem', parts: ['stem'] } as never, [], deps(words), { signal: ctl() });
    if (!kept.ok) throw new Error('failed');
    expect(words.requests.map((r) => payload(r).task ?? 'write')).not.toContain('diagram-set');
    expect(kept.drafts[0].diagramSet).toBe(draft.diagramSet);
  });
});

describe('a question told in its diagrams and the near-copy check', () => {
  it('shared formula words are a note to compare the diagrams, not a red warning, and ask for no rewrite', async () => {
    const f = fixture('grid-regressive');
    const corpus = buildCorpusIndex([
      {
        id: 'past',
        kind: 'paper',
        en: 'Which of the following diagrams describe a progressive tax? (1) and (2) only (1) and (3) only (2) and (4) only (3) and (4) only',
        zh: '下列哪些圖描繪累進稅？ 只有 (1)、(2) 只有 (1)、(3) 只有 (2)、(4) 只有 (3)、(4)',
      },
    ]);
    const client = scriptedClient([writeOf(f), JSON.stringify(f.reply), solveKey(f)]);
    const out = await writeDrafts({ ...REQUEST, count: 1 }, { ...deps(client), corpus }, { signal: ctl() });
    if (!out.ok) throw new Error('failed');
    expect(client.requests).toHaveLength(3);
    const copy = out.drafts[0].checks.find((c) => c.id === 'copy');
    expect(copy?.state).toBe('look');
    expect(copy?.findings[0].id).toBe('copy.wordsOnly');
  });
});
