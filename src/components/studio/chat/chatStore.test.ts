import { describe, expect, it } from 'vitest';
import { aiErrorInfo } from '@/ai/errors';
import { presetFor } from '@/ai/providers';
import { EXAMPLE, okOutcome, studioDraft, usageOf } from '@/questionStudio/fixtures';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import type { StudioEnv } from '@/questionStudio/session';
import type { Refinement, StudioDraft, StudioOutcome, StudioRequest } from '@/questionStudio/types';
import { CHATS_KEY, localChatStorage, readChat } from './chatStorage';
import { createChatStore } from './chatStore';
import type { AiTurn, Chat } from './chatTypes';
import type { PickInput, StudioEngine, WriteHooks } from './engine';
import { computerPick } from './engine';
import { localPick } from './localPick';

const preset = presetFor('gemini');

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

interface Calls {
  picks: PickInput[];
  writes: StudioRequest[];
  refines: Array<{ refinement: Refinement; target: StudioDraft }>;
}

function setup(over: { write?: (request: StudioRequest, hooks: WriteHooks) => Promise<StudioOutcome>; references?: StudioEnv['references'] } = {}) {
  const calls: Calls = { picks: [], writes: [], refines: [] };
  let n = 0;
  const engine: StudioEngine = {
    pick: async (input) => {
      calls.picks.push(input);
      return computerPick(input);
    },
    write: async (request, _deps, hooks) => {
      calls.writes.push(request);
      if (over.write) return over.write(request, hooks);
      return okOutcome(Array.from({ length: request.count }, () => studioDraft(`d${++n}`)));
    },
    refine: async (_request, target, refinement) => {
      calls.refines.push({ refinement, target });
      return okOutcome([studioDraft(`r${++n}`)]);
    },
  };
  const env: StudioEnv = {
    resolve: async () => ({ ok: true, deps: { client: {} as never, preset, glossary: null, corpus: EMPTY_CORPUS }, compared: { past: 10, mine: 0 } }),
    references: over.references ?? (async () => []),
  };
  const store = memory();
  const runs: string[] = [];
  const useChat = createChatStore({ env, engine, storage: localChatStorage(store), language: () => 'en', onRun: (info) => runs.push(info.kind) });
  const chat = () => useChat.getState().chats.find((c) => c.id === useChat.getState().activeId) as Chat;
  const lastAi = () => [...chat().turns].reverse().find((t): t is AiTurn => t.role === 'ai') as AiTurn;
  return { useChat, chat, lastAi, calls, store, runs };
}

