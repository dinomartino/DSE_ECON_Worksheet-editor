import { describe, expect, it } from 'vitest';
import { summarize } from '@/storage/document';
import {
  createDocFilesBackend,
  readDocFile,
  STORED_INDEX_FORMAT,
  isBankRow,
  type CacheFilePort,
  type DocFilesPort,
  type PackPorts,
  type StoredDoc,
  type TextFilePort,
} from './bankBackend';
import { docsFromRecords } from './idbBackend';
import { rowsOf } from './indexer';
import { choiceQuestion, docWith, partedQuestion, row } from './testKit';

function memoryFiles(initial: Record<string, string> = {}, legacyText?: string) {
  const files = new Map(Object.entries(initial));
  const counts = { writes: 0, removes: 0 };
  const port: DocFilesPort = {
    ids: async () => [...files.keys()],
    read: async (id) => files.get(id),
    write: async (id, text) => {
      counts.writes += 1;
      await Promise.resolve();
      files.set(id, text);
    },
    remove: async (id) => {
      counts.removes += 1;
      files.delete(id);
    },
    clear: async () => files.clear(),
  };
  const legacy = { text: legacyText, removes: 0 };
  const legacyPort: TextFilePort = {
    read: async () => legacy.text,
    remove: async () => {
      legacy.removes += 1;
      legacy.text = undefined;
    },
  };
  return { files, counts, port, legacy, legacyPort };
}

const doc = docWith([choiceQuestion('One'), choiceQuestion('Two'), choiceQuestion('Three')]);
const stored = { updatedAt: doc.updatedAt, rows: rowsOf(doc, summarize(doc)) };

describe('isBankRow', () => {
  it('accepts what rowsOf writes and rejects anything else', () => {
    expect(stored.rows.every(isBankRow)).toBe(true);
    expect(isBankRow(row({ classes: ['5A', '5B'], number: 3 }))).toBe(true);
    // A format-1 row (`classTag`, no use date) is not ours: the index is rebuilt.
    const formatOne: Record<string, unknown> = { ...row(), classTag: '5A' };
    delete formatOne.usedOn;
    expect(isBankRow(formatOne)).toBe(false);
    expect(isBankRow({ ...row(), classes: '5A' })).toBe(false);
    expect(isBankRow({ ...row(), excerpt: 'flat' })).toBe(false);
    expect(isBankRow({ ...row(), marks: '1' })).toBe(false);
    expect(isBankRow(null)).toBe(false);
  });
});

const docFile = (value: object) => JSON.stringify({ format: STORED_INDEX_FORMAT, ...value });

describe('createDocFilesBackend', () => {
  it('round-trips documents, one file each, keeping printed order', async () => {
    const { port, files } = memoryFiles();
    await createDocFilesBackend(port).commit([[doc.id, stored]], []);
    expect([...files.keys()]).toEqual([doc.id]);
    expect(JSON.parse(files.get(doc.id)!).format).toBe(STORED_INDEX_FORMAT);

    const reloaded = await createDocFilesBackend(port).load();
    expect(reloaded?.get(doc.id)?.rows.map((r) => r.excerpt.en)).toEqual(['One', 'Two', 'Three']);
  });

  it('a commit writes only the documents it names', async () => {
    const { port, counts } = memoryFiles();
    const backend = createDocFilesBackend(port);
    await backend.commit(Array.from({ length: 10 }, (_, i) => [`d${i}`, { updatedAt: 't', rows: [] }]), []);
    counts.writes = 0;
    await backend.commit([['d3', { updatedAt: 'u', rows: [] }]], []);
    expect(counts.writes).toBe(1);
  });

  it('drops documents and clears', async () => {
    const { port, files } = memoryFiles();
    const backend = createDocFilesBackend(port);
    await backend.commit([[doc.id, stored], ['empty', { updatedAt: 'x', rows: [] }]], []);
    await backend.commit([], [doc.id]);
    expect([...(await createDocFilesBackend(port).load())!.keys()]).toEqual(['empty']);
    await backend.clear();
    expect(files.size).toBe(0);
  });

  it.each([
    ['not JSON', '{oops'],
    ['another format', JSON.stringify({ format: 'another', updatedAt: 't', rows: [] })],
    ['a row that is not a row', docFile({ updatedAt: 't', rows: [{}] })],
    ['a row filed under another document', docFile(stored)],
    ['no stamp', docFile({ rows: stored.rows })],
    ['a rootId that is not a string', docFile({ ...stored, rows: [{ ...stored.rows[0], rootId: 42 }] })],
  ])('drops only the document whose file holds %s; the rest load', async (_label, text) => {
    const good = docWith([choiceQuestion('Kept')]);
    const { port, files } = memoryFiles({ bad: text, [good.id]: docFile({ updatedAt: good.updatedAt, rows: rowsOf(good, summarize(good)) }) });
    const loaded = await createDocFilesBackend(port).load();
    expect([...loaded!.keys()]).toEqual([good.id]);
    expect(files.has('bad')).toBe(false);
  });

  it('treats a listing or read that throws as nothing stored', async () => {
    const { port } = memoryFiles({ [doc.id]: docFile(stored) });
    port.read = () => Promise.reject(new Error('EACCES'));
    expect(await createDocFilesBackend(port).load()).toBeUndefined();
    port.ids = () => Promise.reject(new Error('EACCES'));
    expect(await createDocFilesBackend(port).load()).toBeUndefined();
  });
});

