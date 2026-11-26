import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { EXAMPLE, okOutcome, studioDraft } from '@/questionStudio/fixtures';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import type { StudioEnv } from '@/questionStudio/session';
import type { Refinement, StudioDraft, StudioRequest } from '@/questionStudio/types';
import type { TurnRead } from '@/questionStudio/understand';
import { localChatStorage } from './chatStorage';
import { createChatStore } from './chatStore';
import type { AiTurn, Chat } from './chatTypes';
import { computerPick, type PickInput, type StudioEngine } from './engine';
import type { StudioReadInput, StudioRoute } from '@/questionStudio/jevRead';

/** k-0535: once drafts exist, the store acts on what the message means, never adding a card for an edit. */

const preset = presetFor('gemini');

function setup(read?: (input: PickInput) => TurnRead | undefined) {
  const calls = { picks: [] as PickInput[], writes: [] as StudioRequest[], refines: [] as Array<{ refinement: Refinement; target: StudioDraft }> };
  const runCounts: number[] = [];
  let n = 0;
  const engine: StudioEngine = {
    pick: async (input) => {
      calls.picks.push(input);
      const base = await computerPick(input);
      const turn = input.drafts ? read?.(input) : undefined;
      return base.ok && turn ? { ...base, ...(turn.intent === 'new' ? {} : { picks: [] }), turn } : base;
    },
    write: async (request) => {
      calls.writes.push(request);
      return okOutcome(Array.from({ length: request.count }, () => studioDraft(`d${++n}`)));
    },
    refine: async (_request, target, refinement) => {
      calls.refines.push({ refinement, target });
      return okOutcome([studioDraft(`r${++n}`)]);
    },
  };
  const env: StudioEnv = {
    resolve: async () => ({ ok: true, deps: { client: {} as never, preset, glossary: null, corpus: EMPTY_CORPUS }, compared: { past: 10, mine: 0 } }),
    references: async () => [],
  };
  const data = new Map<string, string>();
  const useChat = createChatStore({ env, engine, storage: localChatStorage({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }), language: () => 'en', initialSettings: { count: 3 } });
  useChat.subscribe((s) => s.run && runCounts.push(s.run.count));
  const chat = () => useChat.getState().chats.find((c) => c.id === useChat.getState().activeId) as Chat;
  const lastAi = () => [...chat().turns].reverse().find((t): t is AiTurn => t.role === 'ai') as AiTurn;
  return { useChat, chat, lastAi, calls, runCounts, engine };
}

const ai = (o: Partial<TurnRead>): TurnRead => ({ intent: 'edit', drafts: [], how: 'change', parts: [], reply: '', ...o });

async function withThree(read?: Parameters<typeof setup>[0]) {
  const t = setup(read);
  t.useChat.getState().addReference(EXAMPLE, 'C.ped');
  await t.useChat.getState().send('');
  expect(t.chat().drafts.map((d) => d.no)).toEqual([1, 2, 3]);
  t.calls.picks.length = 0;
  t.calls.writes.length = 0;
  t.runCounts.length = 0;
  return t;
}

