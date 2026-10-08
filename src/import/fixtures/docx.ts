/**
 * Invented `.docx` files for the reader's tests (test support): hand-written XML zipped
 * with jszip. Only invented text; the repo is public.
 */
import JSZip from 'jszip';

const NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
  'xmlns:o="urn:schemas-microsoft-com:office:office"',
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
].join(' ');

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- runs and paragraphs ----

export interface RunOpts {
  b?: boolean;
  i?: boolean;
  u?: string;
  color?: string;
  highlight?: string;
  vanish?: boolean;
  vert?: 'superscript' | 'subscript';
}

export function r(text: string, o: RunOpts = {}): string {
  const rPr = [
    o.b ? '<w:b/>' : '',
    o.i ? '<w:i/>' : '',
    o.u ? `<w:u w:val="${o.u}"/>` : '',
    o.color ? `<w:color w:val="${o.color}"/>` : '',
    o.highlight ? `<w:highlight w:val="${o.highlight}"/>` : '',
    o.vanish ? '<w:vanish/>' : '',
    o.vert ? `<w:vertAlign w:val="${o.vert}"/>` : '',
  ].join('');
  const body = text
    .split('\t')
    .map((t) => (t ? `<w:t xml:space="preserve">${esc(t)}</w:t>` : ''))
    .join('<w:tab/>');
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${body}</w:r>`;
}

export interface ParaOpts {
  num?: [numId: number, ilvl: number];
  style?: string;
  ind?: number;
}

export function p(content: string, o: ParaOpts = {}): string {
  const pPr = [
    o.style ? `<w:pStyle w:val="${o.style}"/>` : '',
    o.num ? `<w:numPr><w:ilvl w:val="${o.num[1]}"/><w:numId w:val="${o.num[0]}"/></w:numPr>` : '',
    o.ind !== undefined ? `<w:ind w:left="${o.ind}"/>` : '',
  ].join('');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`;
}

/** A paragraph of plain text (TABs become `w:tab`). */
export const para = (text: string, o: ParaOpts = {}) => p(text ? r(text) : '', o);

