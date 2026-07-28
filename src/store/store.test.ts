import { beforeEach, describe, expect, it } from 'vitest';
import { questionMarks } from '@/model/marks';
import { createPageBreakElement, resolveFlow } from '@/model/flow';
import { computeNumbering } from '@/model/numbering';
import { bi, plain } from '@/model/text';
import type { McqQuestion, StructuredQuestion } from '@/model/types';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { useWorksheetStore } from './worksheetStore';

const store = () => useWorksheetStore.getState();

beforeEach(() => {
  useWorksheetStore.setState({
    worksheet: buildAcceptanceWorksheet(),
    past: [],
    future: [],
    mode: { language: 'bilingual', version: 'student' },
    selectedQuestionId: undefined,
    dirty: false,
  });
});

describe('undo/redo (§10, §11.13)', () => {
  it('undoes and redoes an edit', () => {
    const questionId = store().worksheet.questions[0].id;

    store().updateQuestion(questionId, { marks: 5 });
    expect((store().worksheet.questions[0] as McqQuestion).marks).toBe(5);
    expect(store().canUndo()).toBe(true);

    store().undo();
    expect((store().worksheet.questions[0] as McqQuestion).marks).toBe(1);

    store().redo();
    expect((store().worksheet.questions[0] as McqQuestion).marks).toBe(5);
  });

  it('undoes an add, a delete and a reorder', () => {
    const before = store().worksheet.questions.length;

    store().addQuestion('mcq');
    expect(store().worksheet.questions.length).toBe(before + 1);
    store().undo();
    expect(store().worksheet.questions.length).toBe(before);

    const firstId = store().worksheet.questions[0].id;
    store().removeQuestion(firstId);
    expect(store().worksheet.questions.find((q) => q.id === firstId)).toBeUndefined();
    store().undo();
    expect(store().worksheet.questions[0].id).toBe(firstId);

    const secondId = store().worksheet.questions[1].id;
    store().moveQuestion(firstId, 1);
    expect(store().worksheet.questions[0].id).toBe(secondId);
    store().undo();
    expect(store().worksheet.questions[0].id).toBe(firstId);
  });

  it('discards the redo branch once a new edit lands', () => {
    const questionId = store().worksheet.questions[0].id;
    store().updateQuestion(questionId, { marks: 3 });
    store().undo();
    expect(store().canRedo()).toBe(true);

    store().updateQuestion(questionId, { marks: 7 });
    expect(store().canRedo()).toBe(false);
  });

  it('is a no-op at the ends of the history', () => {
    const snapshot = store().worksheet;
    store().undo();
    expect(store().worksheet).toBe(snapshot);
    store().redo();
    expect(store().worksheet).toBe(snapshot);
  });

  it('treats loading a document as a fresh history, not an undoable edit', () => {
    store().updateWorksheet({ title: bi('Changed', '改變') });
    expect(store().canUndo()).toBe(true);

    store().replaceWorksheet(buildAcceptanceWorksheet());
    expect(store().canUndo()).toBe(false);
    expect(store().canRedo()).toBe(false);
  });
});

describe('question operations (§5.3)', () => {
  it('duplicates a question with fresh ids throughout', () => {
    const worksheet = store().worksheet;
    const original = worksheet.questions[5] as StructuredQuestion;

    store().duplicateQuestion(original.id);
    // The copy lands immediately after its original, wherever that is.
    const questions = store().worksheet.questions;
    const clone = questions[6] as StructuredQuestion;

    expect(questions.length).toBe(8);
    expect(clone.id).not.toBe(original.id);
    expect(clone.parts[0].id).not.toBe(original.parts[0].id);
    expect(clone.parts[1].subParts![0].id).not.toBe(original.parts[1].subParts![0].id);
    // Content is identical, and derived marks match.
    expect(questionMarks(clone)).toBe(questionMarks(original));

    const stemText = (question: StructuredQuestion) => {
      const block = question.parts[0].blocks[0];
      return block.kind === 'paragraph' ? plain(block.text.en) : '';
    };
    expect(stemText(clone)).toBe(stemText(original));
    expect(stemText(clone)).toBeTruthy();
  });

  it('moves a question under another section and renumbers', () => {
    // "Into Section B" is now "after Section B's heading" — there is no container to
    // move it into, so the same `reorderFlowItem` every drag uses expresses it.
    const questionId = store().worksheet.questions[0].id;
    const sectionB = store().worksheet.layout.filter((e) => e.kind === 'section')[1];

    store().reorderFlowItem(questionId, sectionB.id, 'after');

    // Section B restarts at 1, and the question now leads its run.
    const plan = computeNumbering(store().worksheet);
    expect(plan.byQuestionId.get(questionId)!.number).toBe(1);
    expect(plan.byQuestionId.get(questionId)!.sectionId).toBe(sectionB.id);
  });

  it('drag-reorders a question to a target position (§5.1)', () => {
    const ids = store().worksheet.questions.map((q) => q.id);

    // Drag the first question onto the fourth's position. The tail beyond the questions
    // this drag touches is spelled out rather than assumed, since the document is one
    // flat list now and not five questions in a section.
    const tail = ids.slice(5);
    store().reorderQuestion(ids[0], ids[3]);
    expect(store().worksheet.questions.map((q) => q.id)).toEqual([
      ids[1], ids[2], ids[0], ids[3], ids[4], ...tail,
    ]);

    // Dragging backwards puts it directly before the target.
    store().reorderQuestion(ids[4], ids[1]);
    expect(store().worksheet.questions.map((q) => q.id)).toEqual([
      ids[4], ids[1], ids[2], ids[0], ids[3], ...tail,
    ]);

    // And it is undoable like any other edit.
    store().undo();
    store().undo();
    expect(store().worksheet.questions.map((q) => q.id)).toEqual(ids);
  });

  it('drag-reorders across a section boundary', () => {
    const sourceId = store().worksheet.questions[0].id;
    const targetId = store().worksheet.questions[6].id;

    store().reorderQuestion(sourceId, targetId);

    const ids = store().worksheet.questions.map((q) => q.id);
    expect(ids.indexOf(sourceId)).toBe(ids.indexOf(targetId) - 1);
  });

  it('ignores a drag onto itself or onto an unknown question', () => {
    const ids = store().worksheet.questions.map((q) => q.id);
    store().reorderQuestion(ids[0], ids[0]);
    store().reorderQuestion(ids[0], 'not-a-question');
    expect(store().worksheet.questions.map((q) => q.id)).toEqual(ids);
    expect(store().canUndo()).toBe(false);
  });

  it('adds a question through the registry and selects it', () => {
    store().addQuestion('structured');
    const added = store().worksheet.questions.at(-1)!;
    expect(added.type).toBe('structured');
    expect(store().selectedQuestionId).toBe(added.id);
  });

  it('ignores an unknown question type rather than corrupting the document', () => {
    const before = store().worksheet.questions.length;
    store().addQuestion('does-not-exist');
    expect(store().worksheet.questions.length).toBe(before);
  });
});