describe('createDocFilesBackend, migrating the single-file index', () => {
  const legacyText = (docs: Record<string, unknown>, format: string = STORED_INDEX_FORMAT) => JSON.stringify({ format, docs });

  it('writes each entry as its own file, then removes the old file', async () => {
    const { port, files, legacy, legacyPort } = memoryFiles({}, legacyText({ [doc.id]: stored }));
    const loaded = await createDocFilesBackend(port, legacyPort).load();
    expect(loaded?.get(doc.id)?.rows).toHaveLength(3);
    expect(readDocFile(doc.id, files.get(doc.id)!)?.rows).toHaveLength(3);
    expect(legacy.text).toBeUndefined();
  });

  it('keeps a document file newer than the old entry, and the old entry when it is newer', async () => {
    const other = docWith([choiceQuestion('Other')]);
    const otherRows = rowsOf(other, summarize(other));
    const { port, legacyPort } = memoryFiles(
      { [doc.id]: docFile({ ...stored, updatedAt: '2026-10-02' }), [other.id]: docFile({ updatedAt: '2026-01-01', rows: otherRows }) },
      legacyText({ [doc.id]: { ...stored, updatedAt: '2026-01-01' }, [other.id]: { updatedAt: '2026-10-02', rows: otherRows } }),
    );
    const loaded = (await createDocFilesBackend(port, legacyPort).load())!;
    expect(loaded.get(doc.id)?.updatedAt).toBe('2026-10-02');
    expect(loaded.get(other.id)?.updatedAt).toBe('2026-10-02');
  });

  it('one bad old entry costs only its document; another format or bad JSON is just removed', async () => {
    const good = docWith([choiceQuestion('Kept')]);
    const { port, legacyPort } = memoryFiles({}, legacyText({ bad: { updatedAt: 't', rows: [{}] }, [good.id]: { updatedAt: 't', rows: rowsOf(good, summarize(good)) } }));
    expect([...(await createDocFilesBackend(port, legacyPort).load())!.keys()]).toEqual([good.id]);

    for (const text of ['{oops', legacyText({ [doc.id]: stored }, 'another')]) {
      const next = memoryFiles({}, text);
      expect(await createDocFilesBackend(next.port, next.legacyPort).load()).toBeUndefined();
      expect(next.legacy.text).toBeUndefined();
    }
  });

  it('keeps the old file when a migrated entry could not be written', async () => {
    const { port, legacy, legacyPort } = memoryFiles({}, legacyText({ [doc.id]: stored }));
    port.write = () => Promise.reject(new Error('ENOSPC'));
    expect((await createDocFilesBackend(port, legacyPort).load())?.has(doc.id)).toBe(true);
    expect(legacy.text).toBeDefined();
  });

  it('clear removes the old file too', async () => {
    const { port, legacy, legacyPort } = memoryFiles({}, legacyText({}));
    await createDocFilesBackend(port, legacyPort).clear();
    expect(legacy.removes).toBe(1);
  });
});

