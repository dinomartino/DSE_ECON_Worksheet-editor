import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import { migrate } from '@/model/migrations';
import { createCoverPage } from '@/model/cover';
import type { OutputMode, Watermark, Worksheet } from '@/model/types';
import { WATERMARK_FIRST_PAGE } from '@/model/watermark';
import { buildPageFlowPaper } from '@/test/pageFlowFixture';
import { buildDocxParts, exportDocxBuffer } from './index';
import { pageStartId } from './pageBreaks';
import { withLeadingRun } from './watermark';

const PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const MODE: OutputMode = { language: 'en', version: 'student' };
const mark = (patch: Partial<Watermark> = {}): Watermark => ({ on: true, src: PIXEL_PNG, widthPx: 400, heightPx: 200, ...patch });
const anchors = (xml: string) => xml.match(/name="Watermark \d+"\/><wp:cNvGraphicFramePr>/g) ?? [];

describe('anchoring the picture in a paragraph', () => {
  const RUN = '<w:r>PIC</w:r>';
  it('goes after the paragraph properties of the first paragraph', () => {
    expect(withLeadingRun('<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>a</w:t></w:r></w:p>', RUN)).toBe(
      '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>PIC</w:r><w:r><w:t>a</w:t></w:r></w:p>',
    );
    expect(withLeadingRun('<w:p w:rsidR="1"><w:r/></w:p><w:p/>', RUN)).toBe('<w:p w:rsidR="1"><w:r>PIC</w:r><w:r/></w:p><w:p/>');
    expect(withLeadingRun('<w:p><w:pPr/><w:r/></w:p>', RUN)).toBe('<w:p><w:pPr/><w:r>PIC</w:r><w:r/></w:p>');
    expect(withLeadingRun('<w:p/>', RUN)).toBe('<w:p><w:r>PIC</w:r></w:p>');
  });

  it('finds the first paragraph inside a table, and none in XML without one', () => {
    const table = '<w:tbl><w:tblPr/><w:tr><w:tc><w:p><w:pPr><w:pBdr/></w:pPr></w:p></w:tc></w:tr></w:tbl>';
    expect(withLeadingRun(table, RUN)).toBe(
      '<w:tbl><w:tblPr/><w:tr><w:tc><w:p><w:pPr><w:pBdr/></w:pPr><w:r>PIC</w:r></w:p></w:tc></w:tr></w:tbl>',
    );
    expect(withLeadingRun('<w:sectPr/>', RUN)).toBeUndefined();
  });
});

describe('the .docx', () => {
  const paper = buildPageFlowPaper();
  const [q1, q2, q3] = paper.questions.map((question) => question.id);

  it('an untouched paper, and one whose watermark is switched off, write the same parts', () => {
    const plain = buildDocxParts(paper, MODE);
    const off = buildDocxParts({ ...paper, watermark: mark({ on: false }) }, MODE);
    expect(off.documentXml).toBe(plain.documentXml);
    expect(off.headerFooter).toEqual(plain.headerFooter);
    expect(off.assets).toEqual(plain.assets);
    expect(plain.documentXml).not.toContain('Watermark');
  });

  it('every page: one picture behind the text in the running header, with its own relationships', async () => {
    const worksheet: Worksheet = { ...paper, watermark: mark({ opacity: 0.25 }) };
    const parts = buildDocxParts(worksheet, MODE);
    expect(anchors(parts.documentXml)).toHaveLength(0);
    const header = parts.headerFooter.header!;
    expect(anchors(header)).toHaveLength(1);
    expect(header).toContain('behindDoc="1"');
    expect(header).toContain('<wp:positionH relativeFrom="page">');
    expect(header).toContain('<a:alphaModFix amt="25000"/>');
    expect(parts.assets).toHaveLength(1);

    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, MODE));
    const rels = await zip.file('word/_rels/header1.xml.rels')!.async('string');
    const relId = /r:embed="([^"]+)"/.exec(header)![1];
    expect(rels).toContain(`Id="${relId}"`);
    expect(rels).toContain('Target="media/image1.png"');
    expect(zip.file('word/media/image1.png')).toBeTruthy();
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('Extension="png"');
  });

  it('a picture with its strength drawn in (the browser export) gets no transparency on top', () => {
    const baked = PIXEL_PNG.replace('e6kg', 'e6kh');
    expect(baked).not.toBe(PIXEL_PNG);
    const parts = buildDocxParts({ ...paper, watermark: mark({ opacity: 0.25 }) }, MODE, new Map(), [], [], baked);
    expect(parts.headerFooter.header).not.toContain('alphaModFix');
    expect(parts.assets).toHaveLength(1);
    expect(anchors(parts.headerFooter.header!)).toHaveLength(1);
  });

  it('a page turned off: the picture is anchored at each other sheet’s head, not in the header', () => {
    const worksheet: Worksheet = { ...paper, watermark: mark({ pages: { [q2]: false } }) };
    const heads = [
      { key: 'masthead', node: 0 },
      { key: q3, node: 0 },
    ];
    const parts = buildDocxParts(worksheet, MODE, new Map(), [], heads);
    expect(parts.headerFooter.header ?? '').not.toContain('Watermark');
    expect(anchors(parts.documentXml)).toHaveLength(2);
    // The second rides in q3's first paragraph: after it, before anything of q3's text.
    const atQ3 = parts.documentXml.indexOf('Watermark', parts.documentXml.indexOf('Watermark') + 1);
    expect(atQ3).toBeGreaterThan(0);
    const ids = [...parts.documentXml.matchAll(/<wp:docPr id="(\d+)" name="Watermark/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pageStartId(q1, 0)).toBe(`${q1}:0`);
  });

  it('a page turned on while the paper is off', () => {
    const worksheet: Worksheet = { ...paper, watermark: mark({ on: false, pages: { [WATERMARK_FIRST_PAGE]: true } }) };
    const parts = buildDocxParts(worksheet, MODE, new Map(), [], [{ key: 'masthead', node: 0 }]);
    expect(anchors(parts.documentXml)).toHaveLength(1);
    expect(parts.headerFooter.header ?? '').not.toContain('Watermark');
  });

  it('the cover carries its own picture, or not', () => {
    const cover = createCoverPage({ paperStyle: 'mcq', now: new Date(2026, 8, 1) });
    const covered: Worksheet = { ...paper, cover, watermark: mark() };
    const on = buildDocxParts(covered, MODE);
    const coverEnd = on.documentXml.indexOf('<w:type w:val="nextPage"/>');
    expect(coverEnd).toBeGreaterThan(0);
    expect(anchors(on.documentXml.slice(0, coverEnd))).toHaveLength(1);
    expect(anchors(on.headerFooter.header!)).toHaveLength(1);

    const off = buildDocxParts({ ...covered, watermark: mark({ cover: false }) }, MODE);
    expect(anchors(off.documentXml)).toHaveLength(0);
    expect(anchors(off.headerFooter.header!)).toHaveLength(1);
  });

  it('the frozen v1 corpus exports no watermark', async () => {
    const worksheet = migrate(structuredClone(v1Corpus));
    const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, MODE));
    expect(await zip.file('word/document.xml')!.async('string')).not.toContain('Watermark');
    expect(Object.keys(zip.files).filter((name) => /header\d\.xml\.rels$/.test(name))).toEqual([]);
  });
});
