import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { CompletionRequest } from '@/ai/types';
import { rowsOf } from '@/library/indexer';
import { choiceQuestion, docWith, partedQuestion } from '@/library/testKit';
import type { BankRow } from '@/library/types';
import { copyQuestion } from '@/model/lineage';
import { derivedTags } from '@/model/tagSlots';
import type { McqQuestion, Worksheet } from '@/model/types';
import { scriptedClient } from '@/translate/testKit';
import type { RunDepsResult } from '@/translate/types';
import { acceptEdit, createAiTag, TAGGED_MEANWHILE, untaggedRows, type AiTagDeps } from './aiTagStore';

function memoryStore(docs: Worksheet[]) {
  const saved = new Map(docs.map((doc) => [doc.id, doc]));
  let saves = 0;
  return {
    saved,
    saves: () => saves,
    list: async () => [...saved.keys()].map((id) => ({ id, title: id, updatedAt: '' })),
    load: async (id: string) => saved.get(id),
    save: async (worksheet: Worksheet) => {
      saves += 1;
      saved.set(worksheet.id, worksheet);
    },
  };
}

const keysOf = (req: CompletionRequest): string[] => (JSON.parse(req.turns[req.turns.length - 1].content) as { questions: Array<{ key: string }> }).questions.map((q) => q.key);

/** Every question gets `main`, with `pattern` when given. */
const answering = (main: string, pattern = '') =>
  scriptedClient([(req) => JSON.stringify({ items: keysOf(req).map((key) => ({ key, main, also: '', pattern, conf: 'high', why: 'Tests PED.' })) })]);

function setup(docs: Worksheet[], client = answering('C.ped'), over: Partial<AiTagDeps> = {}) {
  const store = memoryStore(docs);
  const queue: Array<Promise<unknown>> = [];
  const run = createAiTag({
    store,
    createRunDeps: async (): Promise<RunDepsResult> => ({
      ok: true,
      deps: { client, preset: { ...presetFor('deepseek'), concurrency: 1 }, model: 'x', glossary: null },
      config: {} as never,
    }),
    desktop: () => false,
    exclusive: (work) => {
      const next = (queue[queue.length - 1] ?? Promise.resolve()).then(work, work);
      queue.push(next);
      return next;
    },
    whyLanguage: () => 'en',
    now: () => '2026-11-25T10:00:00.000Z',
    ...over,
  });
  const rows = () => [...store.saved.values()].flatMap((doc) => rowsOf(doc));
  let written = 0;
  const bind = () => run.getState().bind({ rows: rows(), patterns: () => ({ 'C.ped': ['Calculate PED from TR'] }), onWritten: () => (written += 1) });
  bind();
  return { store, run, rows, bind, written: () => written, client };
}

const topicsOf = (store: ReturnType<typeof memoryStore>, docId: string, questionId: string) =>
  derivedTags(store.saved.get(docId)!.questions.find((q) => q.id === questionId)!);

