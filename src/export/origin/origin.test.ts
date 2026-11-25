import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import pkg from '../../../package.json';
import { exportAnswerKeyDocxBuffer, exportDocxBuffer } from '@/export/docx';
import { buildXlsxZip } from '@/export/csv/xlsx';
import { makePdf } from '@/import/fixtures/pdfWriter';
import { pdfjsLib } from '@/import/pdfjs';
import { createWorksheet } from '@/model/factories';
import { isOriginId, newOriginId, withOriginId } from '@/model/origin';
import { rt } from '@/model/text';
import { APP_NAME, exportOrigin, ORIGIN_KEYS, pdfStamp, type ExportOrigin } from './index';
import { ooxmlAppVersion } from './docxProps';
import { PdfStampError, pdfDate, pdfString, stampPdf } from './pdf';

const ID = '0b6f3c1e-5d4a-4c2b-9e8f-7a6b5c4d3e2f';
const ORIGIN: ExportOrigin = { app: APP_NAME, version: '0.10.0', exportedAt: '2026-11-25T09:30:00Z', docId: ID };

describe('origin id', () => {
  it('is a random UUID v4, different each time', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newOriginId()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(isOriginId(id)).toBe(true);
  });

  it('is kept when present and minted when absent or malformed', () => {
    const doc = createWorksheet();
    expect(doc.originId).toBeUndefined();
    const given = withOriginId(doc);
    expect(isOriginId(given.originId)).toBe(true);
    expect(withOriginId(given)).toBe(given);
    expect(isOriginId(withOriginId({ ...doc, originId: 'not-a-uuid' }).originId)).toBe(true);
  });

  it('is the only document-derived value in an origin', () => {
    const origin = exportOrigin({ originId: ID }, new Date('2026-11-25T09:30:00.123Z'));
    expect(origin).toEqual({ app: 'Econ Studio', version: pkg.version, exportedAt: '2026-11-25T09:30:00Z', docId: ID });
    expect(exportOrigin({ originId: 'garbage' }, '2026-11-25T09:30:00Z').docId).toBeUndefined();
  });
});

async function parts(bytes: Uint8Array): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(bytes);
  const out: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) {
    if (!zip.files[name].dir && /\.(xml|rels)$/.test(name)) out[name] = await zip.files[name].async('string');
  }
  return out;
}

describe('.docx origin', () => {
  const doc = { ...createWorksheet(), originId: ID, title: { en: rt('Demand and supply'), zh: rt('') } };

  it('carries app, version, date and id in its document properties', async () => {
    const files = await parts(await exportDocxBuffer(doc, { language: 'en', version: 'student' }));
    const custom = files['docProps/custom.xml'];
    expect(custom).toContain(`name="${ORIGIN_KEYS.docId}"><vt:lpwstr>${ID}</vt:lpwstr>`);
    expect(custom).toContain(`name="${ORIGIN_KEYS.app}"><vt:lpwstr>Econ Studio</vt:lpwstr>`);
    expect(custom).toContain(`name="${ORIGIN_KEYS.version}"><vt:lpwstr>${pkg.version}</vt:lpwstr>`);
    expect(custom).toMatch(new RegExp(`name="${ORIGIN_KEYS.exportedAt}"><vt:filetime>\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ<`));
    expect(files['docProps/app.xml']).toContain('<Application>Econ Studio</Application>');
    expect(files['docProps/app.xml']).toContain(`<AppVersion>${ooxmlAppVersion(pkg.version)}</AppVersion>`);
    expect(files['[Content_Types].xml']).toContain(
      '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>',
    );
    expect(files['_rels/.rels']).toContain('relationships/custom-properties" Target="docProps/custom.xml"');
  });

  it('puts nothing in the page: no id, app name or version in any word/ part', async () => {
    for (const bytes of [
      await exportDocxBuffer(doc, { language: 'en', version: 'teacher' }),
      await exportAnswerKeyDocxBuffer(doc, 'en'),
    ]) {
      const files = await parts(bytes);
      const wordParts = Object.entries(files).filter(([name]) => name.startsWith('word/'));
      expect(wordParts.length).toBeGreaterThan(3);
      for (const [, xml] of wordParts) {
        expect(xml).not.toContain(ID);
        expect(xml).not.toContain('DSEcon');
        expect(xml).not.toContain('Econ Studio');
      }
    }
  });

  it('the answer key carries the same id; a document without one carries no id', async () => {
    const key = await parts(await exportAnswerKeyDocxBuffer(doc, 'en'));
    expect(key['docProps/custom.xml']).toContain(ID);
    const bare = await parts(await exportDocxBuffer(createWorksheet(), { language: 'en', version: 'student' }));
    expect(bare['docProps/custom.xml']).toContain(ORIGIN_KEYS.app);
    expect(bare['docProps/custom.xml']).not.toContain(ORIGIN_KEYS.docId);
  });

  it('writes AppVersion in the XX.YYYY form the schema asks for', () => {
    expect(ooxmlAppVersion('0.10.0')).toBe('00.1000');
    expect(ooxmlAppVersion('1.2.3')).toBe('01.0203');
    expect(ooxmlAppVersion('dev')).toBeUndefined();
  });
});

