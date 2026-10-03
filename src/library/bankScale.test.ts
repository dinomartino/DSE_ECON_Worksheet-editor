import { describe, expect, it } from 'vitest';
import { summarize } from '@/storage/document';
import { createDocFilesBackend, readDocFile, STORED_INDEX_FORMAT, type CacheFilePort, type DocFilesPort, type StoredDoc } from './bankBackend';
import { groupRows } from './group';
import { rowsOf } from './indexer';
import { withSharedTags } from './sharedTags';
import { choiceQuestion, docWith, partedQuestion } from './testKit';

/**
 * The bank at the size of a real library: 2000 papers (10 000 questions). Each file call
 * costs a simulated IPC round trip, so the desktop launch is measured in calls and time.
 * `BANK_SCALE=1 npx vitest run src/library/bankScale.test.ts` prints the numbers.
 */

const PAPERS = 2000;
/** One Tauri fs call, round trip (a fair figure for `plugin-fs` on a Mac). */
const IPC_MS = 1;
const log = (...args: unknown[]) => {
  if (process.env.BANK_SCALE) console.log(...args);
};

const ipc = () => new Promise((resolve) => setTimeout(resolve, IPC_MS));

function library(): Map<string, StoredDoc> {
  const docs = new Map<string, StoredDoc>();
  for (let p = 0; p < PAPERS; p++) {
    const questions = [
      ...Array.from({ length: 4 }, (_, q) => choiceQuestion(`Paper ${p} question ${q}: a demand curve shifts`, '', ['C.ped'])),
      partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.intervention'] }]),
    ];
    const doc = docWith(questions);
    docs.set(doc.id, { updatedAt: doc.updatedAt, rows: rowsOf(doc, summarize(doc)) });
  }
  return docs;
}

/** `worksheets/library/` in memory, every call one simulated round trip, counted. */
function disk(docs: Map<string, StoredDoc>) {
  const files = new Map([...docs].map(([id, doc]) => [id, JSON.stringify({ format: STORED_INDEX_FORMAT, ...doc })]));
  const text: Record<string, string | undefined> = {};
  let calls = 0;
  const call = async <T>(value: () => T): Promise<T> => {
    calls += 1;
    await ipc();
    return value();
  };
  const port: DocFilesPort = {
    ids: () => call(() => [...files.keys()]),
    read: (id) => call(() => files.get(id)),
    write: (id, value) => call(() => void files.set(id, value)),
    remove: (id) => call(() => void files.delete(id)),
    clear: () => call(() => files.clear()),
  };
  const cacheFile = (name: string): CacheFilePort => ({
    read: () => call(() => text[name]),
    write: (value) => call(() => void (text[name] = value)),
    remove: () => call(() => void delete text[name]),
  });
  return { port, files, cache: { pack: cacheFile('pack'), journal: cacheFile('journal') }, calls: () => calls, reset: () => (calls = 0) };
}

/** The load this build replaced: chunks of 16, each read an `exists` then a read (two calls). */
async function previousLoad(port: DocFilesPort): Promise<number> {
  const ids = await port.ids();
  let loaded = 0;
  for (let at = 0; at < ids.length; at += 16) {
    await Promise.all(
      ids.slice(at, at + 16).map(async (id) => {
        await ipc(); // exists
        const text = await port.read(id);
        if (text && readDocFile(id, text)) loaded += 1;
      }),
    );
  }
  return loaded;
}

const time = async <T>(run: () => Promise<T>): Promise<[T, number]> => {
  const start = performance.now();
  const out = await run();
  return [out, Math.round(performance.now() - start)];
};

describe(`the bank at ${PAPERS} papers`, () => {
  const docs = library();
  const rows = [...docs.values()].flatMap((doc) => doc.rows);

  it('desktop launch: one pack read and the changed files, not one file per paper', { timeout: 60_000 }, async () => {
    const files = disk(docs);
    const [previous, previousMs] = await time(() => previousLoad(files.port));
    expect(previous).toBe(PAPERS);
    log(`previous load: ${files.calls() + PAPERS} calls (exists + read each), ${previousMs} ms`);

    files.reset();
    const first = createDocFilesBackend(files.port, undefined, files.cache);
    const [scanned, scanMs] = await time(() => first.load());
    expect(scanned?.size).toBe(PAPERS);
    // ids, pack and journal, every file (the background pack write may have begun).
    expect(files.calls()).toBeGreaterThanOrEqual(3 + PAPERS);
    expect(files.calls()).toBeLessThanOrEqual(5 + PAPERS);
    log(`first launch (no pack yet): ${files.calls()} calls, ${scanMs} ms`);
    await first.commit([], []); // the pack is written in the background

    // An editing session: three papers saved.
    const edited = [...docs.keys()].slice(0, 3);
    await first.commit(edited.map((id) => [id, { ...docs.get(id)!, updatedAt: '2030-01-01T00:00:00.000Z' }]), []);

    files.reset();
    const next = createDocFilesBackend(files.port, undefined, files.cache);
    const [loaded, packMs] = await time(() => next.load());
    expect(loaded?.size).toBe(PAPERS);
    expect(edited.every((id) => loaded?.get(id)?.updatedAt === '2030-01-01T00:00:00.000Z')).toBe(true);
    expect(files.calls()).toBeGreaterThanOrEqual(2 + edited.length);
    expect(files.calls()).toBeLessThanOrEqual(4 + edited.length);
    log(`next launch (pack + journal): ${files.calls()} calls, ${packMs} ms`);
    log(`rows: ${rows.length}, pack ${Math.round(files.cache ? (await files.cache.pack.read())!.length / 1024 / 1024 : 0)} MB`);
  });

  it('a publish over every row (what S8 now does once per burst, not once per save)', () => {
    const start = performance.now();
    const shared = withSharedTags(rows);
    groupRows(shared);
    const ms = Math.round(performance.now() - start);
    log(`one publish over ${rows.length} rows: ${ms} ms`);
    expect(shared).toHaveLength(rows.length);
  });
});
