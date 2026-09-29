import { beforeEach, describe, expect, it } from 'vitest';
import { createParagraphBlock } from '@/model/factories';
import { copyQuestion } from '@/model/lineage';
import { bi } from '@/model/text';
import type { Worksheet } from '@/model/types';
import { LocalStorageWorksheetStore } from '@/storage';
import { withChangeFeed } from '@/storage/changes';
import { summarize } from '@/storage/document';
import type { WorksheetStore } from '@/storage/types';
import { createJsonFileBackend, createMemoryBackend, INDEX_FORMAT, type BankIndexBackend } from './bankBackend';
import { createBankIndex, type BankIndex, type BankSource } from './bankIndex';
import { installLocalStorage, localFeed } from './bankTestKit';
import { rowsOf } from './indexer';
import { choiceQuestion, docWith } from './testKit';

/**
 * The persistent index against the real web store (fake `localStorage`), a private change
 * feed and an in-memory backend. "Another tab" is the undecorated store: it changes the
 * documents without announcing anything, as a second tab would.
 */

const noPause = () => Promise.resolve();

let n = 0;
/** A saved document with one question per stem, dated so the newest is obvious. */
function paper(stems: string[], extra: Partial<Worksheet> = {}): Worksheet {
  n += 1;
  return docWith(stems.map((stem) => choiceQuestion(stem)), {
    updatedAt: `2026-01-${String(n).padStart(2, '0')}T00:00:00.000Z`,
    ...extra,
  });
}

function edited(worksheet: Worksheet, stem: string): Worksheet {
  const [first, ...rest] = worksheet.questions;
  return {
    ...worksheet,
    questions: [{ ...first, blocks: [createParagraphBlock(bi(stem, ''))] }, ...rest],
    updatedAt: new Date(Date.parse(worksheet.updatedAt) + 1000).toISOString(),
  };
}

/** Counts loads, so a test can prove a fresh document was not re-read. */
function counting(store: WorksheetStore) {
  const loads: string[] = [];
  const source: BankSource = {
    list: () => store.list(),
    load: (id) => {
      loads.push(id);
      return store.load(id);
    },
  };
  return { source, loads };
}

function setup(backend: BankIndexBackend = createMemoryBackend()) {
  const feed = localFeed();
  const other = new LocalStorageWorksheetStore();
  const store = withChangeFeed(other, feed.emit);
  const { source, loads } = counting(other);
  let wakeUp: () => void = () => undefined;
  const index = createBankIndex(source, noPause, {
    backend,
    changes: feed.subscribe,
    wake: (listener) => {
      wakeUp = listener;
      return () => undefined;
    },
  });
  return { index, store, other, backend, loads, feed, wake: () => wakeUp() };
}

const excerpts = (index: BankIndex) => index.getSnapshot().rows.map((r) => r.excerpt.en);

beforeEach(() => {
  installLocalStorage();
});

