import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { AiError, type AiClient, type CompletionRequest } from '@/ai/types';
import { aiErrorInfo } from '@/ai/errors';
import { okOutcome, studioDraft } from '@/questionStudio/fixtures';
import { EMPTY_CORPUS } from '@/questionStudio/nearCopy';
import type { StudioEnv } from '@/questionStudio/session';
import { localChatStorage } from '../chat/chatStorage';
import { createChatStore } from '../chat/chatStore';
import type { Chat } from '../chat/chatTypes';
import { computerPick, type StudioEngine } from '../chat/engine';
import { reviewAvailable } from './available';
import { buildReviewFiles, HOW_TO_READ } from './exportFiles';
import { chatsFor, gather, zipReview } from './exportReview';
import { createNotesStore } from './notes';
import { createRecorder, PROMPT_REF_MIN } from './recorder';
import { lean, redactSecrets } from './redact';
import { createMemoryReviewStore } from './reviewStore';
import type { CallEvent } from './types';

const preset = presetFor('gemini');
const KEY = 'AIzaSyD-THIS-IS-A-FAKE-KEY-0123456789abc';
const SYSTEM = `You write HKDSE Economics multiple-choice questions. ${'Follow the syllabus. '.repeat(40)}`;
const PICTURE = `data:image/png;base64,${'iVBORw0KGgo'.repeat(200)}`;

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

/** A client holding a key the way a real one does (in its own closure), answering each call. */
function fakeClient(replies: string[] = []): AiClient & { seen: CompletionRequest[] } {
  const apiKey = KEY;
  const seen: CompletionRequest[] = [];
  let n = 0;
  return {
    seen,
    complete: async (req) => {
      seen.push(req);
      void apiKey;
      return { text: replies[n++] ?? '{"ok":true}', finish: 'stop', dialect: 'gemini-jsonSchema', model: 'gemini-test', ms: 5, usage: { input: 1000, output: 200 }, charged: 1.25, balance: 98.75 };
    },
    stream: async (req, onText) => {
      seen.push(req);
      onText('{"items":[');
      throw new AiError(aiErrorInfo('network', 'gemini'));
    },
    listModels: async () => [],
    decide: async () => ({ answers: { intent: { type: 'choice', choice: 'edit', confidence: 0.9, probabilities: { edit: 0.9 } } }, model: 'jev-1.14.0', fallback: false, ms: 200, charged: 0.07 }),
  };
}

/** An engine that asks the client like the real one: a pick call, then a write call with a picture. */
function engineUsing(): StudioEngine {
  const ask = (deps: { client: AiClient }, feature: CompletionRequest['feature'], user: string, images?: CompletionRequest['images']) =>
    deps.client.complete({ system: SYSTEM, turns: [{ role: 'user', content: user }], schema: { type: 'object', properties: { items: { type: 'array' } } }, maxOutputTokens: 4000, signal: new AbortController().signal, feature, requestKey: 'idem-123', ...(images ? { images } : {}) });
  return {
    pick: async (input, deps) => {
      await ask(deps, 'studio.pick', `Pick a key point for: ${input.text}`);
      return computerPick(input);
    },
    write: async (request, deps) => {
      await ask(deps, 'studio.write', `Write ${request.count} question(s) on ${request.keyPoint}. The key ${KEY} must never be kept.`, [{ dataUrl: PICTURE }]);
      return okOutcome([studioDraft('d1')]);
    },
    refine: async (_r, _t, _f, _o, deps) => {
      await ask(deps, 'studio.write', 'harder');
      return okOutcome([studioDraft('r1')]);
    },
  };
}

function setup(on = true) {
  const review = createMemoryReviewStore();
  let t = 1_000_000;
  const recorder = createRecorder({ store: review, on: () => on, now: () => (t += 10), delay: 1 });
  const client = fakeClient();
  const env: StudioEnv = {
    resolve: async () => ({ ok: true, deps: { client, preset, glossary: null, corpus: EMPTY_CORPUS }, compared: { past: 1, mine: 0 } }),
    references: async () => [],
  };
  const useChat = createChatStore({ env, engine: engineUsing(), storage: localChatStorage(memory()), language: () => 'en', trace: recorder });
  const chat = () => useChat.getState().chats.find((c) => c.id === useChat.getState().activeId) as Chat;
  return { review, recorder, client, useChat, chat };
}

