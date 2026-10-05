/**
 * The bank index rows the v0.6.0 release stored (INDEX_FORMAT 7), frozen in
 * `src/test/corpus/bank-v0.6.0-index.json` beside the paper and bank that produced them
 * (`scripts/emit-bank-v0.6.0-corpus.test.ts`, which refuses any commit but the tag).
 * Never regenerate them.
 *
 * The index is derived data: once the stored format moves, these rows are dropped whole and
 * rebuilt from the documents, which is allowed. What may never happen is a row that loads
 * damaged, or a rebuild that loses a question's identity, its parts' roots or its tags.
 */
import { describe, expect, it } from 'vitest';
import frozen from '@/test/corpus/bank-v0.6.0-index.json';
import paperCorpus from '@/test/corpus/bank-v0.6.0-paper.json';
import bankCorpus from '@/test/corpus/bank-v0.6.0-bank.json';
import { migrate } from '@/model/migrations';
import type { WorksheetSummary } from '@/storage/types';
import {
  createMemoryBackend,
  INDEX_FORMAT,
  isBankRow,
  readDocFile,
  readJsonIndex,
  STORED_INDEX_FORMAT,
  storedDoc,
  type IndexedDocs,
} from './bankBackend';
import { createBankIndex } from './bankIndex';
import { docsFromRecords } from './idbBackend';
import { rowsOf } from './indexer';
import type { BankRow } from './types';

/** The rows version that wrote the corpus. */
const WRITTEN_AT = 7;
/** This build reads the stored rows as they are (else it rebuilds them). */
const sameFormat = frozen.storedIndexFormat === STORED_INDEX_FORMAT;

type StoredFile = { format: string; updatedAt: string; rows: BankRow[] };
const FILES = frozen['library/docs'] as Record<string, StoredFile>;
const PACK = frozen['library/pack.json'] as { format: string; docs: Record<string, { updatedAt: string; rows: BankRow[] }> };
const SUMMARIES = frozen['econ-worksheet-index'] as WorksheetSummary[];
const DOCUMENTS: Record<string, unknown> = { 'bank-v060-paper': paperCorpus, 'bank-v060-bank': bankCorpus };
const asStored = (file: StoredFile) => ({ updatedAt: file.updatedAt, rows: file.rows });
const expected: IndexedDocs = new Map(Object.entries(FILES).map(([id, file]) => [id, asStored(file)]));

/** What a rebuild must keep: everything but the derived search text and content hash. */
function meaning(row: BankRow) {
  const { searchText: _searchText, contentKey: _contentKey, ...kept } = row;
  void _searchText;
  void _contentKey;
  return kept;
}

