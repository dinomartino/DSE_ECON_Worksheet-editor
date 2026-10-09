import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createBand, createTextField } from '@/model/bands';
import { createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { BandField, LanguageMode, Worksheet } from '@/model/types';
import { exportDocxBuffer } from './index';

/**
 * A page number in the masthead (the body's title rows) is a live Word field, as in the
 * header: its IR text holds the raw placeholders, and printing those wrote "#".
 */
const pageNumber = (pattern: 'plain' | 'pDot' | 'longForm', extra: Partial<BandField> = {}) =>
  ({ kind: 'pageNumber', id: `pn-${pattern}`, pattern, ...extra }) as BandField;

async function documentXml(worksheet: Worksheet, language: LanguageMode = 'en'): Promise<string> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, { language, version: 'student' }));
  return zip.file('word/document.xml')!.async('string');
}

/** The row's text with each field reduced to `{PAGE}`, the way Word shows codes. */
const line = (xml: string, marker: string) => {
  const paragraph = xml.split('</w:p>').find((p) => p.includes(marker))!;
  return paragraph
    .replace(/<w:instrText[^>]*> (\w+) <\/w:instrText>/g, '{$1}')
    .replace(/<w:fldChar w:fldCharType="separate"\/><\/w:r><w:r>(<w:rPr>.*?<\/w:rPr>)?<w:t>1<\/w:t>/g, '')
    .replace(/<w:tab\/>/g, '⇥')
    .replace(/<[^>]+>/g, '')
    .trim();
};

describe('a page number in the masthead (.docx)', () => {
  const masthead = (...fields: BandField[]) => {
    const worksheet = createWorksheet();
    worksheet.bands = [createBand({ left: [createTextField(bi('Mock exam', ''))], right: fields })];
    return worksheet;
  };

  it('exports each pattern as PAGE / NUMPAGES fields, never a literal "#"', async () => {
    for (const [pattern, expected] of [
      ['plain', 'Mock exam⇥{PAGE}'],
      ['pDot', 'Mock exam⇥P.{PAGE}'],
      ['longForm', 'Mock exam⇥Page {PAGE} of {NUMPAGES}'],
    ] as const) {
      const xml = await documentXml(masthead(pageNumber(pattern)));
      expect(xml).toContain('<w:fldChar w:fldCharType="begin"/>');
      expect(xml).not.toContain('>#<');
      expect(line(xml, 'Mock exam')).toBe(expected);
    }
  });

  it('keeps authored wording and the field formatting around the number', async () => {
    const xml = await documentXml(
      masthead(pageNumber('pDot', { prefix: bi('Sheet ', ''), format: { fontSize: 9, bold: true } })),
    );
    expect(line(xml, 'Mock exam')).toBe('Mock exam⇥Sheet P.{PAGE}');
    // The field's runs carry the field's size and weight, as the header's do.
    expect(xml).toContain(
      '<w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/>',
    );
  });

  it('prints a bare number once in bilingual mode', async () => {
    const xml = await documentXml(masthead(pageNumber('plain')), 'bilingual');
    expect(xml.match(/ PAGE /g)).toHaveLength(1);
  });

  it('leaves a masthead without a page number unchanged', async () => {
    const xml = await documentXml(masthead(createTextField(bi('Name:', ''))));
    expect(xml).not.toContain('fldChar');
  });
});
