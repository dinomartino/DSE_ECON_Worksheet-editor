import { ORIGIN_KEYS, type ExportOrigin } from './index';

/**
 * The origin (k-0558) written into a PDF the engine already made (the desktop's native
 * print, `platform.savePdf`): a new document Info dictionary (Producer, Creator, dates,
 * the `DSEcon…` keys) and an XMP metadata stream on the catalog, added as an **incremental
 * update** — appended after `%%EOF`, the engine's bytes left exactly as they were. Nothing
 * is added to any page or content stream, so the page's text (copy, search, screen
 * readers) is unchanged.
 *
 * Both cross-reference forms are handled: a classic `xref` table (WebKit's Quartz output,
 * Chromium's Skia output) gets a classic section, an xref stream gets an xref stream. A
 * file this cannot read safely (encrypted, no trailer) throws `PdfStampError`, and the
 * caller keeps the file unstamped.
 */

export class PdfStampError extends Error {}

const latin1 = (bytes: Uint8Array): string => {
  let text = '';
  // Chunked: `String.fromCharCode(...bytes)` overflows the stack on a large file.
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return text;
};

const ascii = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff;
  return bytes;
};

/** The dictionary starting at `start` (its `<<`), through its matching `>>`. */
export function dictionaryAt(text: string, start: number): string | undefined {
  if (text.slice(start, start + 2) !== '<<') return undefined;
  let depth = 0;
  for (let at = start; at < text.length; at += 1) {
    const char = text[at];
    if (char === '(') {
      // A literal string: balanced parentheses, backslash escapes.
      let nest = 1;
      for (at += 1; at < text.length && nest > 0; at += 1) {
        if (text[at] === '\\') at += 1;
        else if (text[at] === '(') nest += 1;
        else if (text[at] === ')') nest -= 1;
      }
      at -= 1;
    } else if (char === '%') {
      while (at < text.length && text[at] !== '\n' && text[at] !== '\r') at += 1;
    } else if (char === '<' && text[at + 1] === '<') {
      depth += 1;
      at += 1;
    } else if (char === '>' && text[at + 1] === '>') {
      depth -= 1;
      at += 1;
      if (depth === 0) return text.slice(start, at + 1);
    } else if (char === '<') {
      // A hex string.
      const end = text.indexOf('>', at);
      if (end < 0) return undefined;
      at = end;
    }
  }
  return undefined;
}

interface Trailer {
  /** Byte offset of the last cross-reference section (`startxref`). */
  prev: number;
  stream: boolean;
  size: number;
  root: { num: number; gen: number };
  id?: string;
}

function readTrailer(text: string): Trailer {
  const marker = text.lastIndexOf('startxref');
  if (marker < 0) throw new PdfStampError('No startxref');
  const prevMatch = /^startxref\s+(\d+)/.exec(text.slice(marker, marker + 40));
  if (!prevMatch) throw new PdfStampError('Unreadable startxref');
  const prev = Number(prevMatch[1]);
  let dict: string | undefined;
  let stream = false;
  if (text.startsWith('xref', prev)) {
    const at = text.indexOf('trailer', prev);
    if (at < 0) throw new PdfStampError('No trailer');
    dict = dictionaryAt(text, text.indexOf('<<', at));
  } else {
    const head = /^(\d+)\s+(\d+)\s+obj\s*/.exec(text.slice(prev, prev + 40));
    if (!head) throw new PdfStampError('The cross-reference section is not where startxref says');
    dict = dictionaryAt(text, prev + head[0].length);
    stream = true;
    if (!dict || !/\/Type\s*\/XRef\b/.test(dict)) throw new PdfStampError('Not a cross-reference stream');
  }
  if (!dict) throw new PdfStampError('Unreadable trailer');
  if (/\/Encrypt\b/.test(dict)) throw new PdfStampError('Encrypted PDF');
  const size = /\/Size\s+(\d+)/.exec(dict);
  const root = /\/Root\s+(\d+)\s+(\d+)\s+R/.exec(dict);
  if (!size || !root) throw new PdfStampError('Trailer without Size or Root');
  const id = /\/ID\s*\[[^\]]*\]/.exec(dict)?.[0];
  return {
    prev,
    stream,
    size: Number(size[1]),
    root: { num: Number(root[1]), gen: Number(root[2]) },
    ...(id ? { id } : {}),
  };
}

/**
 * The catalog's dictionary: the **last** definition of the object in the file, since an
 * incremental update redefines it later. Undefined when it sits in an object stream.
 */