describe('the chat acts on what a message means (k-0535)', () => {
  it('clear words ("Q2 太易"): no reading request, draft 2 gets a new version, no new card', async () => {
    const { useChat, chat, calls } = await withThree();
    await useChat.getState().send('Q2 太易');
    expect(calls.picks).toHaveLength(0);
    expect(calls.writes).toHaveLength(0);
    expect(calls.refines).toEqual([expect.objectContaining({ refinement: { kind: 'harder' } })]);
    expect(chat().drafts).toHaveLength(3);
    expect(chat().drafts[1].older).toHaveLength(1);
    // Undo: back to the old version.
    useChat.getState().restoreVersion(chat().drafts[1].id, 0);
    expect(chat().drafts[1].entry.draft.id).toBe('d2');
  });

  it('other words: the AI reads them in the pick request, the edit runs, nothing new is drawn meanwhile', async () => {
    const { useChat, chat, calls, lastAi, runCounts } = await withThree(() => ai({ intent: 'edit', drafts: [2], parts: ['stem'] }));
    await useChat.getState().send('the second one is too wordy');
    expect(calls.picks).toHaveLength(1);
    expect(calls.picks[0].drafts).toHaveLength(3);
    expect(calls.picks[0].picks).toBe(true);
    expect(calls.writes).toHaveLength(0);
    expect(calls.refines[0]).toMatchObject({ refinement: { kind: 'change', text: 'the second one is too wordy', parts: ['stem'] }, target: { id: 'd2' } });
    expect(chat().drafts).toHaveLength(3);
    expect(runCounts.every((c) => c <= 1)).toBe(true);
    expect(lastAi().steps.find((s) => s.kind === 'understand')).toMatchObject({ state: 'done', intent: 'edit', drafts: [2], by: 'ai' });
    expect(lastAi().notes).toEqual([{ kind: 'changed', draftNo: 2, version: 2 }]);
  });

  it('several drafts in one reply, each its own new version', async () => {
    const { useChat, chat, calls, lastAi } = await withThree();
    await useChat.getState().send('make them all easier');
    expect(calls.refines.map((r) => r.target.id)).toEqual(['d1', 'd2', 'd3']);
    expect(chat().drafts).toHaveLength(3);
    expect(lastAi().notes.map((x) => x.kind)).toEqual(['changed', 'changed', 'changed']);
    expect(chat().turns.filter((t) => t.role === 'user').at(-1)).toMatchObject({ draftNos: [1, 2, 3] });
  });

  it('unsure: asks which draft (buttons), costs nothing more until the teacher answers', async () => {
    const { useChat, calls, lastAi } = await withThree(() => ai({ intent: 'unsure', drafts: [1, 2, 3], how: 'harder' }));
    await useChat.getState().send('make it harder');
    expect(calls.refines).toHaveLength(0);
    expect(calls.writes).toHaveLength(0);
    const asked = lastAi();
    expect(asked.ask).toMatchObject({ kind: 'which', options: [1, 2, 3], wanted: 'edit', how: 'harder' });
    await useChat.getState().answerWhich(asked.id, 3);
    expect(calls.refines).toEqual([expect.objectContaining({ refinement: { kind: 'harder' }, target: expect.objectContaining({ id: 'd3' }) })]);
    // Answered once: a second tap does nothing.
    await useChat.getState().answerWhich(asked.id, 1);
    expect(calls.refines).toHaveLength(1);
  });

  it('unsure → "Write new ones" writes new drafts with the words', async () => {
    const { useChat, chat, calls, lastAi } = await withThree(() => ai({ intent: 'unsure', drafts: [1, 2, 3] }));
    await useChat.getState().send('make it harder');
    await useChat.getState().answerWhich(lastAi().id, 'new');
    expect(calls.writes[0].note).toBe('make it harder');
    expect(chat().drafts).toHaveLength(6);
  });

  it('a question about a draft: answered in the chat, no rewrite, a small request (no syllabus)', async () => {
    const { useChat, chat, calls, lastAi } = await withThree(() => ai({ intent: 'ask', drafts: [1], reply: 'B is the key: PED is about 0.5.' }));
    await useChat.getState().send('why is B wrong in draft 1?');
    expect(calls.picks[0]).toMatchObject({ target: 1, picks: false, examples: [] });
    expect(calls.refines).toHaveLength(0);
    expect(lastAi().notes).toEqual([{ kind: 'reply', text: 'B is the key: PED is about 0.5.', draftNo: 1 }]);
    expect(lastAi().draftIds).toEqual([chat().drafts[0].id]);
  });

  it('the chip: words go to that draft at once; a question about it is answered', async () => {
    const { useChat, chat, calls, lastAi } = await withThree(() => ai({ intent: 'ask', drafts: [3], reply: 'Statement (2) is wrong: the burden is shared.' }));
    const d3 = chat().drafts[2];
    await useChat.getState().send('use property prices', d3.id);
    expect(calls.picks).toHaveLength(0);
    expect(calls.refines[0].target.id).toBe('d3');
    await useChat.getState().send('why is (2) wrong?', d3.id);
    expect(calls.picks[0]).toMatchObject({ target: 3, picks: false });
    expect(lastAi().notes[0]).toMatchObject({ kind: 'reply' });
  });

  it('the AI says new: new drafts are written with its picks', async () => {
    const { useChat, chat, calls } = await withThree(() => ai({ intent: 'new' }));
    await useChat.getState().send('write 3 more on price ceilings');
    expect(calls.writes).toHaveLength(1);
    expect(chat().drafts).toHaveLength(6);
  });

  it('no AI read (a provider that only picks): an unclear edit asks which, never writes new ones', async () => {
    const { useChat, calls, lastAi } = await withThree(() => undefined);
    await useChat.getState().send('make it harder');
    expect(calls.writes).toHaveLength(0);
    expect(lastAi().ask).toMatchObject({ kind: 'which' });
  });

  it('the guessed chip taken away (asNew): new drafts, no reading', async () => {
    const { useChat, chat, calls } = await withThree();
    await useChat.getState().send('Q2 太易', undefined, { asNew: true });
    expect(calls.refines).toHaveLength(0);
    expect(calls.picks[0].drafts).toBeUndefined();
    expect(chat().drafts).toHaveLength(6);
  });

  it('"another like draft 2" adds one card right after it', async () => {
    const { useChat, chat } = await withThree();
    await useChat.getState().send('another like draft 2');
    expect(chat().drafts.map((d) => d.no)).toEqual([1, 2, 4, 3]);
  });
});

