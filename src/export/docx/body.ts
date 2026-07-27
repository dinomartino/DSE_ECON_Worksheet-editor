import type { BiText, FontPair, LanguageMode, TextFormat } from '@/model/types';
import type {
  ColumnsNode,
  DiagramNode,
  ImageNode,
  RenderNode,
  TableNode,
  TextNode,
} from '@/render/ir';
import { biTextRuns, formatRunOptions, marksRuns, richTextRuns, run } from './runs';
import { STYLE_IDS } from './styles';
import { attrs, escapeXml } from './xml';

/**
 * Document body construction: paragraphs, tables and inline images (§7.5, §7.6).
 */

/**
 * A4 portrait content width at 2.54cm margins, in twips.
 *
 * Only the fallback for a context that predates configurable page setup; live code
 * reads `BodyContext.contentWidth`, which follows the worksheet's paper and margins.
 */
export const CONTENT_WIDTH_TWIPS = 9026;
const EMU_PER_PX = 9525; // 96 dpi

/**
 * One answer line's writing height, in twips (24pt) — roughly double-spaced for a
 * 12pt hand, which is what a ruled line on an exam paper has to accommodate.
 */
const ANSWER_LINE_HEIGHT_TWIPS = 480;
const ANSWER_LINE_COLOR = 'A6A6A6';

export interface BodyContext {
  fonts: FontPair;
  language: LanguageMode;
  /** Live text-column width in twips, so tab stops track the page setup. */
  contentWidth: number;
  /** stream id -> concrete w:numId. */
  numIds: Map<string, number>;
  /** Allocates a relationship id for an embedded image. */
  imageRelId: (src: string) => string | undefined;
  /**
   * The rasterized PNG for a diagram block, produced by the export pre-pass.
   * Absent means the diagram could not be rendered, and it is skipped rather than
   * emitting a broken drawing.
   */
  diagramSrc?: (blockId: string) => string | undefined;
  /** Allocates the unique docPr id every drawing needs. */
  nextDrawingId: () => number;
}

/**
 * Paragraph-level direct formatting from a `TextFormat`.
 *
 * Only the fields the teacher set are emitted, so everything else keeps coming from
 * the named style — a style change still reaches every element that never overrode it.
 */
export function formatParagraphProps(format: TextFormat | undefined): string {
  if (!format) return '';
  const parts: string[] = [];
  if (format.spaceBefore !== undefined || format.spaceAfter !== undefined) {
    // Word measures paragraph spacing in twentieths of a point.
    parts.push(
      `<w:spacing${attrs({
        'w:before': format.spaceBefore !== undefined ? String(Math.round(format.spaceBefore * 20)) : undefined,
        'w:after': format.spaceAfter !== undefined ? String(Math.round(format.spaceAfter * 20)) : undefined,
      })}/>`,
    );
  }
  if (format.align) {
    // OOXML calls the two ends "left"/"right" in the compatibility vocabulary Word
    // still writes, and full justification "both".
    const value = format.align === 'justify' ? 'both' : format.align;
    parts.push(`<w:jc w:val="${value}"/>`);
  }
  return parts.join('');
}

function paragraph(options: {
  styleId: string;
  runs: string;
  numId?: number;
  level?: number;
  keepNext?: boolean;
  indent?: number;
  tabRight?: boolean;
  tabRightAt?: number;
  format?: TextFormat;
}): string {
  const props: string[] = [`<w:pStyle w:val="${options.styleId}"/>`];

  if (options.keepNext) props.push('<w:keepNext/>');

  if (options.numId !== undefined) {
    props.push(
      `<w:numPr><w:ilvl w:val="${options.level ?? 0}"/>` +
        `<w:numId w:val="${options.numId}"/></w:numPr>`,
    );
  } else if (options.indent) {
    props.push(`<w:ind w:left="${options.indent}"/>`);
  }

  // A right-aligned tab stop at the content edge puts "(4 marks)" in the
  // conventional right-hand position without a second paragraph (§3.5).
  if (options.tabRight) {
    props.push(
      `<w:tabs><w:tab w:val="right" w:pos="${options.tabRightAt ?? CONTENT_WIDTH_TWIPS}"/></w:tabs>`,
    );
  }

  props.push(formatParagraphProps(options.format));

  return `<w:p><w:pPr>${props.join('')}</w:pPr>${options.runs}</w:p>`;
}

