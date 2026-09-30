import { describe, expect, it } from 'vitest';
import { choiceQuestion, docWith, partsQuestion } from '@/library/testKit';
import { flowOf } from '@/model/flow';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { useWorksheetStore } from '@/store/worksheetStore';
import { addPicksToOpenDocument } from './addToOpen';

const store = () => useWorksheetStore.getState();

describe('addPicksToOpenDocument', () => {
  it('appends copies in picked order, each tied to its own source, and one undo removes them all', () => {
    const own = choiceQuestion('Already in the paper');
    const loaded = docWith([own]);
    store().replaceWorksheet(loaded);
    const a = choiceQuestion('From A, first');
    const b = partsQuestion('From B');
    const a2 = choiceQuestion('From A, again');
    const ids = addPicksToOpenDocument([
      { question: a, fromDocId: 'doc-a' },
      { question: b, fromDocId: 'doc-b' },
      { question: a2, fromDocId: 'doc-a' },
    ]);

    const after = store().worksheet;
    expect(after.questions.map((q) => q.id)).toEqual([own.id, ...ids]);
    expect(after.questions.slice(1).map((q) => q.lineage?.fromDocId)).toEqual(['doc-a', 'doc-b', 'doc-a']);
    expect(after.questions.slice(1).map((q) => q.lineage?.rootId)).toEqual([a.id, b.id, a2.id]);
    expect(store().selectedQuestionId).toBe(ids[0]);
    expect(store().dirty).toBe(true);

    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().worksheet).toEqual(loaded);
  });

  it('puts picks into Section A of an empty sectioned worksheet, not after Section B', () => {
    store().replaceWorksheet(createWorksheetFrom({ documentType: 'classroom' }));
    const [a, b] = store().worksheet.layout;
    const ids = addPicksToOpenDocument([
      { question: choiceQuestion('One'), fromDocId: 'doc-a' },
      { question: partsQuestion('Two'), fromDocId: 'doc-b' },
    ]);
    expect(flowOf(store().worksheet).map((item) => item.id)).toEqual([a.id, ...ids, b.id]);
  });

  it('leaves a read-only document alone', () => {
    store().replaceWorksheet({ ...docWith([]), schemaVersion: 999 });
    expect(addPicksToOpenDocument([{ question: choiceQuestion('x'), fromDocId: 'd' }])).toEqual([]);
    expect(store().past).toHaveLength(0);
  });
});