describe('docsFromRecords (the IndexedDB stores, read)', () => {
  const format = { key: 'format', value: STORED_INDEX_FORMAT };
  const good = docWith([choiceQuestion('A'), choiceQuestion('B')]);
  const goodRows = rowsOf(good, summarize(good));
  const records = (docId: string, rows: unknown[]) => rows.map((row, seq) => ({ docId, questionId: `q${seq}`, seq, row }));

  it('loads every document, in printed order', () => {
    const out = docsFromRecords(format, [{ docId: good.id, updatedAt: 't' }], records(good.id, goodRows).reverse());
    expect(out?.docs.get(good.id)?.rows.map((r) => r.excerpt.en)).toEqual(['A', 'B']);
    expect(out?.bad).toEqual([]);
  });

  it('rejects everything only for another format', () => {
    expect(docsFromRecords({ key: 'format', value: 'another' }, [], [])).toBeUndefined();
    expect(docsFromRecords(undefined, [], [])).toBeUndefined();
  });

  it('drops only the document with a bad row, a bad stamp or no stamp', () => {
    const stamps = [
      { docId: good.id, updatedAt: 't' },
      { docId: 'badRow', updatedAt: 't' },
      { docId: 'badStamp', updatedAt: 5 },
    ];
    const rows = [
      ...records(good.id, goodRows),
      ...records('badRow', [{ ...goodRows[0], docId: 'badRow', rootId: 42 }]),
      ...records('noStamp', [{ ...goodRows[0], docId: 'noStamp' }]),
      { docId: 7, row: {} },
    ];
    const out = docsFromRecords(format, stamps, rows);
    expect([...out!.docs.keys()]).toEqual([good.id]);
    expect(out!.bad.sort()).toEqual(['badRow', 'badStamp', 'noStamp']);
  });
});

describe('rows of a question tagged per part', () => {
  const parted = docWith([partedQuestion([{ tags: ['C.ped'] }, { subs: [['D'], undefined] }], ['mock'])]);
  const partRows = rowsOf(parted, summarize(parted));

  it('are accepted as rowsOf writes them, and refused with a malformed part list', () => {
    expect(partRows[0].slots).toHaveLength(4);
    expect(partRows.every(isBankRow)).toBe(true);
    const [slot] = partRows[0].slots!;
    expect(isBankRow({ ...partRows[0], slots: 'flat' })).toBe(false);
    expect(isBankRow({ ...partRows[0], slots: [{ ...slot, leaf: 'yes' }] })).toBe(false);
    expect(isBankRow({ ...partRows[0], slots: [{ ...slot, own: [7] }] })).toBe(false);
    expect(isBankRow({ ...partRows[0], slots: [{ ...slot, tags: undefined }] })).toBe(false);
    expect(isBankRow({ ...partRows[0], slots: [{ ...slot, parent: 3 }] })).toBe(false);
    expect(isBankRow({ ...partRows[0], ownTags: 'mock' })).toBe(false);
  });

  it('a malformed part list drops only its own document', () => {
    const format = { key: 'format', value: STORED_INDEX_FORMAT };
    const good = docWith([choiceQuestion('A')]);
    const goodRows = rowsOf(good, summarize(good));
    const bad = { ...partRows[0], docId: 'badSlots', slots: [{ key: 'k' }] };
    const out = docsFromRecords(
      format,
      [
        { docId: good.id, updatedAt: 't' },
        { docId: 'badSlots', updatedAt: 't' },
        { docId: parted.id, updatedAt: 't' },
      ],
      [
        { docId: good.id, questionId: 'q0', seq: 0, row: goodRows[0] },
        { docId: 'badSlots', questionId: 'q0', seq: 0, row: bad },
        { docId: parted.id, questionId: 'q0', seq: 0, row: partRows[0] },
      ],
    );
    expect([...out!.docs.keys()].sort()).toEqual([good.id, parted.id].sort());
    expect(out!.bad).toEqual(['badSlots']);
  });
});

