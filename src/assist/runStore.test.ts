import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError, type AiErrorInfo } from '@/ai/types';
import { createStructuredQuestion, createWorksheet } from '@/model/factories';
import { useWorksheetStore } from '@/store/worksheetStore';
import { withFlow } from '@/test/fixtures';
import { openAi, useAiMenu } from './menuStore';
import { registerVerb, resetVerbsForTest } from './registry';
import { resetAiRunForTest, useAiRun } from './runStore';
import type { AiVerb, VerbContext, VerbIO, VerbOutcome } from './types';

const item = (id: string) => ({ id, tone: 'inserted' as const, where: id, notes: [] });

function fakeVerb(id: string, run: (ctx: VerbContext, io: VerbIO, input?: string) => Promise<VerbOutcome>): AiVerb {
  return { id, group: 'translate', order: 0, needsKey: false, label: () => `Run ${id}`, available: () => ({}), run };
}

/** Resolves once the verb has been entered, and lets the test finish it. */
function gate() {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  return { release, released };
}

const errorInfo: AiErrorInfo = { kind: 'quota', provider: 'gemini', message: 'Out of quota', fatal: true, actions: [] };

describe('useAiRun', () => {
  beforeEach(() => {
    resetVerbsForTest();
    resetAiRunForTest();
    useAiMenu.getState().close();
    useWorksheetStore.getState().replaceWorksheet(withFlow(createWorksheet(), [createStructuredQuestion()]));
    useWorksheetStore.getState().setMode({ language: 'en', version: 'student' });
  });
  afterEach(() => resetAiRunForTest());

  it('runs to review, closes the menu, passes the menu scope and applies showSide/showTeacher', async () => {
    const undo = { run: vi.fn(), live: () => true };
    let seen: VerbContext | undefined;
    registerVerb(
      fakeVerb('t.fill', async (ctx, io) => {
        seen = ctx;
        io.progress(1, 2);
        expect(useAiRun.getState().phase).toMatchObject({ kind: 'running', done: 1, total: 2 });
        return { kind: 'inserted', summary: 'Filled 2', items: [item('a'), item('b')], undo, showSide: 'zh', showTeacher: true };
      }),
    );
    openAi({ scope: { kind: 'paper' }, scopeLabel: 'Whole paper' });
    await useAiRun.getState().startVerb('t.fill');
    expect(useAiMenu.getState().open).toBeNull();
    expect(seen?.scopeLabel).toBe('Whole paper');
    expect(useAiRun.getState().phase).toMatchObject({ kind: 'review', verbId: 't.fill', index: 0 });
    expect(useWorksheetStore.getState().mode).toMatchObject({ language: 'zh', version: 'teacher' });

    useAiRun.getState().next();
    expect(useAiRun.getState().phase).toMatchObject({ index: 1 });
    useAiRun.getState().next();
    expect(useAiRun.getState().phase).toMatchObject({ index: 0 });
    useAiRun.getState().prev();
    expect(useAiRun.getState().phase).toMatchObject({ index: 1 });

    useAiRun.getState().undoAll();
    expect(undo.run).toHaveBeenCalledTimes(1);
    expect(useAiRun.getState().phase).toEqual({ kind: 'idle' });
  });

  it('stop aborts the signal; the verb returns what finished', async () => {
    const { release, released } = gate();
    let aborted = false;
    registerVerb(
      fakeVerb('t.slow', async (_ctx, io) => {
        release();
        await new Promise<void>((resolve) => io.signal.addEventListener('abort', () => resolve()));
        aborted = io.signal.aborted;
        return { kind: 'inserted', summary: 'Filled 1 of 3', items: [item('a')], undo: null };
      }),
    );
    const done = useAiRun.getState().startVerb('t.slow');
    await released;
    expect(useAiRun.getState().phase.kind).toBe('running');
    useAiRun.getState().stop();
    await done;
    expect(aborted).toBe(true);
    expect(useAiRun.getState().phase).toMatchObject({ kind: 'review', outcome: { summary: 'Filled 1 of 3' } });
  });

  it('allows one run at a time', async () => {
    const { release, released } = gate();
    const second = vi.fn(async (): Promise<VerbOutcome> => ({ kind: 'nothing', summary: '' }));
    registerVerb(
      fakeVerb('t.a', async (_ctx, io) => {
        release();
        await new Promise<void>((resolve) => io.signal.addEventListener('abort', () => resolve()));
        return { kind: 'nothing', summary: 'stopped' };
      }),
    );
    registerVerb(fakeVerb('t.b', second));
    const first = useAiRun.getState().startVerb('t.a');
    await released;
    await useAiRun.getState().startVerb('t.b');
    expect(second).not.toHaveBeenCalled();
    useAiRun.getState().stop();
    await first;
  });

  it('maps a thrown AiError, and any other throw, to the error phase', async () => {
    registerVerb(fakeVerb('t.err', async () => { throw new AiError(errorInfo); }));
    await useAiRun.getState().startVerb('t.err');
    expect(useAiRun.getState().phase).toEqual({ kind: 'error', verbId: 't.err', error: errorInfo });

    useAiRun.getState().dismiss();
    registerVerb(fakeVerb('t.bug', async () => { throw new Error('boom'); }));
    await useAiRun.getState().startVerb('t.bug');
    const phase = useAiRun.getState().phase;
    expect(phase.kind).toBe('error');
    expect(phase.kind === 'error' && phase.error).toMatchObject({ fatal: false, detail: 'boom' });
  });

  it('maps a returned error outcome to the error phase', async () => {
    registerVerb(fakeVerb('t.ret', async () => ({ kind: 'error', error: errorInfo })));
    await useAiRun.getState().startVerb('t.ret');
    expect(useAiRun.getState().phase).toMatchObject({ kind: 'error', error: errorInfo });
  });

  it('refuses a read-only document and an unknown verb', async () => {
    const run = vi.fn(async (): Promise<VerbOutcome> => ({ kind: 'nothing', summary: '' }));
    registerVerb(fakeVerb('t.ro', run));
    useWorksheetStore.setState({ readOnly: true });
    await useAiRun.getState().startVerb('t.ro');
    await useAiRun.getState().startVerb('missing');
    expect(run).not.toHaveBeenCalled();
    expect(useAiRun.getState().phase).toEqual({ kind: 'idle' });
    useWorksheetStore.setState({ readOnly: false });
  });

  it('retry reruns the last verb over its own scope, whatever is selected now', async () => {
    const scopes: VerbContext['scope'][] = [];
    registerVerb(fakeVerb('t.retry', async (ctx) => {
      scopes.push(ctx.scope);
      return { kind: 'error', error: errorInfo };
    }));
    const q = useWorksheetStore.getState().worksheet.questions[0].id;
    openAi({ scope: { kind: 'questions', ids: [q] }, scopeLabel: 'Question 1' });
    await useAiRun.getState().startVerb('t.retry');
    useWorksheetStore.getState().select(undefined);
    useAiRun.getState().retry();
    await vi.waitFor(() => expect(scopes).toHaveLength(2));
    expect(scopes[1]).toEqual({ kind: 'questions', ids: [q] });
  });

  it('goTo jumps to an item in review, and ignores one out of range', async () => {
    registerVerb(fakeVerb('t.go', async () => ({ kind: 'findings', summary: '', items: [item('a'), item('b'), item('c')] })));
    await useAiRun.getState().startVerb('t.go');
    useAiRun.getState().goTo(2);
    expect(useAiRun.getState().phase).toMatchObject({ index: 2 });
    useAiRun.getState().goTo(3);
    expect(useAiRun.getState().phase).toMatchObject({ index: 2 });
  });

  it('undoAll skips a stale undo', async () => {
    const undo = { run: vi.fn(), live: () => false };
    registerVerb(fakeVerb('t.stale', async () => ({ kind: 'inserted', summary: '', items: [], undo })));
    await useAiRun.getState().startVerb('t.stale');
    useAiRun.getState().undoAll();
    expect(undo.run).not.toHaveBeenCalled();
    expect(useAiRun.getState().phase).toEqual({ kind: 'idle' });
  });
});
