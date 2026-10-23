import { beforeEach, describe, expect, it } from 'vitest';
import '@/registry';
import { pageFlowPatch } from '@/components/editor/PageFlowFields';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { renderWorksheet } from '@/render/worksheet';
import type { Question, Worksheet } from '@/model/types';
import { useWorksheetStore } from './worksheetStore';

/**
 * The two page choices through the real store: a question's `startOnNewPage` and `keepOnOnePage`
 * are written by `updateQuestion`, like every other question field, so they are one undo step
 * each, survive a save and a reload, and reach the page through the walker's marks.
 */

const store = () => useWorksheetStore.getState();
const EN = { language: 'en', version: 'student' } as const;
let a: Question;
let b: Question;

function open(): void {
  a = createStructuredQuestion();
  b = createStructuredQuestion();
  const worksheet: Worksheet = {
    ...createWorksheetFrom({ documentType: 'classroom', seedSample: false }),
    questions: [a, b, createMcqQuestion()],
    layout: [],
    flow: [],
  };
  worksheet.flow = worksheet.questions.map((q) => ({ type: 'question' as const, id: q.id }));
  useWorksheetStore.setState({ worksheet, past: [], future: [] });
}

const own = (id: string) => store().worksheet.questions.find((q) => q.id === id)!;
const marks = () => renderWorksheet(store().worksheet, EN).questions.map((q) => [q.startsPage, q.keptTogether]);

describe('the page choices, through the store', () => {
  beforeEach(open);

  it('stores true for a question that asks, and reaches the page', () => {
    store().updateQuestion(b.id, pageFlowPatch('startOnNewPage', true));
    expect(own(b.id).startOnNewPage).toBe(true);
    expect(marks()).toEqual([[undefined, undefined], [true, undefined], [undefined, undefined]]);
  });

  it('stores keep-on-one-page the same way', () => {
    store().updateQuestion(b.id, pageFlowPatch('keepOnOnePage', true));
    expect(own(b.id).keepOnOnePage).toBe(true);
    expect(marks()).toEqual([[undefined, undefined], [undefined, true], [undefined, undefined]]);
  });

  it('returns to the question it was when cleared: no key left behind once saved', () => {
    const before = JSON.stringify(own(b.id));
    store().updateQuestion(b.id, pageFlowPatch('startOnNewPage', true));
    store().updateQuestion(b.id, pageFlowPatch('startOnNewPage', false));
    expect(JSON.stringify(own(b.id))).toBe(before);
    expect(marks()).toEqual([[undefined, undefined], [undefined, undefined], [undefined, undefined]]);
  });

  it('is one undo step each way', () => {
    store().updateQuestion(b.id, pageFlowPatch('startOnNewPage', true));
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(own(b.id).startOnNewPage).toBeUndefined();
    expect(marks()[1]).toEqual([undefined, undefined]);
    store().redo();
    expect(own(b.id).startOnNewPage).toBe(true);
    expect(marks()[1]).toEqual([true, undefined]);
  });

  it('leaves the other questions alone', () => {
    store().updateQuestion(b.id, pageFlowPatch('startOnNewPage', true));
    expect(own(a.id).startOnNewPage).toBeUndefined();
    expect(store().worksheet.questions[2].startOnNewPage).toBeUndefined();
  });

  it('follows the question when it moves', () => {
    store().updateQuestion(b.id, pageFlowPatch('startOnNewPage', true));
    store().moveQuestion(b.id, -1);
    // b is first now and so opens the paper: dormant, kept, not lost.
    expect(marks()[0]).toEqual([undefined, undefined]);
    expect(own(b.id).startOnNewPage).toBe(true);
    store().moveQuestion(b.id, 1);
    expect(marks()[1]).toEqual([true, undefined]);
  });
});
