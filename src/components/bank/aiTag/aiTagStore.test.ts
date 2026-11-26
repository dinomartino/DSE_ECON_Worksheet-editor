import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { CompletionRequest } from '@/ai/types';
import { rowsOf } from '@/library/indexer';
import { choiceQuestion, docWith, partedQuestion } from '@/library/testKit';
import type { BankRow } from '@/library/types';
import { copyQuestion } from '@/model/lineage';
import { derivedTags, slotRef, tagStateOf } from '@/model/tagSlots';
import type { McqQuestion, Worksheet } from '@/model/types';
import { scriptedClient } from '@/translate/testKit';
import type { RunDepsResult } from '@/translate/types';
import { acceptEdit, acceptPartEdit, createAiTag, TAGGED_MEANWHILE, undoPartEdit, untaggedRows, type AiTagDeps } from './aiTagStore';

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

const questionsOf = (req: CompletionRequest) => (JSON.parse(req.turns[req.turns.length - 1].content) as { questions: Array<{ key: string; parts?: string[] }> }).questions;
const keysOf = (req: CompletionRequest): string[] => questionsOf(req).map((q) => q.key);
/** Every item a request asks for: a question's key, or one per part ("q1(a)"). */
const itemKeysOf = (req: CompletionRequest): string[] => questionsOf(req).flatMap((q) => (q.parts ? q.parts.map((label) => `${q.key}${label}`) : [q.key]));

