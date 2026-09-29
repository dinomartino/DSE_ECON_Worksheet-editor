import { beforeEach, describe, expect, it } from 'vitest';
import { rowsOf } from '@/library/indexer';
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
    rows: async () => docs.flatMap((doc) => rowsOf(doc)),
    notify: (message) => notices.push(message),
  };
  return { saved, writes, notices, deps };
}

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

    // Dates are left alone: a tag edit is not a use.
    expect(saved.get(docA.id)?.createdAt).toBe(docA.createdAt);
    expect(saved.get(docA.id)?.satOn).toBe(docA.satOn);

    useWorksheetStore.getState().undo();
    expect(tagsIn(useWorksheetStore.getState().worksheet, copyB.id)).toEqual(['C', 'mock 2025']);
  });

  it('takes a removed topic off every copy and keeps what another copy had besides', async () => {
    const extra = { ...docC, questions: [{ ...copyC, tags: ['C', 'mock 2025', 'F.gdp'] }] };
    const { saved, deps } = harness([docA, docB, extra]);
    open(docB);
    await setQuestionTopics(copyB.id, ['mock 2025'], deps);
    expect(tagsIn(saved.get(docA.id), original.id)).toEqual(['mock 2025']);
    expect(tagsIn(saved.get(docC.id), copyC.id)).toEqual(['mock 2025', 'F.gdp']);
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
