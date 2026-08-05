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

  it('sizes the page number itself, not just the wording beside it', async () => {
    /*
     * A `PAGE` field is five runs — begin, instruction, separate, fallback, end — and
     * Word takes the displayed number's size from *them*, not from the text run next to
     * it. Built from fonts alone, the number silently reverted to the document default
     * while the authored prefix printed at the size the teacher set.
     *
     * Invisible everywhere but the exported file: the model is right, the preview draws
     * its own chip at the right size, and the .docx prints an 11pt number under a 9pt
     * code. The QAB's footer shipped like that — its centre number is meant to be the
     * big one a candidate flips to.
     */
    const w = buildAcceptanceWorksheet();
    const field = { ...createPageNumberField('plain'), format: { fontSize: 14 } };
    w.footer = {
      enabled: true,
      bands: [createBand({ center: [field] })],
      rule: false,
      showOnFirstPage: true,
    };

    const foot = await read(w, 'word/footer1.xml');

    // Every run of the field, not just one of them: Word renders the number from the
    // run pair around `separate`, so a size on the instruction alone would still print
    // at the default. 14pt = 28 half-points.
    const runs = foot.match(/<w:r>[\s\S]*?<\/w:r>/g) ?? [];
    const fieldRuns = runs.filter((r) => /fldChar|instrText/.test(r));

    expect(fieldRuns.length).toBe(4);
    for (const r of fieldRuns) expect(r).toContain('<w:sz w:val="28"/>');
  });
});
