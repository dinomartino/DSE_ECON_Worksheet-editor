import { beforeEach, describe, expect, it } from 'vitest';
import { choiceQuestion, docWith, row } from '@/library/testKit';
import type { Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { insertFromBank, useBankSession } from './bankSession';
import { emptySentence, typePlural } from './tabText';
import { NO_FILTERS } from '@/library/tabFilters';

const store = () => useWorksheetStore.getState();

const a1 = choiceQuestion('If the price elasticity of demand for MTR rides is 0.4…', '', ['C.ped']);
const a2 = choiceQuestion('A good with many close substitutes will have…', '', ['C.ped']);
const b1 = choiceQuestion('The supply of flats is inelastic in the short run because…', '', ['C.pes']);
const docA = { ...docWith([a1, a2]), id: 'doc-a' };
const docB = { ...docWith([b1]), id: 'doc-b' };
const docs = new Map<string, Worksheet>([
  [docA.id, docA],
  [docB.id, docB],
]);
const loads: string[] = [];
const source = {
  load: async (id: string) => {
    loads.push(id);
    return docs.get(id);
  },
};
const rowOf = (docId: string, questionId: string) => row({ docId, questionId, rootId: questionId });

describe('insertFromBank', () => {
  let open: Worksheet;
  beforeEach(() => {
    loads.length = 0;
    open = docWith([choiceQuestion('Q1 already here'), choiceQuestion('Q2 already here')]);
    store().replaceWorksheet(open);
    useWorksheetStore.setState({ insertAnchorId: open.questions[0].id });
    useBankSession.setState({ review: null });
  });

  it('copies from several documents in one commit after the anchor, each with its own source', async () => {
    const report = await insertFromBank([rowOf('doc-a', a2.id), rowOf('doc-b', b1.id), rowOf('doc-a', a1.id)], undefined, source);
    expect(report.inserted).toHaveLength(3);
    expect(loads.sort()).toEqual(['doc-a', 'doc-b']);
    const after = store().worksheet;
    const flow = after.flow.map((item) => item.id);
    expect(flow.slice(0, 4)).toEqual([open.questions[0].id, ...report.inserted]);
    const copies = report.inserted.map((id) => after.questions.find((q) => q.id === id)!);
    expect(copies.map((q) => q.lineage)).toMatchObject([
      { rootId: a2.id, fromDocId: 'doc-a' },
      { rootId: b1.id, fromDocId: 'doc-b' },
      { rootId: a1.id, fromDocId: 'doc-a' },
    ]);
    expect(store().insertAnchorId).toBe(report.inserted[2]);
    expect(store().past).toHaveLength(1);
    // The sources are only read.
    expect(docs.get('doc-a')).toBe(docA);
  });

  it('starts a review whose Undo reverts exactly the insert, and only while it is the latest edit', async () => {
    const { inserted } = await insertFromBank([rowOf('doc-a', a1.id), rowOf('doc-b', b1.id)], undefined, source);
    const review = useBankSession.getState().review!;
    expect(review.questionIds).toEqual(inserted);
    expect(review.summary).toBe('2 questions added from 題庫');
    expect(review.undo.live()).toBe(true);
    useBankSession.getState().walk(1);
    expect(useBankSession.getState().review!.index).toBe(1);
    useBankSession.getState().undo();
    expect(store().worksheet.questions.map((q) => q.id)).toEqual(open.questions.map((q) => q.id));
    // The anchor goes back to where the teacher was inserting, not to the end.
    expect(store().insertAnchorId).toBe(open.questions[0].id);
    expect(useBankSession.getState().review).toBeNull();
  });

  it('retires Undo after a later edit', async () => {
    await insertFromBank([rowOf('doc-a', a1.id)], undefined, source);
    store().updateWorksheet({ classTag: '5A' });
    const review = useBankSession.getState().review!;
    expect(review.undo.live()).toBe(false);
    useBankSession.getState().undo();
    expect(store().worksheet.classTag).toBe('5A');
  });

  it('extends the open review with a consecutive insert; its Undo takes them all out', async () => {
    const first = await insertFromBank([rowOf('doc-a', a1.id)], undefined, source);
    const second = await insertFromBank([rowOf('doc-b', b1.id), rowOf('doc-a', a2.id)], undefined, source);
    const review = useBankSession.getState().review!;
    expect(review.questionIds).toEqual([...first.inserted, ...second.inserted]);
    expect(review.index).toBe(1);
    expect(review.summary).toBe('3 questions added from 題庫');
    expect(review.commits).toBe(2);
    useBankSession.getState().walk(-1);
    expect(useBankSession.getState().review!.index).toBe(0);
    useBankSession.getState().undo();
    expect(store().worksheet.questions.map((q) => q.id)).toEqual(open.questions.map((q) => q.id));
    expect(store().insertAnchorId).toBe(open.questions[0].id);
  });

  it('starts a fresh review after Done, or after an edit between inserts', async () => {
    await insertFromBank([rowOf('doc-a', a1.id)], undefined, source);
    useBankSession.getState().dismiss();
    const after = await insertFromBank([rowOf('doc-b', b1.id)], undefined, source);
    expect(useBankSession.getState().review!.questionIds).toEqual(after.inserted);

    store().updateWorksheet({ classTag: '5A' });
    const later = await insertFromBank([rowOf('doc-a', a2.id)], undefined, source);
    expect(useBankSession.getState().review).toMatchObject({ questionIds: later.inserted, commits: 1 });
    // Undo reverts only its own insert: the edit before it stays.
    useBankSession.getState().undo();
    expect(store().worksheet.classTag).toBe('5A');
    expect(store().worksheet.questions.some((q) => q.id === after.inserted[0])).toBe(true);
  });

  it('skips rows whose question is gone, and writes nothing when read-only', async () => {
    const report = await insertFromBank([rowOf('doc-a', 'deleted'), rowOf('doc-z', 'x'), rowOf('doc-b', b1.id)], undefined, source);
    expect(report.inserted).toHaveLength(1);
    expect(report.missing.map((r) => r.questionId)).toEqual(['deleted', 'x']);

    useWorksheetStore.setState({ readOnly: true });
    const refused = await insertFromBank([rowOf('doc-a', a1.id)], undefined, source);
    expect(refused).toMatchObject({ inserted: [], refused: 'readOnly' });
    useWorksheetStore.setState({ readOnly: false });
  });
});

describe('useBankSession.openBank', () => {
  it('counts requests, so a second one still opens the tab', () => {
    const before = useBankSession.getState().openRequest;
    useBankSession.getState().openBank();
    useBankSession.getState().openBank();
    expect(useBankSession.getState().openRequest).toBe(before + 2);
  });
});

describe('tab text', () => {
  it('pluralises from the registry label', () => {
    expect(typePlural('')).toBe('questions');
    expect(typePlural(choiceQuestion('x').type)).toBe('MCQs');
  });

  it('says what the filters asked for', () => {
    const filters = { ...NO_FILTERS, typeId: choiceQuestion('x').type, topic: 'C.ped', notUsedWithClass: true };
    expect(emptySentence(filters, '5A')).toBe('No MCQs in C · Price elasticity of demand not used with 5A.');
    expect(emptySentence(filters, undefined)).toBe('No MCQs in C · Price elasticity of demand.');
  });
});