describe('createBankIndex — reconcile', () => {
  it('indexes every listed document, newest first, and stamps each', async () => {
    const { index, store, backend } = setup();
    const older = paper(['Old one', 'Old two']);
    const newer = paper(['New one']);
    await store.save(older);
    await store.save(newer);
    await index.refresh();
    await index.settled();

    expect(index.getSnapshot().status).toEqual({ state: 'ready', done: 2, total: 2 });
    expect(excerpts(index)).toEqual(['New one', 'Old one', 'Old two']);
    const stored = await backend.load();
    expect(stored?.get(older.id)?.updatedAt).toBe(older.updatedAt);
    expect(stored?.get(newer.id)?.rows.map((r) => r.excerpt.en)).toEqual(['New one']);
  });

  it('re-reads only documents whose stamp differs, and indexes new ones', async () => {
    const { index, other, loads } = setup();
    const kept = paper(['Kept']);
    const changed = paper(['Before']);
    await other.save(kept);
    await other.save(changed);
    await index.refresh();
    loads.length = 0;

    await other.save(edited(changed, 'After'));
    const added = paper(['Added']);
    await other.save(added);
    await index.refresh();

    expect(loads.sort()).toEqual([added.id, changed.id].sort());
    expect(excerpts(index).sort()).toEqual(['Added', 'After', 'Kept']);
  });

  it('drops a document trashed or removed elsewhere, and takes it back when restored', async () => {
    const { index, other } = setup();
    const a = paper(['A']);
    const b = paper(['B']);
    await other.save(a);
    await other.save(b);
    await index.refresh();

    await other.trash(a.id);
    await other.remove(b.id);
    await index.refresh();
    expect(index.getSnapshot().rows).toEqual([]);

    // The web keeps a trashed document's key: `list()` decides, never the key.
    expect(await other.load(a.id)).toBeDefined();
    await other.restore(a.id);
    await index.refresh();
    expect(excerpts(index)).toEqual(['A']);
  });

  it('gives a hidden document no rows, but a stamp, so it is not re-read', async () => {
    const { index, other, loads } = setup();
    const hidden = paper(['Private'], { bankHidden: true });
    await other.save(hidden);
    await index.refresh();
    expect(index.getSnapshot().rows).toEqual([]);
    loads.length = 0;
    await index.refresh();
    expect(loads).toEqual([]);
  });

  it('publishes one set of tags per question, but stores each copy’s own', async () => {
    const { index, other, backend } = setup();
    const original = choiceQuestion('Tagged in one paper', '', ['C.ped']);
    const copy = { ...copyQuestion(original, 'x'), tags: ['mock'] };
    const a = paper([]);
    const b = paper([]);
    await other.save({ ...a, questions: [original], flow: [{ type: 'question', id: original.id }] });
    await other.save({ ...b, questions: [copy], flow: [{ type: 'question', id: copy.id }] });
    await index.refresh();
    await index.settled();

    const { rows, groups } = index.getSnapshot();
    expect(rows.map((r) => r.tags)).toEqual([['mock', 'C.ped'], ['mock', 'C.ped']]);
    expect(groups[0].rows.every((r) => r.tags.includes('C.ped'))).toBe(true);
    const stored = await backend.load();
    expect(stored?.get(b.id)?.rows[0].tags).toEqual(['mock']);
    expect(stored?.get(a.id)?.rows[0].tags).toEqual(['C.ped']);
  });

  it('publishes progress while scanning', async () => {
    const { index, other } = setup();
    for (let i = 0; i < 9; i++) await other.save(paper([`Doc ${i}`]));
    const seen: string[] = [];
    index.subscribe(() => {
      const { status, rows } = index.getSnapshot();
      seen.push(`${status.state} ${status.done}/${status.total} rows=${rows.length}`);
    });
    await index.settled();
    expect(seen).toEqual(['scanning 0/9 rows=0', 'scanning 4/9 rows=4', 'scanning 8/9 rows=8', 'ready 9/9 rows=9']);
  });
});

describe('createBankIndex — wake', () => {
  it('reconciles when woken', async () => {
    const setupResult = setup();
    const { index, other } = setupResult;
    await index.refresh();
    await other.save(paper(['From the other tab']));
    setupResult.wake();
    await index.settled();
    expect(excerpts(index)).toEqual(['From the other tab']);
  });
});

