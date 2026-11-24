import { describe, expect, it } from 'vitest';
import { aiErrorInfo } from '@/ai/errors';
import { presetFor } from '@/ai/providers';
import { AiError } from '@/ai/types';
import { scriptedClient } from '@/translate/testKit';
import { EXAMPLE, INVENTED, solver, writeReply } from './fixtures';
import { EMPTY_CORPUS } from './nearCopy';
import { canWrite, createStudioSession, requestOf, sidesOf, type Resolved, type RunInfo, type SheetDraft, type StudioEnv } from './session';
import { MAX_EXAMPLES, type StudioDraft } from './types';

const [A, B, C, D, E] = INVENTED;
const preset = presetFor('gemini');
const seeded = () => {
  let n = 5;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
};
type Replies = Parameters<typeof scriptedClient>[0];

function setup(replies: Replies, resolveOnce?: () => Promise<Resolved>) {
  const client = scriptedClient(replies);
  const compared = { past: 1759, mine: 12 };
  const env: StudioEnv = {
    resolve: resolveOnce ?? (async () => ({ ok: true, deps: { client, preset, glossary: null, corpus: EMPTY_CORPUS, random: seeded() }, compared })),
  };
  const session = createStudioSession(env, 'bilingual');
  return { client, session, compared };
}

const chosen = (session: ReturnType<typeof setup>['session']) => session.getState().setForm({ keyPoint: 'C.ped', count: 3 });

const stub = (id: string, keyPoint = 'C.ped', status: StudioDraft['status'] = 'ok'): SheetDraft => ({
  draft: { id, draft: { kind: 'mcq', stem: A.stem, statements: [], options: A.options, answerIndex: 2, explanation: A.explanation }, angle: id, status, checks: [], attempt: 1 },
  request: { keyPoint, points: [], examples: [], count: 1, level: 'same', shape: 'any', sides: ['en', 'zh'], note: '' },
});

describe('the form', () => {
  it('makes the request: the paper language gives the sides, and a key point must be one of the syllabus', () => {
    const { session } = setup(['']);
    expect(session.getState().form).toMatchObject({ keyPoint: '', count: 1, level: 'same', shape: 'any', language: 'bilingual' });
    expect(canWrite(session.getState().form)).toBe(false);
    session.getState().setForm({ keyPoint: 'C.ped', language: 'zh', level: 'harder', note: 'HK prices' });
    expect(requestOf(session.getState().form)).toMatchObject({ keyPoint: 'C.ped', sides: ['zh'], level: 'harder', note: 'HK prices' });
    expect(canWrite(session.getState().form)).toBe(true);
    expect(sidesOf('en')).toEqual(['en']);
    expect(sidesOf('bilingual')).toEqual(['en', 'zh']);
    session.getState().setForm({ keyPoint: 'C.ped#arc', note: '' });
    expect(canWrite(session.getState().form)).toBe(false);
    session.getState().setForm({ keyPoint: 'nonsense' });
    expect(canWrite(session.getState().form)).toBe(false);
    // k-0514: a typed request, or a picked question, is enough: the AI picks the key point.
    session.getState().setForm({ note: 'a question on elasticity' });
    expect(canWrite(session.getState().form)).toBe(true);
    session.getState().setForm({ note: '' });
    session.getState().addExample(EXAMPLE);
    expect(canWrite(session.getState().form)).toBe(true);
  });

  it('a new key point forgets the narrowed points; the same one keeps them', () => {
    const { session } = setup(['']);
    session.getState().setForm({ keyPoint: 'C.ped', points: ['C.ped#arc'] });
    session.getState().setForm({ keyPoint: 'C.ped' });
    expect(session.getState().form.points).toEqual(['C.ped#arc']);
    session.getState().setForm({ keyPoint: 'C.law-of-demand' });
    expect(session.getState().form.points).toEqual([]);
  });

  it('keeps up to three examples, once each', () => {
    const { session } = setup(['']);
    const at = (id: string) => ({ ...EXAMPLE, id });
    expect(session.getState().addExample(at('a'))).toBe(true);
    expect(session.getState().addExample(at('a'))).toBe(false);
    for (const id of ['b', 'c']) session.getState().addExample(at(id));
    expect(session.getState().form.examples).toHaveLength(MAX_EXAMPLES);
    expect(session.getState().addExample(at('d'))).toBe(false);
    session.getState().removeExample('b');
    expect(session.getState().form.examples.map((e) => e.id)).toEqual(['a', 'c']);
  });
});

