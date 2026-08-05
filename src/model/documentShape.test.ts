/**
 * A document only offers what its own paper can contain.
 *
 * The shape is **derived** from the document — furniture for the booklet, a panel-less
 * cover for the MCQ paper — so a worksheet assembled by hand, pasted, or loaded from an
 * older build gets the same answer as one the wizard built. A stored `documentType`
 * would be a second answer to a question the content already settles.
 */
import { describe, expect, it } from 'vitest';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { createWorksheet } from '@/model/factories';
import { documentShape, hiddenLayoutKinds, offersLayoutKind } from '@/model/documentShape';

describe('reading a document’s shape from the document itself', () => {
  it('names each of the wizard’s documents', () => {
    expect(documentShape(createWorksheetFrom({ documentType: 'lqMock' }))).toBe('lqMock');
    expect(documentShape(createWorksheetFrom({ documentType: 'paper1' }))).toBe('paper1');
    expect(documentShape(createWorksheetFrom({ documentType: 'classroom' }))).toBe('classroom');
    expect(documentShape(createWorksheet())).toBe('classroom');
  });

  it('calls the booklet a booklet even though it also has a cover', () => {
    // Order matters: the QAB has *both* furniture and a cover, so testing the cover
    // first would classify it as a Paper 1 and strip its answer space.
    const qab = createWorksheetFrom({ documentType: 'lqMock' });
    expect(qab.cover).toBeDefined();
    expect(qab.pageFurniture).toBeDefined();
    expect(documentShape(qab)).toBe('lqMock');
  });
});

describe('what each paper offers', () => {
  it('withholds writing room and sections from an MCQ paper', () => {
    // Its candidate answers on a separate machine-read sheet, and it runs as one
    // unbroken sequence of questions.
    const hidden = hiddenLayoutKinds('paper1');
    expect(hidden.has('answerLines')).toBe(true);
    expect(hidden.has('answerSpace')).toBe(true);
    expect(hidden.has('section')).toBe(true);
    expect(hidden.has('partHeader')).toBe(true);
  });

  it('withholds the worksheet’s ruled lines from the booklet', () => {
    // A QAB answers on dotted `answerSpace` at the reference's own pitch; the 24pt
    // ruled `answerLines` is a different mechanism and a second, disagreeing rhythm.
    expect(offersLayoutKind('lqMock', 'answerLines')).toBe(false);
    expect(offersLayoutKind('lqMock', 'answerSpace')).toBe(true);
  });

  it('offers the question count only on the paper whose lead-in it is', () => {
    expect(offersLayoutKind('paper1', 'questionCount')).toBe(true);
    expect(offersLayoutKind('lqMock', 'questionCount')).toBe(false);
    expect(offersLayoutKind('classroom', 'questionCount')).toBe(false);
  });

  it('keeps every element a real paper of either kind carries', () => {
    // The cut must not reach past what the paper genuinely cannot contain: a heading, a
    // note, a divider, a page break and blank space are all things both papers print.
    for (const shape of ['paper1', 'lqMock'] as const) {
      for (const kind of ['heading', 'text', 'divider', 'pageBreak', 'spacer'] as const) {
        expect(offersLayoutKind(shape, kind)).toBe(true);
      }
    }
  });

  it('takes nothing away from a plain worksheet but the MCQ lead-in', () => {
    const hidden = hiddenLayoutKinds('classroom');
    expect([...hidden]).toEqual(['questionCount']);
  });
});
