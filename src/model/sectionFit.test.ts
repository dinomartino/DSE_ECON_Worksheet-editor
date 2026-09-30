import { describe, expect, it } from 'vitest';
import { choiceQuestion, partsQuestion } from '@/library/testKit';
import { createSectionElement, flowOf } from './flow';
import { createWorksheetFrom } from './newWorksheet';
import { sectionSpans } from './sectionFit';
import { bi } from './text';
import type { LayoutElement, Question, Worksheet } from './types';

/** A document of section markers and questions, in the order given. */
function doc(items: Array<LayoutElement | Question>): Worksheet {
  const base = createWorksheetFrom({ documentType: 'classroom', sections: false, seedSample: false });
  const layout = items.filter((item): item is LayoutElement => 'kind' in item);
  const questions = items.filter((item): item is Question => !('kind' in item));
  return {
    ...base,
    layout,
    questions,
    flow: items.map((item) => ('kind' in item ? { type: 'layout' as const, id: item.id } : { type: 'question' as const, id: item.id })),
  };
}
const fits = (worksheet: Worksheet) => sectionSpans(worksheet, flowOf(worksheet)).map((span) => span.fits);

describe('sectionSpans', () => {
  it('reads the new classroom worksheet’s headings, in either language', () => {
    const worksheet = createWorksheetFrom({ documentType: 'classroom', seedSample: false });
    const [mcq, structured] = [choiceQuestion('x'), partsQuestion('y')].map((q) => q.type);
    expect(fits(worksheet)).toEqual([mcq, structured]);
    const zhOnly = doc([
      createSectionElement(bi('', '甲部：多項選擇題')),
      createSectionElement(bi('', '乙部：結構性問題')),
    ]);
    expect(fits(zhOnly)).toEqual([mcq, structured]);
  });

  it('spans each marker to the next', () => {
    const q = choiceQuestion('x');
    const worksheet = doc([createSectionElement(bi('One', '')), q, createSectionElement(bi('Two', ''))]);
    expect(sectionSpans(worksheet, flowOf(worksheet)).map(({ start, end }) => [start, end])).toEqual([[0, 2], [2, 3]]);
  });

  it('lets what a section holds outrank its heading, and a mix fit nothing', () => {
    const mcqHeading = createSectionElement(bi('Section A: Multiple Choice', ''));
    const structuredHeading = createSectionElement(bi('Section B: Structured Questions', ''));
    const worksheet = doc([mcqHeading, structuredHeading, choiceQuestion('a'), choiceQuestion('b')]);
    const mcq = choiceQuestion('x').type;
    expect(fits(worksheet)).toEqual([mcq, mcq]);
    const mixed = doc([structuredHeading, choiceQuestion('a'), partsQuestion('b')]);
    expect(fits(mixed)).toEqual([undefined]);
  });

  it('fits nothing to a heading that names no type, or two', () => {
    const worksheet = doc([
      createSectionElement(bi('Section A', '')),
      createSectionElement(bi('Multiple choice and structured questions', '')),
    ]);
    expect(fits(worksheet)).toEqual([undefined, undefined]);
  });
});