describe('write', () => {
  it('puts the drafts on the sheet, each with the request it was written for, and focuses the first', async () => {
    const { session, client, compared } = setup([writeReply([A, B, C]), solver()]);
    chosen(session);
    await session.getState().write();
    const state = session.getState();
    expect(client.requests).toHaveLength(2);
    expect(state.phase).toEqual({ kind: 'idle' });
    expect(state.entries.map((e) => e.draft.angle)).toEqual([A.angle, B.angle, C.angle]);
    expect(state.entries.every((e) => e.request.keyPoint === 'C.ped' && e.request.sides.join() === 'en,zh')).toBe(true);
    expect(state.focus).toBe(state.entries[0].draft.id);
    expect(state.model).toBe('fake');
    expect(state.compared).toEqual(compared);
    expect(state.usage.requests).toBe(2);
    expect(state.picked).toEqual([]);
  });

  it('does nothing without a key point', async () => {
    const { session, client } = setup([writeReply([A]), solver()]);
    await session.getState().write();
    expect(client.requests).toHaveLength(0);
    expect(session.getState().entries).toEqual([]);
  });

  it('a second write lands above the first and is told to differ from it; usage adds up', async () => {
    const { session, client } = setup([writeReply([A, B, C]), solver(), writeReply([D]), solver()]);
    chosen(session);
    await session.getState().write();
    session.getState().setForm({ count: 1 });
    await session.getState().write();
    const state = session.getState();
    expect(state.entries.map((e) => e.draft.angle)).toEqual([D.angle, A.angle, B.angle, C.angle]);
    expect(state.usage.requests).toBe(4);
    const second = JSON.parse(client.requests[2].turns.at(-1)!.content) as { avoid: unknown[] };
    expect(second.avoid).toHaveLength(3);
  });

  it('drafts for another key point are not avoided, and keep their own key point', async () => {
    const { session, client } = setup([writeReply([A]), solver(), writeReply([E]), solver()]);
    session.getState().setForm({ keyPoint: 'C.ped', count: 1 });
    await session.getState().write();
    session.getState().setForm({ keyPoint: 'C.law-of-demand' });
    await session.getState().write();
    expect(JSON.parse(client.requests[2].turns.at(-1)!.content)).not.toHaveProperty('avoid');
    expect(session.getState().entries.map((e) => e.request.keyPoint)).toEqual(['C.law-of-demand', 'C.ped']);
  });

  it('shows the running phase while it works, and one run at a time', async () => {
    const phases: string[] = [];
    const { session, client } = setup([writeReply([A]), solver()]);
    session.subscribe((s) => phases.push(s.phase.kind));
    chosen(session);
    const first = session.getState().write();
    const second = session.getState().write();
    await Promise.all([first, second]);
    expect(client.requests).toHaveLength(2);
    expect(phases).toContain('running');
    expect(phases.at(-1)).toBe('idle');
  });

  it('a provider that is not set up is an error with Try again, which runs it again', async () => {
    let calls = 0;
    const client = scriptedClient([writeReply([A, B, C]), solver()]);
    const { session } = setup([''], async () => {
      calls += 1;
      return calls === 1
        ? { ok: false, error: aiErrorInfo('notConfigured', 'gemini') }
        : { ok: true, deps: { client, preset, glossary: null, corpus: EMPTY_CORPUS, random: seeded() }, compared: { past: null, mine: 0 } };
    });
    chosen(session);
    await session.getState().write();
    expect(session.getState().phase).toMatchObject({ kind: 'error', error: { kind: 'notConfigured' } });
    await session.getState().retry();
    expect(calls).toBe(2);
    expect(session.getState().phase).toEqual({ kind: 'idle' });
    expect(session.getState().entries).toHaveLength(3);
    expect(session.getState().compared).toEqual({ past: null, mine: 0 });
  });

  it('a provider error leaves the sheet as it was', async () => {
    const { session } = setup([writeReply([A, B, C]), solver(), new AiError(aiErrorInfo('quota', 'gemini'))]);
    chosen(session);
    await session.getState().write();
    expect(session.getState().entries).toHaveLength(3);
    await session.getState().write();
    expect(session.getState().phase).toMatchObject({ kind: 'error', error: { kind: 'quota' } });
    expect(session.getState().entries).toHaveLength(3);
    session.getState().dismissError();
    expect(session.getState().phase).toEqual({ kind: 'idle' });
  });

  it('Stop after the write keeps the drafts, with the key unchecked, and no error', async () => {
    let stop = () => {};
    const { session } = setup([
      () => {
        stop();
        return writeReply([A, B]);
      },
      solver(),
    ]);
    stop = () => session.getState().stop();
    chosen(session);
    await session.getState().write();
    const state = session.getState();
    expect(state.phase).toEqual({ kind: 'idle' });
    expect(state.entries).toHaveLength(2);
    expect(state.notes.map((n) => n.id)).toContain('run.stopped');
    expect(state.entries[0].draft.checks.find((c) => c.id === 'key')?.state).toBe('skipped');
  });
});

