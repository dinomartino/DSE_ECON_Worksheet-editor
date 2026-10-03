import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeaderFooterBand } from '@/components/preview/Preview';
import { createBand, createTextField } from '@/model/bands';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { defaultHeader, headerFooterOf } from '@/model/page';
import { bi } from '@/model/text';
import type { HeaderFooter, Worksheet } from '@/model/types';
import { buildDocxParts } from './index';

/**
 * On a paper with a cover, "page 1" is the body's first sheet, as Word has it: the cover
 * is its own section, and `w:titlePg` applies to the first page of the section that
 * carries it, which is the body's.
 */

const running = createBand({ right: [createTextField(bi('RUNNING', ''))] });
const own = createBand({ left: [createTextField(bi('PAGE ONE', ''))] });
const covered = (header: HeaderFooter): Worksheet => ({
  ...createWorksheetFrom({ documentType: 'lqMock', title: 'Covered' }),
  header,
});
const header = (extra: Partial<HeaderFooter>): HeaderFooter => ({
  enabled: true,
  rule: true,
  showOnFirstPage: true,
  bands: [running],
  ...extra,
});
const text = (html: string) => html.replace(/<[^>]+>/g, '');

/** A body sheet as `Preview` draws it on a covered paper: numbered after the cover. */
const sheet = (worksheet: Worksheet, pageIndex: number) =>
  renderToStaticMarkup(
    <HeaderFooterBand
      value={headerFooterOf(worksheet.header, defaultHeader)}
      language="en"
      edge="header"
      pageNumber={pageIndex + 2}
      firstOfSection={pageIndex === 0}
      pageCount={4}
      totalMarks={10}
    />,
  );

describe('page 1 header on a paper with a cover', () => {
  it('puts the page-1 part on the body section, never on the cover', () => {
    const parts = buildDocxParts(covered(header({ firstPage: { bands: [own] } })), {
      language: 'en',
      version: 'student',
    });
    const [coverSection, bodySection] = parts.documentXml.match(/<w:sectPr>.*?<\/w:sectPr>/g)!;
    expect(coverSection).not.toContain('w:headerReference');
    expect(coverSection).not.toContain('w:titlePg');
    expect(bodySection).toContain('<w:titlePg/>');
    expect(parts.headerFooter.headerFirst).toContain('PAGE ONE');
  });

  it('prints "Its own" rows on the first body sheet in the preview, as Word does', () => {
    const ws = covered(header({ firstPage: { bands: [own] } }));
    expect(text(sheet(ws, 0))).toBe('PAGE ONE');
    expect(text(sheet(ws, 1))).toBe('RUNNING');
  });

  it('prints nothing, and no rule, on the first body sheet for "Nothing"', () => {
    const ws = covered(header({ showOnFirstPage: false }));
    const first = sheet(ws, 0);
    expect(text(first)).toBe('');
    expect(first).not.toContain('border-b');
    expect(text(sheet(ws, 1))).toBe('RUNNING');
    // Word: an empty first part, so no border either.
    const parts = buildDocxParts(ws, { language: 'en', version: 'student' });
    expect(parts.headerFooter.headerFirst).not.toContain('w:pBdr');
  });
});
