import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeaderFooterBand } from '@/components/preview/Preview';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { createTextField } from '@/model/bands';
import { defaultHeader, headerFooterOf } from '@/model/page';
import { newId } from '@/model/factories';
import { bi } from '@/model/text';
import { teacherMarkPlacement } from '@/model/headerMarks';
import { versionHeaderText } from '@/model/versions';
import type { Band, HeaderFooter, OutputMode, Worksheet } from '@/model/types';
import { buildDocxParts } from './index';

/** The Teacher version names itself in the running header, in Word and on the page alike. */

const TEACHER: OutputMode = { language: 'en', version: 'teacher' };
const MARK = 'Teacher Version / 教師版';
const row = (left: string, right = ''): Band => ({
  id: newId(),
  zones: {
    left: left ? [createTextField(bi(left, ''))] : [],
    center: [],
    right: right ? [createTextField(bi(right, ''))] : [],
  },
});
const header = (extra: Partial<HeaderFooter> = {}): HeaderFooter => ({
  enabled: true,
  rule: true,
  showOnFirstPage: true,
  bands: [row('S5 Economics')],
  ...extra,
});
const sheet = (h?: HeaderFooter, versions = false): Worksheet => ({
  ...buildAcceptanceWorksheet(),
  header: h,
  ...(versions ? { versions: { count: 2, seed: 7 } } : {}),
});
const plainText = (xml = '') => xml.replace(/<[^>]+>/g, '').trim();
const htmlText = (html: string) => html.replace(/<[^>]+>/g, '');

function preview(worksheet: Worksheet, pageNumber: number, mode: OutputMode = TEACHER) {
  return renderToStaticMarkup(
    <HeaderFooterBand
      value={headerFooterOf(worksheet.header, defaultHeader)}
      language={mode.language}
      edge="header"
      pageNumber={pageNumber}
      pageCount={3}
      totalMarks={10}
      versionRow={versionHeaderText(worksheet, mode)}
      teacherMark={mode.version === 'teacher'}
    />,
  );
}

describe('the Teacher version marker in the running header', () => {
  it('joins the rightmost printing zone of the last row', () => {
    const ws = sheet(header({ bands: [row('Top'), row('S5 Economics', 'Quiz 3')] }));
    expect(teacherMarkPlacement(ws.header!, { totalMarks: 10 }, 'en')).toMatchObject({ zone: 'right', alone: false });
    const parts = buildDocxParts(ws, TEACHER);
    expect(plainText(parts.headerFooter.header)).toBe(`TopS5 EconomicsQuiz 3  —  ${MARK}`);
    expect(htmlText(preview(ws, 2))).toBe(`TopS5 EconomicsQuiz 3  —  ${MARK}`);
  });

  it('stands alone, with no rule and none of a disabled header’s rows', () => {
    for (const h of [undefined, header({ enabled: false }), header({ bands: [] })]) {
      const parts = buildDocxParts(sheet(h), TEACHER);
      expect(plainText(parts.headerFooter.header)).toBe(MARK);
      expect(parts.headerFooter.header).not.toContain('w:pBdr');
      const page = preview(sheet(h), 2);
      expect(htmlText(page)).toBe(MARK);
      expect(page).not.toContain('border-b');
    }
  });

  it('follows the first-page mode as Word does: on page 1 only when it prints the running rows', () => {
    const cases: Array<[HeaderFooter, boolean]> = [
      [header(), true],
      [header({ showOnFirstPage: false }), false],
      [header({ firstPage: { bands: [row('Name: ____')] } }), false],
    ];
    for (const [h, onPageOne] of cases) {
      const parts = buildDocxParts(sheet(h), TEACHER);
      const wordFirst = parts.headerFooter.headerFirst ?? parts.headerFooter.header;
      expect(plainText(wordFirst).includes(MARK)).toBe(onPageOne);
      expect(htmlText(preview(sheet(h), 1)).includes(MARK)).toBe(onPageOne);
      expect(htmlText(preview(sheet(h), 2))).toContain(MARK);
    }
  });

  it('sits above the version row, on every page when the header is otherwise empty', () => {
    const ws = sheet(undefined, true);
    const mode: OutputMode = { ...TEACHER, variant: 'B' };
    const parts = buildDocxParts(ws, mode);
    expect(plainText(parts.headerFooter.header)).toBe(`${MARK}Version B`);
    expect(parts.headerFooter.headerFirst).toBeUndefined();
    for (const page of [1, 2]) expect(htmlText(preview(ws, page, mode))).toBe(`${MARK}Version B`);
  });

  it('prints no blank lines for empty header rows, as the page draws none', () => {
    const paragraphs = (xml = '') => xml.match(/<w:p>/g)?.length ?? 0;
    // Three empty rows: Word printed two blank lines above the marker.
    const blank = sheet(header({ bands: [row(''), row(''), row('')] }));
    const parts = buildDocxParts(blank, TEACHER);
    expect(plainText(parts.headerFooter.header)).toBe(MARK);
    expect(paragraphs(parts.headerFooter.header)).toBe(1);
    expect(htmlText(preview(blank, 2))).toBe(MARK);

    // Empty rows under authored text: one line, with the rule under it.
    const mixed = sheet(header({ bands: [row('S5 Economics'), row(''), row('')] }));
    for (const mode of [TEACHER, { language: 'en', version: 'student' } as OutputMode]) {
      const xml = buildDocxParts(mixed, mode).headerFooter.header;
      expect(paragraphs(xml)).toBe(mode.version === 'teacher' ? 2 : 1);
      expect(xml).toContain('w:pBdr');
    }
  });

  it('leaves the student copy alone', () => {
    const student: OutputMode = { language: 'en', version: 'student' };
    expect(buildDocxParts(sheet(undefined), student).headerFooter.header).toBeUndefined();
    expect(htmlText(preview(sheet(header()), 2, student))).toBe('S5 Economics');
  });
});
