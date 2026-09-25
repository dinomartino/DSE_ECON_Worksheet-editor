/**
 * Renaming a document a newer build saved is refused, and the dialog says why.
 * The store's refusal (§ NewerDocumentError) used to escape as an unhandled rejection,
 * leaving the dialog open with no message.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import v1Corpus from '@/test/corpus/v1-published.json';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import { LocalStorageWorksheetStore } from '@/storage';
import { RENAME_NEWER_MESSAGE, RenameDialog, renameWorksheet } from './RenameDialog';

const INDEX_KEY = 'econ-worksheet-index';
const PREFIX = 'econ-worksheet:';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

let storage: Storage;
const seed = (id: string, schemaVersion: number) => {
  // The frozen corpus is only read; the fixture is a relabelled clone.
  const raw = JSON.stringify({ ...structuredClone(v1Corpus), id, schemaVersion }, null, 2);
  storage.setItem(PREFIX + id, raw);
  storage.setItem(
    INDEX_KEY,
    JSON.stringify([{ id, title: 'Mock paper', updatedAt: '2027-01-01T00:00:00.000Z' }]),
  );
  return raw;
};

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
});

describe('renaming from the start screen', () => {
  it('refuses a newer document, shows why, and leaves its bytes alone', async () => {
    const raw = seed('from-the-future', CURRENT_SCHEMA_VERSION + 1);

    const problem = await renameWorksheet(new LocalStorageWorksheetStore(), 'from-the-future', 'Renamed');

    expect(problem).toBe(RENAME_NEWER_MESSAGE);
    expect(storage.getItem(PREFIX + 'from-the-future')).toBe(raw);

    const markup = renderToStaticMarkup(
      <RenameDialog
        summary={{ id: 'from-the-future', title: 'Mock paper', updatedAt: '2027-01-01T00:00:00.000Z' }}
        error={problem}
        onClose={() => {}}
        onDone={() => {}}
      />,
    );
    expect(markup).toContain(RENAME_NEWER_MESSAGE);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Cancel');
  });

  it('renames a current document with nothing to report', async () => {
    seed('current', CURRENT_SCHEMA_VERSION);
    const store = new LocalStorageWorksheetStore();

    expect(await renameWorksheet(store, 'current', 'Renamed')).toBeUndefined();
    expect((await store.load('current'))!.name).toBe('Renamed');
  });

  it('says something even for a failure it cannot name', async () => {
    const failing = { rename: () => Promise.reject(new Error('quota')) };
    expect(await renameWorksheet(failing, 'x', 'y')).toBe('Could not rename that worksheet.');
  });

  it('shows no error text before anything is refused', () => {
    const markup = renderToStaticMarkup(
      <RenameDialog
        summary={{ id: 'x', title: 'Mock paper', updatedAt: '2027-01-01T00:00:00.000Z' }}
        onClose={() => {}}
        onDone={() => {}}
      />,
    );
    expect(markup).not.toContain('role="alert"');
  });
});