describe('the review record (k-0598)', () => {
  it('keeps every AI call as sent, the raw reply, the decisions, the outcome; no key, no picture data', async () => {
    const { review, recorder, useChat, chat } = setup();
    await useChat.getState().send('2 MC on price elasticity of demand');
    await recorder.flush();
    const ai = chat().turns.find((x) => x.role === 'ai');
    const trace = review.turns.get(`${chat().id}:${ai?.id}`);
    expect(trace?.endedAt).toBeTruthy();
    const kinds = trace?.events.map((e) => (e.t === 'decision' ? `decision:${e.what}` : e.t === 'call' ? `call:${e.feature}` : e.t));
    expect(kinds).toEqual(['call:studio.pick', 'decision:pick', 'request', 'call:studio.write', 'outcome']);
    const calls = trace?.events.filter((e): e is CallEvent => e.t === 'call') ?? [];
    expect(calls[1]).toMatchObject({ provider: 'gemini', model: 'gemini-test', charged: 1.25, balance: 98.75, maxOutputTokens: 4000, usage: { input: 1000, output: 200 } });
    expect(calls[1].reply).toBe('{"ok":true}');
    expect(calls[1].turns[0].content).toContain('Write 1 question(s) on C.ped');
    // The same long system prompt, kept once and pointed to by both calls.
    expect(SYSTEM.length).toBeGreaterThan(PROMPT_REF_MIN);
    expect(calls[0].system).toEqual(calls[1].system);
    const ref = (calls[0].system as { prompt: string }).prompt;
    expect(review.texts.get(ref)).toBe(SYSTEM);
    expect(calls[1].pictures).toEqual([expect.objectContaining({ kb: expect.any(Number) })]);
    const all = JSON.stringify([...review.turns.values()]) + JSON.stringify([...review.texts.values()]);
    expect(all).not.toContain(KEY);
    expect(all).not.toContain('idem-123');
    expect(all).not.toContain('data:image');
    expect(all).toContain('[redacted]');
    const outcome = trace?.events.find((e) => e.t === 'outcome');
    expect(outcome).toMatchObject({ ok: true, drafts: [expect.objectContaining({ id: 'd1', status: 'ok', checks: expect.any(Array) })] });
  });

  it('records nothing and hands the engine the very same client when off (a release build, a browser)', async () => {
    const { review, recorder, useChat, client } = setup(false);
    await useChat.getState().send('2 MC on price elasticity of demand');
    await recorder.flush();
    expect(review.turns.size).toBe(0);
    expect(recorder.client('c', 't', client, 'gemini')).toBe(client);
  });

  it('a change of a draft: the read on this computer, the request with its refinement, the outcome', async () => {
    const { review, recorder, useChat, chat } = setup();
    await useChat.getState().send('2 MC on price elasticity of demand');
    await useChat.getState().change(chat().drafts[0].id, 'harder');
    await recorder.flush();
    const last = [...chat().turns].reverse().find((x) => x.role === 'ai');
    const events = review.turns.get(`${chat().id}:${last?.id}`)?.events ?? [];
    expect(events[0]).toMatchObject({ t: 'decision', what: 'localRead', value: { refinement: { kind: 'harder' } } });
    expect(events.find((e) => e.t === 'request')).toMatchObject({ kind: 'refine', target: { no: 1 }, refinement: { kind: 'harder' } });
  });

  it('a failed stream keeps what arrived and the error; Jev reads are kept with their answers', async () => {
    const review = createMemoryReviewStore();
    const recorder = createRecorder({ store: review, on: () => true, delay: 1 });
    const client = recorder.client('c1', 't1', fakeClient(), 'mentor');
    await expect(client.stream?.({ system: 's', turns: [{ role: 'user', content: 'u' }], schema: {}, maxOutputTokens: 10, signal: new AbortController().signal }, () => undefined)).rejects.toThrow();
    await client.decide?.({ feature: 'studio.read', state: { text: 'make 2 harder' }, questions: { intent: { type: 'choice', instructions: 'x' } }, signal: new AbortController().signal });
    recorder.end('c1', 't1');
    await recorder.flush();
    const events = review.turns.get('c1:t1')?.events ?? [];
    expect(events[0]).toMatchObject({ t: 'call', mode: 'stream', reply: '{"items":[', error: { kind: 'network' } });
    expect(events[1]).toMatchObject({ t: 'decide', feature: 'studio.read', model: 'jev-1.14.0', charged: 0.07, state: { text: 'make 2 harder' } });
  });

  it('a deleted chat takes its records and notes with it', async () => {
    const { review, recorder, useChat, chat } = setup();
    await useChat.getState().send('2 MC on price elasticity of demand');
    await recorder.flush();
    const id = chat().id;
    await review.putNotes({ chatId: id, chat: 'mine', turns: {} });
    useChat.getState().deleteChat(id);
    await new Promise((r) => setTimeout(r, 5));
    expect([...review.turns.values()].some((t) => t.chatId === id)).toBe(false);
    expect(review.notes.has(id)).toBe(false);
  });

  it('scrubs keys and token-shaped text, and drops secret-named fields', () => {
    expect(redactSecrets(`key ${KEY} and sk-ant-api03-abcdefghijklmnop1234 and Bearer abc.def.ghi123`)).toBe('key [redacted] and [redacted] and [redacted]');
    expect(redactSecrets('https://x.test/v1?key=SECRET123&alt=sse')).toBe('https://x.test/v1?key=[redacted]&alt=sse');
    expect(lean({ apiKey: 'x', token: 'y', nested: { authorization: 'z', ok: 1 }, pic: PICTURE })).toEqual({ nested: { ok: 1 }, pic: expect.stringMatching(/^\[picture [0-9a-z-]+, \d+ KB\]$/) });
  });

  it('shows only in a develop build, on the desktop (or a browser asked for it); never in a release build', () => {
    expect(reviewAvailable(true, true, () => true)).toBe(false);
    expect(reviewAvailable(false, true, () => false)).toBe(true);
    expect(reviewAvailable(false, false, () => false)).toBe(false);
    expect(reviewAvailable(false, false, () => true)).toBe(true);
  });
});

