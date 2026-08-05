/**
 * The wizard may only offer choices the factory actually honours.
 *
 * A checkbox that is ticked, live, and ignored is worse than an absent one: it tells the
 * teacher a decision was theirs and then silently overrules it. That is exactly what
 * shipped when `paper1` stopped taking section headings — the option kept being offered
 * because nothing tied the form's list to the factory's behaviour.
 *
 * This is that tie. It drives `createWorksheetFrom` both ways for every document type
 * and asserts that the answer only moves where the form says it can, so the two cannot
 * drift again without a failure here.
 */
import { describe, expect, it } from 'vitest';
import { ASKS_SECTIONS } from './NewWorksheetForm';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';

const TYPES: DocumentType[] = ['classroom', 'paper1', 'lqWorksheet', 'lqMock'];

const sectionCount = (type: DocumentType, sections: boolean) =>
  createWorksheetFrom({ documentType: type, sections }).layout.filter(
    (element) => element.kind === 'section',
  ).length;

describe('every offered choice changes the document', () => {
  it.each(TYPES)('the sections checkbox on %s matches what the factory does', (type) => {
    const on = sectionCount(type, true);
    const off = sectionCount(type, false);

    if (ASKS_SECTIONS[type]) {
      // Offered: the answer has to matter, and ticking it has to produce headings.
      expect(on).toBeGreaterThan(0);
      expect(off).toBe(0);
    } else {
      // Withheld: the type decides for itself, so both answers give the same document.
      expect(on).toBe(off);
    }
  });

  it('withholds the choice from every exam-shaped document', () => {
    // Each of the three *is* a shape rather than a document with options: the booklet's
    // Sections A-C are its structure, a plain LQ set has none, and an MCQ paper runs as
    // one unbroken sequence between its lead-in and "END OF PAPER".
    expect(ASKS_SECTIONS.paper1).toBe(false);
    expect(ASKS_SECTIONS.lqMock).toBe(false);
    expect(ASKS_SECTIONS.lqWorksheet).toBe(false);
    expect(ASKS_SECTIONS.classroom).toBe(true);
  });

  it('gives the MCQ paper no section headings either way', () => {
    // The reference (DSE 2021 P1) carries none anywhere in its 18 pages.
    expect(sectionCount('paper1', true)).toBe(0);
    expect(sectionCount('paper1', false)).toBe(0);
  });
});
