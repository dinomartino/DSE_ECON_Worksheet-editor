import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { scriptedClient } from '@/translate/testKit';
import { geminiAdapter } from '@/ai/adapters/gemini';
import { anthropicAdapter } from '@/ai/adapters/anthropic';
import { openaiCompatAdapter } from '@/ai/adapters/openaiCompat';
import { INVENTED, EXAMPLE, REQUEST, solver, writeReply } from './fixtures';
import { EMPTY_CORPUS } from './nearCopy';
import { buildPickRequest, MAX_PICKS, needsPick, parsePicks, pickKeyPoints, PICK_SYSTEM_PROMPT, syllabusList } from './pick';
import { buildWriteRequest, emptyJob } from './prompt';
import { makeBrief, sentSummary } from './brief';
import { createStudioSession, type StudioEnv } from './session';
import type { SourceQuestion } from './types';

const [A] = INVENTED;
const gemini = presetFor('gemini');
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const signal = new AbortController().signal;
const withFigure: SourceQuestion = { ...EXAMPLE, hasFigure: true, figures: [{ dataUrl: PNG }] };
const pickReply = (...codes: string[]) => JSON.stringify({ picks: codes.map((code) => ({ code, reason: `because ${code}` })) });

describe('parsePicks', () => {
  it('keeps real key points, maps a point to its key point, drops made-up codes and repeats, caps at two', () => {
    expect(parsePicks(pickReply('C.ped', 'C.ped#arc', 'nonsense', 'C.law-of-demand', 'C.ped'))?.map((p) => p.code)).toEqual(['C.ped', 'C.law-of-demand']);
    expect(MAX_PICKS).toBe(2);
    expect(parsePicks('```json\n' + pickReply('C.ped') + '\n```')).toHaveLength(1);
    expect(parsePicks('not json')).toBeUndefined();
    expect(parsePicks('{"picks":"x"}')).toBeUndefined();
    expect(parsePicks(pickReply('C'))).toEqual([]);
  });
  it('needsPick: only a request with a real key point skips step 1', () => {
    expect(needsPick({ keyPoint: '' })).toBe(true);
    expect(needsPick({ keyPoint: 'C.ped#arc' })).toBe(true);
    expect(needsPick({ keyPoint: 'C.ped' })).toBe(false);
  });
});

describe('the pick request', () => {
  it('lists the whole syllabus, sends the request and the example words, never a label', () => {
    const req = buildPickRequest({ text: 'a question about price elasticity', examples: [EXAMPLE] }, gemini, signal);
    const user = JSON.parse(req.turns.at(-1)!.content);
    expect(req.system).toBe(PICK_SYSTEM_PROMPT);
    expect(user.request).toBe('a question about price elasticity');
    expect(user.syllabus).toEqual(syllabusList());
    expect(user.examples).toHaveLength(1);
    expect(req.turns.at(-1)!.content).not.toContain('EXAMPLE-LABEL');
  });
  it('attaches example pictures only to a provider that reads them', () => {
    expect(buildPickRequest({ text: '', examples: [withFigure] }, gemini, signal).images).toEqual([{ dataUrl: PNG }]);
    const deepseek = buildPickRequest({ text: '', examples: [withFigure] }, presetFor('deepseek'), signal);
    expect(deepseek.images).toBeUndefined();
    expect(JSON.parse(deepseek.turns.at(-1)!.content).examples[0]).toMatchObject({ figureNotShown: true });
  });
});

describe('pickKeyPoints', () => {
  it('asks once and returns the picks with usage', async () => {
    const client = scriptedClient([pickReply('C.ped')]);
    const out = await pickKeyPoints({ text: 'elasticity', examples: [] }, { client, preset: gemini }, signal);
    expect(out).toMatchObject({ ok: true, picks: [{ code: 'C.ped', reason: 'because C.ped' }] });
    expect(client.requests).toHaveLength(1);
  });
  it('tries once more on an unreadable or empty answer, then reports badOutput', async () => {
    const client = scriptedClient(['nope', pickReply('x')]);
    const out = await pickKeyPoints({ text: 'elasticity', examples: [] }, { client, preset: gemini }, signal);
    expect(out).toMatchObject({ ok: false, error: { kind: 'badOutput' } });
    expect(client.requests).toHaveLength(2);
    const again = scriptedClient(['nope', pickReply('C.ped')]);
    expect(await pickKeyPoints({ text: 'e', examples: [] }, { client: again, preset: gemini }, signal)).toMatchObject({ ok: true });
  });
});

