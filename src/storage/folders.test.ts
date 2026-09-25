/**
 * Folders: filing metadata beside the index, never in it. Keys are literals, like
 * `legacyIndex.test.ts` — what an older build reads (and does not read) is the contract.
 * The rule everything here serves: no state of the folders key can hide a document.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorksheet } from '@/model/factories';
import { LocalStorageWorksheetStore } from '.';
import {
  copyAssignment,
  createFolder,
  deleteFolder,
  EMPTY_FOLDERS,
  folderCounts,
  folderNameProblem,
  folderOf,
  forgetDocuments,
  mergeBackupFolders,
  moveToFolder,
  parseFolders,
  renameFolder,
  serializeFolders,
  sortedFolders,
  updateFolders,
  usableFolders,
  type FolderState,
} from './folders';

const INDEX_KEY = 'econ-worksheet-index';
const PREFIX = 'econ-worksheet:';
const TRASH_KEY = 'econ-worksheet-trash';
const FOLDERS_KEY = 'econ-worksheet-folders';
const DAY = 86_400_000;

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
let clock: number;
const store = () => new LocalStorageWorksheetStore(() => clock);
const doc = (id: string) => ({
  ...createWorksheet(),
  id,
  name: `Doc ${id}`,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
  clock = Date.parse('2026-09-01T00:00:00.000Z');
});

const twoFolders = (): FolderState => {
  let state = createFolder(EMPTY_FOLDERS, 'Mocks', 'f-mocks', 'T');
  state = createFolder(state, '  S5   2026-27 ', 'f-s5', 'T');
  return state;
};

describe('folder rules', () => {
  it('creates, renames and sorts folders naturally; names are tidied', () => {
    let state = twoFolders();
    state = createFolder(state, 'Unit 10', 'f-10');
    state = createFolder(state, 'Unit 9', 'f-9');
    expect(state.folders.find((f) => f.id === 'f-s5')?.name).toBe('S5 2026-27');
    expect(sortedFolders(state).map((f) => f.name)).toEqual([
      'Mocks',
      'S5 2026-27',
      'Unit 9',
      'Unit 10',
    ]);
    state = renameFolder(state, 'f-mocks', 'Mock papers');
    expect(state.folders.find((f) => f.id === 'f-mocks')?.name).toBe('Mock papers');
  });

  it('refuses an empty or duplicate name, case-blind, but not the folder’s own', () => {
    const state = twoFolders();
    expect(folderNameProblem(state, '   ')).toBeDefined();
    expect(folderNameProblem(state, 'mocks')).toBeDefined();
    expect(folderNameProblem(state, 'MOCKS', 'f-mocks')).toBeUndefined();
    expect(folderNameProblem(state, 'Term 1')).toBeUndefined();
  });

  it('moves documents in, between and out of folders', () => {
    let state = moveToFolder(twoFolders(), ['a', 'b'], 'f-mocks');
    expect(folderOf(state, 'a')?.id).toBe('f-mocks');
    state = moveToFolder(state, ['a'], 'f-s5');
    expect(folderOf(state, 'a')?.id).toBe('f-s5');
    state = moveToFolder(state, ['a'], undefined);
    expect(folderOf(state, 'a')).toBeUndefined();
    expect(state.assignments).toEqual({ b: 'f-mocks' });
    // An unknown folder is root, never a dangling assignment.
    expect(moveToFolder(state, ['b'], 'nope').assignments).toEqual({});
  });

  it('deleting a folder returns its documents to root and deletes none', () => {
    let state = moveToFolder(twoFolders(), ['a', 'b'], 'f-mocks');
    state = moveToFolder(state, ['c'], 'f-s5');
    state = deleteFolder(state, 'f-mocks');
    expect(state.folders.map((f) => f.id)).toEqual(['f-s5']);
    expect(state.assignments).toEqual({ c: 'f-s5' });
  });

  it('counts, copies and forgets assignments', () => {
    let state = moveToFolder(twoFolders(), ['a', 'b'], 'f-mocks');
    expect(folderCounts(state, ['a', 'b', 'x']).get('f-mocks')).toBe(2);
    state = copyAssignment(state, 'a', 'a-copy');
    expect(folderOf(state, 'a-copy')?.id).toBe('f-mocks');
    expect(copyAssignment(state, 'root-doc', 'z')).toBe(state);
    state = forgetDocuments(state, ['a']);
    expect(state.assignments).toEqual({ b: 'f-mocks', 'a-copy': 'f-mocks' });
    expect(forgetDocuments(state, ['never-filed'])).toBe(state);
  });

  it('a stale assignment — its folder gone — is root', () => {
    const state: FolderState = { folders: [], assignments: { a: 'deleted-folder' } };
    expect(folderOf(state, 'a')).toBeUndefined();
    expect(folderCounts(state, ['a']).size).toBe(0);
  });
});

describe('reading a folders file', () => {
  it('judges rows one at a time and keeps what a newer build added', () => {
    const state = usableFolders({
      format: 1,
      folders: [
        { id: 'f1', name: 'Mocks', colour: 'red' },
        { id: 'f2' },
        null,
        'junk',
        { id: 'f1', name: 'Duplicate id' },
        { id: 'f3', name: 'Term 1', parentId: 'f1' },
      ],
      assignments: { a: 'f1', b: 7, c: '', d: 'f3' },
      pinned: ['a'],
    });
    expect(state.folders.map((f) => f.id)).toEqual(['f1', 'f3']);
    expect(state.assignments).toEqual({ a: 'f1', d: 'f3' });
    const written = serializeFolders(renameFolder(state, 'f1', 'Mock papers'));
    expect(written.pinned).toEqual(['a']);
    expect((written.folders as Record<string, unknown>[])[0]).toEqual({
      id: 'f1',
      name: 'Mock papers',
      colour: 'red',
    });
    expect((written.folders as Record<string, unknown>[])[1].parentId).toBe('f1');
  });

  it('anything unreadable is no folders at all', () => {
    for (const raw of [null, '', '{', '[]', '"x"', '42', '{"folders":"x","assignments":[1]}']) {
      expect(parseFolders(raw)).toEqual({ folders: [], assignments: {} });
    }
  });
});

describe('merging a backup’s folders', () => {
  it('reuses folders by id or name, adds new ones, and never re-files a filed document', () => {
    let here = createFolder(EMPTY_FOLDERS, 'mocks', 'here-mocks');
    here = moveToFolder(here, ['kept'], 'here-mocks');
    const incoming: FolderState = {
      folders: [
        { id: 'b-mocks', name: 'Mocks' },
        { id: 'b-term', name: 'Term 1' },
      ],
      assignments: { a: 'b-mocks', kept: 'b-term', c: 'b-term', skipped: 'b-term' },
    };
    const placed = new Map([
      ['a', 'a'],
      ['kept', 'kept'],
      ['c', 'c-copy'],
    ]);
    const merged = mergeBackupFolders(here, incoming, placed);
    expect(sortedFolders(merged).map((f) => [f.id, f.name])).toEqual([
      ['here-mocks', 'mocks'],
      ['b-term', 'Term 1'],
    ]);
    expect(merged.assignments).toEqual({
      kept: 'here-mocks', // already filed here: left alone
      a: 'here-mocks', // same-named folder reused
      'c-copy': 'b-term', // a copy is filed as its original was
    });
  });
});

describe('the web store', () => {
  it('keeps folders under their own key, outside the document prefix and the index', async () => {
    await store().save(doc('a'));
    await updateFolders(store(), (s) => moveToFolder(createFolder(s, 'Mocks', 'f1'), ['a'], 'f1'));

    expect(FOLDERS_KEY.startsWith(PREFIX)).toBe(false);
    expect(JSON.parse(storage.getItem(FOLDERS_KEY)!)).toMatchObject({
      format: 1,
      folders: [{ id: 'f1', name: 'Mocks' }],
      assignments: { a: 'f1' },
    });
    // The index row is exactly what an older build writes: nothing to lose on a rewrite.
    expect(Object.keys(JSON.parse(storage.getItem(INDEX_KEY)!)[0]).sort()).toEqual(
      ['hasCover', 'id', 'questionCount', 'title', 'updatedAt'].sort(),
    );
    expect(folderOf(await store().readFolders(), 'a')?.name).toBe('Mocks');
  });

  it('survives an older build rewriting the index', async () => {
    await store().save(doc('a'));
    await updateFolders(store(), (s) => moveToFolder(createFolder(s, 'Mocks', 'f1'), ['a'], 'f1'));
    // An older build saves another document: it rewrites the index from what it knows.
    storage.setItem(
      INDEX_KEY,
      JSON.stringify([{ id: 'b', title: 'B', updatedAt: 'x' }, { id: 'a', title: 'Doc a', updatedAt: 'y' }]),
    );
    expect(folderOf(await store().readFolders(), 'a')?.id).toBe('f1');
  });

  it('a malformed folders key lists every document, reads as no folders, and is not touched', async () => {
    await store().save(doc('a'));
    await store().save(doc('b'));
    storage.setItem(FOLDERS_KEY, '{not json');

    expect((await store().list()).map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(await store().readFolders()).toEqual({ folders: [], assignments: {} });
    await store().trash('a');
    await store().purge('a');
    expect(storage.getItem(FOLDERS_KEY)).toBe('{not json');
  });

  it('removes the key when nothing is left in it', async () => {
    await updateFolders(store(), (s) => createFolder(s, 'Mocks', 'f1'));
    expect(storage.getItem(FOLDERS_KEY)).not.toBeNull();
    await updateFolders(store(), (s) => deleteFolder(s, 'f1'));
    expect(storage.getItem(FOLDERS_KEY)).toBeNull();
  });

  it('Trash keeps the folder, so Restore puts it back where it was', async () => {
    await store().save(doc('a'));
    await updateFolders(store(), (s) => moveToFolder(createFolder(s, 'Mocks', 'f1'), ['a'], 'f1'));
    await store().trash('a');
    expect((await store().readFolders()).assignments).toEqual({ a: 'f1' });

    expect(await store().restore('a')).toBe('a');
    expect(folderOf(await store().readFolders(), 'a')?.id).toBe('f1');
  });

  it('deleting for good forgets the folder: purge, Empty Trash, expiry, remove', async () => {
    for (const id of ['p', 'e', 'x', 'r', 'keep']) await store().save(doc(id));
    await updateFolders(store(), (s) =>
      moveToFolder(createFolder(s, 'Mocks', 'f1'), ['p', 'e', 'x', 'r', 'keep'], 'f1'),
    );

    await store().trash('p');
    await store().purge('p');
    await store().remove('r');
    await store().trash('x');
    clock += 31 * DAY;
    await store().listTrash(); // expires x
    await store().trash('e');
    await store().emptyTrash();

    expect((await store().readFolders()).assignments).toEqual({ keep: 'f1' });
    expect(storage.getItem(TRASH_KEY)).toBeNull();
  });

  it('clear() takes the folders with the documents', async () => {
    await store().save(doc('a'));
    await updateFolders(store(), (s) => createFolder(s, 'Mocks', 'f1'));
    storage.setItem('econgen.startFolder', 'f1');
    await store().clear();
    expect(storage.getItem(FOLDERS_KEY)).toBeNull();
    // A per-viewer preference is not a document; clear() leaves it.
    expect(storage.getItem('econgen.startFolder')).toBe('f1');
  });
});