describe('AI tagging in the bank: nothing saved without the teacher', () => {
  it('suggests from the tree and writes nothing until Accept; Accept writes every copy', async () => {
    const q = choiceQuestion('If the price of rice rises by 10%, total revenue falls. Demand is…');
    const copy = copyQuestion(q);
    const a = docWith([q], { id: 'a' });
    const b = docWith([copy], { id: 'b' });
    const { store, run, rows } = setup([a, b]);
    const untagged = untaggedRows(rows());
    expect(untagged).toHaveLength(1);
    await run.getState().start(untagged);
    const item = run.getState().items[0];
    expect(item).toMatchObject({ state: 'ready', topics: ['C.ped'] });
    expect(item.pattern).toBeUndefined();
    expect(item.suggestion?.why).toBe('Tests PED.');
    expect(store.saves()).toBe(0);
    await run.getState().accept(item.rootId);
    expect(run.getState().items[0].state).toBe('saved');
    expect(topicsOf(store, 'a', q.id)).toEqual(['C.ped']);
    expect(topicsOf(store, 'b', copy.id)).toEqual(['C.ped']);
  });

  it('Skip writes nothing; Change saves the teacher’s topics; Accept all saves the rest', async () => {
    const qs = [choiceQuestion('One'), choiceQuestion('Two'), choiceQuestion('Three')];
    const doc = docWith(qs, { id: 'd' });
    const { store, run, rows } = setup([doc]);
    await run.getState().start(untaggedRows(rows()));
    const [one, two] = run.getState().items;
    run.getState().skip(one.rootId);
    await run.getState().change(two.rootId, ['C.pes'], undefined);
    await run.getState().acceptAll();
    expect(run.getState().items.map((i) => i.state)).toEqual(['skipped', 'saved', 'saved']);
    expect(topicsOf(store, 'd', qs[0].id)).toEqual([]);
    expect(topicsOf(store, 'd', qs[1].id)).toEqual(['C.pes']);
    expect(topicsOf(store, 'd', qs[2].id)).toEqual(['C.ped']);
    expect(run.getState().items[1].changed).toBe(true);
  });

  it('a 題型 is saved under its topic only when it is one of the teacher’s', async () => {
    const q = choiceQuestion('TR falls as price rises.');
    const { store, run, rows } = setup([docWith([q], { id: 'd' })], answering('C.ped', 'Calculate PED from TR'));
    await run.getState().start(untaggedRows(rows()));
    expect(run.getState().items[0].pattern).toEqual({ topic: 'C.ped', name: 'Calculate PED from TR' });
    await run.getState().accept(run.getState().items[0].rootId);
    expect(topicsOf(store, 'd', q.id)).toEqual(['C.ped', 'C.ped::Calculate PED from TR']);
  });

  it('never changes a question that got topics since the run: it says so', async () => {
    const q = choiceQuestion('Rice.');
    const { store, run, rows } = setup([docWith([q], { id: 'd' })]);
    await run.getState().start(untaggedRows(rows()));
    // Tagged elsewhere (another tab, stamped) before the teacher accepts; the bank's rows not caught up yet.
    const doc = store.saved.get('d')!;
    store.saved.set('d', { ...doc, questions: doc.questions.map((x) => ({ ...x, tags: ['J.trade'], tagsAt: '2026-11-25T09:00:00.000Z' })) });
    await run.getState().accept(run.getState().items[0].rootId);
    expect(run.getState().items[0]).toMatchObject({ state: 'notSaved', reason: TAGGED_MEANWHILE });
    expect(topicsOf(store, 'd', q.id)).toEqual(['J.trade']);
  });

  it('Undo puts back exactly what the accept changed', async () => {
    const q = choiceQuestion('Rice.', '', ['S5']);
    const { store, run, rows } = setup([docWith([q], { id: 'd' })]);
    await run.getState().start(untaggedRows(rows()));
    const root = run.getState().items[0].rootId;
    await run.getState().accept(root);
    expect(topicsOf(store, 'd', q.id)).toEqual(['S5', 'C.ped']);
    await run.getState().undo(root);
    expect(topicsOf(store, 'd', q.id)).toEqual(['S5']);
    expect(run.getState().items[0].state).toBe('ready');
  });

  it('a question with parts gets the topics on every part', async () => {
    const q = partedQuestion([{}, {}]);
    const { store, run, rows } = setup([docWith([q], { id: 'd' })]);
    await run.getState().start(untaggedRows(rows()));
    await run.getState().accept(run.getState().items[0].rootId);
    const saved = store.saved.get('d')!.questions[0];
    expect(derivedTags(saved)).toContain('C.ped');
    expect(rowsOf(store.saved.get('d')!)[0].slots?.every((slot) => slot.tags.includes('C.ped'))).toBe(true);
  });

  it('asked about a tagged question (Suggest topics again), Accept replaces its topics', async () => {
    const q = choiceQuestion('Rice.', '', ['J.trade', 'S5']);
    const { store, run, rows } = setup([docWith([q], { id: 'd' })]);
    const row = rows()[0];
    expect(untaggedRows(rows())).toEqual([]);
    await run.getState().start([row], { again: true });
    expect(run.getState().items[0].current).toEqual(['J.trade']);
    await run.getState().accept(row.rootId);
    expect(topicsOf(store, 'd', q.id)).toEqual(['C.ped', 'S5']);
  });

  it('a question with no words is never sent', async () => {
    const blank = choiceQuestion('') as McqQuestion;
    blank.options = blank.options.map((o) => ({ ...o, text: { en: [], zh: [] } }));
    const filled = choiceQuestion('Rice.');
    const { run, rows, client } = setup([docWith([blank, filled], { id: 'd' })]);
    await run.getState().start(untaggedRows(rows()));
    expect(run.getState().items.map((i) => i.state)).toEqual(['noWords', 'ready']);
    expect(client.requests.map(keysOf)).toEqual([['q1']]);
  });

  it('no AI set up: an error naming the fix, nothing sent', async () => {
    const { run, rows, client } = setup([docWith([choiceQuestion('Rice.')], { id: 'd' })], answering('C.ped'), {
      createRunDeps: async () => ({ ok: false, provider: 'gemini', reason: 'noKey' }),
    });
    await run.getState().start(untaggedRows(rows()));
    expect(run.getState().status).toBe('error');
    expect(run.getState().error?.actions).toContain('openSettings');
    expect(client.requests).toHaveLength(0);
    run.getState().dismissError();
    expect(run.getState().status).toBe('stopped');
  });

  it('Close stops and forgets; nothing unaccepted is written', async () => {
    const { store, run, rows } = setup([docWith([choiceQuestion('A'), choiceQuestion('B')], { id: 'd' })]);
    await run.getState().start(untaggedRows(rows()));
    await run.getState().close();
    expect(run.getState()).toMatchObject({ status: 'idle', items: [] });
    expect(store.saves()).toBe(0);
  });
});

describe('the accept edit', () => {
  it('adds to an untagged question and leaves a tagged one alone, unless asked again', () => {
    const empty = { tags: ['S5'], slots: [] };
    const tagged = { tags: ['J.trade', 'S5'], slots: [] };
    expect(acceptEdit(['C.ped'], undefined, false)(empty).tags).toEqual(['S5', 'C.ped']);
    expect(acceptEdit(['C.ped'], undefined, false)(tagged)).toBe(tagged);
    expect(acceptEdit(['C.ped'], undefined, true)(tagged).tags).toEqual(['C.ped', 'S5']);
  });

  it('untagged rows: one per question, none tagged in any copy', () => {
    const rows = [
      { rootId: 'r1', tags: [] },
      { rootId: 'r1', tags: [] },
      { rootId: 'r2', tags: ['C.ped'] },
      { rootId: 'r2', tags: [] },
      { rootId: 'r3', tags: ['C.new'] },
    ] as unknown as BankRow[];
    expect(untaggedRows(rows).map((r) => r.rootId)).toEqual(['r1']);
  });
});
