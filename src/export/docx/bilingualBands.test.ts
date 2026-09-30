import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { BandField, LanguageMode, OutputMode, Worksheet } from '@/model/types';
import { createBand, createTextField, createTotalMarksField } from '@/model/bands';
import {
  applyBandFieldSide,
  bandFieldPrintSides,
  bandFieldPrintText,
  mirrorBilingualEdit,
} from '@/model/bandSegments';
import { createPageNumberField } from '@/model/page';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { bi, plain } from '@/model/text';
import { bandFieldText, renderWorksheet } from '@/render/worksheet';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { exportDocxBuffer } from './index';

/**
 * Bilingual mode stacks English over 中文 — but a band field whose two sides read the
 * same printed twice. The QAB footer's code ("2026-27-ECON 2–") is authored identically
 * in both languages and its page number is derived, so a new bilingual Paper 2 printed
 * "2026-27-ECON 2–⏎2026-27-ECON 2–" in the .docx and the number twice on the page.
 */

const mode = (language: LanguageMode): OutputMode => ({ language, version: 'student' });

const part = async (worksheet: Worksheet, language: LanguageMode, name: string) => {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode(language)));
  return zip.file(name)!.async('string');
};

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const codeField = (): BandField =>
  applyBandFieldSide(createPageNumberField('plain'), 'prefix', bi('2026-27-ECON 2–', '2026-27-ECON 2–'));

describe('which language lines a band field prints', () => {
  it('prints identical sides once — wording and derived value alike', () => {
    expect(bandFieldPrintSides(codeField(), { totalMarks: 0 }, 'bilingual')).toEqual(['en']);
    // A bare page number: no wording, the same number on both sides.
    expect(bandFieldPrintSides(createPageNumberField(), { totalMarks: 0 }, 'bilingual')).toEqual([
      'en',
    ]);
    expect(
      bandFieldPrintSides(createTextField(bi('ECON', 'ECON')), { totalMarks: 0 }, 'bilingual'),
    ).toEqual(['en']);
  });

  it('keeps both lines when the languages really differ', () => {
    expect(bandFieldPrintSides(createTotalMarksField(), { totalMarks: 45 }, 'bilingual')).toEqual([
      'en',
      'zh',
    ]);
    const translated = applyBandFieldSide(createPageNumberField(), 'prefix', bi('Page ', '頁 '));
    expect(bandFieldPrintSides(translated, { totalMarks: 0 }, 'bilingual')).toEqual(['en', 'zh']);
  });

  it('drops a side that would only restate the derived value', () => {
    let f = createTotalMarksField();
    f = applyBandFieldSide(f, 'prefix', { en: [{ text: 'Total: ' }], zh: [] });
    f = applyBandFieldSide(f, 'suffix', { en: [], zh: [] });
    // Chinese has no wording of its own: stacked, it was a bare "45".
    expect(bandFieldPrintSides(f, { totalMarks: 45 }, 'bilingual')).toEqual(['en']);

    let zhOnly = createTotalMarksField();
    zhOnly = applyBandFieldSide(zhOnly, 'prefix', { en: [], zh: [{ text: '總分：' }] });
    zhOnly = applyBandFieldSide(zhOnly, 'suffix', { en: [], zh: [] });
    expect(bandFieldPrintSides(zhOnly, { totalMarks: 45 }, 'bilingual')).toEqual(['zh']);
  });

  it('leaves single-language output exactly as it was', () => {
    for (const field of [codeField(), createTotalMarksField(), createPageNumberField('longForm')]) {
      for (const language of ['en', 'zh'] as const) {
        expect(bandFieldPrintSides(field, { totalMarks: 7 }, language)).toEqual([language]);
        expect(bandFieldPrintText(field, { totalMarks: 7 }, language)).toEqual(
          bandFieldText(field, 7),
        );
      }
    }
  });

  it('empties the repeated side of the printed text', () => {
    const page = { number: 5, count: 12 };
    const text = bandFieldPrintText(codeField(), { totalMarks: 0, page }, 'bilingual');
    expect(plain(text.en)).toBe('2026-27-ECON 2–5');
    expect(text.zh).toEqual([]);
  });
});