describe('the sheet', () => {
  const seeded2 = () => {
    const { session } = setup(['']);
    session.setState({ entries: [stub('d1'), stub('d2'), stub('d3', 'C.ped', 'failed')], focus: 'd1' });
    return session;
  };

  it('ticks and unticks; a warned draft can be ticked too (k-0531)', () => {
    const session = seeded2();
    session.getState().toggle('d2');
    session.getState().toggle('d1');
    session.getState().toggle('d3');
    expect(session.getState().picked).toEqual(['d2', 'd1', 'd3']);
    session.getState().toggle('d2');
    expect(session.getState().picked).toEqual(['d1', 'd3']);
  });

  it('drafts that were delivered leave the sheet with their ticks', () => {
    const session = seeded2();
    session.getState().toggle('d1');
    session.getState().toggle('d2');
    session.getState().delivered(['d1', 'd2']);
    const state = session.getState();
    expect(state.entries.map((e) => e.draft.id)).toEqual(['d3']);
    expect(state.picked).toEqual([]);
    expect(state.focus).toBe('d3');
  });

  it('discarding drops the pick and moves the focus on', () => {
    const session = seeded2();
    session.getState().toggle('d1');
    session.getState().discard('d1');
    const state = session.getState();
    expect(state.entries.map((e) => e.draft.id)).toEqual(['d2', 'd3']);
    expect(state.picked).toEqual([]);
    expect(state.focus).toBe('d2');
    session.getState().clearDrafts();
    expect(session.getState()).toMatchObject({ entries: [], picked: [], notes: [], focus: undefined });
  });
});

