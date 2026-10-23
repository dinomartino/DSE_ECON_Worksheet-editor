import { describe, expect, it } from 'vitest';
import '@/registry';
import { createStimulusElement } from '@/model/flow';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import { bi, rt } from '@/model/text';
import type { LayoutElement, McqQuestion, OutputMode, Question, StructuredQuestion, Worksheet } from '@/model/types';
import { gapAboveStatus } from './questionGap';
import { startsEveryQuestion, withStartEveryQuestionOnNewPage } from './pageFlow';
import { renderWorksheet } from './worksheet';

/**
 * The paper-wide "Start every question on a new page" (format-settings.md § 6 decision 4, built
 * as k-0189). It asks of every question what its own "Start on a new page" asks, so the rules
 * themselves are proved in `pageFlow.test.ts`; this file proves the switch reaches them, and only
 * where it should.
 */

const EN: OutputMode = { language: 'en', version: 'student' };

const structured = (id: string, extra: Partial<StructuredQuestion> = {}): StructuredQuestion => ({
  id,
  type: 'structured',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: bi(`Stem ${id}`, '') }],
  parts: [{ id: `${id}-p`, blocks: [{ id: `${id}-pb`, kind: 'paragraph', text: bi('part a', '') }], marks: 2 }],
  ...extra,
});
const mcq = (id: string): McqQuestion => ({
  id,
  type: 'mcq',
  blocks: [{ id: `${id}-b`, kind: 'paragraph', text: { en: rt(`stem ${id}`), zh: [] } }],
  options: ['one', 'two', 'three', 'four'].map((text, i) => ({ id: `${id}-o${i}`, text: { en: rt(text), zh: [] } })),
  answerIndex: 0,
  marks: 1,
});
const section = (): LayoutElement => ({ id: 'sec', kind: 'section', text: bi('Section A', ''), restartNumbering: false });
const pageBreak = (): LayoutElement => ({ id: 'brk', kind: 'pageBreak' });
const stimulus = (): LayoutElement => ({ ...createStimulusElement(), id: 'stim' });

const isLayout = (item: Question | LayoutElement): item is LayoutElement => 'kind' in item;
function paper(
  items: Array<Question | LayoutElement>,
  documentType: DocumentType = 'classroom',
  extra: Partial<Worksheet> = {},
): Worksheet {
  return {
    ...createWorksheetFrom({ documentType, seedSample: false }),
    ...extra,
    questions: items.filter((item): item is Question => !isLayout(item)),
    layout: items.filter(isLayout),
    flow: items.map((item) => ({ type: isLayout(item) ? ('layout' as const) : ('question' as const), id: item.id })),
  } as Worksheet;
}

/** The ids of the items that open a sheet, in flow order. */
const opened = (worksheet: Worksheet): string[] =>
  renderWorksheet(worksheet, EN).items.flatMap((item) => {
    const placed = item.type === 'question' ? item.question : item.layout;
    const id = item.type === 'question' ? item.question.questionId : item.layout.elementId;
    return placed.startsPage ? [id] : [];
  });

const ON = { startEveryQuestionOnNewPage: true } as const;

describe('Start every question on a new page', () => {
  it('opens a sheet at every question but the first', () => {
    expect(opened(paper([structured('a'), structured('b'), structured('c')], 'classroom', ON))).toEqual(['b', 'c']);
  });

  it('does nothing while off, and for a stored false', () => {
    const items = [structured('a'), structured('b')];
    expect(opened(paper(items))).toEqual([]);
    expect(opened(paper(items, 'classroom', { startEveryQuestionOnNewPage: false }))).toEqual([]);
  });

  it('takes the heading, lead-in or source above each question along, as the per-question box does', () => {
    const w = paper([structured('a'), section(), structured('b'), stimulus(), structured('c')], 'classroom', ON);
    expect(opened(w)).toEqual(['sec', 'stim']);
  });

  it('adds nothing under a New page break, and never makes a blank page of it', () => {
    expect(opened(paper([structured('a'), pageBreak(), structured('b'), structured('c')], 'classroom', ON))).toEqual(['c']);
  });

  it('works on an LQ worksheet and a booklet, and reaches an MC question too', () => {
    for (const documentType of ['lqWorksheet', 'lqMock'] as const) {
      expect(opened(paper([structured('a'), structured('b')], documentType, ON)), documentType).toEqual(['b']);
    }
    expect(opened(paper([structured('a'), mcq('b')], 'classroom', ON))).toEqual(['b']);
  });

  it('is not honoured on a Paper 1, whatever is stored', () => {
    const w = paper([mcq('a'), mcq('b'), mcq('c')], 'paper1', ON);
    expect(startsEveryQuestion(w)).toBe(false);
    expect(opened(w)).toEqual([]);
    expect(startsEveryQuestion(paper([mcq('a')], 'classroom', ON))).toBe(true);
  });

  it('leaves each question’s own box working beside it: nothing opens twice, and a paper with it off still obeys the boxes', () => {
    const boxed = paper([structured('a'), structured('b', { startOnNewPage: true }), structured('c')]);
    expect(opened(boxed)).toEqual(['b']);
    expect(opened({ ...boxed, ...ON })).toEqual(['b', 'c']);
  });

  it('leaves no air above what opens a sheet, and no drag handle on the gap that never prints', () => {
    const w = paper([structured('a'), structured('b')], 'classroom', { ...ON, examGapLines: 3 });
    const [, second] = renderWorksheet(w, EN).questions;
    const first = second.nodes[0];
    expect(first.kind === 'text' ? (first.format?.spaceBefore ?? 0) : 0).toBe(0);
    expect(second.adjustableGap).toBeUndefined();
  });

  it('tells the Space above panel why its gap does not print', () => {
    const items = [structured('a'), structured('b')];
    expect(gapAboveStatus(paper(items), 'b')).toBe('applies');
    expect(gapAboveStatus(paper(items, 'classroom', ON), 'b')).toBe('startsPage');
  });

  it('marks nothing on a paper that has it off: no key at all', () => {
    for (const item of renderWorksheet(paper([structured('a'), section(), structured('b')]), EN).items) {
      expect('startsPage' in (item.type === 'question' ? item.question : item.layout)).toBe(false);
    }
  });

  it('is written as true and removed when cleared, the same object for a no-op', () => {
    const off = paper([structured('a')]);
    const on = withStartEveryQuestionOnNewPage(off, true);
    expect(on.startEveryQuestionOnNewPage).toBe(true);
    expect(withStartEveryQuestionOnNewPage(on, true)).toBe(on);
    const back = withStartEveryQuestionOnNewPage(on, false);
    expect('startEveryQuestionOnNewPage' in back).toBe(false);
    expect(back).toEqual(off);
    expect(withStartEveryQuestionOnNewPage(off, false)).toBe(off);
  });
});
