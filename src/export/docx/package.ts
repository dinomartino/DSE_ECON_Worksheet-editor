import JSZip from 'jszip';
import type { FontPair } from '@/model/types';
import { XML_DECL } from './xml';

/**
 * OPC package plumbing: content types, relationships, header/footer, settings.
 * Getting these exactly right is what keeps Word from showing a repair prompt (§7.1).
 */

export interface ImageAsset {
  relId: string;
  fileName: string;
  data: Uint8Array;
  contentType: string;
  extension: string;
}

export function buildContentTypesXml(assets: ImageAsset[], hf: HeaderFooterParts = {}): string {
  const extensions = new Set(assets.map((asset) => asset.extension));
  const defaults = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>'];
  for (const extension of extensions) {
    const asset = assets.find((a) => a.extension === extension)!;
    defaults.push(`<Default Extension="${extension}" ContentType="${asset.contentType}"/>`);
  }

  return (
    XML_DECL +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    defaults.join('') +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
    '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>' +
    headerFooterFiles(hf)
      .map(
        (file) =>
          `<Override PartName="/word/${file.name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${file.type}+xml"/>`,
      )
      .join('') +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>'
  );
}

export function buildRootRelsXml(): string {
  return (
    XML_DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>'
  );
}

export const REL_STYLES = 'rId1';
export const REL_NUMBERING = 'rId2';
export const REL_SETTINGS = 'rId3';
export const REL_FONT_TABLE = 'rId4';
export const REL_HEADER = 'rId5';
export const REL_FOOTER = 'rId6';
export const REL_HEADER_FIRST = 'rId7';
export const REL_FOOTER_FIRST = 'rId8';
/** Image relationship ids start after the fixed parts. */
export const REL_IMAGE_BASE = 100;

/** Which optional header/footer parts a package actually contains. */
export interface HeaderFooterParts {
  header?: string;
  footer?: string;
  /** Empty page-1 overrides, present only when the first page suppresses them. */
  headerFirst?: string;
  footerFirst?: string;
}

/** The `word/` entries for the header/footer parts that exist, in relationship order. */
function headerFooterFiles(parts: HeaderFooterParts): Array<{
  name: string;
  relId: string;
  type: 'header' | 'footer';
  xml: string;
}> {
  const files: Array<{ name: string; relId: string; type: 'header' | 'footer'; xml: string }> = [];
  if (parts.header !== undefined)
    files.push({ name: 'header1.xml', relId: REL_HEADER, type: 'header', xml: parts.header });
  if (parts.footer !== undefined)
    files.push({ name: 'footer1.xml', relId: REL_FOOTER, type: 'footer', xml: parts.footer });
  if (parts.headerFirst !== undefined)
    files.push({
      name: 'header2.xml',
      relId: REL_HEADER_FIRST,
      type: 'header',
      xml: parts.headerFirst,
    });
  if (parts.footerFirst !== undefined)
    files.push({
      name: 'footer2.xml',
      relId: REL_FOOTER_FIRST,
      type: 'footer',
      xml: parts.footerFirst,
    });
  return files;
}

export function buildDocumentRelsXml(assets: ImageAsset[], hf: HeaderFooterParts = {}): string {
  const fixed = [
    `<Relationship Id="${REL_STYLES}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    `<Relationship Id="${REL_NUMBERING}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>`,
    `<Relationship Id="${REL_SETTINGS}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`,
    `<Relationship Id="${REL_FONT_TABLE}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>`,
    ...headerFooterFiles(hf).map(
      (file) =>
        `<Relationship Id="${file.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${file.type}" Target="${file.name}"/>`,
    ),
  ];
  const images = assets.map(
    (asset) =>
      `<Relationship Id="${asset.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${asset.fileName}"/>`,
  );
  return (
    XML_DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    fixed.join('') +
    images.join('') +
    '</Relationships>'
  );
}

export function buildSettingsXml(): string {
  return (
    XML_DECL +
    '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:zoom w:percent="100"/>' +
    '<w:defaultTabStop w:val="720"/>' +
    /*
     * Open in print layout.
     *
     * Whether *formatting marks* are drawn is a Word application preference, not a
     * document one — there is no document-level flag that reliably turns them off — so
     * the small black square beside every `w:keepNext` paragraph is controlled by the
     * reader's own ¶ toggle. It is a formatting mark rather than content: it cannot be
     * selected or deleted, and it never prints. `w:keepNext` therefore stays exactly
     * where it is, because it is what stops Word splitting a question across a page
     * break (§7.6) — removing it to hide a display-only mark would trade a cosmetic
     * annoyance for a real layout defect.
     */
    '<w:view w:val="print"/>' +
    // Kerning/spacing rules that make mixed Latin + CJK text lay out correctly.
    '<w:characterSpacingControl w:val="compressPunctuation"/>' +
    '<w:compat>' +
    '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>' +
    '</w:compat>' +
    '</w:settings>'
  );
}