describe('the chat studio store (k-0516)', () => {
  it('a reference alone: reads it, the pick comes from its tag, writes on it, no topic asked', async () => {
    const { useChat, chat, lastAi, calls, runs } = setup();
    expect(useChat.getState().addReference(EXAMPLE, 'C.ped')).toBe(true);
    await useChat.getState().send('');
    expect(calls.picks[0].examples[0].id).toBe(EXAMPLE.id);
    expect(calls.writes[0].keyPoint).toBe('C.ped');
    expect(calls.writes[0].examples).toHaveLength(1);
    expect(calls.writes[0].strict).toBe(true);
    const steps = lastAi().steps.map((s) => `${s.kind}:${s.state}`);
    expect(steps).toEqual(['read:done', 'pick:done', 'write:done', 'check:done']);
    expect(chat().drafts.map((d) => d.no)).toEqual([1, 2, 3]);
    expect(lastAi().notes[0]).toMatchObject({ kind: 'written', ok: 3 });
    expect(lastAi().draftIds).toHaveLength(3);
    expect(runs).toEqual(['write']);
    expect(useChat.getState().run).toBeUndefined();
  });

  it('a typed request: the key point is picked from the words, and real questions are found to write like', async () => {
    const { useChat, chat, lastAi, calls } = setup({ references: async () => [{ ...EXAMPLE, id: 'auto1', label: 'DSE2019/P1/Q15', auto: true }] });
    await useChat.getState().send('3 MC on price elasticity of demand with numbers');
    expect(calls.writes[0].keyPoint).toBe('C.ped');
    const pick = lastAi().steps.find((s) => s.kind === 'pick');
    expect(pick).toMatchObject({ state: 'done', by: 'computer' });
    expect(lastAi().steps.find((s) => s.kind === 'refs')).toMatchObject({ labels: ['DSE2019/P1/Q15'] });
    expect(chat().refs).toEqual([expect.objectContaining({ who: 'ai' })]);
    expect(calls.writes[0].note).toContain('price elasticity');
  });

  it('streams: partial drafts land in the run while it writes', async () => {
    let seen = 0;
    const { useChat } = setup({
      write: async (request, hooks) => {
        hooks.onEvent?.({ type: 'text', index: 0, attempt: 1, draft: { index: 0, stem: { en: 'The price of', zh: '' }, statements: [], options: [], explanation: { en: '', zh: '' }, angle: '', complete: false } });
        seen = useChat.getState().run?.live.drafts.length ?? 0;
        return okOutcome([studioDraft('s1')]);
      },
    });
    useChat.getState().addReference(EXAMPLE, 'C.ped');
    await useChat.getState().send('');
    expect(seen).toBe(1);
  });

  it('"make draft 2 harder" changes that draft; v1 is kept and can come back', async () => {
    const { useChat, chat, calls, lastAi } = setup();
    useChat.getState().addReference(EXAMPLE, 'C.ped');
    await useChat.getState().send('');
    const before = chat().drafts[1].entry.draft.id;
    await useChat.getState().send('Make draft 2 harder');
    expect(calls.refines[0].refinement).toEqual({ kind: 'harder' });
    const d2 = chat().drafts[1];
    expect(d2.no).toBe(2);
    expect(d2.older.map((d) => d.id)).toEqual([before]);
    expect(lastAi().notes).toContainEqual({ kind: 'changed', draftNo: 2, version: 2 });
    // A change stays on the draft's own key point, and nothing is left spinning.
    expect(lastAi().steps.find((s) => s.kind === 'pick')).toMatchObject({ by: 'draft', picks: [{ code: 'C.ped' }] });
    expect(lastAi().steps.every((s) => s.state === 'done')).toBe(true);
    expect(lastAi().steps.some((s) => s.kind === 'write')).toBe(false);
    useChat.getState().restoreVersion(d2.id, 0);
    expect(chat().drafts[1].entry.draft.id).toBe(before);
  });

  it('a message about a draft (Ask about this) is a change in words; Another adds a draft after it', async () => {
    const { useChat, chat, calls } = setup();
    useChat.getState().addReference(EXAMPLE, 'C.ped');
    await useChat.getState().send('');
    const d1 = chat().drafts[0];
    await useChat.getState().send('use property prices', d1.id);
    expect(calls.refines[0].refinement).toEqual({ kind: 'change', text: 'use property prices' });
    await useChat.getState().change(d1.id, 'another');
    expect(chat().drafts.map((d) => d.no)).toEqual([1, 4, 2, 3]);
  });

  it('changing the pick asks before rewriting; Rewrite replaces the open drafts, Keep keeps them', async () => {
    const { useChat, chat, lastAi, calls } = setup();
    useChat.getState().addReference(EXAMPLE, 'C.ped');
    await useChat.getState().send('');
    useChat.getState().setDraftState(chat().drafts[0].id, 'accepted');
    useChat.getState().changePick('C.pes');
    const ask = lastAi();
    expect(ask.ask).toEqual({ kind: 'rewrite', code: 'C.pes' });
    await useChat.getState().answerRewrite(ask.id, 'rewrite');
    expect(calls.writes[1].keyPoint).toBe('C.pes');
    // The accepted draft stays; the two open ones gave way to three new ones.
    expect(chat().drafts.filter((d) => d.state === 'accepted')).toHaveLength(1);
    expect(chat().drafts).toHaveLength(4);
    useChat.getState().changePick('C.ped');
    await useChat.getState().answerRewrite(lastAi().id, 'keep');
    expect(calls.writes).toHaveLength(2);
  });

  it('accept, reject, added: what the tray reads', async () => {
    const { useChat, chat } = setup();
    useChat.getState().addReference(EXAMPLE, 'C.ped');
    await useChat.getState().send('');
    const [a, b] = chat().drafts;
    useChat.getState().setDraftState(a.id, 'accepted');
    useChat.getState().setDraftState(b.id, 'rejected');
    useChat.getState().delivered([a.id]);
    expect(chat().drafts.map((d) => d.state)).toEqual(['added', 'rejected', 'open']);
    // An added draft cannot be ticked again.
    useChat.getState().setDraftState(a.id, 'open');
    expect(chat().drafts[0].state).toBe('added');
  });

  it('an error lands on the reply, and Try again runs the request again', async () => {
    let fail = true;
    const { useChat, lastAi, calls } = setup({
      write: async () => (fail ? { ok: false, error: aiErrorInfo('timeout', 'gemini'), usage: usageOf() } : okOutcome([studioDraft('ok1')])),
    });
    useChat.getState().addReference(EXAMPLE, 'C.ped');
    await useChat.getState().send('');
    expect(lastAi().error?.kind).toBe('timeout');
    fail = false;
    await useChat.getState().retry(lastAi().id);
    expect(calls.writes).toHaveLength(2);
    expect(lastAi().error).toBeUndefined();
    expect(useChat.getState().chats[0].turns.filter((t) => t.role === 'user')).toHaveLength(1);
  });

  it('Stop keeps nothing from the request and says so', async () => {
    const { useChat, lastAi } = setup({
      write: (_request, hooks) =>
        new Promise((resolve) => hooks.signal.addEventListener('abort', () => resolve({ ok: false, error: aiErrorInfo('cancelled', 'gemini'), usage: usageOf() }))),
    });
    useChat.getState().addReference(EXAMPLE, 'C.ped');
    const done = useChat.getState().send('');
    await new Promise((r) => setTimeout(r, 0));
    useChat.getState().stop();
    await done;
    expect(lastAi().notes).toContainEqual({ kind: 'stopped' });
    expect(useChat.getState().chats[0].drafts).toHaveLength(0);
  });

  it('chats are kept on this computer: saved, read back, a damaged one skipped, pictures never saved', async () => {
    const { useChat, store } = setup();
    useChat.getState().addReference({ ...EXAMPLE, figures: [{ dataUrl: 'data:image/png;base64,AAAA' }] } as never, 'C.ped');
    await useChat.getState().send('');
    const raw = JSON.parse(store.data.get(CHATS_KEY) as string) as unknown[];
    expect(raw).toHaveLength(1);
    expect(JSON.stringify(raw)).not.toContain('data:image');
    store.setItem(CHATS_KEY, JSON.stringify([{ broken: true }, ...raw]));
    const loaded = localChatStorage(store).load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].drafts).toHaveLength(3);
    expect(readChat({ ...(raw[0] as object), drafts: [{ id: 'x' }] })?.drafts).toEqual([]);
  });

  it('New chat reuses an empty one, and opening a saved chat brings back its drafts', async () => {
    const { useChat, chat } = setup();
    useChat.getState().newChat();
    expect(useChat.getState().chats).toHaveLength(1);
    useChat.getState().addReference(EXAMPLE, 'C.ped');
    await useChat.getState().send('');
    const first = chat().id;
    useChat.getState().newChat();
    expect(chat().id).not.toBe(first);
    useChat.getState().openChat(first);
    expect(chat().drafts).toHaveLength(3);
  });
});