export function tbl(rows: string[][]): string {
  return `<w:tbl><w:tblPr/>${rows.map((cells) => `<w:tr>${cells.map((c) => `<w:tc>${c || '<w:p/>'}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
}

// ---- numbering ----

export type Lvl = [fmt: string, text: string, start?: number];

export function abstractNum(id: number, levels: Lvl[]): string {
  const lvls = levels.map(([fmt, text, start], k) => `<w:lvl w:ilvl="${k}"><w:start w:val="${start ?? 1}"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${esc(text)}"/><w:pPr><w:ind w:left="${(k + 1) * 720}" w:hanging="360"/></w:pPr></w:lvl>`);
  return `<w:abstractNum w:abstractNumId="${id}">${lvls.join('')}</w:abstractNum>`;
}

export function num(numId: number, abstractId: number, restartAt?: number): string {
  const override = restartAt !== undefined ? `<w:lvlOverride w:ilvl="0"><w:startOverride w:val="${restartAt}"/></w:lvlOverride>` : '';
  return `<w:num w:numId="${numId}"><w:abstractNumId w:val="${abstractId}"/>${override}</w:num>`;
}

// ---- drawings ----

const EMU = 9525;

const anchor = (inner: string, w: number, h: number, offsetY = 0) =>
  `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>${offsetY * EMU}</wp:posOffset></wp:positionV><wp:extent cx="${w * EMU}" cy="${h * EMU}"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="1" name="Shape"/>${inner}</wp:anchor>`;

const picXml = (rid: string, w: number, h: number) =>
  `<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="p"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w * EMU}" cy="${h * EMU}"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic>`;

/** An inline picture `w`×`h` px. */
export function picture(rid: string, w: number, h: number, alt = ''): string {
  return `<w:r><w:drawing><wp:inline><wp:extent cx="${w * EMU}" cy="${h * EMU}"/><wp:docPr id="1" name="Picture"${alt ? ` descr="${esc(alt)}"` : ''}/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">${picXml(rid, w, h)}</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

export function chart(rid: string): string {
  return `<w:r><w:drawing><wp:inline><wp:extent cx="${400 * EMU}" cy="${300 * EMU}"/><wp:docPr id="2" name="Chart"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="${rid}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const wspBox = (paragraphs: string) =>
  `<wps:wsp><wps:spPr><a:prstGeom prst="rect"/></wps:spPr><wps:txbx><w:txbxContent>${paragraphs}</w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp>`;
const wspLine = '<wps:wsp><wps:cNvCnPr/><wps:spPr><a:prstGeom prst="straightConnector1"/></wps:spPr><wps:bodyPr/></wps:wsp>';

/**
 * A floating text box, as Word writes it: the DrawingML shape in `mc:Choice` and the
 * same text again in the VML `mc:Fallback`. `offsetY` < 0 sets it above its paragraph.
 */
export function textBox(paragraphs: string, offsetY = 0): string {
  const choice = `<w:drawing>${anchor(`<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">${wspBox(paragraphs)}</a:graphicData></a:graphic>`, 400, 120, offsetY)}</w:drawing>`;
  const fallback = `<w:pict><v:shape style="width:300pt;height:90pt"><v:textbox><w:txbxContent>${paragraphs}</w:txbxContent></v:textbox></v:shape></w:pict>`;
  return `<w:r><mc:AlternateContent><mc:Choice Requires="wps">${choice}</mc:Choice><mc:Fallback>${fallback}</mc:Fallback></mc:AlternateContent></w:r>`;
}

/** A group: axes drawn as lines with small label boxes (a hand-drawn graph), and optional pictures. */
export function group(labels: string[], pictures: Array<[rid: string, w: number, h: number]> = [], lines = 2): string {
  const inner = [
    ...Array.from({ length: lines }, () => wspLine),
    ...labels.map((t) => wspBox(para(t))),
    ...pictures.map(([rid, w, h]) => picXml(rid, w, h)),
  ].join('');
  const grp = `<wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${500 * EMU}" cy="${300 * EMU}"/><a:chOff x="0" y="0"/><a:chExt cx="${500 * EMU}" cy="${300 * EMU}"/></a:xfrm></wpg:grpSpPr>${inner}</wpg:wgp>`;
  return `<w:r><mc:AlternateContent><mc:Choice Requires="wpg"><w:drawing>${anchor(`<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">${grp}</a:graphicData></a:graphic>`, 500, 300)}</w:drawing></mc:Choice><mc:Fallback><w:pict><v:group><v:line/><v:line/></v:group></w:pict></mc:Fallback></mc:AlternateContent></w:r>`;
}

/** One loose floating shape: a line, or a small label box. */
export const looseLine = () => `<w:r><w:drawing>${anchor(`<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">${wspLine}</a:graphicData></a:graphic>`, 200, 1)}</w:drawing></w:r>`;
export const looseLabel = (text: string) => `<w:r><w:drawing>${anchor(`<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">${wspBox(para(text))}</a:graphicData></a:graphic>`, 40, 20)}</w:drawing></w:r>`;

// ---- media ----

/** A 1×1 PNG. */
export const PNG_1x1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

/** The first bytes of an EMF: a record of type 1 with " EMF" at byte 40. */
export const EMF = (() => {
  const b = new Uint8Array(88);
  b.set([1, 0, 0, 0, 88, 0, 0, 0]);
  b.set([0x20, 0x45, 0x4d, 0x46], 40);
  return b;
})();

// ---- the package ----

export interface DocxSpec {
  body: string;
  numbering?: string;
  styles?: string;
  /** rId → [type suffix, target under word/]. */
  rels?: Record<string, [type: string, target: string]>;
  media?: Record<string, Uint8Array>;
  title?: string;
  /** Extra parts, path → content. */
  parts?: Record<string, string>;
  /** The body's `w:sectPr` content: header/footer references, `w:titlePg`, page size. */
  sectPr?: string;
  /** `word/settings.xml` content (e.g. `<w:evenAndOddHeaders/>`). */
  settings?: string;
}

/** A header or footer part around `content` (paragraphs, tables). */
export const headerPart = (content: string) => `<?xml version="1.0"?><w:hdr ${NS}>${content}</w:hdr>`;
export const footerPart = (content: string) => `<?xml version="1.0"?><w:ftr ${NS}>${content}</w:ftr>`;

/** A field as Word writes it: begin, code, separate, the shown result, end. */
export const field = (code: string, shown = '1') =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${code} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${shown}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;

/** A paragraph with raw `pPr` content (tab stops, `w:jc`, `w:framePr`, borders) around runs. */
export const pp = (pPr: string, content: string) => `<w:p><w:pPr>${pPr}</w:pPr>${content}</w:p>`;
export const tabs = (...stops: Array<[val: string, pos: number]>) => `<w:tabs>${stops.map(([v, pos]) => `<w:tab w:val="${v}" w:pos="${pos}"/>`).join('')}</w:tabs>`;

export async function makeDocx(spec: DocxSpec): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file('_rels/.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${spec.body}<w:sectPr>${spec.sectPr ?? ''}</w:sectPr></w:body></w:document>`);
  const rels: Record<string, [string, string]> = { ...spec.rels };
  if (spec.settings !== undefined) {
    zip.file('word/settings.xml', `<?xml version="1.0"?><w:settings ${NS}>${spec.settings}</w:settings>`);
    rels.rIdSettings = ['settings', 'settings.xml'];
  }
  if (spec.numbering) {
    zip.file('word/numbering.xml', `<?xml version="1.0"?><w:numbering ${NS}>${spec.numbering}</w:numbering>`);
    rels.rIdNum = ['numbering', 'numbering.xml'];
  }
  if (spec.styles) {
    zip.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${NS}>${spec.styles}</w:styles>`);
    rels.rIdStyles = ['styles', 'styles.xml'];
  }
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Object.entries(rels)
      .map(([id, [type, target]]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${esc(target)}"${/^https?:/.test(target) ? ' TargetMode="External"' : ''}/>`)
      .join('')}</Relationships>`,
  );
  for (const [path, bytes] of Object.entries(spec.media ?? {})) zip.file(`word/${path}`, bytes);
  if (spec.title !== undefined) {
    zip.file('docProps/core.xml', `<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(spec.title)}</dc:title></cp:coreProperties>`);
  }
  for (const [path, content] of Object.entries(spec.parts ?? {})) zip.file(path, content);
  return zip.generateAsync({ type: 'arraybuffer' });
}
