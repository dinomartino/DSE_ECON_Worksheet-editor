import { describe, expect, it } from 'vitest';
import { summarize } from '@/storage/document';
import { createJsonFileBackend, INDEX_FORMAT, isBankRow, type TextFilePort } from './bankBackend';
import { rowsOf } from './indexer';
import { choiceQuestion, docWith, row } from './testKit';

function memoryFile(initial?: string) {
  const file = { text: initial, writes: 0, removes: 0 };
  const port: TextFilePort = {
    read: async () => file.text,
    write: async (text) => {
      file.writes += 1;
      await Promise.resolve();
      file.text = text;
    },
    remove: async () => {
      file.removes += 1;
      file.text = undefined;
    },
  };
  return { file, port };
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

describe('createJsonFileBackend', () => {
  it('round-trips documents, keeping printed order', async () => {
    const { port, file } = memoryFile();
    await createJsonFileBackend(port).commit([[doc.id, stored]], []);
    expect(JSON.parse(file.text!).format).toBe(INDEX_FORMAT);

    const reloaded = await createJsonFileBackend(port).load();
    expect(reloaded?.get(doc.id)?.rows.map((r) => r.excerpt.en)).toEqual(['One', 'Two', 'Three']);
  });

  it('drops documents and clears', async () => {
    const { port, file } = memoryFile();
    const backend = createJsonFileBackend(port);
    await backend.commit([[doc.id, stored], ['empty', { updatedAt: 'x', rows: [] }]], []);
    await backend.commit([], [doc.id]);
    expect([...(await createJsonFileBackend(port).load())!.keys()]).toEqual(['empty']);
    await backend.clear();
    expect(file.text).toBeUndefined();
  });

  it('coalesces a burst of commits into at most two writes', async () => {
    const { port, file } = memoryFile();
    const backend = createJsonFileBackend(port);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => backend.commit([[`d${i}`, { updatedAt: 't', rows: [] }]], [])),
    );
    expect(file.writes).toBeLessThanOrEqual(2);
    expect(Object.keys(JSON.parse(file.text!).docs)).toHaveLength(10);
  });

  it.each([
    ['not JSON', '{oops'],
    ['another format', JSON.stringify({ format: INDEX_FORMAT + 1, docs: {} })],
    ['a row that is not a row', JSON.stringify({ format: INDEX_FORMAT, docs: { a: { updatedAt: 't', rows: [{}] } } })],
    ['a row filed under another document', JSON.stringify({ format: INDEX_FORMAT, docs: { other: stored } })],
    ['no stamp', JSON.stringify({ format: INDEX_FORMAT, docs: { [doc.id]: { rows: stored.rows } } })],
  ])('drops a file holding %s, so the index rebuilds', async (_label, text) => {
    const { port, file } = memoryFile(text);
    expect(await createJsonFileBackend(port).load()).toBeUndefined();
    expect(file.removes).toBe(1);
  });

  it('treats a read that throws as nothing stored', async () => {
    const { port } = memoryFile();
    port.read = () => Promise.reject(new Error('EACCES'));
    expect(await createJsonFileBackend(port).load()).toBeUndefined();
  });
});