describe('createBankIndex — change feed', () => {
  it('re-indexes a saved document from the worksheet written, without reading it back', async () => {
    const { index, store, loads } = setup();
    const doc = paper(['First draft']);
    await store.save(doc);
    await index.refresh();
    loads.length = 0;

    await store.save(edited(doc, 'Second draft'));
    await index.settled();
    expect(excerpts(index)).toEqual(['Second draft']);
    expect(loads).toEqual([]);
    expect(index.getSnapshot().status.state).toBe('ready');
  });

  it('re-reads a renamed document, and names it by its new name', async () => {
    const { index, store } = setup();
    const doc = paper(['Stem']);
    await store.save(doc);
    await index.refresh();
    await store.rename(doc.id, 'Mock exam');
    await index.settled();
    expect(index.getSnapshot().rows[0].docTitle).toBe('Mock exam');
  });

  it('drops on trash and remove, and brings back on restore', async () => {
    const { index, store, backend } = setup();
    const a = paper(['A']);
    const b = paper(['B']);
    await store.save(a);
    await store.save(b);
    await index.refresh();

    await store.trash(a.id);
    await index.settled();
    expect(excerpts(index)).toEqual(['B']);
    expect((await backend.load())?.has(a.id)).toBe(false);

    await store.restore(a.id);
    await index.settled();
    expect(excerpts(index).sort()).toEqual(['A', 'B']);

    await store.remove(b.id);
    await index.settled();
    expect(excerpts(index)).toEqual(['A']);
  });

  it('indexes a restore that came back under a new id (desktop), and leaves the live one', async () => {
    const { index, other, feed } = setup();
    const live = paper(['Live copy']);
    await other.save(live);
    await index.refresh();
    const copy = { ...edited(live, 'Restored copy'), id: 'copy-id' };
    await other.save(copy);
    feed.emit({ docId: copy.id, kind: 'restored' });
    await index.settled();
    expect(excerpts(index).sort()).toEqual(['Live copy', 'Restored copy']);
  });

  it('wipes everything on clear, backend included', async () => {
    const { index, store, backend } = setup();
    await store.save(paper(['Gone soon']));
    await index.refresh();
    await store.clear();
    await index.settled();
    expect(index.getSnapshot()).toMatchObject({ rows: [], status: { state: 'ready', done: 0, total: 0 } });
    expect(await backend.load()).toBeUndefined();
  });

  it('reconciles on a purge or Empty Trash (no id)', async () => {
    const { index, store, other } = setup();
    await index.refresh();
    await other.save(paper(['Saved quietly']));
    await store.emptyTrash();
    await index.settled();
    expect(excerpts(index)).toEqual(['Saved quietly']);
  });

  it('never lets a slow scan overwrite a fresher save', async () => {
    const other = new LocalStorageWorksheetStore();
    const feed = localFeed();
    const store = withChangeFeed(other, feed.emit);
    const doc = paper(['Old text']);
    await other.save(doc);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const index = createBankIndex(
      {
        list: () => other.list(),
        load: async (id) => {
          const loaded = await other.load(id); // the old text, read before the save
          await gate;
          return loaded;
        },
      },
      noPause,
      { changes: feed.subscribe },
    );
    const scan = index.refresh();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await store.save(edited(doc, 'New text'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await scan;
    await index.settled();
    expect(excerpts(index)).toEqual(['New text']);
  });
});

describe('createBankIndex — persistence', () => {
  it('paints stored rows before the store has even listed', async () => {
    const backend = createMemoryBackend();
    const doc = paper(['Remembered']);
    await backend.commit([[doc.id, { updatedAt: doc.updatedAt, rows: rowsOf(doc, summarize(doc)) }]], []);
    let listed: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (listed = resolve));
    const index = createBankIndex(
      {
        list: async () => {
          await gate;
          return [summarize(doc)];
        },
        load: async () => doc,
      },
      noPause,
      { backend },
    );
    index.subscribe(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(index.getSnapshot()).toMatchObject({ status: { state: 'scanning' } });
    expect(excerpts(index)).toEqual(['Remembered']);
    listed();
    await index.settled();
    expect(index.getSnapshot().status.state).toBe('ready');
  });

  it('survives a reload: a second index over the same backend reads nothing that is fresh', async () => {
    const backend = createMemoryBackend();
    const first = setup(backend);
    await first.store.save(paper(['Persisted']));
    await first.index.refresh();
    await first.index.settled();

    const second = setup(backend);
    await second.index.refresh();
    expect(excerpts(second.index)).toEqual(['Persisted']);
    expect(second.loads).toEqual([]);
  });

  it('rebuilds from the documents when the stored index is corrupt', async () => {
    const file = { text: '{"format":1,"docs":{"x":{"updatedAt":"t","rows":[{"nope":1}]}}}' as string | undefined, removed: 0 };
    const backend = createJsonFileBackend({
      read: async () => file.text,
      write: async (text) => void (file.text = text),
      remove: async () => {
        file.removed += 1;
        file.text = undefined;
      },
    });
    const { index, other } = setup(backend);
    await other.save(paper(['Rebuilt']));
    await index.refresh();
    await index.settled();
    expect(file.removed).toBe(1);
    expect(excerpts(index)).toEqual(['Rebuilt']);
    const written = JSON.parse(file.text!);
    expect(written.format).toBe(INDEX_FORMAT);
    expect(Object.values(written.docs)).toHaveLength(1);
  });

  it('keeps working when the backend throws on every call', async () => {
    const broken: BankIndexBackend = {
      load: () => Promise.reject(new Error('io')),
      commit: () => Promise.reject(new Error('io')),
      clear: () => Promise.reject(new Error('io')),
    };
    const { index, store } = setup(broken);
    await store.save(paper(['Still works']));
    await index.refresh();
    await index.settled();
    expect(excerpts(index)).toEqual(['Still works']);
    expect(index.getSnapshot().status.state).toBe('ready');
  });
});