/**
 * A row of text at fixed horizontal positions, as one paragraph with tab stops.
 *
 * Word has no "columns within a paragraph" primitive, so the idiom is a tab stop per
 * cell and a `w:tab` run between them. A borderless table would also look right but
 * would be a table to edit, and it could not sit inside a numbered list item.
 *
 * The first cell is emitted without a leading tab so it starts at the paragraph indent.
 */
function columnsNodeXml(node: ColumnsNode, context: BodyContext): string {
  // `at` is relative to the row, so stops are measured from the paragraph indent.
  const indent = node.indent ?? 0;
  const width = Math.max(720, context.contentWidth - indent);

  const stops = node.cells
    .slice(1)
    .map((cell) => {
      const value = cell.align === 'right' ? 'right' : cell.align === 'center' ? 'center' : 'left';
      return `<w:tab w:val="${value}" w:pos="${Math.round(indent + cell.at * width)}"/>`;
    })
    .join('');

  const runs = node.cells
    .map((cell, index) => {
      const fonts = cell.format?.fonts ?? context.fonts;
      const marker = cell.marker
        ? run(`${cell.marker} `, fonts, formatRunOptions(cell.format))
        : '';
      const body = biTextRuns(cell.text, fonts, context.language, formatRunOptions(cell.format));
      return (index > 0 ? '<w:r><w:tab/></w:r>' : '') + marker + body;
    })
    .join('');

  const props =
    `<w:pStyle w:val="${STYLE_IDS[node.style]}"/>` +
    (node.keepNext ? '<w:keepNext/>' : '') +
    (stops ? `<w:tabs>${stops}</w:tabs>` : '') +
    (node.indent ? `<w:ind w:left="${node.indent}"/>` : '') +
    (node.rule
      ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/></w:pBdr>'
      : '');

  return `<w:p><w:pPr>${props}</w:pPr>${runs}</w:p>`;
}

function textNodeXml(node: TextNode, context: BodyContext): string {
  const styleId = STYLE_IDS[node.style];
  // A per-element font override applies to this node's runs only.
  const fonts = node.format?.fonts ?? context.fonts;
  let runs = biTextRuns(node.text, fonts, context.language, formatRunOptions(node.format));

  if (node.marks !== undefined) {
    runs += '<w:r><w:tab/></w:r>' + marksRuns(node.marks, context.fonts, context.language);
  }

  // Word drops a completely empty numbered paragraph's usefulness, but the number
  // still renders, which is what we want for a stem that opens with a table.
  const numId = node.listRef ? context.numIds.get(node.listRef.stream) : undefined;

  return paragraph({
    styleId,
    runs,
    numId,
    level: node.listRef?.level,
    keepNext: node.keepNext,
    indent: node.indent,
    tabRight: node.marks !== undefined,
    tabRightAt: context.contentWidth,
    format: node.format,
  });
}

function cellParagraph(cellText: string, align: string): string {
  return (
    '<w:p><w:pPr>' +
    `<w:pStyle w:val="${STYLE_IDS.Body}"/>` +
    `<w:jc w:val="${align}"/>` +
    '<w:spacing w:before="20" w:after="20"/>' +
    '</w:pPr>' +
    cellText +
    '</w:p>'
  );
}

