import { beforeEach, describe, expect, it } from 'vitest';
import { choiceQuestion, docWith, partsQuestion } from '@/library/testKit';
import { flowOf } from '@/model/flow';
import { copyQuestion } from '@/model/lineage';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { bi } from '@/model/text';
import { createParagraphBlock } from '@/model/factories';
import { useWorksheetStore } from '@/store/worksheetStore';
import { useBankSession } from '../bankSession';
import { addedSummary, addPicksToOpenDocument, nothingAddedText, splitAlreadyInPaper, uniquePicks } from './addToOpen';

const store = () => useWorksheetStore.getState();

beforeEach(() => useBankSession.setState({ review: null }));

describe('addPicksToOpenDocument', () => {
  it('appends copies in picked order, each tied to its own source, and one undo removes them all', () => {
    const own = choiceQuestion('Already in the paper');
    // No sections: the picks keep their order rather than each finding its type's section.
    const loaded = docWith([own], { layout: [] });
    store().replaceWorksheet(loaded);
    const a = choiceQuestion('From A, first');
    const b = partsQuestion('From B');
    const a2 = choiceQuestion('From A, again');
    const { inserted: ids, skipped } = addPicksToOpenDocument([
      { question: a, fromDocId: 'doc-a' },
      { question: b, fromDocId: 'doc-b' },
      { question: a2, fromDocId: 'doc-a' },
    ]);

    expect(skipped).toBe(0);
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

  it('starts the 題庫 review on the copies, as an insert from the tab does', () => {
    store().replaceWorksheet(docWith([choiceQuestion('Own')]));
    const { inserted } = addPicksToOpenDocument([
      { question: choiceQuestion('One'), fromDocId: 'doc-a' },
      { question: choiceQuestion('Two'), fromDocId: 'doc-a' },
    ]);
    const review = useBankSession.getState().review!;
    expect(review.questionIds).toEqual(inserted);
    expect(review.worksheetId).toBe(store().worksheet.id);
    expect(review.summary).toBe('2 questions added from 題庫');
  });

  it('skips a question the paper already holds, in any copy, and says so', () => {
    const original = choiceQuestion('Country A has a comparative advantage');
    const copied = copyQuestion(choiceQuestion('Copied in earlier'), 'doc-b');
    store().replaceWorksheet(docWith([original, copied]));
    const edited = copyQuestion(original, 'doc-mock');
    edited.blocks = [createParagraphBlock(bi('Country A has an absolute advantage', ''))];
    const sourceOfCopied = { ...choiceQuestion('Copied in earlier'), id: copied.lineage!.rootId };
    const fresh = choiceQuestion('New to this paper');

    const { inserted, skipped } = addPicksToOpenDocument([
      { question: edited, fromDocId: 'doc-mock' }, // another copy of the paper's own question, edited
      { question: sourceOfCopied, fromDocId: 'doc-b' }, // the source of a copy the paper holds
      { question: fresh, fromDocId: 'doc-c' },
    ]);

    expect(skipped).toBe(2);
    expect(inserted).toHaveLength(1);
    expect(store().worksheet.questions).toHaveLength(3);
    expect(store().worksheet.questions[2].lineage?.rootId).toBe(fresh.id);
    expect(useBankSession.getState().review!.summary).toBe('1 question added from 題庫. Skipped 2 already in this paper.');
  });

  it('adds nothing, and leaves the history alone, when every pick is already there', () => {
    const own = choiceQuestion('Own');
    const loaded = docWith([own]);
    store().replaceWorksheet(loaded);
    const before = store().worksheet;
    expect(addPicksToOpenDocument([{ question: own, fromDocId: loaded.id }])).toEqual({ inserted: [], skipped: 1 });
    expect(store().worksheet).toBe(before);
    expect(store().past).toHaveLength(0);
    expect(useBankSession.getState().review).toBeNull();
  });

  it('adds two copies of one question picked together once', () => {
    store().replaceWorksheet(docWith([]));
    const q = choiceQuestion('Picked twice');
    const other = copyQuestion(q, 'doc-a');
    const { inserted, skipped } = addPicksToOpenDocument([
      { question: q, fromDocId: 'doc-a' },
      { question: other, fromDocId: 'doc-b' },
    ]);
    expect(inserted).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('puts each pick into the section for its type in an empty classroom worksheet', () => {
    store().replaceWorksheet(createWorksheetFrom({ documentType: 'classroom' }));
    const [a, b] = store().worksheet.layout;
    const { inserted: [one, two] } = addPicksToOpenDocument([
      { question: choiceQuestion('One'), fromDocId: 'doc-a' },
      { question: partsQuestion('Two'), fromDocId: 'doc-b' },
    ]);
    expect(flowOf(store().worksheet).map((item) => item.id)).toEqual([a.id, one, b.id, two]);
  });

  it('leaves a read-only document alone', () => {
    store().replaceWorksheet({ ...docWith([]), schemaVersion: 999 });
    expect(addPicksToOpenDocument([{ question: choiceQuestion('x'), fromDocId: 'd' }]).inserted).toEqual([]);
    expect(store().past).toHaveLength(0);
  });
});

describe('already in this paper', () => {
  it('is by question (root), not by copy', () => {
    const original = choiceQuestion('Original');
    const copy = copyQuestion(original, 'doc-a');
    const unrelated = choiceQuestion('Original'); // the same words typed again is another question
    const { fresh, skipped } = splitAlreadyInPaper(docWith([copy]), [
      { question: original, fromDocId: 'doc-a' },
      { question: unrelated, fromDocId: 'doc-c' },
    ]);
    expect(skipped.map((pick) => pick.question.id)).toEqual([original.id]);
    expect(fresh.map((pick) => pick.question.id)).toEqual([unrelated.id]);
  });

  it('keeps the first pick of each question', () => {
    const q = choiceQuestion('Q');
    const copy = copyQuestion(q, 'doc-a');
    const r = choiceQuestion('R');
    expect(
      uniquePicks([
        { question: copy, fromDocId: 'doc-b' },
        { question: r, fromDocId: 'doc-c' },
        { question: q, fromDocId: 'doc-a' },
      ]).map((pick) => pick.question.id),
    ).toEqual([copy.id, r.id]);
  });

  it('says what happened in plain words', () => {
    expect(addedSummary(3, 0)).toBe('3 questions added from 題庫');
    expect(addedSummary(3, 1)).toBe('3 questions added from 題庫. Skipped 1 already in this paper.');
    expect(nothingAddedText(1, 'Mock 2026 Paper 1')).toBe('That question is already in “Mock 2026 Paper 1”. Nothing was added.');
    expect(nothingAddedText(2, 'Mock 2026 Paper 1')).toBe('Both questions are already in “Mock 2026 Paper 1”. Nothing was added.');
    expect(nothingAddedText(3, 'Mock 2026 Paper 1')).toBe('All 3 questions are already in “Mock 2026 Paper 1”. Nothing was added.');
  });
});
