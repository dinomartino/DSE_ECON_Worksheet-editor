import { describe, expect, it } from 'vitest';
import { copyQuestion } from '@/model/lineage';
import type { Worksheet } from '@/model/types';
import { summarize } from '@/storage/document';
import { choiceQuestion, docWith } from './testKit';
import { createBankIndex } from './useBank';

function fakeStore(docs: Worksheet[], broken: string[] = []) {
  return {
    docs,
    list: async () => docs.map(summarize),
    load: async (id: string) => {
      if (broken.includes(id)) throw new Error('corrupt');
      return docs.find((doc) => doc.id === id);
    },
  };
}

const noPause = () => Promise.resolve();

describe('createBankIndex (the naive useBank provider)', () => {
  it('scans on first subscribe and publishes rows and groups when ready', async () => {
    const original = choiceQuestion('Which is a free good?');
    const bank = docWith([original], { kind: 'bank' });
    const paper = docWith([copyQuestion(original, bank.id), choiceQuestion('Other')]);
    const hidden = docWith([choiceQuestion('Private')], { bankHidden: true });
    const index = createBankIndex(fakeStore([bank, paper, hidden]), noPause);

    expect(index.getSnapshot().status.state).toBe('scanning');
    const states: string[] = [];
    index.subscribe(() => states.push(index.getSnapshot().status.state));
    await index.refresh();

    const { status, rows, groups } = index.getSnapshot();
    expect(status).toEqual({ state: 'ready', done: 3, total: 3 });
    expect(rows).toHaveLength(3);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.rootId === original.id)?.usedIn.map((u) => u.docId)).toEqual([paper.id]);
    expect(states.at(-1)).toBe('ready');
  });

  it('skips a document that will not load, and rescans on refresh', async () => {
    const good = docWith([choiceQuestion('Good')]);
    const bad = docWith([choiceQuestion('Bad')]);
    const store = fakeStore([good, bad], [bad.id]);
    const index = createBankIndex(store, noPause);
    await index.refresh();
    expect(index.getSnapshot().rows.map((r) => r.docId)).toEqual([good.id]);

    store.docs.push(docWith([choiceQuestion('New')]));
    await index.refresh();
    expect(index.getSnapshot().rows).toHaveLength(2);
  });

  it('lets a newer scan supersede an older one', async () => {
    const store = fakeStore([docWith([choiceQuestion('One')])]);
    const index = createBankIndex(store, noPause);
    const first = index.refresh();
    store.docs.push(docWith([choiceQuestion('Two')]));
    await Promise.all([first, index.refresh()]);
    expect(index.getSnapshot().rows).toHaveLength(2);
  });

  it('reports a store that cannot list', async () => {
    const index = createBankIndex({ list: () => Promise.reject(new Error('offline')), load: async () => undefined }, noPause);
    await index.refresh();
    expect(index.getSnapshot().status).toMatchObject({ state: 'error', error: 'Error: offline' });
  });
});