describe('the Jev pre-router (k-0567, u-5sy9)', () => {
  async function withRouter(route: StudioRoute | undefined, read?: Parameters<typeof setup>[0]) {
    const t = await withThree(read);
    const seen: StudioReadInput[] = [];
    (t.engine as StudioEngine).read = async (input) => {
      seen.push(input);
      return route;
    };
    return { ...t, seen };
  }

  it('an edit Jev is sure of runs at once: no main-model read', async () => {
    const { useChat, calls, seen, lastAi } = await withRouter({ route: 'act', kind: 'edit', drafts: [2], wanted: 'edit', parts: ['stem'] });
    await useChat.getState().send('the second one is too wordy');
    expect(seen).toHaveLength(1);
    expect(seen[0].drafts).toHaveLength(3);
    expect(calls.picks).toHaveLength(0);
    expect(calls.refines).toEqual([expect.objectContaining({ refinement: { kind: 'change', text: 'the second one is too wordy', parts: ['stem'] } })]);
    expect(lastAi().steps.find((s) => s.kind === 'understand')).toMatchObject({ state: 'done', intent: 'edit', drafts: [2], by: 'ai' });
  });

  it('unclear: "Which draft do you mean?" straight away, with Jev\'s candidates', async () => {
    const { useChat, calls, lastAi } = await withRouter({ route: 'act', kind: 'unsure', drafts: [2, 3], wanted: 'edit' });
    await useChat.getState().send('the numbers look off');
    expect(calls.picks).toHaveLength(0);
    expect(calls.refines).toHaveLength(0);
    expect(lastAi().ask).toMatchObject({ kind: 'which', wanted: 'edit', options: [2, 3] });
  });

  it('one more like a draft: written beside it; harder/easier falls back to the computer\'s words when Jev isn\'t sure', async () => {
    const t = await withRouter({ route: 'act', kind: 'another', drafts: [1], wanted: 'another' });
    await t.useChat.getState().send('one similar to the first, please');
    expect(t.calls.picks).toHaveLength(0);
    expect(t.calls.refines).toEqual([expect.objectContaining({ refinement: { kind: 'another' } })]);
    const u = await withRouter({ route: 'act', kind: 'edit', drafts: [1, 2, 3], wanted: 'edit' });
    await u.useChat.getState().send('全部改易啲');
    expect(u.calls.refines.map((r) => r.refinement)).toEqual([{ kind: 'easier' }, { kind: 'easier' }, { kind: 'easier' }]);
  });

  it('new, ask, any doubt or no answer: today\'s main-model read, as before', async () => {
    for (const route of [{ route: 'main', why: 'new' } as const, { route: 'main', why: 'doubt' } as const, undefined]) {
      const { useChat, calls, seen } = await withRouter(route, () => ai({ intent: 'edit', drafts: [2], parts: ['stem'] }));
      await useChat.getState().send('the second one is too wordy');
      expect(seen).toHaveLength(1);
      expect(calls.picks).toHaveLength(1);
      expect(calls.refines).toHaveLength(1);
    }
  });

  it('not asked when the words already read as new questions: the main read runs straight away', async () => {
    const { useChat, calls, seen } = await withRouter({ route: 'act', kind: 'edit', drafts: [2], wanted: 'edit' });
    await useChat.getState().send('write 3 more on price ceilings');
    expect(seen).toHaveLength(0);
    expect(calls.picks).toHaveLength(1);
  });

  it('not asked when the computer is sure, or the draft is known (the chip)', async () => {
    const { useChat, chat, seen } = await withRouter({ route: 'act', kind: 'edit', drafts: [3], wanted: 'edit' });
    await useChat.getState().send('Q2 太易');
    await useChat.getState().send('why is B wrong?', chat().drafts[0].id);
    expect(seen).toHaveLength(0);
  });
});
