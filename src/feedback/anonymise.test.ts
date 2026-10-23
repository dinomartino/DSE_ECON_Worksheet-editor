import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import v2Corpus from '@/test/corpus/v2-published.json';
import { exportDocxBuffer } from '@/export/docx';
import { createDiagramBlock, createImageBlock, createStructuredQuestion, createTableBlock } from '@/model/factories';
import { migrate } from '@/model/migrations';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { bi } from '@/model/text';
import { collectTexts } from '@/model/textWalk';
import type { OutputMode, RichText, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { parseWorksheet, stringifyWorksheet } from '@/storage/document';
import { sha256 } from '@/sync/hash';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import { buildTranslateFixture } from '@/test/translateFixture';
import {
  anonymiseWorksheet,
  COMMON_CHINESE,
  cryptoRandom,
  dataUrlBytes,
  DROPPED_KEYS,
  IMAGE_KEY,
  imagePixelSize,
  KEPT_KEYS,
  noisePng,
  reportName,
  SCRAMBLED_KEYS,
  scrambleText,
  seededRandom,
  TIMESTAMP_KEYS,
} from './anonymise';
import { GITHUB_FILE_LIMIT, makeAnonymisedCopy, saveAnonymisedCopy } from './anonymisedCopy';

/**
 * The anonymised copy for a bug report (k-0180): nothing the teacher wrote or inserted
 * survives, and everything that lays the page out does. Seeded, so every run is the same;
 * the real copy draws from the CSPRNG (`cryptoRandom`).
 */

const NOW = new Date(2026, 9, 23, 9, 30);

const pngUrl = (width: number, height: number, bytes = width * height) =>
  `data:image/png;base64,${Buffer.from(noisePng(width, height, bytes, seededRandom(width * 7 + height))).toString('base64')}`;

/** A JPEG's first bytes: SOI, an APP0, a baseline SOF0 of 640 × 480, then filler. */
function jpegUrl(): string {
  const bytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array.from('JFIF\0', (c) => c.charCodeAt(0)), 1, 1, 0, 0, 1, 0, 1, 0, 0];
  bytes.push(0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  for (let i = 0; i < 40_000; i += 1) bytes.push((i * 31) & 0xff);
  bytes.push(0xff, 0xd9);
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Every picture slot: a photo block, a JPEG, a picture in a table cell, a forum's illustration. */
function pictureDocument(): Worksheet {
  const worksheet = createWorksheetFrom({ documentType: 'classroom', title: 'Pictures of Kowloon' });
  const photo = createImageBlock(pngUrl(300, 200, 20_000), 300, 200);
  const jpeg = { ...createImageBlock(jpegUrl(), 320, 240), naturalWidthPx: 640, naturalHeightPx: 480 };
  const table = createTableBlock(2, 2);
  table.rows[0].cells[0] = {
    ...table.rows[0].cells[0],
    text: bi('Harbour photograph', '海港相片'),
    image: { src: pngUrl(120, 90), widthPx: 120, heightPx: 90, altText: bi('Victoria Harbour', '維多利亞港') },
  };
  const forum = createDiagramBlock('forum');
  forum.diagram = {
    ...forum.diagram,
    forum: { ...forum.diagram.forum!, image: { src: pngUrl(64, 48), naturalWidthPx: 64, naturalHeightPx: 48 } },
  };
  const question = createStructuredQuestion();
  question.blocks = [photo, jpeg, table, forum];
  return { ...worksheet, questions: [...worksheet.questions, question], flow: [], classes: ['5A', '5B'], satOn: '2026-10-01' };
}

const DOCUMENTS: Array<[string, () => Worksheet]> = [
  ['v1 published corpus', () => migrate(structuredClone(v1Corpus))],
  ['v2 published corpus', () => migrate(structuredClone(v2Corpus))],
  ['acceptance fixture', buildAcceptanceWorksheet],
  ['mark scheme fixture', buildMarkSchemeWorksheet],
  ['kitchen sink', buildTranslateFixture],
  ['LQ mock', () => createWorksheetFrom({ documentType: 'lqMock', title: 'Mock', coverDetails: { school: "St. Mary's College", examName: 'MOCK' } })],
  ['pictures', pictureDocument],
  // Hand-testing document: invented school, teacher names, email, phone and address.
  ['mixed hand-testing document', () => parseWorksheet(readFileSync('test-fixtures/manual/mixed-for-anonymiser.json', 'utf8'))],
];

const anonymise = (worksheet: Worksheet, seed = 7) => anonymiseWorksheet(worksheet, { random: seededRandom(seed), now: NOW });

const plain = (runs: RichText) => runs.map((run) => run.text).join('');

/** Every string in a document with the key it stands under (an array's items under its key). */
function strings(value: unknown, key = '', out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof value === 'string') out.push([key, value]);
  else if (Array.isArray(value)) value.forEach((item) => strings(item, key, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, k, out);
  return out;
}

/** The pictures' `data:` URLs, in document order. */
const pictures = (worksheet: Worksheet) => strings(worksheet).filter(([key]) => key === IMAGE_KEY).map(([, src]) => src);

/**
 * The document with its content taken out: every scrambled string replaced by its length,
 * every picture by its pixel size, the copy's own metadata set aside. Original and copy
 * must come out identical.
 */
function shape(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    if (key === IMAGE_KEY) return imagePixelSize(dataUrlBytes(value) ?? new Uint8Array()) ?? 'unreadable';
    if (TIMESTAMP_KEYS.has(key)) return 'time';
    if (KEPT_KEYS.has(key)) return value;
    return Array.from(value).length;
  }
  if (Array.isArray(value)) return value.map((item) => shape(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !(key === '' && (k === 'id' || k === 'name' || DROPPED_KEYS.has(k))))
        .map(([k, v]) => [k, shape(v, k)]),
    );
  }
  return value;
}

