import { beforeEach, describe, expect, it } from 'vitest';
import { rowsOf } from '@/library/indexer';
import { searchRows } from '@/library/search';
import { withSharedTags } from '@/library/sharedTags';
import { choiceQuestion, docWith } from '@/library/testKit';
import { copyQuestion } from '@/model/lineage';
import { bi } from '@/model/text';
import type { Question, Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { copiesMessage, setQuestionTopics, type TopicSyncDeps } from './topicSync';

function harness(docs: Worksheet[]) {
  const saved = new Map(docs.map((doc) => [doc.id, doc]));
  const writes: string[] = [];
  const notices: string[] = [];
  const deps: TopicSyncDeps = {
    store: {
      load: async (id) => saved.get(id),
      save: async (worksheet) => {
        writes.push(worksheet.id);
        saved.set(worksheet.id, worksheet);
      },
    },
    // Published rows, as `bankRowsNow` gives them: each holds its question's shared set.
    rows: async () => withSharedTags(docs.flatMap((doc) => rowsOf(doc))),
    notify: (message) => notices.push(message),
  };
  return { saved, writes, notices, deps };
}

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-01-02T00:00:00.000Z';

const tagsIn = (doc: Worksheet | undefined, id: string) => doc?.questions.find((q) => q.id === id)?.tags;

function open(worksheet: Worksheet, readOnly = false) {
  useWorksheetStore.setState({ worksheet, past: [], future: [], dirty: false, readOnly });
}

describe('the editor Topic row writes every copy', () => {
  let original: Question;
  let copyB: Question;
  let copyC: Question;
  let docA: Worksheet;
  let docB: Worksheet;
  let docC: Worksheet;

  beforeEach(() => {
    original = choiceQuestion('Along a straight-line demand curve…', '', ['C']);
    docA = docWith([original], { title: bi('Paper A', '') });
    copyB = { ...copyQuestion(original, docA.id), tags: ['C', 'mock 2025'] };
    docB = docWith([copyB, choiceQuestion('Unrelated')], { title: bi('Paper B', '') });
    copyC = copyQuestion(copyB, docB.id);
    docC = docWith([copyC], { title: bi('Paper C', '') });
  });

  it('changes the open copy through the store (one undo) and saves each other document once', async () => {
    const { saved, writes, notices, deps } = harness([docA, docB, docC]);
    open(docB);
    const report = await setQuestionTopics(copyB.id, ['C', 'mock 2025', 'C.ped'], deps);

    // The open copy: through the store, undoable, never written to storage from here.
    expect(tagsIn(useWorksheetStore.getState().worksheet, copyB.id)).toEqual(['C', 'mock 2025', 'C.ped']);
    expect(useWorksheetStore.getState().past).toHaveLength(1);
    expect(writes).not.toContain(docB.id);

    // Every other copy: the edited copy's set, one save per document.
    expect(report?.saved.sort()).toEqual([docA.id, docC.id].sort());
    expect(writes.sort()).toEqual([docA.id, docC.id].sort());
    expect(tagsIn(saved.get(docA.id), original.id)).toEqual(['C', 'mock 2025', 'C.ped']);
    expect(tagsIn(saved.get(docC.id), copyC.id)).toEqual(['C', 'mock 2025', 'C.ped']);
    expect(notices).toEqual(['Also updated in 2 other worksheets.']);

    // Every copy written, the open one included, carries the tag-write stamp.
    const at = (doc: Worksheet | undefined, id: string) => doc?.questions.find((q) => q.id === id)?.tagsAt;
    expect(Date.parse(at(useWorksheetStore.getState().worksheet, copyB.id) ?? '')).not.toBeNaN();
    expect(Date.parse(at(saved.get(docA.id), original.id) ?? '')).not.toBeNaN();
    expect(Date.parse(at(saved.get(docC.id), copyC.id) ?? '')).not.toBeNaN();

    // Dates are left alone: a tag edit is not a use.
    expect(saved.get(docA.id)?.createdAt).toBe(docA.createdAt);
    expect(saved.get(docA.id)?.satOn).toBe(docA.satOn);

    useWorksheetStore.getState().undo();
    expect(tagsIn(useWorksheetStore.getState().worksheet, copyB.id)).toEqual(['C', 'mock 2025']);
  });

  it('takes a removed topic off every copy, keeping a topic of the shared set the row had not shown yet', async () => {
    // No copy stamped: the shared set is the union, F.gdp included. Called without `shown`
    // (the bank had not loaded), the change is read against the open copy's own tags.
    const extra = { ...docC, questions: [{ ...copyC, tags: ['C', 'mock 2025', 'F.gdp'] }] };
    const { saved, deps } = harness([docA, docB, extra]);
    open(docB);
    await setQuestionTopics(copyB.id, ['mock 2025'], deps);
    expect(tagsIn(saved.get(docA.id), original.id)).toEqual(['mock 2025', 'F.gdp']);
    expect(tagsIn(saved.get(docC.id), copyC.id)).toEqual(['mock 2025', 'F.gdp']);
    // One stamp on every copy: tied, so the set is their union, and C is gone everywhere.
    const openDoc = useWorksheetStore.getState().worksheet;
    const rows = withSharedTags([openDoc, saved.get(docA.id)!, saved.get(docC.id)!].flatMap((doc) => rowsOf(doc)));
    expect(new Set(rows.filter((r) => r.rootId === original.id).map((r) => r.tags.join()))).toEqual(new Set(['mock 2025,F.gdp']));
  });

  it('reads the change against the shown set, so a stale open copy adopts the newest', async () => {
    // B was left behind (older stamp); A and C hold the newest set, without D.
    const staleB = { ...copyB, tags: ['C', 'D'], tagsAt: T1 };
    const b = { ...docB, questions: [staleB, docB.questions[1]] };
    const a = { ...docA, questions: [{ ...original, tags: ['C', 'mock 2025'], tagsAt: T2 }] };
    const c = { ...docC, questions: [{ ...copyC, tags: ['C', 'mock 2025'], tagsAt: T2 }] };
    const { saved, deps } = harness([a, b, c]);
    open(b);
    // The Topic row showed the newest set; the teacher removes 'mock 2025'.
    await setQuestionTopics(staleB.id, ['C'], deps, ['C', 'mock 2025']);
    const openDoc = useWorksheetStore.getState().worksheet;
    expect(tagsIn(openDoc, staleB.id)).toEqual(['C']);
    expect(tagsIn(saved.get(a.id), original.id)).toEqual(['C']);
    expect(tagsIn(saved.get(c.id), copyC.id)).toEqual(['C']);
    // D, which only the stale copy held, does not come back.
    const rows = withSharedTags([openDoc, saved.get(a.id)!, saved.get(c.id)!].flatMap((doc) => rowsOf(doc)));
    expect(rows.filter((r) => r.rootId === original.id).map((r) => r.tags)).toEqual([['C'], ['C'], ['C']]);
  });

  it('stamps the open copy when the edit only drops what its own tags never had', async () => {
    const staleB = { ...copyB, tags: ['C'], tagsAt: T1 };
    const b = { ...docB, questions: [staleB, docB.questions[1]] };
    const a = { ...docA, questions: [{ ...original, tags: ['C', 'D'], tagsAt: T2 }] };
    const { saved, deps } = harness([a, b]);
    open(b);
    await setQuestionTopics(staleB.id, ['C'], deps, ['C', 'D']);
    const q = useWorksheetStore.getState().worksheet.questions.find((x) => x.id === staleB.id)!;
    expect(q.tags).toEqual(['C']);
    expect(Date.parse(q.tagsAt!)).toBeGreaterThan(Date.parse(T2));
    expect(tagsIn(saved.get(a.id), original.id)).toEqual(['C']);
  });

  it('makes a removal stick over a copy it cannot reach: a newer-build file, and a trashed one restored later', async () => {
    const tagged = (doc: Worksheet, q: Question) => ({ ...doc, questions: doc.questions.map((x) => (x.id === q.id ? { ...x, tags: ['C', 'D'], tagsAt: T1 } : x)) });
    const a = tagged(docA, original);
    const b = tagged(docB, copyB);
    const newer = { ...tagged(docC, copyC), schemaVersion: 999 };
    const trashedQ = { ...copyQuestion(original, docA.id), tags: ['C', 'D'], tagsAt: T1 };
    const trashed = docWith([trashedQ]);
    // The trashed paper is not in the index while the edit runs.
    const { saved, deps } = harness([a, b, newer]);
    open(b);
    await setQuestionTopics(copyB.id, ['C'], deps, ['C', 'D']);
    expect(saved.get(newer.id)).toBe(newer);
    // Restored: indexed again beside everything else. Its tags and the newer file's are older.
    const all = [useWorksheetStore.getState().worksheet, saved.get(a.id)!, newer, trashed];
    const rows = withSharedTags(all.flatMap((doc) => rowsOf(doc)));
    expect(rows.filter((r) => r.rootId === original.id).map((r) => r.tags)).toEqual([['C'], ['C'], ['C'], ['C']]);
    expect(searchRows(rows, { topic: 'D' })).toEqual([]);
  });

  it('reaches the copies of an original (no lineage) opened in its own paper', async () => {
    const { saved, deps } = harness([docA, docB, docC]);
    open(docA);
    await setQuestionTopics(original.id, ['C', 'D'], deps);
    expect(tagsIn(saved.get(docB.id), copyB.id)).toEqual(['C', 'D', 'mock 2025']);
    expect(tagsIn(saved.get(docC.id), copyC.id)).toEqual(['C', 'D', 'mock 2025']);
  });

  it('never rewrites a document from a newer build, and says so by name', async () => {
    const newer = { ...docC, schemaVersion: 999 };
    const { saved, writes, notices, deps } = harness([docA, docB, newer]);
    open(docB);
    const report = await setQuestionTopics(copyB.id, ['C', 'mock 2025', 'D'], deps);
    expect(writes).toEqual([docA.id]);
    expect(saved.get(newer.id)).toBe(newer);
    expect(report?.failed.map((f) => f.docId)).toEqual([newer.id]);
    expect(notices).toEqual(['Also updated in 1 other worksheet. “Paper C” keeps its old topics: it was saved by a newer version of the app.']);
  });

  it('with no other copy behaves as before: the store changes, storage is not touched', async () => {
    const lone = choiceQuestion('Explain a bumper harvest.', '', ['C']);
    const doc = docWith([lone]);
    const { writes, notices, deps } = harness([doc, docA]);
    open(doc);
    const report = await setQuestionTopics(lone.id, ['C', 'D'], deps);
    expect(report).toBeUndefined();
    expect(tagsIn(useWorksheetStore.getState().worksheet, lone.id)).toEqual(['C', 'D']);
    expect(writes).toEqual([]);
    expect(notices).toEqual([]);
  });

  it('writes nothing when the open document is read-only', async () => {
    const { writes, deps } = harness([docA, docB, docC]);
    open(docB, true);
    expect(await setQuestionTopics(copyB.id, ['D'], deps)).toBeUndefined();
    expect(writes).toEqual([]);
  });

  it('says nothing when every other copy already holds the topics', async () => {
    const same = { ...docA, questions: [{ ...original, tags: ['mock 2025', 'C', 'D'] }] };
    const { writes, notices, deps } = harness([same, docB]);
    open(docB);
    await setQuestionTopics(copyB.id, ['C', 'mock 2025', 'D'], deps);
    expect(writes).toEqual([]);
    expect(notices).toEqual([]);
  });

  it('carries a 題型 swap to every copy: the new one on, the old one off', async () => {
    const withOld = (doc: Worksheet, q: Question) => ({ ...doc, questions: doc.questions.map((x) => (x.id === q.id ? { ...x, tags: ['C.ped', 'C.ped::Old'] } : x)) });
    const a = withOld(docA, original);
    const b = withOld(docB, copyB);
    const { saved, deps } = harness([a, b]);
    open(b);
    await setQuestionTopics(copyB.id, ['C.ped', 'C.ped::New'], deps);
    expect(tagsIn(saved.get(docA.id), original.id)).toEqual(['C.ped', 'C.ped::New']);
  });
});

describe('copiesMessage', () => {
  it('counts what was saved and names what was not', () => {
    expect(copiesMessage({ saved: [], failed: [] }, [])).toBeUndefined();
    expect(copiesMessage({ saved: ['a'], failed: [] }, [])).toBe('Also updated in 1 other worksheet.');
    expect(copiesMessage({ saved: [], failed: [{ docId: 'x', reason: 'it is no longer saved here' }] }, [])).toBe(
      '“A worksheet” keeps its old topics: it is no longer saved here.',
    );
  });
});
