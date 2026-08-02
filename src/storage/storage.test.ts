import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageWorksheetStore, duplicateWorksheet, worksheetTitle } from '.';
import { createMcqQuestion, createWorksheet, newId } from '@/model/factories';
import { bi, emptyBiText, plain } from '@/model/text';

/**
 * Browser persistence (§6).
 *
 * The store is the reason a document survives a restart — it lives in `localStorage`,
 * not in the build — so the risks are about *reach*: clearing more than this app owns,
 * or failing to clear what it does.
 */

/** A `localStorage` good enough for the store, since the tests run under node. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  // `Object.keys(storage)` is what the implementation enumerates, so the entries have to
  // be own properties of the object itself, exactly as the browser exposes them.
  return new Proxy(storage as unknown as Storage, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: (_t, p) =>
      map.has(String(p))
        ? { configurable: true, enumerable: true, value: map.get(String(p)) }
        : undefined,
    get: (target, p) =>
      p in target ? (target as never)[p] : (map.get(String(p)) as never),
  });
}

let storage: Storage;

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
});

const store = () => new LocalStorageWorksheetStore();

describe('saving and reopening', () => {
  it('round-trips a worksheet and lists it', async () => {
    const worksheet = { ...createWorksheet(), title: bi('Test paper', '測驗') };
    await store().save(worksheet);

    expect(await store().load(worksheet.id)).toMatchObject({ id: worksheet.id });
    expect(await store().list()).toEqual([
      expect.objectContaining({ id: worksheet.id, title: 'Test paper' }),
    ]);
  });

  it('lists the most recently updated document first', async () => {
    // What the editor reopens on load, so the ordering *is* the "my last work came
    // back" behaviour rather than an incidental detail of the index.
    const older = { ...createWorksheet(), updatedAt: '2026-01-01T00:00:00.000Z' };
    const newer = { ...createWorksheet(), updatedAt: '2026-08-01T00:00:00.000Z' };
    await store().save(older);
    await store().save(newer);

    expect((await store().list())[0].id).toBe(newer.id);
  });
});

/**
 * The file list reads the index, never the documents (§`WorksheetSummary`), so anything
 * it shows has to be *in* the index — and has to survive an index written before those
 * fields existed.
 */
describe('the file list', () => {
  it('records what the list shows about each document', async () => {
    const worksheet = {
      ...createWorksheet(),
      questions: [createMcqQuestion(), createMcqQuestion()],
    };
    await store().save(worksheet);

    expect((await store().list())[0]).toMatchObject({ questionCount: 2, hasCover: false });
  });

  it('names a Chinese-only document by its Chinese title', async () => {
    // A worksheet titled only in Chinese is not untitled. The fallback order is a
    // decision the list, the rename field and the download filename all share.
    const worksheet = { ...createWorksheet(), title: { en: [], zh: [{ text: '模擬試卷' }] } };
    expect(worksheetTitle(worksheet)).toBe('模擬試卷');
  });

  it('reads Untitled only when there is no title at all', () => {
    expect(worksheetTitle({ ...createWorksheet(), title: emptyBiText() })).toBe('Untitled');
  });
});

describe('renaming', () => {
  it('writes the document’s own title, so the list agrees with the page', async () => {
    // A display name kept beside the document in the index would part company with
    // `worksheet.title` the moment the title was edited on the page.
    const worksheet = createWorksheet();
    await store().save(worksheet);

    await store().rename(worksheet.id, 'Renamed paper');

    expect((await store().list())[0].title).toBe('Renamed paper');
    expect(plain((await store().load(worksheet.id))!.title.en)).toBe('Renamed paper');
  });

  it('leaves the Chinese title alone', async () => {
    // The rename field is one box; blanking authored Chinese as a side effect of
    // renaming in English would be a silent loss.
    const worksheet = { ...createWorksheet(), title: bi('Old', '舊標題') };
    await store().save(worksheet);

    await store().rename(worksheet.id, 'New');

    expect(plain((await store().load(worksheet.id))!.title.zh)).toBe('舊標題');
  });

  it('does nothing for an id that is not there', async () => {
    await expect(store().rename('missing', 'x')).resolves.toBeUndefined();
  });
});

describe('duplicating', () => {
  it('saves a copy beside the original rather than replacing it', async () => {
    const worksheet = { ...createWorksheet(), title: bi('Mock paper', '') };
    await store().save(worksheet);

    await store().save(duplicateWorksheet(worksheet, newId()));

    const list = await store().list();
    expect(list).toHaveLength(2);
    expect(list.map((entry) => entry.title).sort()).toEqual(['Mock paper', 'Mock paper (copy)']);
  });

  it('keeps the ids inside the document, changing only the document id', async () => {
    /*
     * Every id *inside* a worksheet addresses something within that one document, so
     * they stay unique after a copy — unlike duplicating a question, where the clone
     * lands in the same id space as its original and must be re-idded.
     */
    const worksheet = { ...createWorksheet(), questions: [createMcqQuestion()] };
    const copy = duplicateWorksheet(worksheet, newId());

    expect(copy.id).not.toBe(worksheet.id);
    expect(copy.questions[0].id).toBe(worksheet.questions[0].id);
  });

  it('sorts to the top of the list, where the teacher is looking for it', async () => {
    // Titled, because "(copy)" is appended to a title — a new document starts with
    // none (§ `createWorksheet`), and duplicating an untitled one lists as another
    // "Untitled" row.
    const worksheet = {
      ...createWorksheet(),
      title: bi('S.6 Mock', ''),
      updatedAt: '2020-01-01T00:00:00.000Z',
    };
    await store().save(worksheet);
    await store().save(duplicateWorksheet(worksheet, newId()));

    expect((await store().list())[0].title).toContain('(copy)');
  });
});

describe('clearing', () => {
  it('forgets every saved document', async () => {
    await store().save(createWorksheet());
    await store().save(createWorksheet());
    expect(await store().list()).toHaveLength(2);

    await store().clear();
    expect(await store().list()).toEqual([]);
  });

  it('touches nothing that belongs to another app on the same origin', async () => {
    // `localStorage` is shared across everything served from this origin. Clearing it
    // wholesale — or reaching for the browser's own "clear site data" — would delete a
    // neighbour's keys, which is why the implementation filters by prefix rather than
    // calling `storage.clear()`.
    storage.setItem('some-other-app:token', 'keep me');
    storage.setItem('theme', 'dark');
    await store().save(createWorksheet());

    await store().clear();

    expect(storage.getItem('some-other-app:token')).toBe('keep me');
    expect(storage.getItem('theme')).toBe('dark');
  });

  it('is safe to call when nothing has ever been saved', async () => {
    await expect(store().clear()).resolves.toBeUndefined();
    expect(await store().list()).toEqual([]);
  });
});
