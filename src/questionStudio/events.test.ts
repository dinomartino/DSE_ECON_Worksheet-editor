import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { AiClient } from '@/ai/types';
import { caseById, replyOf } from '@/diagramGen/fixtures';
import { scriptedClient } from '@/translate/testKit';
import { INVENTED, REQUEST, solver, writeReply } from './fixtures';
import { EMPTY_CORPUS } from './nearCopy';
import { studioBuilds } from './insert';
import { writeDrafts } from './run';
import { applyEvent, emptyLive } from './stream';
import type { DraftDiagram, StudioDeps, StudioEvent } from './types';
import { studioDraft } from './fixtures';

const [A, B] = INVENTED;
const preset = presetFor('gemini');
type Replies = Parameters<typeof scriptedClient>[0];

/** A scripted client that can also stream: the reply arrives in 25-character pieces. */
function streaming(replies: Replies): AiClient & { requests: ReturnType<typeof scriptedClient>['requests']; streamed: number } {
  const base = scriptedClient(replies);
  const client = {
    requests: base.requests,
    streamed: 0,
    complete: base.complete,
    listModels: base.listModels,
    async stream(req: Parameters<AiClient['complete']>[0], onText: (t: string) => void) {
      const res = await base.complete(req);
      client.streamed += 1;
      for (let i = 25; i < res.text.length + 25; i += 25) onText(res.text.slice(0, i));
      return res;
    },
  };
  return client;
}

const deps = (client: AiClient, extra: Partial<StudioDeps> = {}): StudioDeps => ({ client, preset, glossary: null, corpus: EMPTY_CORPUS, random: () => 0.3, ...extra });
const ctl = () => new AbortController().signal;
const run = async (client: AiClient, extra: Partial<StudioDeps> = {}, count = 2) => {
  const events: StudioEvent[] = [];
  const outcome = await writeDrafts({ ...REQUEST, count }, deps(client, extra), { signal: ctl(), onEvent: (e) => events.push(e) });
  return { outcome, events };
};

describe('streaming events', () => {
  it('words arrive piece by piece, in order, then checked drafts; draft 0 completes before draft 1', async () => {
    const client = streaming([writeReply([A, B]), solver()]);
    const { outcome, events } = await run(client);
    expect(outcome.ok).toBe(true);
    expect(client.streamed).toBe(1);
    expect(events[0]).toMatchObject({ type: 'stage', stage: 'write' });
    expect(events[1]).toMatchObject({ type: 'write', mode: 'streamed', attempt: 1 });
    const texts = events.filter((e) => e.type === 'text');
    expect(texts.length).toBeGreaterThan(4);
    const first = texts.filter((e) => e.index === 0);
    // The stem grows monotonically (a prefix of the earlier text), never jumps back.
    const stems = first.map((e) => e.draft.stem.en);
    stems.slice(1).forEach((s, i) => expect(s.startsWith(stems[i])).toBe(true));
    expect(first.at(-1)!.draft.complete).toBe(true);
    const firstComplete = events.findIndex((e) => e.type === 'text' && e.index === 0 && e.draft.complete);
    const secondStart = events.findIndex((e) => e.type === 'text' && e.index === 1);
    expect(firstComplete).toBeLessThan(secondStart + 1);
    expect(events.some((e) => e.type === 'draft')).toBe(true);
    // Words before checks, checks before the solve's stage.
    expect(events.findIndex((e) => e.type === 'text')).toBeLessThan(events.findIndex((e) => e.type === 'draft'));
  });
  it('a client that cannot stream gives whole drafts, said so by mode', async () => {
    const { events } = await run(scriptedClient([writeReply([A, B]), solver()]));
    expect(events.find((e) => e.type === 'write')).toMatchObject({ mode: 'whole' });
    const texts = events.filter((e) => e.type === 'text');
    expect(texts).toHaveLength(2);
    expect(texts.every((e) => e.type === 'text' && e.draft.complete)).toBe(true);
  });
  it('a custom server (not asked to stream) gets the whole reply even from a streaming client', async () => {
    const client = streaming([writeReply([A]), solver()]);
    const events: StudioEvent[] = [];
    await writeDrafts({ ...REQUEST, count: 1 }, deps(client, { preset: presetFor('custom') }), { signal: ctl(), onEvent: (e) => events.push(e) });
    expect(client.streamed).toBe(0);
    expect(events.find((e) => e.type === 'write')).toMatchObject({ mode: 'whole' });
  });
  it('a stream that fails (not fatally) falls back to the whole reply', async () => {
    const base = scriptedClient([writeReply([A]), solver()]);
    const client: AiClient = { ...base, stream: async () => { throw new Error('socket closed'); } };
    const { outcome } = await run(client, {}, 1);
    expect(outcome.ok && outcome.drafts).toHaveLength(1);
  });
  it('without a listener nothing is streamed', async () => {
    const client = streaming([writeReply([A]), solver()]);
    await writeDrafts({ ...REQUEST, count: 1 }, deps(client), { signal: ctl() });
    expect(client.streamed).toBe(0);
  });
  it('a listener that throws does not break the run', async () => {
    const out = await writeDrafts({ ...REQUEST, count: 1 }, deps(streaming([writeReply([A]), solver()])), { signal: ctl(), onEvent: () => { throw new Error('ui'); } });
    expect(out.ok).toBe(true);
  });
  it('the reducer folds events into the live screen state', async () => {
    const { events } = await run(streaming([writeReply([A, B]), solver()]));
    const live = events.reduce(applyEvent, emptyLive());
    expect(live.mode).toBe('streamed');
    expect(live.drafts).toHaveLength(2);
    expect(live.drafts.every((d) => d.draft && d.partial?.complete)).toBe(true);
    expect(live.drafts[0].draft!.status).toBeDefined();
  });
});

