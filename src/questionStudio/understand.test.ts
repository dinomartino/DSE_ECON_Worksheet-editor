import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { scriptedClient } from '@/translate/testKit';
import { liveEngine } from '@/components/studio/chat/engine';
import { PAGE } from '@/components/studio/chat/intentPhrasings';
import { refinementFor } from '@/components/studio/chat/chatStore';
import { EMPTY_CORPUS } from './nearCopy';
import { PICK_TASK_MARKER } from './pick';
import { buildUnderstandRequest, parseTurn, TURN_TASK_MARKER, understandTurn } from './understand';

const gemini = presetFor('gemini');
const signal = new AbortController().signal;
const payload = (content: string) => JSON.parse(content) as Record<string, unknown>;
const turn = (o: Record<string, unknown>) => JSON.stringify({ intent: 'edit', drafts: [2], how: 'change', parts: [], reply: '', picks: [], ...o });

describe('the reading request (k-0535)', () => {
  it('folded into the pick: the drafts go with the syllabus, and the pick marker still opens it', () => {
    const req = buildUnderstandRequest({ text: 'the second one is too wordy', examples: [], drafts: PAGE, recent: [1, 2, 3], picks: true }, gemini, signal);
    expect(req.system.startsWith(PICK_TASK_MARKER)).toBe(true);
    expect(req.system).toContain(TURN_TASK_MARKER);
    const body = payload(req.turns[0].content);
    expect(body.syllabus).toBeDefined();
    expect((body.drafts as unknown[]).length).toBe(3);
    expect(body.recent).toEqual([1, 2, 3]);
    expect(body.targetDraft).toBeUndefined();
  });

  it('answer-only (the draft is known): no syllabus, no examples, the chosen draft in full', () => {
    const req = buildUnderstandRequest({ text: 'why is (2) wrong?', examples: [], drafts: PAGE.map((d) => (d.no === 3 ? { ...d, explanation: 'Because the burden is shared.' } : d)), recent: [], target: 3, picks: false }, gemini, signal);
    const body = payload(req.turns[0].content);
    expect(body.syllabus).toBeUndefined();
    expect(body.examples).toBeUndefined();
    expect(body.targetDraft).toBe(3);
    expect((body.drafts as Array<Record<string, unknown>>)[2].explanation).toContain('burden');
    expect((body.drafts as Array<Record<string, unknown>>)[0].explanation).toBeUndefined();
    expect(req.system.startsWith(PICK_TASK_MARKER)).toBe(false);
    // Small: the syllabus is most of a pick request.
    expect(req.turns[0].content.length).toBeLessThan(3000);
  });

  it('short briefs: about 80 tokens a draft', () => {
    const req = buildUnderstandRequest({ text: 'x', examples: [], drafts: PAGE, recent: [], picks: false }, gemini, signal);
    expect(JSON.stringify(payload(req.turns[0].content).drafts).length / PAGE.length).toBeLessThan(450);
  });
});

describe('parseTurn', () => {
  it('keeps drafts on the page; a missing one, or none, makes it unsure', () => {
    expect(parseTurn(turn({ drafts: [2] }), [1, 2, 3])).toMatchObject({ intent: 'edit', drafts: [2] });
    expect(parseTurn(turn({ drafts: [5] }), [1, 2, 3])?.intent).toBe('unsure');
    expect(parseTurn(turn({ drafts: [2, 5] }), [1, 2, 3])?.intent).toBe('unsure');
    expect(parseTurn(turn({ intent: 'ask', drafts: [1], reply: '' }), [1, 2, 3])?.intent).toBe('unsure');
    expect(parseTurn(turn({ intent: 'new', drafts: [], reply: 'stray' }), [1, 2, 3])).toMatchObject({ intent: 'new', reply: '' });
    expect(parseTurn(turn({ parts: ['diagram', 'nonsense', 'diagram'] }), [1, 2, 3])?.parts).toEqual(['diagram']);
  });
  it('no read in a pick-only or broken reply', () => {
    expect(parseTurn('{"picks":[{"code":"C.ped","reason":"x"}]}', [1])).toBeUndefined();
    expect(parseTurn('not json', [1])).toBeUndefined();
    expect(parseTurn(turn({ intent: 'dance' }), [1])).toBeUndefined();
  });
});

describe('understandTurn and the engine', () => {
  const deps = (client: ReturnType<typeof scriptedClient>) => ({ client, preset: gemini, glossary: null, corpus: EMPTY_CORPUS });

  it('one request reads and picks', async () => {
    const client = scriptedClient([JSON.stringify({ intent: 'new', drafts: [], how: 'change', parts: [], reply: '', picks: [{ code: 'C.pes', reason: 'r', reasonZh: 'z' }] })]);
    const out = await understandTurn({ text: 'price elasticity of supply', examples: [], drafts: PAGE, recent: [], picks: true }, deps(client), signal);
    expect(client.requests).toHaveLength(1);
    expect(out).toMatchObject({ ok: true, read: { intent: 'new' }, picks: [{ code: 'C.pes' }] });
  });

  it('a provider that answers picks only (the mock): picks, no read', async () => {
    const client = scriptedClient(['{"picks":[{"code":"C.ped","reason":"x","reasonZh":"y"}]}']);
    const out = await understandTurn({ text: 'x', examples: [], drafts: PAGE, recent: [], picks: true }, deps(client), signal);
    expect(out).toMatchObject({ ok: true, picks: [{ code: 'C.ped' }] });
    expect(out.ok && out.read).toBeFalsy();
  });

  it('liveEngine.pick with drafts reads the message; without, it is the old pick', async () => {
    const client = scriptedClient([turn({ drafts: [2] })]);
    const out = await liveEngine.pick({ text: 'the second one is too wordy', examples: [], drafts: PAGE, recent: [] }, deps(client), signal);
    expect(out).toMatchObject({ ok: true, turn: { intent: 'edit', drafts: [2] }, picks: [] });
    expect(client.requests[0].system).toContain(TURN_TASK_MARKER);
    const plain = scriptedClient(['{"picks":[{"code":"C.ped","reason":"x","reasonZh":"y"}]}']);
    await liveEngine.pick({ text: 'elasticity', examples: [] }, deps(plain), signal);
    expect(plain.requests[0].system).not.toContain(TURN_TASK_MARKER);
  });
});

describe('refinementFor', () => {
  it('short difficulty-only words are Harder / Easier; anything more is the words, with what they touch', () => {
    expect(refinementFor({ how: 'harder', parts: [] }, 'Q2 太易')).toEqual({ kind: 'harder' });
    expect(refinementFor({ how: 'easier', parts: [] }, 'make the last question easier')).toEqual({ kind: 'easier' });
    expect(refinementFor({ how: 'harder', parts: ['diagram'] }, 'make draft 3 harder by shifting both curves in the diagram')).toEqual({
      kind: 'change',
      text: 'make draft 3 harder by shifting both curves in the diagram',
      parts: ['diagram'],
    });
    expect(refinementFor({ how: 'change', parts: [] }, 'use property prices')).toEqual({ kind: 'change', text: 'use property prices' });
  });
});
