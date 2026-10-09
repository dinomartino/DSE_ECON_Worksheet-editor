import { describe, expect, it } from 'vitest';
import { createBand, createTextField } from '@/model/bands';
import { createWorksheet } from '@/model/factories';
import { contentWidth, pageSetupOf, twipsToPt } from '@/model/page';
import { bi } from '@/model/text';
import type { BandField, BandZones, OutputMode, Worksheet } from '@/model/types';
import { worksheetClipboardHtml, worksheetPlainText } from './clipboard';

/**
 * Band rows paste as the `.docx` writes them (§ Bands and zones): one paragraph with tab
 * stops, never a table. Rows reduce to `[stops]text⇥text`, as in `docx/bandTabs.test.ts`.
 */
const EN: OutputMode = { language: 'en', version: 'student' };
const t = (text: string) => createTextField(bi(text, ''));
const pageNumber = (pattern: 'plain' | 'pDot' | 'longForm') =>
  ({ kind: 'pageNumber', id: `pn-${pattern}`, pattern }) as BandField;

const withBands = (...rows: Array<Partial<Record<keyof BandZones, BandField[]>>>): Worksheet => {
  const worksheet = createWorksheet();
  worksheet.bands = rows.map((zones) =>
    createBand({ left: zones.left ?? [], center: zones.center ?? [], right: zones.right ?? [] }),
  );
  return worksheet;
};

/** Each band paragraph as `[center][right]⇥text`, the field codes as `{PAGE}`. */
function rows(html: string): string[] {
  return [...html.matchAll(/<p data-band style="([^"]*)">(.*?)<\/p>/g)].map(
    ([, style, body]) =>
      (/tab-stops:([^;]*);/.exec(style)?.[1] ?? '').replace(/(center|right) [\d.]+pt ?/g, '[$1]') +
      body
        .replace(/<span style='mso-tab-count:1'>.*?<\/span>/g, '⇥')
        .replace(/<span style='mso-field-code:" (\w+) "'>1<\/span>/g, '{$1}')
        .replace(/<[^>]+>/g, ''),
  );
}

describe('band rows on the clipboard', () => {
  it('writes the masthead as tab-stop paragraphs, with no table', () => {
    const html = worksheetClipboardHtml(
      withBands(
        { left: [t('L')], right: [t('R')] },
        { left: [t('L')], center: [t('C')], right: [t('R')] },
        { center: [t('Title')] },
        { right: [t('Right only')] },
        { left: [t('Two'), t('fields')], right: [t('R1'), t('R2')] },
      ),
      EN,
    );
    expect(html).not.toContain('<table');
    expect(rows(html)).toEqual(
      expect.arrayContaining([
        '[right]L⇥R',
        '[center][right]L⇥C⇥R',
        '[center]⇥Title',
        '[right]⇥Right only',
        '[right]Two fields⇥R1 R2',
      ]),
    );
  });

  it('places the stops where the .docx does: mid column and right edge', () => {
    const worksheet = withBands({ left: [t('L')], center: [t('C')], right: [t('R')] });
    const width = contentWidth(pageSetupOf(worksheet));
    expect(worksheetClipboardHtml(worksheet, EN)).toContain(
      `tab-stops:center ${twipsToPt(Math.round(width / 2))}pt right ${twipsToPt(width)}pt;`,
    );
  });

  it('pastes a page number as a Word field showing 1, never "#"', () => {
    const html = worksheetClipboardHtml(
      withBands(
        { left: [t('A')], right: [pageNumber('plain')] },
        { left: [t('B')], right: [pageNumber('pDot')] },
        { left: [t('C')], right: [pageNumber('longForm')] },
      ),
      EN,
    );
    expect(html.replace(/&#9;/g, '')).not.toContain('#');
    expect(rows(html)).toEqual(
      expect.arrayContaining(['[right]A⇥{PAGE}', '[right]B⇥P.{PAGE}', '[right]C⇥Page {PAGE} of {NUMPAGES}']),
    );
  });

  it('writes plain text with the same tabs and the page shown as 1', () => {
    const text = worksheetPlainText(
      withBands(
        { center: [t('Title')] },
        { left: [t('Two'), t('fields')], right: [pageNumber('pDot')] },
      ),
      EN,
    );
    expect(text).toContain('\tTitle');
    expect(text).toContain('Two fields\tP.1');
    expect(text).not.toContain('#');
  });
});