export function buildFontTableXml(fonts: FontPair): string {
  const font = (name: string) =>
    `<w:font w:name="${name}"><w:pitch w:val="variable"/><w:charset w:val="00"/></w:font>`;
  const unique = [...new Set([fonts.latin, fonts.eastAsia])];
  return (
    XML_DECL +
    '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    unique.map(font).join('') +
    '</w:fonts>'
  );
}

const WML_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  // Shapes, for the cover's vertical rule — a `prstGeom prst="line"` connector, which
  // is what the reference draws (§ `coverRuleXml`).
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
  // Shape groups, for the cover's floating corner block (§ `cornerGroupXml`).
  'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';

/**
 * A header/footer paragraph laid out as left / centre / right.
 *
 * Word has no three-column header primitive; the convention is one paragraph with a
 * centre tab stop at the middle of the text column and a right tab stop at its end,
 * with the slots separated by tabs. Deriving both stops from the live content width
 * keeps the layout correct after a paper-size, orientation or margin change, which a
 * fixed stop would silently break.
 */
export interface HeaderFooterRow {
  left: string;
  center: string;
  right: string;
}

/**
 * A header or footer: one paragraph per printed row.
 *
 * `rows` rather than a single triple, because real papers stack them — the reference
 * exam header runs an exam line with a page number, three centred title rows, then a
 * marks line beside a date rule. Each row is still one Word paragraph with tab stops,
 * so nothing about the export contract changes; there are simply several of them.
 */
export interface HeaderFooterLayout {
  rows: HeaderFooterRow[];
  contentWidth: number;
  rule?: boolean;
  /** 'top' draws above the paragraph (footer), 'bottom' below it (header). */
  ruleEdge?: 'top' | 'bottom';
}

function headerFooterParagraph(
  row: HeaderFooterRow,
  contentWidth: number,
  /** Only the edge-most row carries the rule, so it frames the block rather than each line. */
  border: string,
): string {
  const { left, center, right } = row;
  const tabs =
    '<w:tabs>' +
    `<w:tab w:val="center" w:pos="${Math.round(contentWidth / 2)}"/>` +
    `<w:tab w:val="right" w:pos="${Math.round(contentWidth)}"/>` +
    '</w:tabs>';

  // Tabs are emitted only as far as the rightmost occupied slot, so a
  // centre-only header does not carry a trailing tab that shifts it off-centre.
  const tab = '<w:r><w:tab/></w:r>';
  let content = left;
  if (center) content += tab + center;
  if (right) content += (center ? tab : tab + tab) + right;

  return `<w:p><w:pPr>${tabs}${border}</w:pPr>${content}</w:p>`;
}

/**
 * Every row as its own paragraph, with the rule on the edge-most one only.
 *
 * A header's rule belongs under the *last* row and a footer's above the *first*, so the
 * line frames the whole block. Drawing it on every row would put a hairline between each
 * title line, which is not what any of the reference papers do.
 */
function headerFooterBody(layout: HeaderFooterLayout): string {
  const rows = layout.rows.length > 0 ? layout.rows : [{ left: '', center: '', right: '' }];
  const edge = layout.ruleEdge ?? 'bottom';
  const ruledIndex = edge === 'bottom' ? rows.length - 1 : 0;
  const border = `<w:pBdr><w:${edge} w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>`;

  return rows
    .map((row, index) =>
      headerFooterParagraph(row, layout.contentWidth, layout.rule && index === ruledIndex ? border : ''),
    )
    .join('');
}

export function buildHeaderXml(layout: HeaderFooterLayout): string {
  return XML_DECL + `<w:hdr ${WML_NS}>` + headerFooterBody(layout) + '</w:hdr>';
}

export function buildFooterXml(layout: HeaderFooterLayout): string {
  return XML_DECL + `<w:ftr ${WML_NS}>` + headerFooterBody(layout) + '</w:ftr>';
}

/**
 * A native Word field (§7.1). PAGE / NUMPAGES recompute per page, so page numbers
 * stay right after the teacher edits the document in Word — a literal number would
 * be correct only on page one.
 */
export function fieldRuns(instruction: string, fontsRunProps: string, fallback: string): string {
  return (
    `<w:r>${fontsRunProps}<w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r>${fontsRunProps}<w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r>` +
    `<w:r>${fontsRunProps}<w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r>${fontsRunProps}<w:t>${fallback}</w:t></w:r>` +
    `<w:r>${fontsRunProps}<w:fldChar w:fldCharType="end"/></w:r>`
  );
}

