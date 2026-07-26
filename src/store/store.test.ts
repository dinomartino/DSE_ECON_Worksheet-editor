import { beforeEach, describe, expect, it } from 'vitest';
import { questionMarks } from '@/model/marks';
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
    const questionId = store().worksheet.sections[0].questions[0].id;

    store().updateQuestion(questionId, { marks: 5 });
    expect((store().worksheet.sections[0].questions[0] as McqQuestion).marks).toBe(5);
    expect(store().canUndo()).toBe(true);

    store().undo();
    expect((store().worksheet.sections[0].questions[0] as McqQuestion).marks).toBe(1);

    store().redo();
    expect((store().worksheet.sections[0].questions[0] as McqQuestion).marks).toBe(5);
  });

  it('undoes an add, a delete and a reorder', () => {
    const sectionId = store().worksheet.sections[0].id;
    const before = store().worksheet.sections[0].questions.length;

    store().addQuestion(sectionId, 'mcq');
    expect(store().worksheet.sections[0].questions.length).toBe(before + 1);
    store().undo();
    expect(store().worksheet.sections[0].questions.length).toBe(before);

    const firstId = store().worksheet.sections[0].questions[0].id;
    store().removeQuestion(firstId);
    expect(store().worksheet.sections[0].questions.find((q) => q.id === firstId)).toBeUndefined();
    store().undo();
    expect(store().worksheet.sections[0].questions[0].id).toBe(firstId);

    const secondId = store().worksheet.sections[0].questions[1].id;
    store().moveQuestion(firstId, 1);
    expect(store().worksheet.sections[0].questions[0].id).toBe(secondId);
    store().undo();
    expect(store().worksheet.sections[0].questions[0].id).toBe(firstId);
  });

  it('discards the redo branch once a new edit lands', () => {
    const questionId = store().worksheet.sections[0].questions[0].id;
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
    const original = worksheet.sections[1].questions[0] as StructuredQuestion;

    store().duplicateQuestion(original.id);
    const questions = store().worksheet.sections[1].questions;
    const clone = questions[1] as StructuredQuestion;

    expect(questions.length).toBe(3);
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

  it('moves a question between sections and renumbers', () => {
    const questionId = store().worksheet.sections[0].questions[0].id;
    const targetSectionId = store().worksheet.sections[1].id;

    store().moveQuestionToSection(questionId, targetSectionId);

    expect(store().worksheet.sections[0].questions.some((q) => q.id === questionId)).toBe(false);
    const moved = store().worksheet.sections[1].questions;
    expect(moved.at(-1)!.id).toBe(questionId);

    // Section B restarts at 1, so the moved question takes the next number there.
    const plan = computeNumbering(store().worksheet);
    expect(plan.byQuestionId.get(questionId)!.number).toBe(3);
  });

  it('drag-reorders a question to a target position (§5.1)', () => {
    const ids = store().worksheet.sections[0].questions.map((q) => q.id);

    // Drag the first question onto the fourth's position.
    store().reorderQuestion(ids[0], ids[3]);
    expect(store().worksheet.sections[0].questions.map((q) => q.id)).toEqual([
      ids[1], ids[2], ids[0], ids[3], ids[4],
    ]);

    // Dragging backwards puts it directly before the target.
    store().reorderQuestion(ids[4], ids[1]);
    expect(store().worksheet.sections[0].questions.map((q) => q.id)).toEqual([
      ids[4], ids[1], ids[2], ids[0], ids[3],
    ]);

    // And it is undoable like any other edit.
    store().undo();
    store().undo();
    expect(store().worksheet.sections[0].questions.map((q) => q.id)).toEqual(ids);
  });

  it('drag-reorders across sections', () => {
    const sourceId = store().worksheet.sections[0].questions[0].id;
    const targetId = store().worksheet.sections[1].questions[1].id;

    store().reorderQuestion(sourceId, targetId);

    expect(store().worksheet.sections[0].questions.some((q) => q.id === sourceId)).toBe(false);
    const sectionB = store().worksheet.sections[1].questions.map((q) => q.id);
    expect(sectionB.indexOf(sourceId)).toBe(sectionB.indexOf(targetId) - 1);
  });

  it('ignores a drag onto itself or onto an unknown question', () => {
    const ids = store().worksheet.sections[0].questions.map((q) => q.id);
    store().reorderQuestion(ids[0], ids[0]);
    store().reorderQuestion(ids[0], 'not-a-question');
    expect(store().worksheet.sections[0].questions.map((q) => q.id)).toEqual(ids);
    expect(store().canUndo()).toBe(false);
  });

  it('adds a question through the registry and selects it', () => {
    const sectionId = store().worksheet.sections[1].id;
    store().addQuestion(sectionId, 'structured');
    const added = store().worksheet.sections[1].questions.at(-1)!;
    expect(added.type).toBe('structured');
    expect(store().selectedQuestionId).toBe(added.id);
  });

  it('ignores an unknown question type rather than corrupting the document', () => {
    const sectionId = store().worksheet.sections[0].id;
    const before = store().worksheet.sections[0].questions.length;
    store().addQuestion(sectionId, 'does-not-exist');
    expect(store().worksheet.sections[0].questions.length).toBe(before);
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
    const questionId = store().worksheet.sections[0].questions[0].id;
    const stem = () => {
      const block = store().worksheet.sections[0].questions[0].blocks[0];
      return block.kind === 'paragraph' ? block.text : { en: [], zh: [] };
    };

    expect(plain(stem().en)).toBeTruthy();
    expect(plain(stem().zh)).toBeTruthy();

    // Switch to English-only and edit the visible side, exactly as the sidebar does:
    // patch one language, leave the other untouched.
    store().setMode({ language: 'en' });
    const block = store().worksheet.sections[0].questions[0].blocks[0];
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