/** Every question (or part) gets `main`, with `pattern` when given; `byPart` gives a part's own. */
const answering = (main: string, pattern = '', byPart: Record<string, string> = {}) =>
  scriptedClient([
    (req) =>
      JSON.stringify({
        items: itemKeysOf(req).map((key) => ({ key, main: byPart[key.replace(/^q\d+/, '')] ?? main, also: '', pattern, conf: 'high', why: `Tests ${key}.` })),
      }),
  ]);

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
    expect(item.suggestion?.why).toBe('Tests q1.');
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

  it('a question with one part gets the topics on it, as a whole question', async () => {
    const q = partedQuestion([{}]);
    const { store, run, rows } = setup([docWith([q], { id: 'd' })]);
    await run.getState().start(untaggedRows(rows()));
    expect(run.getState().items[0].parts).toBeUndefined();
    await run.getState().accept(run.getState().items[0].rootId);
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

describe('part by part (u-g13t)', () => {
  /** What each part of the saved question tests, by label. */
  const byLabel = (store: ReturnType<typeof memoryStore>, docId: string) =>
    Object.fromEntries((rowsOf(store.saved.get(docId)!)[0].slots ?? []).map((slot) => [slot.label, slot.tags]));
  const partsAnswer = () => answering('C.ped', '', { '(a)': 'C.intervention', '(b)': 'E.efficiency', '(c)(i)': 'C.ped', '(c)(ii)': 'C.pes' });

  it('suggests per part and writes nothing until a part is accepted; Accept writes that part only, in every copy', async () => {
    const q = partedQuestion([{}, {}]);
    const copy = copyQuestion(q);
    const { store, run, rows } = setup([docWith([q], { id: 'a' }), docWith([copy], { id: 'b' })], partsAnswer());
    await run.getState().start(untaggedRows(rows()));
    const item = run.getState().items[0];
    expect(item.state).toBe('ready');
    expect(item.parts?.map((p) => [p.label, p.topics, p.state, p.suggestion?.why])).toEqual([
      ['(a)', ['C.intervention'], 'ready', 'Tests q1(a).'],
      ['(b)', ['E.efficiency'], 'ready', 'Tests q1(b).'],
    ]);
    expect(store.saves()).toBe(0);
    await run.getState().accept(item.rootId, item.parts![1].slot);
    expect(byLabel(store, 'a')).toEqual({ '(a)': [], '(b)': ['E.efficiency'] });
    expect(byLabel(store, 'b')).toEqual({ '(a)': [], '(b)': ['E.efficiency'] });
    expect(run.getState().items[0].parts?.map((p) => p.state)).toEqual(['ready', 'saved']);
    expect(run.getState().items[0].state).toBe('ready');
    // The other part is still accepted on its own, though the question has a topic now.
    await run.getState().accept(item.rootId, item.parts![0].slot);
    expect(byLabel(store, 'a')).toEqual({ '(a)': ['C.intervention'], '(b)': ['E.efficiency'] });
    expect(run.getState().items[0].state).toBe('saved');
  });

  it('sub-parts get their own; Skip, Change and Accept all parts per part', async () => {
    const q = partedQuestion([{}, {}, { subs: [undefined, undefined] }]);
    const { store, run, rows } = setup([docWith([q], { id: 'd' })], partsAnswer());
    await run.getState().start(untaggedRows(rows()));
    const item = run.getState().items[0];
    expect(item.parts?.map((p) => p.label)).toEqual(['(a)', '(b)', '(c)(i)', '(c)(ii)']);
    const [a, b, ci] = item.parts!;
    run.getState().skip(item.rootId, a.slot);
    await run.getState().change(item.rootId, ['E.equity'], undefined, b.slot);
    await run.getState().accept(item.rootId);
    expect(run.getState().items[0].parts?.map((p) => p.state)).toEqual(['skipped', 'saved', 'saved', 'saved']);
    expect(byLabel(store, 'd')).toEqual({ '(a)': [], '(b)': ['E.equity'], '(c)': [], '(c)(i)': ['C.ped'], '(c)(ii)': ['C.pes'] });
    expect(run.getState().items[0].parts![1].changed).toBe(true);
    expect(ci.state).toBe('ready');
  });

  it('Undo takes back one part, even after another was accepted, and leaves the other', async () => {
    const q = partedQuestion([{}, {}], ['S5']);
    const { store, run, rows } = setup([docWith([q], { id: 'd' })], partsAnswer());
    await run.getState().start(untaggedRows(rows()));
    const [a, b] = run.getState().items[0].parts!;
    const root = run.getState().items[0].rootId;
    await run.getState().accept(root, a.slot);
    await run.getState().accept(root, b.slot);
    await run.getState().undo(root, a.slot);
    expect(byLabel(store, 'd')).toEqual({ '(a)': [], '(b)': ['E.efficiency'] });
    expect(topicsOf(store, 'd', q.id)).toEqual(['E.efficiency', 'S5']);
    expect(run.getState().items[0].parts?.map((p) => p.state)).toEqual(['ready', 'saved']);
  });

  it('a part tagged since the run is left alone and says so; the other parts still save', async () => {
    const q = partedQuestion([{}, {}]);
    const { store, run, rows } = setup([docWith([q], { id: 'd' })], partsAnswer());
    await run.getState().start(untaggedRows(rows()));
    const doc = store.saved.get('d')!;
    const tagged = { ...doc.questions[0], parts: doc.questions[0].type === 'structured' ? doc.questions[0].parts.map((p, i) => (i === 0 ? { ...p, tags: ['J.trade'] } : p)) : [], tagsAt: '2026-11-25T09:00:00.000Z' };
    store.saved.set('d', { ...doc, questions: [tagged as typeof doc.questions[0]] });
    await run.getState().accept(run.getState().items[0].rootId);
    expect(run.getState().items[0].parts?.map((p) => [p.state, p.reason])).toEqual([
      ['notSaved', TAGGED_MEANWHILE],
      ['saved', undefined],
    ]);
    expect(byLabel(store, 'd')).toEqual({ '(a)': ['J.trade'], '(b)': ['E.efficiency'] });
  });

  it('asked again about a tagged question, a part’s accept replaces that part’s topics only', async () => {
    const q = partedQuestion([{ tags: ['J.trade'] }, { tags: ['H.money'] }]);
    const { store, run, rows } = setup([docWith([q], { id: 'd' })], partsAnswer());
    await run.getState().start([rows()[0]], { again: true });
    const [a] = run.getState().items[0].parts!;
    expect(a.before).toEqual(['J.trade']);
    await run.getState().accept(run.getState().items[0].rootId, a.slot);
    expect(byLabel(store, 'd')).toEqual({ '(a)': ['C.intervention'], '(b)': ['H.money'] });
    await run.getState().undo(run.getState().items[0].rootId, a.slot);
    expect(byLabel(store, 'd')).toEqual({ '(a)': ['J.trade'], '(b)': ['H.money'] });
  });

  it('a part the AI left out has no suggestion and can be tagged with Change…', async () => {
    const q = partedQuestion([{}, {}]);
    const { store, run, rows } = setup([docWith([q], { id: 'd' })], answering('C.ped', '', { '(b)': 'Not a code' }));
    await run.getState().start(untaggedRows(rows()));
    const [, b] = run.getState().items[0].parts!;
    expect(b.state).toBe('noAnswer');
    await run.getState().change(run.getState().items[0].rootId, ['E.efficiency'], undefined, b.slot);
    expect(byLabel(store, 'd')['(b)']).toEqual(['E.efficiency']);
  });

  it('a part with no words is listed, not sent', async () => {
    const q = partedQuestion([{}, {}, {}]);
    q.parts[2].blocks = [];
    const { run, rows, client } = setup([docWith([q], { id: 'd' })], partsAnswer());
    await run.getState().start(untaggedRows(rows()));
    expect(run.getState().items[0].parts?.map((p) => p.state)).toEqual(['ready', 'ready', 'noWords']);
    expect(itemKeysOf(client.requests[0])).toEqual(['q1(a)', 'q1(b)']);
  });

  it('the part edits: add only to an empty part; undo only what is still there', () => {
    const q = partedQuestion([{}, { tags: ['J.trade'] }]);
    const state = tagStateOf(q);
    const [a, b] = state.slots.map((slot) => slotRef(state.slots, slot.key)!);
    expect(acceptPartEdit(a, ['C.ped'], undefined, false)(state).slots.map((s) => s.own)).toEqual([['C.ped'], ['J.trade']]);
    expect(acceptPartEdit(b, ['C.ped'], undefined, false)(state)).toBe(state);
    const after = acceptPartEdit(a, ['C.ped'], undefined, false)(state);
    expect(undoPartEdit(a, ['C.ped'], [])(after).slots[0].own).toBeUndefined();
    expect(undoPartEdit(a, ['C.pes'], [])(after)).toBe(after);
  });
});