describe('a bilingual exam footer prints once', () => {
  for (const documentType of ['lqMock', 'paper1'] as const) {
    it(`${documentType}: the paper code and the page number, once each`, async () => {
      const w = createWorksheetFrom({ documentType });
      const bilingual = await part(w, 'bilingual', 'word/footer1.xml');
      // The seeded code follows the school year, so read it rather than pin a year.
      const seeded = w.footer!.bands[0].zones.left[0];
      const code = plain(seeded.kind === 'pageNumber' ? seeded.prefix?.en : []);
      expect(code).toMatch(new RegExp(`-ECON ${documentType === 'lqMock' ? 2 : 1}–$`));

      expect(count(bilingual, code)).toBe(1);
      // Two fields (code + number, bare number), one live PAGE each.
      expect(count(bilingual, 'PAGE')).toBe(2);
      expect(bilingual).not.toContain('<w:br/>');
      // Nothing in this footer is language: bilingual is the English footer, byte for byte.
      expect(bilingual).toBe(await part(w, 'en', 'word/footer1.xml'));
    });
  }

  it('still stacks a footer whose wording is translated', async () => {
    const w = buildAcceptanceWorksheet();
    const f = applyBandFieldSide(createPageNumberField(), 'prefix', bi('Page ', '頁 '));
    w.footer = { enabled: true, bands: [createBand({ center: [f] })], rule: false, showOnFirstPage: true };
    const foot = await part(w, 'bilingual', 'word/footer1.xml');
    expect(foot).toContain('Page ');
    expect(foot).toContain('頁 ');
    // One line per language, each with its own live number — the preview's shape.
    expect(count(foot, '<w:br/>')).toBe(1);
    expect(count(foot, 'PAGE')).toBe(2);
  });
});

describe('other band and cover text in bilingual mode', () => {
  it('a masthead field that reads the same in both languages prints once', () => {
    const w = buildAcceptanceWorksheet();
    w.bands = [createBand({ left: [createTextField(bi('S.6', 'S.6'))], right: [createTotalMarksField()] })];
    const [row] = renderWorksheet(w, mode('bilingual')).bands;
    if (row.kind !== 'columns') throw new Error('expected a columns row');
    expect(row.cells[0].text).toEqual({ en: [{ text: 'S.6' }], zh: [] });
    // Translated wording is untouched.
    expect(plain(row.cells[1].text.zh)).toContain('總分');

    const [enRow] = renderWorksheet(w, mode('en')).bands;
    if (enRow.kind !== 'columns') throw new Error('expected a columns row');
    expect(enRow.cells[0].text).toEqual(bi('S.6', 'S.6'));
  });

  it('a cover instruction number prints once, beside the English line', () => {
    const w = createWorksheetFrom({ documentType: 'lqMock' });
    const marker = (language: LanguageMode) => {
      const row = renderWorksheet(w, mode(language)).cover!.instructions.find(
        (node) => node.kind === 'columns',
      );
      if (row?.kind !== 'columns') throw new Error('expected an instruction row');
      return row.cells[0].text;
    };
    expect(marker('bilingual')).toEqual({ en: [{ text: '(1)' }], zh: [] });
    expect(marker('en')).toEqual(bi('(1)', '(1)'));
    expect(marker('zh')).toEqual(bi('(1)', '(1)'));
  });
});

describe('editing wording that reads the same in both languages', () => {
  const same = bi('2026-27-ECON 2–', '2026-27-ECON 2–');
  const typed = { ...same, en: [{ text: '2027-28-ECON 2–' }] };

  it('writes both sides in bilingual mode, so the Chinese copy cannot resurface', () => {
    expect(mirrorBilingualEdit(same, typed, 'bilingual')).toEqual(
      bi('2027-28-ECON 2–', '2027-28-ECON 2–'),
    );
  });

  it('writes one side otherwise', () => {
    expect(mirrorBilingualEdit(same, typed, 'en')).toEqual(typed);
    const translated = bi('Page ', '頁 ');
    const edited = { ...translated, en: [{ text: 'Sheet ' }] };
    expect(mirrorBilingualEdit(translated, edited, 'bilingual')).toEqual(edited);
    // Empty is not "the same": typing a prefix must not invent the other language.
    const empty = { en: [], zh: [] };
    const first = { en: [{ text: 'Page ' }], zh: [] };
    expect(mirrorBilingualEdit(empty, first, 'bilingual')).toEqual(first);
  });
});