describe('the bank index v0.6.0 stored', () => {
  it(`was written at INDEX_FORMAT ${WRITTEN_AT}, its pack agreeing with its files`, () => {
    expect(frozen.storedIndexFormat.startsWith(`${WRITTEN_AT}.`)).toBe(true);
    expect(Object.keys(FILES).sort()).toEqual(['bank-v060-bank', 'bank-v060-paper']);
    for (const file of Object.values(FILES)) expect(file.format).toBe(frozen.storedIndexFormat);
    expect(PACK.format).toBe(frozen.storedIndexFormat);
    expect(PACK.docs).toEqual(Object.fromEntries(expected));
    expect([...expected.values()].flatMap((doc) => doc.rows)).toHaveLength(5);
  });

  it('every row validates as a row of its document while the rows version is unchanged', () => {
    if (INDEX_FORMAT !== WRITTEN_AT) {
      // A later rows version never reads them: the stamp rejects the whole store first.
      expect(readJsonIndex(JSON.stringify(PACK))).toBeUndefined();
      return;
    }
    for (const [id, file] of Object.entries(FILES)) {
      for (const row of file.rows) expect(isBankRow(row), `${id} ${row.questionId}`).toBe(true);
      expect(storedDoc(id, asStored(file))).toEqual(asStored(file));
    }
  });

  it('loads intact through the desktop files, the pack and the web records, or is dropped whole', () => {
    const fromPack = readJsonIndex(JSON.stringify(PACK));
    const fromFiles = new Map(Object.entries(FILES).map(([id, file]) => [id, readDocFile(id, JSON.stringify(file))]));
    const records = Object.values(FILES).flatMap((file) =>
      file.rows.map((row, seq) => ({ docId: row.docId, questionId: row.questionId, seq, row })),
    );
    const stamps = Object.entries(FILES).map(([docId, file]) => ({ docId, updatedAt: file.updatedAt }));
    const fromRecords = docsFromRecords({ key: 'format', value: frozen.storedIndexFormat }, stamps, records);
    if (sameFormat) {
      expect(fromPack).toEqual(expected);
      expect(fromFiles).toEqual(expected);
      expect(fromRecords).toEqual({ docs: expected, bad: [] });
    } else {
      expect(fromPack).toBeUndefined();
      for (const doc of fromFiles.values()) expect(doc).toBeUndefined();
      expect(fromRecords).toBeUndefined();
    }
  });

  it('rebuilt from the frozen documents, every row keeps its identity, part roots and tags', () => {
    for (const summary of SUMMARIES) {
      const rows = rowsOf(migrate(structuredClone(DOCUMENTS[summary.id])), summary);
      const stored = FILES[summary.id].rows;
      expect(rows.map(meaning)).toEqual(stored.map(meaning));
      // Same rows version and labels: the very same rows, byte for byte.
      if (INDEX_FORMAT === WRITTEN_AT && sameFormat) expect(rows).toEqual(stored);
    }
  });

  it('keeps the part slots, the legacy question-level topics, and one question across the copy pair', () => {
    const rows = Object.values(FILES).flatMap((file) => file.rows);
    const pair = rows.filter((row) => row.rootId === 'v060-013');
    expect(pair.map((row) => row.docId).sort()).toEqual(['bank-v060-bank', 'bank-v060-paper']);
    expect(pair[0].slots).toEqual(pair[1].slots);
    expect(pair[0].slots?.map((slot) => [slot.key, slot.own, slot.tags])).toEqual([
      ['v060-018', ['C.ped', 'C.ped::Explain PED'], ['C.ped', 'C.ped::Explain PED']],
      ['v060-021', ['C.intervention'], ['C.intervention']],
      ['v060-024', undefined, ['C.intervention']],
      ['v060-027', ['E.efficiency'], ['E.efficiency']],
    ]);
    expect(pair[0].ownTags).toEqual(['mock 2026']);
    const legacy = rows.find((row) => row.questionId === 'v060-040')!;
    expect(legacy.ownTags).toEqual(['C.equilibrium', 'mock 2026']);
    expect(legacy.slots?.map((slot) => [slot.key, slot.own, slot.tags])).toEqual([['v060-042', undefined, ['C.equilibrium']]]);
  });

  it('the bank lists each copied question once, with both copies, from stored or rebuilt rows', async () => {
    const source = {
      list: async () => structuredClone(SUMMARIES),
      load: async (id: string) => migrate(structuredClone(DOCUMENTS[id])),
    };
    for (const seeded of [true, false]) {
      const backend = createMemoryBackend();
      if (seeded && sameFormat) for (const [id, doc] of expected) backend.docs.set(id, structuredClone(doc));
      const index = createBankIndex(source, () => Promise.resolve(), { backend });
      await index.refresh();
      await index.settled();
      const groups = new Map(index.getSnapshot().groups.map((group) => [group.rootId, group]));
      expect([...groups.keys()].sort()).toEqual(['v060-006', 'v060-013', 'v060-040']);
      for (const root of ['v060-006', 'v060-013']) {
        const group = groups.get(root)!;
        expect(group.rows.map((row) => row.docId).sort()).toEqual(['bank-v060-bank', 'bank-v060-paper']);
        expect(group.versions).toBe(1);
        expect(group.usedIn.map((use) => [use.docId, use.classes])).toEqual([['bank-v060-paper', ['5A', '5B']]]);
      }
    }
  });
});
