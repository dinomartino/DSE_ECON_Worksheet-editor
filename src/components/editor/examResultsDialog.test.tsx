import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMcqQuestion, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { duplicateSetPapers } from '@/model/duplicateSet';
import { bi } from '@/model/text';
import type { McqQuestion, Worksheet } from '@/model/types';
import { duplicateWorksheet, editableCopy } from '@/storage/document';
import { withFlow } from '@/test/fixtures';
import { draftInvalid, draftResults, resultRows, startingDraft, ExamResultsDialog } from './ExamResultsDialog';

// A server render reads zustand's initial state; read the live one so setState shows.
vi.mock('@/store/worksheetStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/store/worksheetStore')>();
  const store = real.useWorksheetStore;
  const live = <T,>(select: (s: ReturnType<typeof store.getState>) => T): T => select(store.getState());
  return { ...real, useWorksheetStore: Object.assign(live, store) };
});

const { useWorksheetStore } = await import('@/store/worksheetStore');
const { AnswerKeyLayoutPanel } = await import('./AnswerKeyLayoutPanel');

const initial = useWorksheetStore.getState();
afterEach(() => useWorksheetStore.setState(initial, true));

/** Two MC questions (keys A, D) and a structured one. */
function paper(): Worksheet {
  const mcqs = [0, 3].map((answerIndex) => ({ ...(createMcqQuestion() as McqQuestion), answerIndex }));
  return withFlow(createWorksheet(), [...mcqs, createStructuredQuestion()], { replaceLayout: true });
}

describe('the dialog’s draft', () => {
  it('lists the MC questions as the paper numbers them, and sees the structured one', () => {
    const { groups, structured } = resultRows(paper());
    expect(groups.flatMap((g) => g.choices).map((c) => [c.number, c.letter])).toEqual([
      [1, 'A'],
      [2, 'D'],
    ]);
    expect(structured).toBe(true);
  });

  it('starts from what is stored, and saves only what is typed', () => {
    const worksheet = paper();
    const [a, b] = worksheet.questions.map((q) => q.id);
    worksheet.examResults = { mcPercent: { [a]: 65, gone: 10 }, sqComments: bi('Weak diagrams.', ''), later: true } as never;
    const { groups } = resultRows(worksheet);
    const draft = startingDraft(worksheet, groups);
    expect(draft.percents).toEqual({ [a]: '65', [b]: '' });
    expect(draft.sq).toEqual({ en: 'Weak diagrams.', zh: '' });

    const next = draftResults({ ...draft, percents: { [a]: '65', [b]: ' 42.5% ' }, mc: { en: '', zh: '第2題最難。' } }, worksheet.examResults);
    // A deleted question's % goes; a newer build's own key stays.
    expect(next).toEqual({
      later: true,
      mcPercent: { [a]: 65, [b]: 42.5 },
      mcComments: bi('', '第2題最難。'),
      sqComments: bi('Weak diagrams.', ''),
    });
  });

  it('cannot save a % outside 0–100, and an emptied draft stores nothing', () => {
    expect(draftInvalid({ percents: { a: '120' }, mc: { en: '', zh: '' }, sq: { en: '', zh: '' } })).toBe(true);
    expect(draftInvalid({ percents: { a: '' }, mc: { en: '', zh: '' }, sq: { en: '', zh: '' } })).toBe(false);
    const empty = draftResults({ percents: { a: '' }, mc: { en: ' ', zh: '' }, sq: { en: '', zh: '' } }, undefined);
    expect(empty).toEqual({});
  });

  it('renders a row per MC question with its key, and both comment boxes in two languages', () => {
    const markup = renderToStaticMarkup(<ExamResultsDialog worksheet={paper()} onClose={() => {}} onSave={() => {}} />);
    expect(markup).toContain('MC: % correct');
    expect(markup).toContain('aria-label="Question 2, % correct"');
    expect(markup).toContain('Structured questions (SQ, LQ)');
    expect(markup.match(/<textarea/g)?.length).toBe(4);
  });
});

describe('the Layout tab’s Exam results', () => {
  it('offers Enter results… and no switches while nothing is entered', () => {
    useWorksheetStore.getState().replaceWorksheet(paper());
    const markup = renderToStaticMarkup(<AnswerKeyLayoutPanel />);
    expect(markup).toContain('Exam results');
    expect(markup).toContain('Enter results…');
    expect(markup).not.toContain('MC % correct');
  });

  it('once entered: what is entered, Edit results… and the two switches', () => {
    const worksheet = paper();
    worksheet.examResults = { mcPercent: { [worksheet.questions[0].id]: 70 }, mcComments: bi('Fine.', '') };
    useWorksheetStore.getState().replaceWorksheet(worksheet);
    const markup = renderToStaticMarkup(<AnswerKeyLayoutPanel />);
    expect(markup).toContain('% correct for 1 of 2 MC');
    expect(markup).toContain('Candidates’ performance entered');
    expect(markup).toContain('Edit results…');
    expect(markup).toContain('MC % correct, e.g. “A (65%)”');
  });

  it('saving is one undoable step, and the same results again are none', () => {
    useWorksheetStore.getState().replaceWorksheet(paper());
    const id = useWorksheetStore.getState().worksheet.questions[0].id;
    const { updateExamResults } = useWorksheetStore.getState();
    updateExamResults({ mcPercent: { [id]: 55 } });
    expect(useWorksheetStore.getState().worksheet.examResults).toEqual({ mcPercent: { [id]: 55 } });
    const past = useWorksheetStore.getState().past.length;
    updateExamResults({ mcPercent: { [id]: 55 } });
    expect(useWorksheetStore.getState().past.length).toBe(past);
    updateExamResults({});
    expect('examResults' in useWorksheetStore.getState().worksheet).toBe(false);
    useWorksheetStore.getState().undo();
    useWorksheetStore.getState().undo();
    expect('examResults' in useWorksheetStore.getState().worksheet).toBe(false);
  });
});

describe('a copy is a new sitting: it leaves the results behind', () => {
  const worksheet = (): Worksheet => ({ ...paper(), examResults: { mcComments: bi('x', '') } });

  it('a duplicate or editable copy', () => {
    for (const copy of [duplicateWorksheet(worksheet(), 'copy'), editableCopy(worksheet(), 'copy')]) {
      expect('examResults' in copy).toBe(false);
    }
  });

  it('a duplicated set', () => {
    const [copy] = duplicateSetPapers([worksheet()], {
      set: { id: 's', name: 'Set' },
      bumpYear: false,
      lang: 'en',
      newId: () => 'copy',
    });
    expect('examResults' in copy).toBe(false);
  });
});