describe('.xlsx origin', () => {
  it('adds core, app and custom properties beside the sheet', async () => {
    const files = await parts(await buildXlsxZip([['Q1', 'A']], 'Sheet1', ORIGIN).generateAsync({ type: 'uint8array' }));
    expect(files['docProps/custom.xml']).toContain(ID);
    expect(files['docProps/app.xml']).toContain('<AppVersion>00.1000</AppVersion>');
    expect(files['[Content_Types].xml']).toContain('/docProps/custom.xml');
    expect(files['_rels/.rels']).toContain('docProps/core.xml');
    expect(files['xl/worksheets/sheet1.xml']).not.toContain(ID);
  });

  it('without an origin is the package it always was', async () => {
    const files = await parts(await buildXlsxZip([['Q1', 'A']]).generateAsync({ type: 'uint8array' }));
    expect(Object.keys(files).some((name) => name.startsWith('docProps/'))).toBe(false);
  });
});

/** The classic-table fixture rebuilt to end in a cross-reference stream (PDF 1.5). */
function withXrefStream(classic: Uint8Array): Uint8Array {
  const text = new TextDecoder('latin1').decode(classic);
  const body = text.slice(0, text.lastIndexOf('xref\n'));
  const offsets = [...body.matchAll(/(?:^|\n)(\d+) 0 obj/g)].map((match) => ({
    num: Number(match[1]),
    at: match.index + (match[0].startsWith('\n') ? 1 : 0),
  }));
  const size = offsets.length + 2;
  const xrefNum = offsets.length + 1;
  const start = body.length;
  const rows: number[] = [0, 0, 0, 0, 0, 0xff, 0xff];
  for (const { at } of offsets) rows.push(1, (at >>> 24) & 255, (at >>> 16) & 255, (at >>> 8) & 255, at & 255, 0, 0);
  rows.push(1, (start >>> 24) & 255, (start >>> 16) & 255, (start >>> 8) & 255, start & 255, 0, 0);
  const head = `${xrefNum} 0 obj\n<< /Type /XRef /Size ${size} /W [1 4 2] /Root 1 0 R /Length ${rows.length} >>\nstream\n`;
  const tail = `\nendstream\nendobj\nstartxref\n${start}\n%%EOF\n`;
  const latin = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const out = [latin(body.replace('%PDF-1.4', '%PDF-1.5')), latin(head), Uint8Array.from(rows), latin(tail)];
  const bytes = new Uint8Array(out.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of out) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

async function readBack(bytes: Uint8Array) {
  const task = pdfjsLib().getDocument({ data: bytes.slice() });
  const document = await task.promise;
  try {
    const { info, metadata } = await document.getMetadata();
    const pages: string[] = [];
    for (let n = 1; n <= document.numPages; n += 1) {
      const content = await (await document.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    const fields = info as Record<string, unknown> & { Custom?: Map<string, unknown> | Record<string, unknown> };
    // pdf.js 6 hands the non-standard keys over as a Map.
    const custom = fields.Custom instanceof Map ? Object.fromEntries(fields.Custom) : (fields.Custom ?? {});
    const read: Record<string, unknown> & { Custom: Record<string, unknown> } = { ...fields, Custom: custom };
    return { info: read, xmp: metadata?.getRaw() ?? '', pages };
  } finally {
    await task.destroy();
  }
}

describe('PDF origin', () => {
  const page = { texts: [{ text: 'Question 1 Demand and supply', x: 60, y: 760 }] };
  const fixtures = {
    'a classic xref table': makePdf([page, page], { title: 'Untitled' }),
    'a cross-reference stream': withXrefStream(makePdf([page])),
  };

  for (const [label, original] of Object.entries(fixtures)) {
    it(`stamps a PDF with ${label}: Info, custom keys and XMP, page text unchanged`, async () => {
      const before = await readBack(original);
      const stamped = stampPdf(original, ORIGIN, '需求與供應 Demand');
      // An incremental update: the engine's bytes are the file's first bytes, untouched.
      expect(stamped.subarray(0, original.length)).toEqual(original);
      const after = await readBack(stamped);
      expect(after.pages).toEqual(before.pages);
      expect(after.info.Producer).toBe('Econ Studio 0.10.0');
      expect(after.info.Creator).toBe('Econ Studio 0.10.0');
      expect(after.info.Title).toBe('需求與供應 Demand');
      expect(after.info.Custom).toMatchObject({
        DSEconApp: 'Econ Studio',
        DSEconVersion: '0.10.0',
        DSEconExported: '2026-11-25T09:30:00Z',
        DSEconDocId: ID,
      });
      expect(after.xmp).toContain(`<dsecon:DSEconDocId>${ID}</dsecon:DSEconDocId>`);
      expect(after.xmp).toContain(`<xmpMM:DocumentID>uuid:${ID}</xmpMM:DocumentID>`);
      expect(after.xmp).toContain('<pdf:Producer>Econ Studio 0.10.0</pdf:Producer>');
      for (const text of after.pages) {
        expect(text).not.toContain(ID);
        expect(text).not.toContain('Econ Studio');
      }
    });
  }

  it('stamps again over its own update (the last one wins)', async () => {
    const once = stampPdf(fixtures['a classic xref table'], ORIGIN);
    const other = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
    const twice = stampPdf(once, { ...ORIGIN, docId: other });
    const { info, xmp } = await readBack(twice);
    expect(info.Custom?.DSEconDocId).toBe(other);
    expect(xmp).toContain(other);
    expect(xmp).not.toContain(ID);
  });

  it('leaves an encrypted or unreadable file alone (throws, the caller keeps it)', () => {
    expect(() => stampPdf(makePdf([page], { encrypted: true }), ORIGIN)).toThrow(PdfStampError);
    expect(() => stampPdf(new TextEncoder().encode('hello'), ORIGIN)).toThrow(PdfStampError);
  });

  it('writes PDF strings and dates readers accept', () => {
    expect(pdfString('a(b)\\c')).toBe('(a\\(b\\)\\\\c)');
    expect(pdfString('需')).toBe('<FEFF9700>');
    expect(pdfDate('2026-11-25T09:30:00Z')).toBe('D:20261125093000Z');
  });

  it('takes the title in the print language, the other side when empty', () => {
    const doc = { originId: ID, title: { en: rt('Elasticity'), zh: rt('彈性') } };
    expect(pdfStamp(doc, 'zh').title).toBe('彈性');
    expect(pdfStamp({ ...doc, title: { en: rt('Elasticity'), zh: rt('') } }, 'zh').title).toBe('Elasticity');
    expect(pdfStamp(doc, 'en').origin.docId).toBe(ID);
  });
});