describe('the computer\'s own key-point pick (until the AI pick lands)', () => {
  it('reads typed words, abbreviations and 中文, and a reference\'s tag', () => {
    expect(localPick({ text: 'questions on unit tax with a diagram', examples: [] })[0].code).toBe('C.intervention');
    expect(localPick({ text: 'PED with numbers', examples: [] })[0].code).toBe('C.ped');
    expect(localPick({ text: '需求價格彈性', examples: [] })[0].code).toBe('C.ped');
    expect(localPick({ text: '', examples: [EXAMPLE], tagged: { [EXAMPLE.id]: 'C.pes' } })).toEqual([{ code: 'C.pes', reason: '', basis: { kind: 'tag', label: EXAMPLE.label } }]);
    expect(localPick({ text: 'hello', examples: [] })).toEqual([]);
  });
});

describe('paper chats: the editor ✦ Write panel (k-0516 B)', () => {
  it('openPaper starts a chat for the paper, keeps it, and comes back to it after another paper', async () => {
    const { useChat, chat, store } = setup();
    useChat.getState().openPaper('paper-1');
    expect(chat().paper).toBe('paper-1');
    await useChat.getState().send('Write 3 MC questions on price elasticity of demand');
    const first = chat().id;
    useChat.getState().openPaper('paper-2');
    expect(chat().paper).toBe('paper-2');
    expect(chat().id).not.toBe(first);
    useChat.getState().openPaper('paper-1');
    expect(chat().id).toBe(first);
    // A new chat from the panel stays the paper's; the paper survives a reload.
    useChat.getState().newChat();
    expect(chat().paper).toBe('paper-1');
    const saved = JSON.parse(store.data.get(CHATS_KEY) ?? '[]') as unknown[];
    expect(saved.map(readChat).find((c) => c?.id === first)?.paper).toBe('paper-1');
  });

  it('undelivered brings an added draft back to open', async () => {
    const { useChat, chat } = setup();
    useChat.getState().openPaper('paper-1');
    await useChat.getState().send('Write 3 MC questions on price elasticity of demand');
    const [a, b] = chat().drafts;
    useChat.getState().delivered([a.id, b.id]);
    expect(chat().drafts.map((d) => d.state)).toEqual(['added', 'added', 'open']);
    useChat.getState().undelivered([a.id]);
    expect(chat().drafts.map((d) => d.state)).toEqual(['open', 'added', 'open']);
  });

  it('a second storage key keeps the panel’s chats apart from the studio’s', () => {
    const store = memory();
    localChatStorage(store, 'econgen.paperChats.v1').save([{ ...readChat({ v: 1, id: 'x', createdAt: 'a', updatedAt: 'a', refs: [], turns: [{ id: 't', role: 'user', text: 'hi', refs: [] }], drafts: [], settings: {} })!, paper: 'p' }]);
    expect(store.data.has('econgen.paperChats.v1')).toBe(true);
    expect(store.data.has(CHATS_KEY)).toBe(false);
    expect(localChatStorage(store, 'econgen.paperChats.v1').load()[0].paper).toBe('p');
  });
});

describe('engine k-0520 in the chat', () => {
  it('a follow-up sends the chat’s key point to the pick', async () => {
    const { useChat, calls } = setup();
    await useChat.getState().send('Write 3 MC questions on price elasticity of demand');
    expect(calls.picks[0].current).toBeUndefined();
    await useChat.getState().send('the same in Chinese');
    expect(calls.picks[1].current?.[0]).toBe(calls.writes[0].keyPoint);
  });
});