describe('output mode (§5.4)', () => {
  it('drives language and version independently', () => {
    store().setMode({ language: 'zh' });
    expect(store().mode).toEqual({ language: 'zh', version: 'student' });
    store().setMode({ version: 'teacher' });
    expect(store().mode).toEqual({ language: 'zh', version: 'teacher' });
  });

  it('never clears hidden-language content when the mode changes (§5.2)', () => {
    const questionId = store().worksheet.questions[0].id;
    const stem = () => {
      const block = store().worksheet.questions[0].blocks[0];
      return block.kind === 'paragraph' ? block.text : { en: [], zh: [] };
    };

    expect(plain(stem().en)).toBeTruthy();
    expect(plain(stem().zh)).toBeTruthy();

    // Switch to English-only and edit the visible side, exactly as the sidebar does:
    // patch one language, leave the other untouched.
    store().setMode({ language: 'en' });
    const block = store().worksheet.questions[0].blocks[0];
    if (block.kind === 'paragraph') {
      store().updateQuestion(questionId, {
        blocks: [{ ...block, text: { ...block.text, en: [{ text: 'Rewritten in EN' }] } }],
      });
    }

    // The Chinese side survives, and reappears when the mode switches back.
    expect(plain(stem().en)).toBe('Rewritten in EN');
    expect(plain(stem().zh)).toBe('當需求下降時會發生甚麼？');

    store().setMode({ language: 'bilingual' });
    expect(plain(stem().zh)).toBe('當需求下降時會發生甚麼？');

    // Switching mode is a view change, not an edit — it must not enter the history.
    store().undo();
    expect(plain(stem().en)).toBe('What happens when demand falls?');
    expect(plain(stem().zh)).toBe('當需求下降時會發生甚麼？');
  });
});

describe('moving a page (§page rail)', () => {
  /*
   * A page is not a thing in the model — the rail hands the store the ids the
   * paginator measured onto one sheet. These cover the two ways that indirection used
   * to lose content: a run whose members did not all live in one section, and a page
   * whose own break was left out of the run it belongs to.
   *
   * The first of those is no longer expressible. A run spanning a section heading is
   * just a run, because there are no containers for it to span — which is why the
   * store's `movePage` lost the carrying loop that used to precede the move.
   */
  const orderOf = () => store().worksheet.questions.map((question) => question.id);
  // Display order, questions and layout elements together — the order the page is
  // actually paginated from, which is what a page move has to get right.
  const flowIds = () => resolveFlow(store().worksheet).map((item) => item.id);

  it('moves a run that spans a section heading, without stranding any of it', () => {
    const sectionB = store().worksheet.layout.filter((e) => e.kind === 'section')[1];
    // Two questions from before the heading, dropped after the last question.
    const run = orderOf().slice(0, 2);
    const anchor = orderOf().at(-1)!;

    store().movePage(run, [anchor], 'after');

    const ids = orderOf();
    // The whole run moved together and stayed in document order.
    expect(ids.slice(-2)).toEqual(run);
    // It is past Section B's heading now, so those questions read under Section B.
    const flow = flowIds();
    expect(flow.indexOf(run[0])).toBeGreaterThan(flow.indexOf(sectionB.id));
  });

  it('moves a page break along with the page it opened', () => {
    const questionIds = orderOf();
    const pageBreak = createPageBreakElement();
    store().addLayoutElement(pageBreak, questionIds[1]);
    const breakId = pageBreak.id;

    // The page the break opens: the break itself, then the question on it. This is
    // exactly the shape `PageComposition.flowIds` reports.
    store().movePage([breakId, questionIds[2]], [questionIds[0]], 'before');

    const order = flowIds();
    // The break stays immediately in front of its own question. Leaving it behind is
    // what made a dragged page reflow back to roughly where it started.
    expect(order.indexOf(breakId)).toBe(order.indexOf(questionIds[2]) - 1);
    expect(order.indexOf(breakId)).toBeLessThan(order.indexOf(questionIds[0]));
  });

  it('refuses to drop a page onto itself', () => {
    const ids = orderOf().slice(0, 2);
    const before = orderOf();
    store().movePage(ids, [ids[0]], 'before');
    expect(orderOf()).toEqual(before);
  });
});
