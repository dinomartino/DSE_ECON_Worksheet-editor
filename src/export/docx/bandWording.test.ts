import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { OutputMode, Worksheet } from '@/model/types';
import { createBand, createTotalMarksField, createFillInField } from '@/model/bands';
import { createPageNumberField } from '@/model/page';
import { applyBandFieldSide } from '@/model/bandSegments';
import { exportDocxBuffer } from './index';
import { buildAcceptanceWorksheet } from '@/test/fixtures';

const STUDENT_BI: OutputMode = { language: 'bilingual', version: 'student' };

const read = async (worksheet: Worksheet, part: string) => {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, STUDENT_BI));
  return zip.file(part)!.async('string');
};

/**
 * A band field's wording is authored text, so it has to survive the whole pipeline.
 *
 * These guard the property the feature rests on: the phrasing around a computed value is
 * editable *and* the value stays computed. Both halves fail silently — a frozen total
 * still prints a plausible number, and lost spacing still prints readable text — so each
 * is asserted on the exported XML rather than on the model.
 */
describe('editable field wording reaches the .docx', () => {
  it('exports a retyped prefix and suffix around a live total', async () => {
    const w = buildAcceptanceWorksheet();
    let f = createTotalMarksField();
    f = applyBandFieldSide(f, 'prefix', { en: [{ text: 'TOTAL SCORE: ' }], zh: [] });
    f = applyBandFieldSide(f, 'suffix', { en: [{ text: ' pts' }], zh: [] });
    w.bands = [createBand({ left: [f] })];
    const doc = await read(w, 'word/document.xml');
    expect(doc).toContain('TOTAL SCORE: ');
    expect(doc).toContain(' pts');
    expect(doc).not.toContain('Full marks');
    // The total is still derived, not frozen into the wording.
    expect(doc).toContain('>24<');
  });

  it('keeps a page number a native field while its wording is authored', async () => {
    const w = buildAcceptanceWorksheet();
    let f = createPageNumberField('longForm');
    f = applyBandFieldSide(f, 'prefix', { en: [{ text: 'Sheet ' }], zh: [] });
    w.footer = { enabled: true, bands: [createBand({ center: [f] })], rule: false, showOnFirstPage: true };
    const foot = await read(w, 'word/footer1.xml');
    expect(foot).toContain('Sheet ');
    expect(foot).toContain('PAGE');
    expect(foot).toContain('NUMPAGES');
  });

  it('preserves the spacing the wording carries', async () => {
    const w = buildAcceptanceWorksheet();
    w.bands = [createBand({ left: [createTotalMarksField()] })];
    const doc = await read(w, 'word/document.xml');
    // xml:space must be preserved or Word eats the space before the number.
    expect(doc).toMatch(/xml:space="preserve">Full marks: </);
  });
});
