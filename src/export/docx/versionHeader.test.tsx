import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeaderFooterBand } from '@/components/preview/Preview';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { createTextField } from '@/model/bands';
import { defaultHeader, headerFooterOf } from '@/model/page';
import { newId } from '@/model/factories';
import { bi } from '@/model/text';
import { versionHeaderText } from '@/model/versions';
import type { HeaderFooter, OutputMode, Worksheet } from '@/model/types';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { buildDocxParts } from './index';

/** The running header names the paper version on every page, not only atop page 1. */

const versioned = (header?: HeaderFooter): Worksheet => ({
  ...bare(),
  versions: { count: 3, seed: 7 },
  ...(header ? { header } : {}),
});
const mode = (variant?: string, language: OutputMode['language'] = 'en'): OutputMode => ({
  language,
  version: 'student',
  ...(variant ? { variant } : {}),
});
const ownHeader = (extra: Partial<HeaderFooter> = {}): HeaderFooter => ({
  enabled: true,
  rule: true,
  showOnFirstPage: true,
  bands: [{ id: newId(), zones: { left: [createTextField(bi('S5 Economics', '中五經濟'))], center: [], right: [] } }],
  ...extra,
});
const plainText = (xml = '') => xml.replace(/<[^>]+>/g, '').trim();
/** The acceptance fixture without its own header. */
const bare = (): Worksheet => ({ ...buildAcceptanceWorksheet(), header: undefined });

describe('the version in the running header', () => {
  it('reads Version B in the chosen language, and nothing when versions are off', () => {
    const worksheet = versioned();
    expect(versionHeaderText(worksheet, mode('B'))).toBe('Version B');
    expect(versionHeaderText(worksheet, mode('C', 'zh'))).toBe('版本 C');
    expect(versionHeaderText(worksheet, mode(undefined, 'bilingual'))).toBe('Version A 版本 A');
    expect(versionHeaderText(buildAcceptanceWorksheet(), mode('B'))).toBeUndefined();
  });

  it('is the whole header when the document has none, on page 1 too', () => {
    const parts = buildDocxParts(versioned(), mode('B'));
    expect(plainText(parts.headerFooter.header)).toBe('Version B');
    expect(parts.headerFooter.header).not.toContain('w:pBdr');
    expect(parts.headerFooter.headerFirst).toBeUndefined();
  });

  it('follows the running rows of a header the document has', () => {
    const parts = buildDocxParts(versioned(ownHeader()), mode('C'));
    expect(plainText(parts.headerFooter.header)).toBe('S5 EconomicsVersion C');
    // A page 1 with its own rows keeps them; the body's "Version C" line names page 1.
    const own = ownHeader({ firstPage: { bands: ownHeader().bands } });
    const first = buildDocxParts(versioned(own), mode('C'));
    expect(plainText(first.headerFooter.header)).toBe('S5 EconomicsVersion C');
    expect(plainText(first.headerFooter.headerFirst)).toBe('S5 Economics');
  });

  it('drops the body label when page 1’s header names the version; Copy for Word keeps it', () => {
    const body = (ws: Worksheet) => plainText(buildDocxParts(ws, mode('B')).documentXml);
    expect(body(versioned())).not.toContain('Version B');
    expect(body(versioned(ownHeader()))).not.toContain('Version B');
    expect(body(versioned(ownHeader({ showOnFirstPage: false })))).toContain('Version B');
    expect(worksheetClipboardHtml(versioned(), mode('B'))).toContain('Version B');
  });

  it('leaves an unversioned document exactly as it was', () => {
    const plain = bare();
    const before = buildDocxParts(plain, mode());
    expect(before.headerFooter.header).toBeUndefined();
    const withHeader = buildDocxParts({ ...plain, header: ownHeader() }, mode());
    expect(plainText(withHeader.headerFooter.header)).toBe('S5 Economics');
  });

  it('previews where the .docx prints it', () => {
    const band = (value: HeaderFooter, pageNumber: number, versionRow?: string) =>
      renderToStaticMarkup(
        <HeaderFooterBand
          value={headerFooterOf(value, defaultHeader)}
          language="en"
          edge="header"
          pageNumber={pageNumber}
          pageCount={3}
          totalMarks={10}
          versionRow={versionRow}
        />,
      );
    // No header of its own: the row alone, every page, no rule.
    for (const page of [1, 2]) {
      const alone = band(defaultHeader(), page, 'Version B');
      expect(alone).toContain('Version B');
      expect(alone).not.toContain('border-b');
    }
    expect(band(defaultHeader(), 2)).toBe('');
    // Its own rows: the version follows them, but not onto a page 1 of its own.
    expect(band(ownHeader(), 2, 'Version B')).toMatch(/S5 Economics.*Version B/);
    const own = ownHeader({ firstPage: { bands: ownHeader().bands } });
    expect(band(own, 1, 'Version B')).not.toContain('Version B');
    expect(band(own, 2, 'Version B')).toContain('Version B');
  });
});
