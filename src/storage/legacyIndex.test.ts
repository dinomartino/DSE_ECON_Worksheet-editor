/**
 * The file list must keep showing documents saved by the published build.
 *
 * A worksheet has two halves in storage: the document itself under
 * `econ-worksheet:<id>`, and an entry in the `econ-worksheet-index` array that the start
 * screen reads. They fail independently, and the index is the more dangerous one — a
 * document whose summary is missing or unreadable is **intact but unreachable**, because
 * the start screen is the only way in (§ the start screen). The teacher sees an empty
 * file list and concludes the work is gone.
 *
 * The storage keys are written as literals here on purpose. They are not exported, and
 * they are not an implementation detail to be kept in sync with the module — they are
 * the published contract with every browser that already has data under them. If a
 * change to the module makes these literals wrong, that change orphans real documents,
 * and this test is where it must fail.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageWorksheetStore } from '.';

const INDEX_KEY = 'econ-worksheet-index';
const PREFIX = 'econ-worksheet:';

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
  return new Proxy(storage as unknown as Storage, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: (_t, p) =>
      map.has(String(p))
        ? { configurable: true, enumerable: true, value: map.get(String(p)) }
        : undefined,
    get: (target, p) => (p in target ? (target as never)[p] : (map.get(String(p)) as never)),
  });
}

let storage: Storage;

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
});

const store = () => new LocalStorageWorksheetStore();

/**
 * An index entry exactly as an early published build wrote it: id, title, updatedAt and
 * nothing else. `questionCount` and `hasCover` came later and are optional for this
 * reason — a list that hid these rows would look like the documents had been lost.
 */
const LEGACY_ENTRY = {
  id: 'legacy-doc',
  title: 'S4 Economics Worksheet',
  updatedAt: '2026-01-15T09:00:00.000Z',
};

/** A minimal schema-v1 document, as saved beside that entry. */
const LEGACY_DOC = {
  schemaVersion: 1,
  id: 'legacy-doc',
  title: { en: [{ text: 'S4 Economics Worksheet' }], zh: [] },
};

describe('an index written by the published build still lists every document', () => {
  it('shows a legacy entry that predates questionCount and hasCover', async () => {
    storage.setItem(INDEX_KEY, JSON.stringify([LEGACY_ENTRY]));

    const listed = await store().list();

    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe('legacy-doc');
    expect(listed[0].title).toBe('S4 Economics Worksheet');
    // Absent, not defaulted to a wrong number: the count is unknown, and inventing 0
    // would tell the teacher an authored worksheet is empty.
    expect(listed[0].questionCount).toBeUndefined();
    expect(listed[0].hasCover).toBeUndefined();
  });

  it('opens the document a legacy entry names', async () => {
    storage.setItem(INDEX_KEY, JSON.stringify([LEGACY_ENTRY]));
    storage.setItem(PREFIX + 'legacy-doc', JSON.stringify(LEGACY_DOC));

    // Listing is only half the promise — the row has to actually open.
    const loaded = await store().load('legacy-doc');
    expect(loaded).toBeDefined();
    expect(loaded?.id).toBe('legacy-doc');
  });

  it('keeps a legacy entry listed after another document is saved', async () => {
    storage.setItem(INDEX_KEY, JSON.stringify([LEGACY_ENTRY]));
    storage.setItem(PREFIX + 'legacy-doc', JSON.stringify(LEGACY_DOC));

    const fresh = await store().load('legacy-doc');
    expect(fresh).toBeDefined();
    await store().save({ ...fresh!, id: 'new-doc', updatedAt: '2026-02-01T00:00:00.000Z' });

    // Writing the index must merge, never replace: a save that rewrote the array from
    // what this build knows about would silently evict every older document.
    const ids = (await store().list()).map((entry) => entry.id);
    expect(ids).toContain('legacy-doc');
    expect(ids).toContain('new-doc');
  });

  it('preserves unknown fields a newer build wrote into an entry', async () => {
    // The mirror of `__unknown` for documents: an older build must not evict data it
    // does not understand when it rewrites the index.
    storage.setItem(
      INDEX_KEY,
      JSON.stringify([{ ...LEGACY_ENTRY, starred: true, folderId: 'term-1' }]),
    );
    storage.setItem(PREFIX + 'legacy-doc', JSON.stringify(LEGACY_DOC));

    const listed = await store().list();
    const entry = listed[0] as unknown as Record<string, unknown>;

    expect(entry.starred).toBe(true);
    expect(entry.folderId).toBe('term-1');
  });
});

describe('a damaged index does not read as "all your work is gone"', () => {
  it('still opens a document whose index entry is missing entirely', async () => {
    // The index and the document fail independently. A document with no summary is
    // unreachable from the list, but `load` must still find it — that is what makes
    // recovery possible at all.
    storage.setItem(INDEX_KEY, JSON.stringify([]));
    storage.setItem(PREFIX + 'orphan-doc', JSON.stringify({ ...LEGACY_DOC, id: 'orphan-doc' }));

    const loaded = await store().load('orphan-doc');
    expect(loaded?.id).toBe('orphan-doc');
  });

  it('does not lose every row to one malformed entry', async () => {
    // `list()` casts the parsed array without validating each entry, and sorts on
    // `updatedAt`. A single entry missing that field throws inside the sort, and the
    // catch returns [] — one bad row hiding every good one.
    storage.setItem(
      INDEX_KEY,
      JSON.stringify([LEGACY_ENTRY, { id: 'broken' }, { ...LEGACY_ENTRY, id: 'second' }]),
    );

    const listed = await store().list();
    const ids = listed.map((entry) => entry.id);

    expect(ids).toContain('legacy-doc');
    expect(ids).toContain('second');
  });
});
