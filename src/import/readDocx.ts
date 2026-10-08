/**
 * `.docx` file reader: the package (jszip) → the same raw lines the paste readers give,
 * but richer: real list numbers, text boxes, tables and pictures. Headers and footers are
 * read as page chrome (`docxChrome.ts`), and the masthead is taken off the top of the
 * lines; footnotes and comments are never read.
 */
import JSZip from 'jszip';
import { BodyReader, type PendingImage, type Rel } from './docxBody';
import { docxMasthead, readHeadersFooters, sectionsOf } from './docxChrome';
import { Numbering, Styles } from './docxNumbering';
import { tidyText } from './normalize';
import type { PageChrome } from './pageChrome';
import type { RawLine, RawRun } from './readPlain';
import type { ImageRef } from './types';
import { child, find, findAll, parseXml, textOf, type XmlElement } from './xml';

export type DocxErrorKind = 'unreadable' | 'encrypted' | 'notDocx';

/** Why a file could not be read; the UI words `kind`. */
export class DocxReadError extends Error {
  constructor(readonly kind: DocxErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'DocxReadError';
  }
}

export interface DocxOptions {
  /** The app's downsizer; null marks the picture lost. Default: the bytes as a data URL. */
  prepareImage?: (blob: Blob) => Promise<ImageRef | null>;
}

export interface DocxRead {
  lines: RawLine[];
  title?: string;
  /** Header, footer and masthead; the masthead's lines are no longer in `lines`. */
  chrome?: PageChrome;
}

const OFFICE_DOC = /\/officeDocument$/;
const MIME: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };

function startsWith(bytes: Uint8Array, sig: number[], at = 0): boolean {
  return sig.every((b, k) => bytes[at + k] === b);
}

/** An OLE compound file: a legacy `.doc`, or an encrypted OOXML package. */
function oleKind(bytes: Uint8Array): DocxErrorKind {
  // "EncryptionInfo" as UTF-16LE, the stream an encrypted package carries.
  const needle = [...'EncryptionInfo'].flatMap((ch) => [ch.charCodeAt(0), 0]);
  outer: for (let i = 0; i + needle.length <= Math.min(bytes.length, 1 << 20); i++) {
    for (let k = 0; k < needle.length; k++) if (bytes[i + k] !== needle[k]) continue outer;
    return 'encrypted';
  }
  return 'notDocx';
}

async function loadZip(bytes: Uint8Array): Promise<JSZip> {
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) throw new DocxReadError(oleKind(bytes));
  if (!startsWith(bytes, [0x50, 0x4b])) throw new DocxReadError('notDocx');
  try {
    return await JSZip.loadAsync(bytes);
  } catch {
    throw new DocxReadError('unreadable');
  }
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);

