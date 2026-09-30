import { describe, expect, it } from 'vitest';
import { paperKind } from '@/model/documentShape';
import { createMcqQuestion, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import type { Question, Worksheet } from '@/model/types';
import { paperTypeFilter, paperTypeIds, typesOutsidePaper } from './paperTypes';

const withQuestions = (worksheet: Worksheet, questions: Question[]): Worksheet => ({
  ...worksheet,
  questions,
  flow: [...worksheet.flow, ...questions.map((q) => ({ type: 'question' as const, id: q.id }))],
});

describe('paperKind', () => {
  it('reads the four kinds the new-worksheet form makes', () => {
    expect(paperKind(createWorksheetFrom({ documentType: 'paper1' }))).toBe('paper1');
    expect(paperKind(createWorksheetFrom({ documentType: 'lqMock' }))).toBe('lqMock');
    expect(paperKind(createWorksheetFrom({ documentType: 'lqWorksheet' }))).toBe('lqWorksheet');
    expect(paperKind(createWorksheetFrom({ documentType: 'classroom' }))).toBe('classroom');
  });

  it('an emptied LQ worksheet reads as a classroom sheet again', () => {
    const lq = createWorksheetFrom({ documentType: 'lqWorksheet' });
    expect(paperKind({ ...lq, questions: [], flow: lq.flow.filter((item) => item.type !== 'question') })).toBe('classroom');
  });
});

describe('paperTypeIds: what a paper normally takes', () => {
  it('Paper 1 takes MCQs only, even holding a stray LQ', () => {
    const paper1 = createWorksheetFrom({ documentType: 'paper1' });
    expect(paperTypeIds(paper1)).toEqual(['mcq']);
    expect(paperTypeIds(withQuestions(paper1, [createStructuredQuestion()]))).toEqual(['mcq']);
    expect(paperTypeFilter(paper1)).toBe('mcq');
  });

  it('a Question-Answer Book and an LQ worksheet take LQs', () => {
    expect(paperTypeIds(createWorksheetFrom({ documentType: 'lqMock' }))).toEqual(['structured']);
    expect(paperTypeFilter(createWorksheetFrom({ documentType: 'lqWorksheet' }))).toBe('structured');
  });

  it('a classroom sheet takes both, so the filter starts on any type', () => {
    expect(paperTypeIds(createWorksheet())).toEqual(['mcq', 'structured']);
    expect(paperTypeFilter(createWorksheetFrom({ documentType: 'classroom' }))).toBe('');
  });

  it('an LQ worksheet that already holds MCQs keeps taking them', () => {
    const lq = createWorksheetFrom({ documentType: 'lqWorksheet' });
    expect(paperTypeIds(withQuestions(lq, [createMcqQuestion()]))).toEqual(['mcq', 'structured']);
  });

  it('names only the types a paper does not take, once each', () => {
    const paper1 = createWorksheetFrom({ documentType: 'paper1' });
    expect(typesOutsidePaper(paper1, ['mcq', 'structured', 'structured'])).toEqual(['structured']);
    expect(typesOutsidePaper(paper1, ['mcq'])).toEqual([]);
    expect(typesOutsidePaper(createWorksheet(), ['mcq', 'structured'])).toEqual([]);
  });
});