function tableNodeXml(node: TableNode, context: BodyContext): string {
  const columnWidth = Math.floor(CONTENT_WIDTH_TWIPS / Math.max(1, node.columnCount));

  const grid =
    '<w:tblGrid>' +
    Array.from({ length: node.columnCount }, () => `<w:gridCol w:w="${columnWidth}"/>`).join('') +
    '</w:tblGrid>';

  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`;

  const tblPr =
    '<w:tblPr>' +
    '<w:tblStyle w:val="TableNormal"/>' +
    `<w:tblW w:w="${CONTENT_WIDTH_TWIPS}" w:type="dxa"/>` +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('') +
    '</w:tblBorders>' +
    '</w:tblPr>';

  const rows = node.rows
    .map((row, rowIndex) => {
      const isHeader = rowIndex < node.headerRowCount;

      const trPr =
        '<w:trPr>' +
        // Never split a row across pages (§7.6).
        '<w:cantSplit/>' +
        // Header rows repeat on every page (§7.5, §11.5).
        (isHeader ? '<w:tblHeader/>' : '') +
        '</w:trPr>';

      const cells = row
        .map((cell, cellIndex) => {
          // A cell covered by a horizontal merge is absorbed by its gridSpan and
          // emits nothing; a cell covered vertically must still emit a `vMerge`
          // continuation cell or Word's grid geometry breaks.
          const coveredVertically =
            cell.covered && isCoveredVertically(node, rowIndex, cellIndex);
          if (cell.covered && !coveredVertically) return '';

          const props: string[] = [
            `<w:tcW w:w="${columnWidth * cell.colSpan}" w:type="dxa"/>`,
          ];
          if (cell.colSpan > 1) props.push(`<w:gridSpan w:val="${cell.colSpan}"/>`);
          if (coveredVertically) props.push('<w:vMerge/>');
          else if (cell.rowSpan > 1) props.push('<w:vMerge w:val="restart"/>');
          props.push('<w:vAlign w:val="center"/>');
          if (cell.header) props.push('<w:shd w:val="clear" w:color="auto" w:fill="EFEFEF"/>');

          const runs = coveredVertically
            ? ''
            : biTextRuns(cell.text, context.fonts, context.language, { bold: cell.header });

          return (
            `<w:tc><w:tcPr>${props.join('')}</w:tcPr>` +
            cellParagraph(runs, cell.align) +
            '</w:tc>'
          );
        })
        .join('');

      return `<w:tr>${trPr}${cells}</w:tr>`;
    })
    .join('');

  const caption = node.caption
    ? paragraph({
        styleId: STYLE_IDS['Table Caption'],
        runs: biTextRuns(node.caption, context.fonts, context.language),
        keepNext: node.keepNext,
      })
    : '';

  // A table must be followed by a paragraph; Word requires it and it also gives the
  // table somewhere to attach keep-with-next behaviour.
  const spacer = paragraph({
    styleId: STYLE_IDS.Body,
    runs: '',
    keepNext: node.keepNext,
  });

  return `<w:tbl>${tblPr}${grid}${rows}</w:tbl>${caption}${spacer}`;
}

/** Is this covered cell covered from above (vertical merge) rather than from the left? */
function isCoveredVertically(node: TableNode, rowIndex: number, cellIndex: number): boolean {
  for (let r = rowIndex - 1; r >= 0; r -= 1) {
    const candidate = node.rows[r]?.[cellIndex];
    if (!candidate) continue;
    if (!candidate.covered) return candidate.rowSpan > 1 && r + candidate.rowSpan > rowIndex;
  }
  return false;
}

/**
 * One inline picture plus its optional caption.
 *
 * Shared by image blocks and diagrams: a diagram arrives here as a single rasterized
 * PNG and is emitted as one `w:drawing`, so in Word it is one object to select, move
 * and resize rather than a group of shapes that a stray click can pull apart.
 */
function pictureXml(
  args: {
    src: string;
    widthPx: number;
    heightPx: number;
    altText: BiText;
    caption?: BiText;
    keepNext?: boolean;
  },
  context: BodyContext,
): string {
  const node = args;
  const relId = context.imageRelId(node.src);
  if (!relId) return '';

  const cx = Math.round(node.widthPx * EMU_PER_PX);
  const cy = Math.round(node.heightPx * EMU_PER_PX);
  const drawingId = context.nextDrawingId();
  const altText = escapeXml(
    node.altText.en.map((r) => r.text).join('') ||
      node.altText.zh.map((r) => r.text).join('') ||
      'Image',
  );

  // "Inline with text" wrapping per §7.5.
  const drawing =
    '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
    `<wp:docPr${attrs({ id: drawingId, name: `Picture ${drawingId}`, descr: altText })}/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:nvPicPr>' +
    `<pic:cNvPr${attrs({ id: drawingId, name: `Picture ${drawingId}`, descr: altText })}/>` +
    '<pic:cNvPicPr/></pic:nvPicPr>' +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    '<pic:spPr>' +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    '</pic:spPr></pic:pic></a:graphicData></a:graphic>' +
    '</wp:inline></w:drawing>';

  const imageParagraph =
    '<w:p><w:pPr>' +
    `<w:pStyle w:val="${STYLE_IDS.Body}"/>` +
    '<w:jc w:val="center"/>' +
    (node.keepNext || node.caption ? '<w:keepNext/>' : '') +
    '</w:pPr>' +
    `<w:r>${drawing}</w:r>` +
    '</w:p>';

  const caption = node.caption
    ? paragraph({
        styleId: STYLE_IDS['Image Caption'],
        runs: biTextRuns(node.caption, context.fonts, context.language),
        keepNext: node.keepNext,
      })
    : '';

  return imageParagraph + caption;
}