function catalogDictionary(text: string, root: { num: number; gen: number }): string | undefined {
  const pattern = new RegExp(`(?:^|[^0-9])${root.num}\\s+${root.gen}\\s+obj\\b\\s*`, 'g');
  let found: RegExpExecArray | null = null;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) found = match;
  if (!found) return undefined;
  const dict = dictionaryAt(text, found.index + found[0].length);
  return dict && /\/Type\s*\/Catalog\b/.test(dict) ? dict : undefined;
}

/** A PDF text string: a literal for plain ASCII, else UTF-16BE hex with a byte-order mark. */
export function pdfString(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return `(${value.replace(/[\\()]/g, (char) => `\\${char}`)})`;
  let hex = 'FEFF';
  for (let index = 0; index < value.length; index += 1) {
    hex += value.charCodeAt(index).toString(16).padStart(4, '0').toUpperCase();
  }
  return `<${hex}>`;
}

/** `2026-11-25T09:30:00Z` → `D:20261125093000Z`. */
export function pdfDate(iso: string): string {
  const digits = iso.replace(/\.\d+/, '').replace(/[-:TZ]/g, '');
  return `D:${digits.slice(0, 14)}Z`;
}

const xmlText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The XMP namespace of the `DSEcon` origin fields. */
export const XMP_ORIGIN_NS = 'urn:dsecon:origin:1.0/';

/** The XMP packet: the standard Producer / CreatorTool / dates / DocumentID, then the origin. */
export function originXmp(origin: ExportOrigin, title?: string): string {
  const tool = `${origin.app} ${origin.version}`;
  const lines = [
    '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about=""',
    ' xmlns:pdf="http://ns.adobe.com/pdf/1.3/"',
    ' xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    ' xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"',
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"',
    ` xmlns:dsecon="${XMP_ORIGIN_NS}">`,
    `<pdf:Producer>${xmlText(tool)}</pdf:Producer>`,
    `<xmp:CreatorTool>${xmlText(tool)}</xmp:CreatorTool>`,
    `<xmp:CreateDate>${origin.exportedAt}</xmp:CreateDate>`,
    `<xmp:ModifyDate>${origin.exportedAt}</xmp:ModifyDate>`,
    `<xmp:MetadataDate>${origin.exportedAt}</xmp:MetadataDate>`,
    ...(origin.docId ? [`<xmpMM:DocumentID>uuid:${origin.docId}</xmpMM:DocumentID>`] : []),
    ...(title ? [`<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlText(title)}</rdf:li></rdf:Alt></dc:title>`] : []),
    `<dsecon:${ORIGIN_KEYS.app}>${xmlText(origin.app)}</dsecon:${ORIGIN_KEYS.app}>`,
    `<dsecon:${ORIGIN_KEYS.version}>${xmlText(origin.version)}</dsecon:${ORIGIN_KEYS.version}>`,
    `<dsecon:${ORIGIN_KEYS.exportedAt}>${origin.exportedAt}</dsecon:${ORIGIN_KEYS.exportedAt}>`,
    ...(origin.docId ? [`<dsecon:${ORIGIN_KEYS.docId}>${origin.docId}</dsecon:${ORIGIN_KEYS.docId}>`] : []),
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ];
  return lines.join('\n');
}

/** The Info dictionary: standard keys, then each origin field under its `DSEcon` name. */
export function originInfo(origin: ExportOrigin, title?: string): string {
  const tool = `${origin.app} ${origin.version}`;
  const entries = [
    ...(title ? [`/Title ${pdfString(title)}`] : []),
    `/Creator ${pdfString(tool)}`,
    `/Producer ${pdfString(tool)}`,
    `/CreationDate (${pdfDate(origin.exportedAt)})`,
    `/ModDate (${pdfDate(origin.exportedAt)})`,
    `/${ORIGIN_KEYS.app} ${pdfString(origin.app)}`,
    `/${ORIGIN_KEYS.version} ${pdfString(origin.version)}`,
    `/${ORIGIN_KEYS.exportedAt} ${pdfString(origin.exportedAt)}`,
    ...(origin.docId ? [`/${ORIGIN_KEYS.docId} ${pdfString(origin.docId)}`] : []),
  ];
  return `<< ${entries.join(' ')} >>`;
}

/**
 * `bytes` with the origin appended as an incremental update. `title` (the document's,
 * already printed on its first page) goes into the Info dictionary and XMP as WebKit's
 * page title would have; nothing else is read from the document.
 */
export function stampPdf(bytes: Uint8Array, origin: ExportOrigin, title?: string): Uint8Array {
  const update = pdfOriginUpdate(bytes, origin, title);
  const out = new Uint8Array(bytes.length + update.length);
  out.set(bytes, 0);
  out.set(update, bytes.length);
  return out;
}

/**
 * Only the bytes `stampPdf` appends: the caller can add them to the end of the file
 * without rewriting what the engine wrote.
 */
