/**
 * A document saved by a newer build opens read-only and is never written back.
 *
 * Teachers share files by folder and not everyone updates, so an older build will meet
 * documents from a newer one. It must show them (a teacher is never refused their work)
 * without rendering-and-saving them under its own, older rules — that would strip or
 * rewrite what the newer build needs. The fixture is the frozen v1 corpus relabelled one
 * version ahead, carrying fields no build has yet: the corpus file itself is only read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import v1Corpus from '@/test/corpus/v1-published.json';
import { CURRENT_SCHEMA_VERSION, isNewerThanBuild, migrate, serializeWorksheet } from '@/model/migrations';
import { createWorksheet } from '@/model/factories';
import { useWorksheetStore } from '@/store/worksheetStore';
import { NewerVersionBar, NEWER_VERSION_MESSAGE } from '@/components/editor/NewerVersionNotice';
import { editableCopy, LocalStorageWorksheetStore, NewerDocumentError } from '.';

const INDEX_KEY = 'econ-worksheet-index';
const PREFIX = 'econ-worksheet:';
const NEWER = CURRENT_SCHEMA_VERSION + 1;
const ID = 'from-the-future';

/** The v1 corpus as a newer build would save it: a higher version and fields unknown here. */
function newerDocument(): Record<string, unknown> {
  const corpus = structuredClone(v1Corpus) as Record<string, unknown> & {
    questions: Record<string, unknown>[];
  };
  return {
    ...corpus,
    id: ID,
    schemaVersion: NEWER,
    futureTopLevel: { rubric: 'levels', weights: [1, 2, 3] },
    questions: corpus.questions.map((question, index) =>
      index === 0 ? { ...question, futureNested: { tag: 'kept' } } : question,
    ),
  };
}

function fakeStorage(): Storage & { writes: string[] } {
  const map = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes.push(k);
      map.set(k, String(v));
    },
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

let storage: ReturnType<typeof fakeStorage>;
const RAW = JSON.stringify(newerDocument(), null, 2);

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('window', { localStorage: storage });
  // As the newer build left it: the document and its index row (with a row field of its own).
  storage.setItem(PREFIX + ID, RAW);
  storage.setItem(
    INDEX_KEY,
    JSON.stringify([{ id: ID, title: 'Mock paper', updatedAt: '2027-01-01T00:00:00.000Z', futureRowField: 7 }]),
  );
  storage.writes.length = 0;
  useWorksheetStore.setState({ worksheet: createWorksheet(), readOnly: false, printPreview: false, dirty: false, past: [], future: [] });
});

const store = () => new LocalStorageWorksheetStore();

describe('a document from a newer build', () => {
  it('loads with every field kept, and loading writes nothing', async () => {
    const loaded = await store().load(ID);

    expect(loaded).toBeDefined();
    expect(storage.writes).toEqual([]);
    expect(loaded!.schemaVersion).toBe(NEWER);
    expect(isNewerThanBuild(loaded!)).toBe(true);
    expect(loaded!.__unknown).toEqual({ futureTopLevel: { rubric: 'levels', weights: [1, 2, 3] } });

    // Everything the newer build wrote is still there to write back — top level and nested.
    const saved = serializeWorksheet(loaded!);
    const original = newerDocument();
    for (const [key, value] of Object.entries(original)) expect(saved[key]).toEqual(value);
  });

  it('is still listed: per-row validation keeps its index row, unknown fields included', async () => {
    const listed = await store().list();
    expect(listed.map((row) => row.id)).toEqual([ID]);
    expect((listed[0] as unknown as Record<string, unknown>).futureRowField).toBe(7);
  });

  it('opens read-only: commit, undo, derived fills and save are inert', async () => {
    const loaded = (await store().load(ID))!;
    const s = useWorksheetStore.getState;
    s().replaceWorksheet(loaded);

    expect(s().readOnly).toBe(true);
    expect(s().printPreview).toBe(true);

    s().addQuestion(s().worksheet.questions[0].type);
    s().updateWorksheet({ name: 'Renamed' });
    s().commit((draft) => ({ ...draft, questions: [] }));
    s().undo();
    s().resolveAnswerSpaceFills(new Map([['anything', 9]]));
    expect(s().worksheet).toBe(loaded);
    expect(s().dirty).toBe(false);
    expect(s().past).toEqual([]);

    // The page cannot be switched back into editing.
    s().setPrintPreview(false);
    expect(s().printPreview).toBe(true);

    // "Save now" and the autosave (which only fires on dirty) write nothing.
    await s().save();
    expect(storage.writes).toEqual([]);
    expect(storage.getItem(PREFIX + ID)).toBe(RAW);
  });

  it('cannot be overwritten through the store, by save or by rename', async () => {
    const loaded = (await store().load(ID))!;

    await expect(store().save({ ...loaded, name: 'Edited here' })).rejects.toBeInstanceOf(NewerDocumentError);
    await expect(store().rename(ID, 'Renamed')).rejects.toBeInstanceOf(NewerDocumentError);
    expect(storage.getItem(PREFIX + ID)).toBe(RAW);
  });

  it('can still be written where nothing is stored — an import is not an overwrite', async () => {
    const imported = migrate({ ...newerDocument(), id: 'imported' });
    await store().save(imported);
    expect(storage.getItem(PREFIX + 'imported')).toContain('futureTopLevel');
  });

  it('duplicates as an editable copy under a new id, leaving the original bytes alone', async () => {
    const loaded = (await store().load(ID))!;
    const copy = editableCopy(loaded, 'the-copy');
    await store().save(copy);

    expect(copy.id).toBe('the-copy');
    expect(copy.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(copy.__unknown).toBeUndefined();
    expect(copy.questions.length).toBe(loaded.questions.length);
    expect(storage.getItem(PREFIX + ID)).toBe(RAW);
    expect((await store().list()).map((row) => row.id).sort()).toEqual(['from-the-future', 'the-copy']);

    // The copy opens editable, back in edit mode.
    useWorksheetStore.getState().replaceWorksheet(loaded);
    useWorksheetStore.getState().replaceWorksheet((await store().load('the-copy'))!);
    expect(useWorksheetStore.getState().readOnly).toBe(false);
    expect(useWorksheetStore.getState().printPreview).toBe(false);
  });

  it('a current document still opens editable', () => {
    useWorksheetStore.getState().replaceWorksheet(migrate(structuredClone(v1Corpus)));
    expect(useWorksheetStore.getState().readOnly).toBe(false);
  });
});

describe('the newer-version notice', () => {
  const noop = () => {};

  it('says what happened and offers the update check on desktop', () => {
    const markup = renderToStaticMarkup(
      <NewerVersionBar desktop onCheck={noop} onDownload={noop} onDuplicate={noop} />,
    );
    expect(markup).toContain(NEWER_VERSION_MESSAGE);
    expect(markup).toContain('Check for updates');
    expect(markup).toContain('Duplicate as editable copy');
    expect(markup).toContain('data-print-hide');
    // Persistent: nothing to close it with.
    expect(markup).not.toMatch(/Dismiss|Later|aria-label="Close/);
  });

  it('links to the download on the web', () => {
    const markup = renderToStaticMarkup(
      <NewerVersionBar desktop={false} onCheck={noop} onDownload={noop} onDuplicate={noop} />,
    );
    expect(markup).toContain('Get the latest version');
    expect(markup).not.toContain('Check for updates');
  });
});
