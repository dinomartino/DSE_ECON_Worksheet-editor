import type { BiText, FontPair, LanguageMode, TextFormat } from '@/model/types';
import type {
  ColumnsNode,
  DiagramNode,
  ImageNode,
  RenderNode,
  TableNode,
  TextNode,
} from '@/render/ir';
import { biTextRuns, formatRunOptions, lineBreak, marksRuns, richTextRuns, run } from './runs';
import { ANSWER_LINE_STYLE_ID, STYLE_IDS, exactLineFor } from './styles';
import { marksAnchorRuns, trailingBlankLines } from '@/model/text';
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
  // A `w:spacing` is emitted when the teacher set paragraph spacing, and also when they
  // only enlarged the text: an exact line box does not grow to fit, so a font size the
  // style's box cannot hold would be clipped unless the box is restated with it.
  const needsLine = format.fontSize !== undefined;
  if (format.spaceBefore !== undefined || format.spaceAfter !== undefined || needsLine) {
    // Word measures paragraph spacing in twentieths of a point.
    //
    // `w:line` is restated even when only the before/after was overridden: direct
    // formatting replaces the style's `w:spacing` *element* wholesale rather than
    // merging attribute by attribute, so emitting before/after alone would silently
    // drop the fixed 12pt line and drop that one paragraph off the page's rhythm —
    // visible as a single stem set looser than everything around it.
    parts.push(
      `<w:spacing${attrs({
        'w:before': format.spaceBefore !== undefined ? String(Math.round(format.spaceBefore * 20)) : undefined,
        'w:after': format.spaceAfter !== undefined ? String(Math.round(format.spaceAfter * 20)) : undefined,
        'w:line': String(exactLineFor(format.fontSize)),
        'w:lineRule': 'exact',
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
    const marks =
      '<w:r><w:tab/></w:r>' + marksRuns(node.marks, context.fonts, context.language);
    /*
     * The marks go on the last line that has text, not after a trailing hard break.
     *
     * A trailing Shift+Enter is a real blank line and still prints, but appending the tab
     * run after its `<w:br/>` lands "(3 marks)" on the empty line — reading as though the
     * marks sit below the part rather than on it. So the trailing breaks are moved to
     * *after* the marks: the label joins the last text line, then the blank lines follow.
     *
     * The preview lifts its label by the same count (`trailingBlankLines`), which is why
     * that helper is shared rather than counted here — the page and the .docx must place
     * the marks on the same line.
     */
    const blanks = trailingBlankLines(marksAnchorRuns(node.text, context.language));
    if (blanks > 0) {
      const trailing = lineBreak().repeat(blanks);
      // Only a run-final break can be hoisted; `biTextRuns` emits the trailing breaks as
      // the last thing in the string, so this is a suffix swap rather than a re-render.
      if (runs.endsWith(trailing)) {
        runs = runs.slice(0, -trailing.length) + marks + trailing;
      } else {
        runs += marks;
      }
    } else {
      runs += marks;
    }
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

function cellParagraph(cellText: string, align: string, format?: TextFormat): string {
  // No `w:spacing` override: the cell paragraph takes the Body style's fixed 12pt line
  // and zero padding like every other paragraph, so a table's rows sit on the same
  // rhythm as the text around it. The breathing room a cell needs is horizontal and
  // vertical *cell* margin (`w:tcMar` per cell), which is a table concern — paragraph
  // spacing here would put the gap inside the cell's text flow instead and desynchronise
  // the row from the page's line grid.
  //
  // The cell's own alignment wins over any `align` in its format: `CellAlign` is the
  // thing the panel and the page both set, and a `TextFormat.align` arriving from the
  // shared toolbar must not quietly overrule the control that names the cell.
  return (
    '<w:p><w:pPr>' +
    `<w:pStyle w:val="${STYLE_IDS.Body}"/>` +
    `<w:jc w:val="${align}"/>` +
    formatParagraphProps(format ? { ...format, align: undefined } : undefined) +
    '</w:pPr>' +
    cellText +
    '</w:p>'
  );
}

/**
 * The per-cell margins, written onto every `w:tc`.
 *
 * Word has table-level `w:tblCellMar` and cell-level `w:tcMar` and **nothing in
 * between** — no row or column margin exists in OOXML. So the resolver's winner is
 * flattened onto each cell here; a teacher's "this row is roomy" survives as an editable
 * statement in the model and reaches Word as the only thing Word can express.
 */
function cellMargins(padding: TableNode['rows'][number][number]['padding']): string {
  return (
    '<w:tcMar>' +
    `<w:top w:w="${Math.round(padding.top)}" w:type="dxa"/>` +
    `<w:left w:w="${Math.round(padding.left)}" w:type="dxa"/>` +
    `<w:bottom w:w="${Math.round(padding.bottom)}" w:type="dxa"/>` +
    `<w:right w:w="${Math.round(padding.right)}" w:type="dxa"/>` +
    '</w:tcMar>'
  );
}

function tableNodeXml(node: TableNode, context: BodyContext): string {
  /*
   * Column widths in twips, from the IR's fractions.
   *
   * The last column takes the rounding remainder rather than being rounded on its own,
   * so the columns always sum to exactly `CONTENT_WIDTH_TWIPS`. Rounding each
   * independently leaves the grid a few twips short or long, and Word resolves that
   * disagreement by stretching the final column — visibly, on a table with many columns.
   */
  const columnWidths = (() => {
    const widths = node.columnWidths.map((fraction) =>
      Math.max(1, Math.round(fraction * CONTENT_WIDTH_TWIPS)),
    );
    if (widths.length === 0) return widths;
    const drift = CONTENT_WIDTH_TWIPS - widths.reduce((sum, value) => sum + value, 0);
    widths[widths.length - 1] += drift;
    return widths;
  })();

  /** The width of a cell spanning `span` columns from `index`. */
  const spanWidth = (index: number, span: number) =>
    columnWidths.slice(index, index + span).reduce((sum, value) => sum + value, 0) ||
    columnWidths[index] ||
    Math.floor(CONTENT_WIDTH_TWIPS / Math.max(1, node.columnCount));

  const grid =
    '<w:tblGrid>' +
    columnWidths.map((width) => `<w:gridCol w:w="${width}"/>`).join('') +
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
      // No `w:tblHeader`, and no shading or bold: an HKDSE table is uniform, plain-ruled
      // cells throughout (§tables). Emphasis is per-cell formatting like any other text.
      const trPr =
        '<w:trPr>' +
        // Never split a row across pages (§7.6).
        '<w:cantSplit/>' +
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
            `<w:tcW w:w="${spanWidth(cellIndex, cell.colSpan)}" w:type="dxa"/>`,
          ];
          if (cell.colSpan > 1) props.push(`<w:gridSpan w:val="${cell.colSpan}"/>`);
          if (coveredVertically) props.push('<w:vMerge/>');
          else if (cell.rowSpan > 1) props.push('<w:vMerge w:val="restart"/>');
          props.push(cellMargins(cell.padding));
          props.push('<w:vAlign w:val="center"/>');

          const runs = coveredVertically
            ? ''
            : biTextRuns(
                cell.text,
                context.fonts,
                context.language,
                formatRunOptions(cell.format),
              );

          return (
            `<w:tc><w:tcPr>${props.join('')}</w:tcPr>` +
            cellParagraph(runs, cell.align, cell.format) +
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
      //
      // It carries the Body style like every other paragraph — the gap is expressed by
      // the height override alone. Without a `w:pStyle` it would inherit whatever style
      // Word considers current, which is both a restyling hazard and a break in the
      // "every paragraph is attached to a named style" invariant (§7.3).
      return (
        '<w:p><w:pPr>' +
        `<w:pStyle w:val="${STYLE_IDS.Body}"/>` +
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
      // The rule and the writing height come from the `Answer Line` style, so these
      // paragraphs carry no direct formatting at all — Word marks a directly
      // formatted paragraph in the left margin, and a block of forty read as editing
      // chrome rather than as a page to write on.
      //
      // The style declares both `w:between` and `w:bottom`. Word *collapses*
      // consecutive paragraphs sharing one border set into a single bordered block,
      // drawing the bottom rule once — under the last paragraph — so N ruled lines
      // printed as one. `w:between` is the border drawn at every interior boundary of
      // such a group, which is precisely one rule per line.
      return Array.from(
        { length: Math.max(1, node.lines) },
        () => `<w:p><w:pPr><w:pStyle w:val="${ANSWER_LINE_STYLE_ID}"/></w:pPr></w:p>`,
      ).join('');
    default:
      return '';
  }
}

export { paragraph, richTextRuns };