export function buildCorePropsXml(title: string, timestamp: string): string {
  const escape = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    XML_DECL +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${escape(title)}</dc:title>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

export function buildAppPropsXml(): string {
  return (
    XML_DECL +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>HKDSE Economics Worksheet Generator</Application>' +
    '</Properties>'
  );
}

export interface SectionOptions {
  pageWidth: number;
  pageHeight: number;
  margins: { top: number; right: number; bottom: number; left: number };
  landscape: boolean;
  hasHeader: boolean;
  hasFooter: boolean;
  /**
   * Suppress the header/footer on page 1. Word models this as a separate "first"
   * header referencing an empty part, enabled by `w:titlePg`.
   */
  differentFirstPage: boolean;
  /**
   * Where the header and footer start, from the page edge (`w:header` / `w:footer`).
   *
   * Passed in rather than fixed here because it depends on how tall the bands are —
   * see `headerFooterOffsets`. Optional so a caller with no header keeps Word's default.
   */
  edgeOffsets?: { header: number; footer: number };
}

/** Page geometry plus header/footer references (§7.1). */
export function buildSectionProperties(options: SectionOptions): string {
  const refs =
    (options.hasHeader ? `<w:headerReference w:type="default" r:id="${REL_HEADER}"/>` : '') +
    (options.hasFooter ? `<w:footerReference w:type="default" r:id="${REL_FOOTER}"/>` : '') +
    (options.differentFirstPage && options.hasHeader
      ? `<w:headerReference w:type="first" r:id="${REL_HEADER_FIRST}"/>`
      : '') +
    (options.differentFirstPage && options.hasFooter
      ? `<w:footerReference w:type="first" r:id="${REL_FOOTER_FIRST}"/>`
      : '');

  return (
    '<w:sectPr>' +
    refs +
    (options.differentFirstPage ? '<w:titlePg/>' : '') +
    `<w:pgSz w:w="${options.pageWidth}" w:h="${options.pageHeight}"` +
    (options.landscape ? ' w:orient="landscape"' : '') +
    '/>' +
    `<w:pgMar w:top="${options.margins.top}" w:right="${options.margins.right}" ` +
    `w:bottom="${options.margins.bottom}" w:left="${options.margins.left}" ` +
    // Derived from the band heights so a tall header sits in the margin rather than
    // pushing the body text down the page (§ `headerFooterOffsets`). These were both a
    // hardcoded 720, which is what made adding a header cost content space.
    `w:header="${options.edgeOffsets?.header ?? 720}" ` +
    `w:footer="${options.edgeOffsets?.footer ?? 720}" w:gutter="0"/>` +
    '<w:cols w:space="708"/>' +
    '<w:docGrid w:linePitch="360"/>' +
    '</w:sectPr>'
  );
}

export function buildDocumentXml(body: string, section: SectionOptions): string {
  return (
    XML_DECL +
    `<w:document ${WML_NS}>` +
    `<w:body>${body}${buildSectionProperties(section)}</w:body>` +
    '</w:document>'
  );
}

/** An empty header/footer part, used as the page-1 override for `w:titlePg`. */
export function buildEmptyHeaderXml(tag: 'hdr' | 'ftr'): string {
  return XML_DECL + `<w:${tag} ${WML_NS}><w:p/></w:${tag}>`;
}

export { WML_NS };

export interface PackageParts {
  documentXml: string;
  stylesXml: string;
  numberingXml: string;
  /** Header/footer parts actually present; absent slots omit the part entirely. */
  headerFooter: HeaderFooterParts;
  fontTableXml: string;
  coreXml: string;
  assets: ImageAsset[];
}

/**
 * Assemble every OPC entry. Both public entry points share this so the browser
 * export and the test export can never contain a different set of parts.
 */
function buildZip(parts: PackageParts): JSZip {
  const zip = new JSZip();

  // [Content_Types].xml must be the first entry, per OPC.
  zip.file('[Content_Types].xml', buildContentTypesXml(parts.assets, parts.headerFooter));
  zip.folder('_rels')!.file('.rels', buildRootRelsXml());

  const word = zip.folder('word')!;
  word.file('document.xml', parts.documentXml);
  word.file('styles.xml', parts.stylesXml);
  word.file('numbering.xml', parts.numberingXml);
  word.file('settings.xml', buildSettingsXml());
  word.file('fontTable.xml', parts.fontTableXml);
  for (const file of headerFooterFiles(parts.headerFooter)) {
    word.file(file.name, file.xml);
  }
  word
    .folder('_rels')!
    .file('document.xml.rels', buildDocumentRelsXml(parts.assets, parts.headerFooter));

  if (parts.assets.length > 0) {
    const media = word.folder('media')!;
    for (const asset of parts.assets) media.file(asset.fileName, asset.data);
  }

  const docProps = zip.folder('docProps')!;
  docProps.file('core.xml', parts.coreXml);
  docProps.file('app.xml', buildAppPropsXml());

  return zip;
}

export async function zipPackage(parts: PackageParts): Promise<Blob> {
  return buildZip(parts).generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

/** Node-side variant used by the export tests. */
export async function zipPackageBuffer(parts: PackageParts): Promise<Uint8Array> {
  return buildZip(parts).generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
