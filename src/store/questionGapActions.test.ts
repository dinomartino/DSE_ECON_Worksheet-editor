import { beforeEach, describe, expect, it } from 'vitest';
import { spaceAbovePatch } from '@/components/editor/SpaceAboveField';
import { createMcqQuestion } from '@/model/factories';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import { BLANK_LINE_PT } from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import type { McqQuestion, Worksheet } from '@/model/types';
import { useWorksheetStore } from './worksheetStore';

/**
 * The two ways a teacher sets the air between questions, through the real store: Setup's
 * Between questions (`setExamGapLines`) and a question's Space above (`updateQuestion` with
 * `gapBefore`, which is also what dragging the gap on the page commits). "Default" is absence,
 * never a stored 0 or the default's current value, so the paper keeps tracking the shape.
 */

const store = () => useWorksheetStore.getState();
let a: McqQuestion;
let b: McqQuestion;

function open(documentType: DocumentType): void {
  a = createMcqQuestion();
  b = createMcqQuestion();
  const worksheet: Worksheet = {
    ...createWorksheetFrom({ documentType, seedSample: false }),
    questions: [a, b],
    layout: [],
    flow: [{ type: 'question', id: a.id }, { type: 'question', id: b.id }],
  };
  useWorksheetStore.setState({ worksheet, past: [], future: [] });
}

/** The blank lines above the second question as the page draws it. */
function gapAboveB(): number {
  const node = renderWorksheet(store().worksheet, { language: 'en', version: 'student' }).questions[1].nodes[0];
  return (node.kind === 'text' ? (node.format?.spaceBefore ?? 0) : 0) / BLANK_LINE_PT;
}

const own = () => store().worksheet.questions.find((q) => q.id === b.id)!.gapBefore;

describe.each<DocumentType>(['classroom', 'lqMock', 'paper1'])('between questions on a %s, through the store', (documentType) => {
  beforeEach(() => open(documentType));

  it('stores the paper’s number, and drops the key for the default', () => {
    store().setExamGapLines(4);
    expect(store().worksheet.examGapLines).toBe(4);
    expect(gapAboveB()).toBe(4);
    store().setExamGapLines(undefined);
    expect('examGapLines' in store().worksheet).toBe(false);
    expect(gapAboveB()).toBe(documentType === 'paper1' ? 3 : 1);
  });

  it('keeps at least one whole line', () => {
    store().setExamGapLines(0.2);
    expect(store().worksheet.examGapLines).toBe(1);
    store().setExamGapLines(3.6);
    expect(store().worksheet.examGapLines).toBe(4);
  });

  it('is one undo step each way', () => {
    store().setExamGapLines(5);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().worksheet.examGapLines).toBeUndefined();
    store().redo();
    expect(store().worksheet.examGapLines).toBe(5);
  });

  it('lets a question state its own number, and return to following the paper’s', () => {
    store().setExamGapLines(4);
    store().updateQuestion(b.id, spaceAbovePatch(2));
    expect(own()).toBe(2);
    expect(gapAboveB()).toBe(2);
    store().updateQuestion(b.id, spaceAbovePatch(0));
    expect(own()).toBeUndefined();
    // Following the paper again: a later change of the paper’s number reaches it.
    expect(gapAboveB()).toBe(4);
    store().setExamGapLines(6);
    expect(gapAboveB()).toBe(6);
  });

  it('commits what a drag on the page commits: a whole number of lines on the question', () => {
    store().updateQuestion(b.id, { gapBefore: 7 });
    expect(gapAboveB()).toBe(7);
  });
});