function imageNodeXml(node: ImageNode, context: BodyContext): string {
  return pictureXml(node, context);
}

/** A diagram: its pre-rendered PNG, emitted through the one picture path. */
function diagramNodeXml(node: DiagramNode, context: BodyContext): string {
  const src = context.diagramSrc?.(node.blockId);
  if (!src) return '';
  return pictureXml({ ...node, src }, context);
}

export function renderNodeXml(node: RenderNode, context: BodyContext): string {
  switch (node.kind) {
    case 'text':
      return textNodeXml(node, context);
    case 'table':
      return tableNodeXml(node, context);
    case 'columns':
      return columnsNodeXml(node, context);
    case 'image':
      return imageNodeXml(node, context);
    case 'diagram':
      return diagramNodeXml(node, context);
    case 'pageBreak':
      return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    case 'spacer':
      // An empty paragraph whose exact-height line gives the requested gap. Using
      // `w:line`/`exact` rather than a run of blank paragraphs keeps the space stable
      // at any font size.
      return (
        '<w:p><w:pPr>' +
        `<w:spacing w:line="${Math.max(1, Math.round(node.heightPt * 20))}" w:lineRule="exact"/>` +
        '</w:pPr></w:p>'
      );
    case 'divider':
      // A bottom-bordered empty paragraph is how Word itself draws a horizontal rule.
      return (
        '<w:p><w:pPr><w:pBdr>' +
        '<w:bottom w:val="single" w:sz="6" w:space="1" w:color="808080"/>' +
        '</w:pBdr></w:pPr></w:p>'
      );
    case 'answerLines':
      // One bottom-bordered paragraph per writing line, so the teacher gets real
      // ruled lines that survive editing in Word rather than a row of underscores.
      //
      // Two details are what make Word actually draw N lines rather than one.
      //
      // Word *collapses* consecutive paragraphs that share an identical `w:pBdr`
      // into a single bordered block: the run gets one top rule and one bottom
      // rule, so N ruled paragraphs printed as one line under the last of them.
      // That is what `w:between` is for — it names the border drawn *at every
      // interior boundary* of such a group, which is precisely one rule per line.
      // Both are declared: `w:between` rules lines 1..N-1 and `w:bottom` closes
      // the last one.
      //
      // An empty paragraph is also only as tall as its line height, which is not a
      // writing line, so each gets an exact height instead of trailing space —
      // `w:after` would land outside the border and shrink the writing room.
      return Array.from(
        { length: Math.max(1, node.lines) },
        () =>
          '<w:p><w:pPr>' +
          `<w:spacing w:before="0" w:after="0" w:line="${ANSWER_LINE_HEIGHT_TWIPS}" w:lineRule="exact"/>` +
          '<w:pBdr>' +
          `<w:between w:val="single" w:sz="6" w:space="1" w:color="${ANSWER_LINE_COLOR}"/>` +
          `<w:bottom w:val="single" w:sz="6" w:space="1" w:color="${ANSWER_LINE_COLOR}"/>` +
          '</w:pBdr>' +
          '</w:pPr></w:p>',
      ).join('');
    default:
      return '';
  }
}

export { paragraph, richTextRuns };