/** A relationship target against its source part's folder. */
function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = (base + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

function fileOf(zip: JSZip, path: string): JSZip.JSZipObject | null {
  return zip.file(path) ?? zip.file(new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'))[0] ?? null;
}

async function xmlPart(zip: JSZip, path: string): Promise<XmlElement | undefined> {
  const file = fileOf(zip, path);
  if (!file) return undefined;
  try {
    return parseXml(await file.async('string'));
  } catch {
    throw new DocxReadError('unreadable');
  }
}

async function relsOf(zip: JSZip, part: string): Promise<Map<string, Rel & { type: string }>> {
  const root = await xmlPart(zip, `${dirOf(part)}_rels/${part.slice(dirOf(part).length)}.rels`);
  const out = new Map<string, Rel & { type: string }>();
  for (const rel of root ? root.children : []) {
    if (typeof rel === 'string' || !rel.attrs.Id) continue;
    const external = rel.attrs.TargetMode === 'External';
    out.set(rel.attrs.Id, { target: external ? rel.attrs.Target : resolve(dirOf(part), rel.attrs.Target ?? ''), external, type: rel.attrs.Type ?? '' });
  }
  return out;
}

// ---- pictures ----

type Picture = { mime: string; width?: number; height?: number };

/** The format from the bytes, and the pixel size when the header gives it cheaply. */
export function sniffImage(b: Uint8Array): Picture | undefined {
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const i32le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return { mime: MIME.png, width: u32be(16), height: u32be(20) };
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return { mime: MIME.gif, width: u16le(6), height: u16le(8) };
  if (startsWith(b, [0x42, 0x4d])) return { mime: MIME.bmp, width: i32le(18), height: Math.abs(i32le(22)) };
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: MIME.webp };
  if (startsWith(b, [0xff, 0xd8])) {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) break;
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { mime: MIME.jpeg, height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
    return { mime: MIME.jpeg };
  }
  return undefined;
}

/** What a lost picture was, for the slot: EMF/WMF, TIFF, HD Photo… */
function lostKind(b: Uint8Array, path: string): string {
  if (startsWith(b, [0x01, 0x00, 0x00, 0x00]) && startsWith(b, [0x20, 0x45, 0x4d, 0x46], 40)) return 'emf';
  if (startsWith(b, [0xd7, 0xcd, 0xc6, 0x9a]) || startsWith(b, [0x01, 0x00, 0x09, 0x00])) return 'wmf';
  return /\.(\w+)$/.exec(path)?.[1]?.toLowerCase() ?? 'picture';
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function loadImages(zip: JSZip, pending: readonly PendingImage[], options: DocxOptions): Promise<void> {
  const cache = new Map<string, Promise<Partial<ImageRef> & { lost?: string }>>();
  const load = async (path: string): Promise<Partial<ImageRef> & { lost?: string }> => {
    const file = fileOf(zip, path);
    if (!file) return { lost: 'missing' };
    const bytes = await file.async('uint8array');
    const pic = sniffImage(bytes);
    if (!pic) return { lost: lostKind(bytes, path) };
    const natural = pic.width && pic.height ? { naturalWidthPx: pic.width, naturalHeightPx: pic.height } : {};
    if (!options.prepareImage) return { src: `data:${pic.mime};base64,${base64(bytes)}`, ...natural };
    const prepared = await options.prepareImage(new Blob([bytes as BlobPart], { type: pic.mime })).catch(() => null);
    if (!prepared?.src) return { lost: 'picture' };
    return { ...natural, ...prepared };
  };
  for (const { ref, rel } of pending) {
    if (!rel || rel.external) {
      ref.alt = rel?.external ? 'linked' : 'missing';
      continue;
    }
    const key = rel.target;
    const got = await (cache.get(key) ?? cache.set(key, load(key)).get(key)!);
    if (got.lost) {
      ref.alt = got.lost;
      continue;
    }
    ref.src = got.src!;
    if (got.naturalWidthPx && got.naturalHeightPx) {
      ref.naturalWidthPx = got.naturalWidthPx;
      ref.naturalHeightPx = got.naturalHeightPx;
    }
    if (!ref.widthPx && got.widthPx) ref.widthPx = got.widthPx;
    if (!ref.heightPx && got.heightPx) ref.heightPx = got.heightPx;
    if (!ref.widthPx && ref.naturalWidthPx) {
      ref.widthPx = ref.naturalWidthPx;
      ref.heightPx = ref.naturalHeightPx;
    }
  }
}

// ---- the package ----

export async function readDocxLines(data: ArrayBuffer | Uint8Array, options: DocxOptions = {}): Promise<DocxRead> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const zip = await loadZip(bytes);
  if (!fileOf(zip, '[Content_Types].xml')) throw new DocxReadError('notDocx');

  const packageRels = await relsOf(zip, '');
  const main = [...packageRels.values()].find((r) => OFFICE_DOC.test(r.type))?.target ?? 'word/document.xml';
  if (!/\.xml$/i.test(main) || !fileOf(zip, main)) throw new DocxReadError('notDocx');
  const doc = await xmlPart(zip, main);
  const body = doc && (child(doc, 'w:body') ?? find(doc, 'w:body'));
  if (!doc || doc.name !== 'w:document' || !body) throw new DocxReadError('notDocx');

  const rels = await relsOf(zip, main);
  const partOf = (suffix: string) => [...rels.values()].find((r) => r.type.endsWith(suffix) && !r.external)?.target;
  const styles = new Styles(await xmlPart(zip, partOf('/styles') ?? `${dirOf(main)}styles.xml`));
  const numbering = new Numbering(await xmlPart(zip, partOf('/numbering') ?? `${dirOf(main)}numbering.xml`), styles);

  const reader = new BodyReader({ styles, numbering, rels });
  const tidy = (runs: RawRun[]) => runs.map((r) => ({ ...r, text: tidyText(r.text) }));
  const lines = reader.read(body).map((l) => ({ ...l, runs: tidy(l.runs), ...(l.cells ? { cells: l.cells.map(tidy) } : {}) }));
  await loadImages(zip, reader.images, options);

  const title = await titleOf(zip, body, rels, reader.headings).catch(() => undefined);
  const chrome = await chromeOf(zip, body, rels, styles, lines).catch(() => undefined);
  const body1 = chrome ? lines.slice(chrome.taken) : lines;
  return { lines: body1, ...(title ? { title } : {}), ...(chrome?.chrome ? { chrome: chrome.chrome } : {}) };
}

/** Header, footer and masthead, and how many leading lines the masthead took. */
async function chromeOf(zip: JSZip, body: XmlElement, rels: Map<string, Rel & { type: string }>, styles: Styles, lines: RawLine[]): Promise<{ chrome?: PageChrome; taken: number }> {
  const settingsRel = [...rels.values()].find((r) => r.type.endsWith('/settings') && !r.external);
  const settings = settingsRel ? await xmlPart(zip, settingsRel.target).catch(() => undefined) : undefined;
  const evenAndOdd = !!settings && child(settings, 'w:evenAndOddHeaders') !== undefined && child(settings, 'w:evenAndOddHeaders')?.attrs['w:val'] !== '0';
  const edges = await readHeadersFooters(
    body,
    styles,
    async (id) => {
      const rel = rels.get(id);
      return rel && !rel.external ? xmlPart(zip, rel.target) : undefined;
    },
    evenAndOdd,
  );
  const sections = sectionsOf(body);
  const width = sections.reduce((best, s) => (s.size >= best.size ? s : best), sections[0]).width;
  const bodySize = styles.get(styles.defaultParagraph)?.run.size ?? styles.defaults.size;
  const masthead = docxMasthead(lines, width, bodySize);
  const chrome: PageChrome = {
    ...edges,
    ...(masthead.rows.length ? { masthead: masthead.rows } : {}),
    unsupported: [...edges.unsupported, ...masthead.found],
  };
  const any = chrome.header || chrome.footer || chrome.firstPageHeader || chrome.firstPageFooter || chrome.masthead || chrome.unsupported.length;
  return { taken: masthead.taken, ...(any ? { chrome } : {}) };
}

// ---- the title ----

const NOT_TITLE = /^(name|class|date|time|full marks|total marks|part|section|instructions?|answer|there (are|is)|page|姓名|班別|學號|日期|甲部|乙部|試題|考生)\b|_{3,}|\(\d+ marks?\)/i;
const EXAMISH = /exam|test|assessment|quiz|paper|worksheet|exercise|測驗|考試|試卷|工作紙|練習/i;

const usable = (text: string) => /[A-Za-z㐀-鿿]{2}/.test(text) && !NOT_TITLE.test(text.trim());

/** The core title; else a title-styled paragraph; else the running header; else a bold or centred line. */
async function titleOf(zip: JSZip, body: XmlElement, rels: Map<string, Rel & { type: string }>, headings: BodyReader['headings']): Promise<string | undefined> {
  const core = await xmlPart(zip, 'docProps/core.xml');
  const coreTitle = core && find(core, 'dc:title');
  const fromCore = coreTitle && textOf(coreTitle).trim();
  if (fromCore) return fromCore;
  const tidy = (t: string) => t.replace(/\s+/g, ' ').trim();
  const styled = headings.find((h) => h.strength === 2 && usable(h.text));
  if (styled) return tidy(styled.text);
  // The running header often carries the paper's name; only its title-like pieces count.
  const sect = child(body, 'w:sectPr');
  const refs = sect ? sect.children.filter((c): c is XmlElement => typeof c !== 'string' && c.name === 'w:headerReference') : [];
  const ids = [...refs.filter((r) => r.attrs['w:type'] === 'default'), ...refs].map((r) => r.attrs['r:id']);
  const headerRels = [...ids.map((id) => rels.get(id)), ...rels.values()].filter((r) => r && !r.external && r.type.endsWith('/header'));
  for (const rel of headerRels) {
    const header = await xmlPart(zip, rel!.target);
    const paragraphs = header ? findAll(header, 'w:p').slice(0, 3) : [];
    const pieces = paragraphs.flatMap((p) => textOfRuns(p).split(/\t+/)).map(tidy).filter(usable);
    if (pieces.length) return pieces.join(' ');
  }
  const plain = headings.filter((h) => usable(h.text));
  const pick = plain.find((h) => EXAMISH.test(h.text)) ?? plain[0];
  return pick && tidy(pick.text);
}

function textOfRuns(el: XmlElement): string {
  let out = '';
  for (const c of el.children) {
    if (typeof c === 'string') continue;
    if (c.name === 'w:t') out += textOf(c);
    else if (c.name === 'w:tab' || c.name === 'w:ptab') out += '\t';
    else if (c.name !== 'w:instrText' && c.name !== 'w:delText' && c.name !== 'w:pPr' && c.name !== 'w:rPr') out += textOfRuns(c);
  }
  return out;
}