/**
 * The same, for a rendered page (`RenderNode[]`): text by length, everything else as is.
 * A node's `key` is a cache key spelled from its content, not layout.
 */
function nodeShape(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    return key === 'text' ? Array.from(value).length : key === 'src' ? 'picture' : key === 'key' ? 'key' : value;
  }
  if (Array.isArray(value)) return value.map((item) => nodeShape(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, nodeShape(v, k)]));
  return value;
}

const decode = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]!);

/** `word/document.xml` with each text replaced by its length and picture ids blanked. */
async function docxShape(worksheet: Worksheet, mode: OutputMode): Promise<string> {
  const zip = await JSZip.loadAsync(await exportDocxBuffer(worksheet, mode));
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml
    .replace(/(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/g, (_, open: string, text: string, close: string) => `${open}${Array.from(decode(text)).length}${close}`)
    .replace(/r:embed="[^"]*"/g, 'r:embed=""')
    .replace(/ (?:name|descr|title)="[^"]*"/g, '');
}

describe('scrambleText', () => {
  const random = seededRandom(1);

  it('keeps the length, the kind of every character, and every space and mark', () => {
    const text = 'Price rose 12.5%, Q₁ → Q₂;\t需求上升（見圖一）。\nGDP: ＄３０ ＡＢ';
    for (let i = 0; i < 20; i += 1) {
      const out = scrambleText(text, random);
      const a = Array.from(text);
      const b = Array.from(out);
      expect(b).toHaveLength(a.length);
      a.forEach((char, at) => {
        const other = b[at];
        if (/[a-z]/.test(char)) expect(other).toMatch(/[a-z]/);
        else if (/[A-Z]/.test(char)) expect(other).toMatch(/[A-Z]/);
        else if (/[0-9]/.test(char)) expect(other).toMatch(/[0-9]/);
        else if (/[０-９]/.test(char)) expect(other).toMatch(/[０-９]/);
        else if (/[₀-₉]/.test(char)) expect(other).toMatch(/[₀-₉]/);
        else if (/[Ａ-Ｚ]/.test(char)) expect(other).toMatch(/[Ａ-Ｚ]/);
        else if (/\p{Script=Han}/u.test(char)) expect(COMMON_CHINESE).toContain(other);
        else expect(other).toBe(char);
      });
    }
  });

  it('replaces a letter with one of the same width class, so lines wrap where they did', () => {
    const narrow = 'fijlrt';
    const wide = 'mw';
    for (let i = 0; i < 50; i += 1) {
      expect(narrow).toContain(scrambleText('i', random));
      expect(wide).toContain(scrambleText('m', random));
    }
  });

  it('keeps list markers and typed numbering, scrambles what follows them', () => {
    const text = '(1) Demand rises\n(ii) Supply falls\n（２）價格\nA. Rent control\n3. Explain (a) the effect';
    const out = scrambleText(text, random);
    for (const marker of ['(1) ', '\n(ii) ', '\n（２）', '\nA. ', '\n3. ', '(a)']) expect(out).toContain(marker);
    for (const word of ['Demand', 'Supply', '價格', 'Rent', 'Explain', 'effect']) expect(out).not.toContain(word);
  });

  it('never leaves a word or number where it stood, even by chance', () => {
    for (let i = 0; i < 500; i += 1) {
      for (const word of ['a', 'I', 'mw', 'it', 'of', '7', '42', '市']) expect(scrambleText(word, random)).not.toBe(word);
    }
  });

  it('is random each time: the same words never scramble the same way twice', () => {
    const text = 'Market failure and externalities in Hong Kong';
    const live = cryptoRandom();
    expect(new Set(Array.from({ length: 5 }, () => scrambleText(text, live))).size).toBe(5);
  });
});

describe('noise pictures', () => {
  it('reads a pixel size from PNG, GIF, JPEG and WebP headers', () => {
    expect(imagePixelSize(dataUrlBytes(pngUrl(300, 200))!)).toEqual({ width: 300, height: 200 });
    expect(imagePixelSize(dataUrlBytes(jpegUrl())!)).toEqual({ width: 640, height: 480 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x2c, 0x01, 0xc8, 0x00]);
    expect(imagePixelSize(gif)).toEqual({ width: 300, height: 200 });
    const webp = new Uint8Array(30);
    webp.set(Array.from('RIFF', (c) => c.charCodeAt(0)));
    webp.set(Array.from('WEBPVP8X', (c) => c.charCodeAt(0)), 8);
    webp.set([0x2b, 0x01, 0x00, 0xc7, 0x00, 0x00], 24);
    expect(imagePixelSize(webp)).toEqual({ width: 300, height: 200 });
    expect(imagePixelSize(new TextEncoder().encode('<svg/>'))).toBeUndefined();
  });

  it('writes a valid PNG of the exact size, near the byte size asked for', () => {
    for (const [width, height, target] of [
      [300, 200, 20_000],
      [301, 7, 50],
      [1000, 800, 900_000],
      [1, 1, 1],
    ]) {
      const png = noisePng(width, height, target, seededRandom(3));
      expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(imagePixelSize(png)).toEqual({ width, height });
      // The pixel data inflates to exactly one filtered row per line.
      const view = new DataView(png.buffer, png.byteOffset);
      const idatLength = view.getUint32(33);
      const raw = inflateSync(png.subarray(41, 41 + idatLength));
      const bits = png[24] * (png[25] === 2 ? 3 : 1);
      expect(raw.length).toBe(height * (1 + Math.ceil((width * bits) / 8)));
      if (target > 10_000) expect(png.length / target).toBeGreaterThan(0.4);
      if (target > 10_000) expect(png.length / target).toBeLessThan(2.5);
    }
  });
});

describe('anonymiseWorksheet', () => {
  it.each(DOCUMENTS)('the %s: every printed text has a counterpart of the same length, and no word stayed where it was', (_, build) => {
    const original = build();
    const copy = anonymise(original);
    const before = collectTexts(original);
    const after = collectTexts(copy);
    expect(after.map((slot) => slot.path)).toEqual(before.map((slot) => slot.path));
    before.forEach((slot, index) => {
      for (const side of ['en', 'zh'] as const) {
        const a = plain(slot.text[side]);
        const b = plain(after[index].text[side]);
        expect(Array.from(b)).toHaveLength(Array.from(a).length);
        for (const match of a.matchAll(/[A-Za-z]+|[0-9]{2,}|\p{Script=Han}/gu)) {
          const at = Array.from(a.slice(0, match.index)).length;
          const there = Array.from(b).slice(at, at + Array.from(match[0]).length).join('');
          if (/^\((?:[0-9]{1,2}|[ivxlc]{1,5}|[a-zA-Z])\)$/i.test(a.slice(match.index - 1, match.index + match[0].length + 1))) continue;
          expect(there, `${slot.path}: "${match[0]}"`).not.toBe(match[0]);
        }
      }
    });
  });

  it.each(DOCUMENTS)('the %s: no word, name or picture of the original is anywhere in the file', (_, build) => {
    const original = build();
    const file = stringifyWorksheet(anonymise(original));
    // What a person wrote: every string but ids, enums, colours, fonts, pictures and times.
    const written = (worksheet: unknown) =>
      strings(worksheet).filter(([key]) => !KEPT_KEYS.has(key) && key !== IMAGE_KEY && !TIMESTAMP_KEYS.has(key));
    const wording = written(original);
    const copied = written(JSON.parse(file)).map(([, text]) => text).join('\n');
    expect(wording.length).toBeGreaterThan(0);
    // Long words and whole texts: shorter ones turn up in random text by chance, and are
    // checked where they stood above.
    const words = new Set(wording.flatMap(([, text]) => text.match(/[A-Za-z]{6,}|\p{Script=Han}{3,}/gu) ?? []));
    for (const word of words) expect(copied, word).not.toContain(word);
    for (const [, text] of wording) if (/[\p{L}\p{N}]{3}/u.test(text) && text.length >= 12) expect(copied).not.toContain(text);
    // Pictures: no original bytes, by hash and by content.
    const hashes = new Set(pictures(parseWorksheet(file)).map((src) => sha256(src)));
    for (const src of pictures(original)) {
      expect(hashes.has(sha256(src))).toBe(false);
      expect(file).not.toContain(src.slice(src.indexOf(',') + 1, src.indexOf(',') + 81));
    }
  });

  it.each(DOCUMENTS)('the %s: the same document underneath — structure, formatting, lengths, picture sizes', (_, build) => {
    const original = build();
    expect(shape(anonymise(original))).toEqual(shape(original));
  });

  it.each(DOCUMENTS)('the %s: renders the same pages in every mode, text by length', (_, build) => {
    const original = build();
    const copy = parseWorksheet(stringifyWorksheet(anonymise(original)));
    for (const mode of [
      { language: 'en', version: 'student' },
      { language: 'zh', version: 'teacher' },
      { language: 'bilingual', version: 'teacher' },
    ] as OutputMode[]) {
      expect(nodeShape(renderWorksheet(copy, mode))).toEqual(nodeShape(renderWorksheet(original, mode)));
    }
  });

  it.each(DOCUMENTS)('the %s: exports the same .docx, text by length, page breaks included', async (_, build) => {
    const original = build();
    const copy = parseWorksheet(stringifyWorksheet(anonymise(original)));
    for (const mode of [
      { language: 'en', version: 'teacher' },
      { language: 'bilingual', version: 'student' },
    ] as OutputMode[]) {
      const [a, b] = await Promise.all([docxShape(original, mode), docxShape(copy, mode)]);
      expect(b.match(/w:type="page"/g)?.length ?? 0).toBe(a.match(/w:type="page"/g)?.length ?? 0);
      expect(b).toBe(a);
    }
  });

  it('replaces each picture with noise of the same pixel size, about as heavy', () => {
    const original = pictureDocument();
    const before = pictures(original);
    const after = pictures(anonymise(original));
    expect(after).toHaveLength(before.length);
    expect(before.length).toBe(4);
    before.forEach((src, index) => {
      const a = dataUrlBytes(src)!;
      const b = dataUrlBytes(after[index])!;
      expect(after[index]).toMatch(/^data:image\/png;base64,/);
      expect(imagePixelSize(b)).toEqual(imagePixelSize(a));
      if (a.length > 10_000) expect(b.length / a.length).toBeGreaterThan(0.4);
      if (a.length > 10_000) expect(b.length / a.length).toBeLessThan(2.5);
    });
  });

  it('a picture it cannot read is still replaced, at the size the block states', () => {
    const worksheet = pictureDocument();
    const question = worksheet.questions.at(-1)!;
    const block = { ...createImageBlock('data:image/svg+xml;utf8,<svg>Secret school logo</svg>', 150, 50) };
    const copy = anonymise({ ...worksheet, questions: [{ ...question, blocks: [block] }] });
    const src = pictures(copy)[0];
    expect(src).not.toContain('Secret');
    expect(imagePixelSize(dataUrlBytes(src)!)).toEqual({ width: 150, height: 50 });
  });

  it("names the file report-<date>, gives it a new id and the copy's own time, and drops the classes", () => {
    const original = { ...pictureDocument(), name: 'Mock 2026 — Mr Chan, 5D' };
    const copy = anonymise(original);
    expect(copy.name).toBe('report-2026-10-23');
    expect(reportName(NOW)).toBe('report-2026-10-23');
    expect(copy.id).not.toBe(original.id);
    expect(copy.id).toMatch(/^report-/);
    expect(copy.createdAt).toBe(NOW.toISOString());
    expect(copy.updatedAt).toBe(NOW.toISOString());
    expect(copy.classes).toBeUndefined();
    expect(copy.satOn).toBeUndefined();
    expect(copy.fonts).toEqual(original.fonts);
    expect(plain(copy.title.en)).not.toBe(plain(original.title.en));
  });

  it('keeps syllabus topic codes and a 題型 topic, scrambles free tags and 題型 names', () => {
    const question = { ...createStructuredQuestion(), tags: ['C.ped', 'C.ped::Calculate PED from a table', 'mock 2026 Mr Chan'] };
    const copy = anonymise({ ...pictureDocument(), questions: [question] });
    const [code, pattern, free] = copy.questions[0].tags!;
    expect(code).toBe('C.ped');
    expect(pattern.startsWith('C.ped::')).toBe(true);
    expect(pattern).not.toContain('Calculate');
    expect(free).not.toContain('Chan');
    expect(free).toHaveLength('mock 2026 Mr Chan'.length);
  });

  it('the hand-testing document: its invented school, names, email, phone and address are gone', () => {
    const original = parseWorksheet(readFileSync('test-fixtures/manual/mixed-for-anonymiser.json', 'utf8'));
    const file = stringifyWorksheet(anonymise(original));
    const personal = ['wong.sm@example.org', '2345 6789', 'Wong Siu Ming', 'Sample Secondary School', 'Example Road', 'Kowloon', '黃小明', '樣本中學'];
    for (const found of personal) expect(JSON.stringify(original)).toContain(found);
    for (const found of personal) expect(file).not.toContain(found);
  });

  it("a newer build's unknown fields are scrambled too, never passed through as written", () => {
    const original = { ...pictureDocument(), __unknown: { teacherNote: 'Ask Mr Chan about Q3', kind: 'note' } };
    const copy = anonymise(original);
    expect(JSON.stringify(copy)).not.toContain('Chan');
    expect((copy.__unknown as Record<string, string>).kind).toBe('note');
  });

  it('a text whose two sides read the same still does (bilingual prints it once)', () => {
    const worksheet = pictureDocument();
    worksheet.title = { en: [{ text: '2025-26 ' }, { text: 'ECON', bold: true }], zh: [{ text: '2025-26 ECON' }] };
    const copy = anonymise(worksheet);
    expect(plain(copy.title.zh)).toBe(plain(copy.title.en));
    expect(plain(copy.title.en)).not.toBe('2025-26 ECON');
  });

  it('never changes the original', () => {
    const original = pictureDocument();
    const before = JSON.stringify(original);
    anonymise(original);
    expect(JSON.stringify(original)).toBe(before);
  });

  it('is random each time: two copies of one document differ', () => {
    const original = buildAcceptanceWorksheet();
    const a = anonymiseWorksheet(original, { now: NOW });
    const b = anonymiseWorksheet(original, { now: NOW });
    expect(stringifyWorksheet(a)).not.toBe(stringifyWorksheet(b));
  });
});

describe('the preview is the file', () => {
  it('previews the document parsed from the very text Save writes; no second scramble', async () => {
    const copy = makeAnonymisedCopy(buildTranslateFixture(), { random: seededRandom(5), now: NOW });
    expect(copy.fileName).toBe('report-2026-10-23.worksheet.json');
    expect(copy.bytes).toBe(new TextEncoder().encode(copy.text).length);
    expect(copy.bytes).toBeLessThan(GITHUB_FILE_LIMIT);
    // What the preview renders is what reopening the saved file gives.
    expect(copy.worksheet).toEqual(parseWorksheet(copy.text));
    expect(stringifyWorksheet(copy.worksheet)).toBe(copy.text);
    const mode: OutputMode = { language: 'bilingual', version: 'teacher' };
    expect(renderWorksheet(copy.worksheet, mode)).toEqual(renderWorksheet(parseWorksheet(copy.text), mode));

    const writes: Array<{ data: string; name: string }> = [];
    const saved = await saveAnonymisedCopy(copy, async (data, name) => {
      writes.push({ data, name });
      return { name };
    });
    expect(saved).toEqual({ name: copy.fileName });
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toBe(copy.text);
    // Saving twice writes the same bytes: the copy is made once.
    await saveAnonymisedCopy(copy, async (data) => {
      writes.push({ data, name: '' });
      return {};
    });
    expect(writes[1].data).toBe(writes[0].data);
  });

  it('a cancelled save sheet writes nothing and reports nothing', async () => {
    const copy = makeAnonymisedCopy(buildAcceptanceWorksheet(), { random: seededRandom(5), now: NOW });
    expect(await saveAnonymisedCopy(copy, async () => undefined)).toBeUndefined();
  });
});

/**
 * Every string field the model's types declare is classified: kept (an id, an enum, a
 * colour or font name), scrambled, a timestamp, a picture or dropped. An enum the walk
 * does not keep would scramble into a value no build reads; a new free-text field the walk
 * does not know is scrambled already, but must be looked at here. Reads `types.ts` with
 * the TypeScript compiler, so the list cannot fall behind the model.
 */
describe('the census of string fields', () => {
  const declared = (() => {
    const file = fileURLToPath(new URL('../model/types.ts', import.meta.url));
    const program = ts.createProgram([file], { strict: true, noEmit: true, skipLibCheck: true, noResolve: false });
    const checker = program.getTypeChecker();
    let worksheet: ts.Type | undefined;
    ts.forEachChild(program.getSourceFile(file)!, (node) => {
      if (ts.isInterfaceDeclaration(node) && node.name.text === 'Worksheet') worksheet = checker.getTypeAtLocation(node);
    });
    const found = new Map<string, Set<'literal' | 'free'>>();
    const seen = new Set<ts.Type>();
    const elements = (type: ts.Type): ts.Type[] =>
      type.isUnion()
        ? type.types.flatMap(elements)
        : checker.isArrayType(type) || checker.isTupleType(type)
          ? checker.getTypeArguments(type as ts.TypeReference).flatMap(elements)
          : [type];
    const visit = (type: ts.Type) => {
      if (seen.has(type)) return;
      seen.add(type);
      for (const part of elements(type)) {
        if (part !== type) visit(part);
        if (!(part.flags & ts.TypeFlags.Object)) continue;
        for (const property of checker.getPropertiesOfType(part)) {
          const propertyType = checker.getTypeOfSymbol(property);
          for (const leaf of elements(propertyType)) {
            if (leaf.flags & ts.TypeFlags.StringLiteral) found.set(property.name, (found.get(property.name) ?? new Set()).add('literal'));
            else if (leaf.flags & ts.TypeFlags.String) found.set(property.name, (found.get(property.name) ?? new Set()).add('free'));
          }
          visit(propertyType);
        }
        for (const index of checker.getIndexInfosOfType(part)) visit(index.type);
      }
    };
    visit(worksheet!);
    return found;
  })();

  it('finds the fields it must (the walk reached the whole model)', () => {
    for (const key of ['text', 'src', 'tags', 'kind', 'align', 'latin', 'templateId', 'createdAt', 'classes']) {
      expect(declared.has(key), key).toBe(true);
    }
  });

  it('keeps every enum, so the copy prints the same options', () => {
    const scrambledEnums = [...declared].filter(([key, kinds]) => kinds.has('literal') && !KEPT_KEYS.has(key));
    expect(scrambledEnums.map(([key]) => key)).toEqual([]);
  });

  it('classifies every free-text field', () => {
    const classified = new Set([...KEPT_KEYS, ...SCRAMBLED_KEYS, ...TIMESTAMP_KEYS, ...DROPPED_KEYS, IMAGE_KEY]);
    const unknown = [...declared.keys()].filter((key) => !classified.has(key));
    expect(unknown, 'add each to a list in anonymise.ts (scrambled is the safe choice)').toEqual([]);
  });

  it('keeps no free-text field it has not reviewed', () => {
    const keptFree = [...declared].filter(([key, kinds]) => kinds.has('free') && KEPT_KEYS.has(key)).map(([key]) => key);
    // Ids and references to ids, colours as hex, font names, a diagram template's id.
    expect(keptFree.sort()).toEqual(
      ['color', 'cross', 'curve', 'eastAsia', 'follows', 'from', 'fromDocId', 'id', 'latin', 'of', 'on', 'point', 'rootId', 'templateId', 'to'].sort(),
    );
  });
});