describe('diagrams after each draft', () => {
  const spec = { ...caseById('demand-increase').spec, placement: 'question' as const };
  const withDiagrams = async (replies: Replies, count = 1) => run(streaming(replies), { diagrams: true }, count);

  it('asks once per standing draft with its words, key and the figure of its example; places it', async () => {
    const client = streaming([writeReply([A]), solver(), replyOf(spec)]);
    const events: StudioEvent[] = [];
    const out = await writeDrafts({ ...REQUEST, count: 1 }, deps(client, { diagrams: true }), { signal: ctl(), onEvent: (e) => events.push(e) });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const d = out.drafts[0];
    expect(d.diagram).toMatchObject({ status: 'ok', placement: 'question' });
    expect(d.diagram?.block).toMatchObject({ kind: 'diagram' });
    const asked = JSON.parse(client.requests[2].turns[0].content);
    expect(asked.task).toBe('diagram');
    expect(asked.question).toContain(A.stem.en);
    expect(asked.key).toContain('Correct answer');
    expect(events.filter((e) => e.type === 'diagram').map((e) => e.type === 'diagram' && e.state)).toEqual(['working', 'done']);
    expect(out.usage.requests).toBe(3);
    // The figure is inserted with the question when it is for the students.
    const [build] = studioBuilds([d], 'C.ped');
    const q = build.fill({ type: 'mcq', id: 'q', blocks: [], options: [1, 2, 3, 4].map((n) => ({ id: `o${n}`, text: { en: [], zh: [] } })), answerIndex: 0 } as never) as { blocks: Array<{ kind: string }> };
    expect(q.blocks.map((b) => b.kind)).toEqual(['paragraph', 'diagram']);
  });
  it('none: no figure, nothing inserted; a failed request is a failed figure, never inserted', async () => {
    const none = await withDiagrams([writeReply([A]), solver(), JSON.stringify({ kind: 'none', reason: 'words only' })]);
    expect(none.outcome.ok && none.outcome.drafts[0].diagram).toMatchObject({ status: 'none', block: null });
    const failing = await run(streaming([writeReply([A]), solver(), new Error('boom')]), { diagrams: true }, 1);
    const diagram = failing.outcome.ok ? failing.outcome.drafts[0].diagram : undefined;
    expect(diagram?.status).toBe('failed');
    expect(diagram?.block).toBeNull();
    const [build] = studioBuilds([studioDraft('x')].map((d) => ({ ...d, diagram: diagram as DraftDiagram })), 'C.ped');
    const q = build.fill({ type: 'mcq', id: 'q', blocks: [], options: [1, 2, 3, 4].map((n) => ({ id: `o${n}`, text: { en: [], zh: [] } })), answerIndex: 0 } as never) as { blocks: unknown[] };
    expect(q.blocks).toHaveLength(1);
  });
  it('off by default: no extra request', async () => {
    const client = streaming([writeReply([A]), solver()]);
    await run(client, {}, 1);
    expect(client.requests).toHaveLength(2);
  });
  it('a model-answer figure has no slot in an MC question: not inserted', () => {
    const base = studioDraft('y');
    const block = { kind: 'diagram' } as never;
    const [build] = studioBuilds([{ ...base, diagram: { status: 'ok', block, placement: 'answer', issues: [] } }], 'C.ped');
    const q = build.fill({ type: 'mcq', id: 'q', blocks: [], options: [1, 2, 3, 4].map((n) => ({ id: `o${n}`, text: { en: [], zh: [] } })), answerIndex: 0 } as never) as { blocks: unknown[] };
    expect(q.blocks).toHaveLength(1);
  });
});