export function pdfOriginUpdate(bytes: Uint8Array, origin: ExportOrigin, title?: string): Uint8Array {
  const text = latin1(bytes);
  if (!text.startsWith('%PDF-')) throw new PdfStampError('Not a PDF');
  const trailer = readTrailer(text);
  const catalog = catalogDictionary(text, trailer.root);

  const infoNum = trailer.size;
  const metaNum = trailer.size + 1;
  const xrefNum = trailer.size + 2;
  const size = trailer.size + (trailer.stream ? 3 : 2);

  const chunks: Uint8Array[] = [];
  let offset = bytes.length;
  const offsets = new Map<number, { offset: number; gen: number }>();
  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    offset += chunk.length;
  };
  const last = bytes[bytes.length - 1];
  if (last !== 0x0a && last !== 0x0d) push(ascii('\n'));

  offsets.set(infoNum, { offset, gen: 0 });
  push(ascii(`${infoNum} 0 obj\n${originInfo(origin, title)}\nendobj\n`));

  if (catalog) {
    const xmp = new TextEncoder().encode(originXmp(origin, title));
    offsets.set(metaNum, { offset, gen: 0 });
    push(ascii(`${metaNum} 0 obj\n<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n`));
    push(xmp);
    push(ascii('\nendstream\nendobj\n'));
    // The catalog again, pointing at the metadata (an older one replaced). A metadata
    // stream is PDF 1.4; a 1.3 file (Quartz writes those) says so in the catalog.
    const header = /^%PDF-(\d)\.(\d)/.exec(text);
    const below14 = header !== null && Number(header[1]) * 10 + Number(header[2]) < 14;
    let dict = catalog.replace(/\/Metadata\s+\d+\s+\d+\s+R/g, '');
    if (below14 && !/\/Version\s*\//.test(dict)) dict = `<< /Version /1.4${dict.slice(2)}`;
    dict = `<< /Metadata ${metaNum} 0 R${dict.slice(2)}`;
    offsets.set(trailer.root.num, { offset, gen: trailer.root.gen });
    push(ascii(`${trailer.root.num} ${trailer.root.gen} obj\n${dict}\nendobj\n`));
  }

  const tail = [`/Root ${trailer.root.num} ${trailer.root.gen} R`, `/Info ${infoNum} 0 R`, `/Prev ${trailer.prev}`];
  if (trailer.id) tail.push(trailer.id);

  if (!trailer.stream) {
    const start = offset;
    let table = 'xref\n';
    for (const [first, run] of runs([...offsets.keys()])) {
      table += `${first} ${run.length}\n`;
      for (const num of run) {
        const entry = offsets.get(num)!;
        table += `${String(entry.offset).padStart(10, '0')} ${String(entry.gen).padStart(5, '0')} n\r\n`;
      }
    }
    push(ascii(`${table}trailer\n<< /Size ${size} ${tail.join(' ')} >>\nstartxref\n${start}\n%%EOF\n`));
  } else {
    // The cross-reference stream lists itself too. Fields: type (1 byte), offset (4), gen (2).
    const start = offset;
    offsets.set(xrefNum, { offset: start, gen: 0 });
    const groups = runs([...offsets.keys()]);
    const data = new Uint8Array(offsets.size * 7);
    let at = 0;
    for (const [, run] of groups) {
      for (const num of run) {
        const entry = offsets.get(num)!;
        data[at] = 1;
        data[at + 1] = (entry.offset >>> 24) & 0xff;
        data[at + 2] = (entry.offset >>> 16) & 0xff;
        data[at + 3] = (entry.offset >>> 8) & 0xff;
        data[at + 4] = entry.offset & 0xff;
        data[at + 5] = (entry.gen >>> 8) & 0xff;
        data[at + 6] = entry.gen & 0xff;
        at += 7;
      }
    }
    const index = groups.map(([first, run]) => `${first} ${run.length}`).join(' ');
    push(
      ascii(
        `${xrefNum} 0 obj\n<< /Type /XRef /Size ${size} /W [1 4 2] /Index [${index}] ${tail.join(' ')} /Length ${data.length} >>\nstream\n`,
      ),
    );
    push(data);
    push(ascii(`\nendstream\nendobj\nstartxref\n${start}\n%%EOF\n`));
  }

  const out = new Uint8Array(offset - bytes.length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Object numbers grouped into ascending runs of consecutive numbers: `[first, run]`. */
function runs(numbers: number[]): Array<[number, number[]]> {
  const sorted = [...numbers].sort((a, b) => a - b);
  const groups: Array<[number, number[]]> = [];
  for (const num of sorted) {
    const current = groups[groups.length - 1];
    if (current && current[1][current[1].length - 1] === num - 1) current[1].push(num);
    else groups.push([num, [num]]);
  }
  return groups;
}