describe('createDocFilesBackend with a pack (one file per launch)', () => {
  function packed(initial: Record<string, string> = {}) {
    const base = memoryFiles(initial);
    const reads: string[] = [];
    const port: DocFilesPort = {
      ...base.port,
      read: async (id) => {
        reads.push(id);
        return base.files.get(id);
      },
    };
    const text: { pack?: string; journal?: string } = {};
    const order: string[] = [];
    const file = (name: 'pack' | 'journal'): CacheFilePort => ({
      read: async () => text[name],
      write: async (value) => {
        order.push(name);
        text[name] = value;
      },
      remove: async () => {
        order.push(`-${name}`);
        delete text[name];
      },
    });
    const cache: PackPorts = { pack: file('pack'), journal: file('journal') };
    const make = () => createDocFilesBackend(port, undefined, cache);
    return { ...base, port, reads, text, order, make };
  }
  const entry = (updatedAt: string): StoredDoc => ({ updatedAt, rows: [] });
  /** Waits for the backend's queued pack and journal writes (a commit of nothing queues behind them). */
  const drain = (backend: ReturnType<ReturnType<typeof packed>['make']>) => backend.commit([], []);

  it('without a pack, reads every file once and writes a pack; the next launch reads only the pack', async () => {
    const disk = packed();
    await createDocFilesBackend(disk.port).commit([[doc.id, stored], ['b', entry('t')]], []);
    const first = disk.make();
    expect([...(await first.load())!.keys()].sort()).toEqual([doc.id, 'b'].sort());
    await drain(first);
    expect(disk.reads.sort()).toEqual([doc.id, 'b'].sort());
    expect(JSON.parse(disk.text.pack!).format).toBe(STORED_INDEX_FORMAT);

    disk.reads.length = 0;
    const second = await disk.make().load();
    expect(disk.reads).toEqual([]);
    expect(second?.get(doc.id)?.rows.map((r) => r.excerpt.en)).toEqual(['One', 'Two', 'Three']);
    expect(second?.get('b')).toEqual(entry('t'));
  });

  it('a commit names its document in the journal before writing the file; the next launch reads just that file', async () => {
    const disk = packed();
    const first = disk.make();
    await first.load();
    await first.commit([['a', entry('1')], ['b', entry('1')]], []);
    await drain(first);
    // Fresh launch: pack written from the load, journal names a and b.
    const second = disk.make();
    await second.load();
    await drain(second);
    disk.order.length = 0;
    await second.commit([['a', entry('2')]], ['b']);
    expect(disk.order[0]).toBe('journal');
    expect(JSON.parse(disk.text.journal!).ids.sort()).toEqual(['a', 'b']);

    disk.reads.length = 0;
    const third = disk.make();
    const loaded = await third.load();
    expect(disk.reads.sort()).toEqual(['a', 'b']);
    expect(loaded?.get('a')).toEqual(entry('2'));
    expect(loaded?.has('b')).toBe(false);
    // Folded into a new pack, journal emptied.
    await drain(third);
    expect(disk.text.journal).toBeUndefined();
    expect(Object.keys(JSON.parse(disk.text.pack!).docs)).toEqual(['a']);
  });

  it('an unreadable pack or journal means reading every file, never losing a document', async () => {
    for (const damage of ['pack', 'journal'] as const) {
      const disk = packed();
      const first = disk.make();
      await first.load();
      await first.commit([['a', entry('1')]], []);
      await drain(first);
      disk.text[damage] = '{ damaged';
      disk.reads.length = 0;
      expect((await disk.make().load())?.get('a')).toEqual(entry('1'));
      expect(disk.reads).toEqual(['a']);
    }
  });

  it('clear removes the pack and the journal', async () => {
    const disk = packed();
    const backend = disk.make();
    await backend.load();
    await backend.commit([['a', entry('1')]], []);
    await backend.clear();
    expect(disk.text).toEqual({});
    expect(await disk.make().load()).toBeUndefined();
  });
});