describe('refine', () => {
  const sheet = async (replies: Replies) => {
    const made = setup(replies);
    chosen(made.session);
    made.session.getState().setForm({ count: 3 });
    return made;
  };

  it('Another adds one beside the draft it came from, avoiding the others', async () => {
    const { session, client } = await sheet([writeReply([A, B, C]), solver(), writeReply([D]), solver()]);
    await session.getState().write();
    const [first, second] = session.getState().entries.map((e) => e.draft.id);
    await session.getState().refine(first, { kind: 'another' });
    const state = session.getState();
    expect(state.entries.map((e) => e.draft.angle)).toEqual([A.angle, D.angle, B.angle, C.angle]);
    expect(state.entries[1].draft.id).not.toBe(second);
    expect(state.focus).toBe(state.entries[1].draft.id);
    const asked = JSON.parse(client.requests[2].turns.at(-1)!.content) as { avoid: unknown[]; make: { count: number } };
    expect(asked.make.count).toBe(1);
    expect(asked.avoid).toHaveLength(3);
  });

  it('Harder changes the draft in place, takes it off the picked list, and asks for the same request again', async () => {
    const { session, client } = await sheet([writeReply([A, B, C]), solver(), writeReply([D]), solver()]);
    await session.getState().write();
    const ids = session.getState().entries.map((e) => e.draft.id);
    session.getState().toggle(ids[1]);
    session.getState().setForm({ keyPoint: 'C.law-of-demand', level: 'same' });
    await session.getState().refine(ids[1], { kind: 'harder' });
    const state = session.getState();
    expect(state.entries.map((e) => e.draft.angle)).toEqual([A.angle, D.angle, C.angle]);
    expect(state.entries[1].draft.id).not.toBe(ids[1]);
    expect(state.entries[1].request.keyPoint).toBe('C.ped');
    expect(state.picked).toEqual([]);
    const asked = JSON.parse(client.requests[2].turns.at(-1)!.content) as { rewrite: { how: string }; make: { level: string }; syllabus: { keyPoint: { en: string } } };
    expect(asked.rewrite.how).toBe('harder');
    expect(asked.make.level).toBe('harder');
    expect(asked.syllabus.keyPoint.en).toBe('Price elasticity of demand');
  });

  it('marks the draft being changed while it runs', async () => {
    const { session } = await sheet([writeReply([A, B, C]), solver(), writeReply([D]), solver()]);
    await session.getState().write();
    const id = session.getState().entries[0].draft.id;
    const seen: Array<string | undefined> = [];
    session.subscribe((s) => s.phase.kind === 'running' && seen.push(s.phase.target));
    await session.getState().refine(id, { kind: 'change', text: 'use property prices' });
    expect(new Set(seen)).toEqual(new Set([id]));
  });
});

describe('the run record hook', () => {
  it('hears of every run that reached the provider, what it asked and got, and a hook that fails does not stop a run', async () => {
    const client = scriptedClient([writeReply([A, B, C]), solver(), writeReply([D]), solver(), new AiError(aiErrorInfo('quota', 'gemini'))]);
    const heard: RunInfo[] = [];
    const compared = { past: 1759, mine: 12 };
    const env: StudioEnv = { resolve: async () => ({ ok: true, deps: { client, preset, glossary: null, corpus: EMPTY_CORPUS, random: seeded() }, compared }) };
    const session = createStudioSession(env, 'bilingual', {
      onRun: (info) => {
        heard.push(info);
        if (heard.length === 2) throw new Error('storage full');
      },
    });
    session.getState().setForm({ keyPoint: 'C.ped', count: 3 });
    await session.getState().write();
    const first = session.getState().entries[0].draft.id;
    await session.getState().refine(first, { kind: 'another' });
    expect(session.getState().phase).toEqual({ kind: 'idle' });
    expect(session.getState().entries).toHaveLength(4);
    await session.getState().refine(first, { kind: 'harder' });
    expect(heard.map((h) => h.kind)).toEqual(['write', 'refine', 'refine']);
    expect(heard[0]).toMatchObject({ request: { keyPoint: 'C.ped', count: 3 }, compared });
    expect(heard[0].outcome.ok && heard[0].outcome.drafts).toHaveLength(3);
    expect(heard[1].request.keyPoint).toBe('C.ped');
    expect(heard[2].outcome).toMatchObject({ ok: false, error: { kind: 'quota' } });
    expect(session.getState().phase).toMatchObject({ kind: 'error' });
  });

  it('hears nothing of a run that never reached the provider (no key)', async () => {
    const heard: RunInfo[] = [];
    const env: StudioEnv = { resolve: async () => ({ ok: false, error: aiErrorInfo('notConfigured', 'gemini') }) };
    const session = createStudioSession(env, 'en', { onRun: (info) => heard.push(info) });
    session.getState().setForm({ keyPoint: 'C.ped' });
    await session.getState().write();
    expect(heard).toEqual([]);
  });
});