describe('the notes (k-0598)', () => {
  it('a note and a tag per reply, one on the chat, written to the store; a tag pressed again goes', async () => {
    const review = createMemoryReviewStore();
    const notes = createNotesStore(() => review, () => new Date('2026-11-28T10:00:00Z'), 1);
    notes.getState().setTurn('c1', 't1', { text: 'Wanted numbers in the stem' });
    notes.getState().setTurn('c1', 't1', { tag: 'wrong' });
    notes.getState().setTurn('c1', 't2', { tag: 'good' });
    notes.getState().setTurn('c1', 't2', { tag: null });
    notes.getState().setChat('c1', 'Trying elasticity with a diagram');
    await notes.getState().flush();
    expect(review.notes.get('c1')).toEqual({ chatId: 'c1', chat: 'Trying elasticity with a diagram', turns: { t1: { text: 'Wanted numbers in the stem', tag: 'wrong', at: '2026-11-28T10:00:00.000Z' } } });
    const again = createNotesStore(() => review);
    await again.getState().load('c1');
    expect(again.getState().byChat.c1.turns.t1.tag).toBe('wrong');
  });
});

describe('Export for review (k-0598)', () => {
  it('a conversation.md per chat with the note under its reply, raw.json, prompts once, HOW-TO-READ; an old chat says it has no record', async () => {
    const { review, recorder, useChat, chat } = setup();
    await useChat.getState().send('2 MC on price elasticity of demand');
    await recorder.flush();
    const live = chat();
    const ai = live.turns.find((x) => x.role === 'ai');
    await review.putNotes({ chatId: live.id, chat: 'The whole chat: elasticity', turns: { [ai?.id ?? '']: { text: 'Too easy, wanted a diagram', tag: 'wrong', at: 'now' } } });
    const old: Chat = { ...live, id: 'old-chat', updatedAt: '2026-01-01T00:00:00Z', turns: [{ id: 'u-old', role: 'user', text: 'An old request', refs: [] }, { id: 'a-old', role: 'ai', steps: [{ kind: 'write', state: 'done', count: 1 }], notes: [{ kind: 'written', ok: 1, look: 0, failed: 0 }], draftIds: [] }], drafts: [] };
    const built = await gather(
      [
        { chat: live, list: 'studio' },
        { chat: old, list: 'panel' },
      ],
      review,
      new Date('2026-11-28T10:00:00Z'),
      '0.10.1',
    );
    expect(built).toMatchObject({ chats: 2, replies: 2, recorded: 1, notes: 2 });
    const paths = [...built.files.keys()].sort();
    expect(paths).toEqual(expect.arrayContaining(['HOW-TO-READ.md', 'index.md', 'chats/01-2-mc-on-price-elasticity-of-demand/conversation.md', 'chats/01-2-mc-on-price-elasticity-of-demand/raw.json', 'chats/02-an-old-request/conversation.md']));
    expect(paths.filter((p) => p.startsWith('prompts/'))).toHaveLength(1); // the system prompt, once (the short schema stays inline)
    const md = built.files.get('chats/01-2-mc-on-price-elasticity-of-demand/conversation.md') ?? '';
    expect(md).toContain('> The whole chat: elasticity');
    // The note sits under the reply, before the behind-the-scenes section.
    expect(md.indexOf('> Too easy, wanted a diagram')).toBeLessThan(md.indexOf('<summary>Behind the scenes'));
    expect(md).toContain('tagged **wrong**');
    expect(md).toMatch(/#### Call 2: studio\.write · gemini · gemini-test/);
    expect(md).toContain('2.5 credits');
    expect(md).toContain('see prompts/p-');
    expect(built.files.get('chats/02-an-old-request/conversation.md')).toContain('No behind-the-scenes record');
    const raw = JSON.parse(built.files.get('chats/01-2-mc-on-price-elasticity-of-demand/raw.json') ?? '{}');
    expect(raw).toMatchObject({ format: 'econ-studio-review/1', version: '0.10.1', list: 'studio', notes: { chat: 'The whole chat: elasticity' } });
    expect(Object.keys(raw.traces)).toEqual([ai?.id]);
    expect(JSON.parse(built.files.get('chats/02-an-old-request/raw.json') ?? '{}').recorded).toBe('no behind-the-scenes record');
    expect(built.files.get('HOW-TO-READ.md')).toBe(HOW_TO_READ);
    const everything = [...built.files.values()].join('\n');
    expect(everything).not.toContain(KEY);
    expect(everything).not.toContain('data:image');
    const zip = await JSZip.loadAsync(await zipReview(built, 'studio-review-x'));
    expect(Object.keys(zip.files)).toContain('studio-review-x/HOW-TO-READ.md');
  });

  it('the files of nothing recorded still read', () => {
    const built = buildReviewFiles({ chats: [], traces: [], notes: new Map(), prompts: new Map(), exportedAt: 'x', version: '0' });
    expect([...built.files.keys()].sort()).toEqual(['HOW-TO-READ.md', 'index.md']);
  });

  it('All chats = both lists, the shown store winning over what is saved; empty chats left out', () => {
    const base = { v: 1 as const, createdAt: 'a', updatedAt: 'a', refs: [], drafts: [], picks: [], settings: { count: 1 as const, level: 'same' as const, language: 'en' as const }, lastText: '' };
    const turn = [{ id: 'u', role: 'user' as const, text: 'x', refs: [] }];
    const mine: Chat[] = [{ ...base, id: 's1', turns: turn }, { ...base, id: 's2', turns: [] }];
    const read = () => [{ ...base, id: 'p1', turns: turn, paper: 'w1' }, { ...base, id: 's1', turns: turn }];
    expect(chatsFor('all', mine[0], mine, 'studio', read).map((c) => `${c.list}:${c.chat.id}`)).toEqual(['studio:s1', 'panel:p1']);
    expect(chatsFor('this', mine[0], mine, 'studio', read).map((c) => c.chat.id)).toEqual(['s1']);
  });
});
