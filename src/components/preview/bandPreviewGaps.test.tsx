import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JSZip from 'jszip';
import { createBand, createTextField } from '@/model/bands';
import { bandsHeight, createPageNumberField } from '@/model/page';
import { createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { Band, BandField, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { exportDocxBuffer } from '@/export/docx';
import { BandEditor, SheetPageContext } from './BandEditor';
import { NodeView } from './Preview';

/**
 * The page agrees with the `.docx` on a band row: a title-block page number prints the
 * sheet's number, editing chrome leaves no text in print, and an enlarged row's line box
 * is the one Word draws.
 */
const noop = () => {};
const page = { number: 2, count: 3 };
const pageNumbers = () =>
  [
    createBand({ left: [createTextField(bi('A', ''))], right: [createPageNumberField('plain')] }),
    createBand({ left: [createTextField(bi('B', ''))], right: [createPageNumberField('pDot')] }),
    createBand({ left: [createTextField(bi('C', ''))], right: [createPageNumberField('longForm')] }),
  ];
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('a title-block page number on the page', () => {
  it('prints the sheet in the editor, as Word does, for every pattern', () => {
    const html = renderToStaticMarkup(
      <SheetPageContext.Provider value={page}>
        <BandEditor bands={pageNumbers()} kind="masthead" language="en" totalMarks={0}
          onMove={noop} onEditField={noop} onRemoveField={noop} onAddField={noop} />
      </SheetPageContext.Provider>,
    );
    expect(text(html)).toContain('P.2');
    expect(text(html)).toContain('Page 2 of 3');
    expect(text(html)).not.toMatch(/#|of N/);
  });

  it('prints the sheet on the read-only row too', () => {
    const worksheet = createWorksheet();
    worksheet.bands = pageNumbers();
    const rows = renderWorksheet(worksheet, { language: 'en', version: 'student' }).bands;
    const html = renderToStaticMarkup(
      <SheetPageContext.Provider value={page}>
        {rows.map((node, index) => <NodeView key={index} node={node} language="en" />)}
      </SheetPageContext.Provider>,
    );
    expect(text(html)).toMatch(/A[^]*2[^]*B[^]*P\.2[^]*C[^]*Page 2 of 3/);
    expect(text(html)).not.toContain('#');
  });

  it('keeps the placeholder where no sheet is known', () => {
    const worksheet = createWorksheet();
    worksheet.bands = pageNumbers();
    const rows = renderWorksheet(worksheet, { language: 'en', version: 'student' }).bands;
    expect(text(renderToStaticMarkup(<NodeView node={rows[0]} language="en" />))).toContain('#');
  });
});

/** The text left once every `data-print-hide` subtree is removed, as print CSS does. */
function printedText(html: string): string {
  const VOID = /^(br|img|input|hr|wbr)$/;
  const hidden: boolean[] = [];
  let out = '';
  for (const token of html.match(/<[^>]+>|[^<]+/g) ?? []) {
    const tag = /^<(\/?)([a-z0-9]+)/i.exec(token);
    if (!tag) {
      if (!hidden.some(Boolean)) out += token;
    } else if (tag[1]) hidden.pop();
    else if (!VOID.test(tag[2]) && !token.endsWith('/>')) hidden.push(token.includes('data-print-hide'));
  }
  return out;
}

describe('band editing chrome in print', () => {
  it('leaves no "+" or "✕" in the printed text of an engaged band', () => {
    const bands: Band[] = [
      createBand({ left: [createTextField(bi('Only left', ''))] }),
      createBand({ center: [createPageNumberField('pDot')] }),
    ];
    const html = renderToStaticMarkup(
      <SheetPageContext.Provider value={page}>
        <BandEditor bands={bands} kind="header" language="en" totalMarks={0} label="Header"
          onMove={noop} onEditField={noop} onRemoveField={noop} onAddField={noop} onRemoveRow={noop} onAddRow={noop} />
      </SheetPageContext.Provider>,
    );
    expect(text(html)).toMatch(/[+✕]/);
    expect(printedText(html)).not.toMatch(/[+✕]/);
    expect(printedText(html)).toContain('Only left');
    expect(printedText(html)).toContain('P.2');
  });
});

describe('an enlarged band row (.docx)', () => {
  const big: BandField = { ...createTextField(bi('SCHOOL NAME', '')), format: { bold: true, fontSize: 14 } };
  const docx = async (worksheet: Worksheet, part: string) =>
    (await JSZip.loadAsync(await exportDocxBuffer(worksheet, { language: 'en', version: 'student' })))
      .file(part)!
      .async('string');
  const paragraph = (xml: string, marker: string) => xml.split('</w:p>').find((p) => p.includes(marker))!;

  it('gives a header row the line its largest field needs, as the page draws it', async () => {
    const worksheet = createWorksheet();
    worksheet.header = { enabled: true, rule: false, bands: [createBand({ center: [big] }), createBand({ center: [createTextField(bi('Plain row', ''))] })] };
    const xml = await docx(worksheet, 'word/header1.xml');
    expect(paragraph(xml, 'SCHOOL NAME')).toContain('<w:spacing w:line="305" w:lineRule="exact"/>');
    expect(paragraph(xml, 'Plain row')).not.toContain('w:spacing');
  });

  it('does the same for a title-block row', async () => {
    const worksheet = createWorksheet();
    worksheet.bands = [createBand({ center: [big] }), createBand({ left: [createTextField(bi('Plain row', ''))] })];
    const xml = await docx(worksheet, 'word/document.xml');
    expect(paragraph(xml, 'SCHOOL NAME')).toContain('w:line="305" w:lineRule="exact"');
    expect(paragraph(xml, 'Plain row')).not.toContain('w:spacing');
  });

  it('estimates a small field at the full 12pt line, which it never shrinks below', () => {
    const small = createBand({ left: [{ ...createTextField(bi('9pt', '')), format: { fontSize: 9 } }] });
    expect(bandsHeight([small])).toBe(bandsHeight([createBand()]));
  });
});