describe('the write request carries the pictures', () => {
  const brief = (examples: SourceQuestion[]) => {
    const made = makeBrief({ ...REQUEST, examples });
    if ('error' in made) throw new Error('no brief');
    return made;
  };
  it('attaches them in the examples\' order and says how many belong to each', () => {
    const b = brief([withFigure, { ...withFigure, id: 'two', figures: [{ dataUrl: PNG }, { dataUrl: PNG }] }]);
    const req = buildWriteRequest(b, emptyJob(b), null, gemini, signal);
    expect(req.images).toHaveLength(3);
    const examples = JSON.parse(req.turns.at(-1)!.content).examples;
    expect(examples.map((e: Record<string, unknown>) => e.figures)).toEqual([1, 2]);
    expect(examples[0]).not.toHaveProperty('figureNotShown');
    expect(sentSummary({ ...REQUEST, examples: [withFigure] }, true).figures).toBe(1);
    expect(sentSummary({ ...REQUEST, examples: [withFigure] }, false).figures).toBe(0);
  });
  it('sends none to a provider without vision, and says a figure was not shown', () => {
    const b = brief([withFigure]);
    const req = buildWriteRequest(b, emptyJob(b), null, presetFor('deepseek'), signal);
    expect(req.images).toBeUndefined();
    expect(JSON.parse(req.turns.at(-1)!.content).examples[0]).toMatchObject({ figureNotShown: true });
  });
  it('caps the pictures of one request', () => {
    const many = Array.from({ length: 3 }, (_, i): SourceQuestion => ({ ...withFigure, id: `m${i}`, figures: Array.from({ length: 3 }, () => ({ dataUrl: PNG })) }));
    const b = brief(many);
    expect(buildWriteRequest(b, emptyJob(b), null, gemini, signal).images).toHaveLength(6);
  });
});

describe('adapters put the pictures on the last user turn', () => {
  const req = { system: 's', turns: [{ role: 'user' as const, content: 'hello' }], schema: {}, maxOutputTokens: 10, signal, images: [{ dataUrl: PNG }, { dataUrl: 'https://evil.example/x.png' }] };
  it('gemini: inlineData; a remote URL is never sent', () => {
    const body = JSON.parse(geminiAdapter.build(gemini, { provider: 'gemini', apiKey: 'k', model: 'm', baseUrl: 'https://x' }, req, 'gemini-jsonSchema').body!);
    expect(body.contents[0].parts).toEqual([{ text: 'hello' }, { inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } }]);
  });
  it('anthropic: base64 image blocks before the text', () => {
    const p = presetFor('anthropic');
    const body = JSON.parse(anthropicAdapter.build(p, { provider: 'anthropic', apiKey: 'k', model: 'm', baseUrl: 'https://x' }, req, 'prompt').body!);
    expect(body.messages[0].content).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }, { type: 'text', text: 'hello' }]);
  });
  it('openai: image_url parts after the text; no images = a plain string', () => {
    const p = presetFor('openai');
    const cfg = { provider: 'openai' as const, apiKey: 'k', model: 'm', baseUrl: 'https://x' };
    expect(JSON.parse(openaiCompatAdapter.build(p, cfg, req, 'prompt').body!).messages[1].content).toEqual([{ type: 'text', text: 'hello' }, { type: 'image_url', image_url: { url: PNG } }]);
    expect(JSON.parse(openaiCompatAdapter.build(p, cfg, { ...req, images: undefined }, 'prompt').body!).messages[1].content).toBe('hello');
  });
});

describe('the session: step 1 for every request', () => {
  const setup = (replies: Parameters<typeof scriptedClient>[0]) => {
    const client = scriptedClient(replies);
    const env: StudioEnv = { resolve: async () => ({ ok: true, deps: { client, preset: gemini, glossary: null, corpus: EMPTY_CORPUS, random: () => 0.3 }, compared: { past: 0, mine: 0 } }) };
    return { client, session: createStudioSession(env, 'bilingual') };
  };
  it('a typed request alone: picks the key point, then writes with it', async () => {
    const { client, session } = setup([pickReply('C.ped', 'C.law-of-demand'), writeReply([A]), solver()]);
    session.getState().setForm({ note: 'a question on elasticity of demand', count: 1 });
    await session.getState().write();
    const state = session.getState();
    expect(client.requests).toHaveLength(3);
    expect(client.requests[0].system).toContain('question-studio-pick');
    const written = JSON.parse(client.requests[1].turns.at(-1)!.content);
    expect(written.syllabus.keyPoint.en).toBeTruthy();
    expect(written.syllabus.alsoKeyPoints).toHaveLength(1);
    expect(state.picks.map((p) => p.code)).toEqual(['C.ped', 'C.law-of-demand']);
    expect(state.entries[0].request).toMatchObject({ keyPoint: 'C.ped', alsoKeyPoints: ['C.law-of-demand'] });
    expect(state.usage.requests).toBe(3);
    expect(state.form.keyPoint).toBe('');
  });
  it('a picked question alone works too, and its pictures reach the pick and the write', async () => {
    const { client, session } = setup([pickReply('C.ped'), writeReply([A]), solver()]);
    session.getState().addExample(withFigure);
    session.getState().setForm({ count: 1 });
    await session.getState().write();
    expect(client.requests[0].images).toEqual([{ dataUrl: PNG }]);
    expect(client.requests[1].images).toEqual([{ dataUrl: PNG }]);
    expect(session.getState().entries).toHaveLength(1);
  });
  it('a key point set by hand skips step 1', async () => {
    const { client, session } = setup([writeReply([A]), solver()]);
    session.getState().setForm({ keyPoint: 'C.ped', count: 1 });
    await session.getState().write();
    expect(client.requests).toHaveLength(2);
    expect(session.getState().picks).toEqual([]);
  });
  it('a failed pick stops with its error and writes nothing', async () => {
    const { client, session } = setup(['nope']);
    session.getState().setForm({ note: 'x', count: 1 });
    await session.getState().write();
    expect(session.getState().phase).toMatchObject({ kind: 'error', error: { kind: 'badOutput' } });
    expect(client.requests).toHaveLength(2);
    expect(session.getState().entries).toEqual([]);
  });
});
