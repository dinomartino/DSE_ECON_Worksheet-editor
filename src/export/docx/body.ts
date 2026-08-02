import type {
  BiText,
  CaptionPlacement,
  FontPair,
  LanguageMode,
  TableAlign,
  TextFormat,
} from '@/model/types';
import type {
  ColumnsNode,
  CoverPanelRender,
  CoverRenderNode,
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
    .map((cell, index) => {
      const value = cell.align === 'right' ? 'right' : cell.align === 'center' ? 'center' : 'left';
      /*
       * With a hang, the *second* cell is the text column: it starts at `indent`, which
       * is where Word returns every wrapped line to. Placing it from `at` instead would
       * put the stop somewhere inside the text column and the wrap would not line up
       * (§ ColumnsNode.hanging). Later cells still measure from `at`.
       */
      const pos =
        node.hanging && index === 0 ? indent : indent + cell.at * width;
      return `<w:tab w:val="${value}" w:pos="${Math.round(pos)}"/>`;
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
    // One `w:ind`, since Word merges the element as a whole — emitting `left` and
    // `hanging` separately would drop whichever came first.
    (node.indent || node.hanging
      ? `<w:ind${node.indent ? ` w:left="${node.indent}"` : ''}${
          node.hanging ? ` w:hanging="${node.hanging}"` : ''
        }/>`
      : '') +
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
  // The table's own box. `columnWidths` are fractions of *this*, not of the page, so a
  // narrowed table keeps its column proportions.
  const tableWidth = Math.max(1, Math.round(node.width * CONTENT_WIDTH_TWIPS));
  const tableIndent = Math.round(node.indent * CONTENT_WIDTH_TWIPS);

  const columnWidths = (() => {
    const widths = node.columnWidths.map((fraction) =>
      Math.max(1, Math.round(fraction * tableWidth)),
    );
    if (widths.length === 0) return widths;
    const drift = tableWidth - widths.reduce((sum, value) => sum + value, 0);
    widths[widths.length - 1] += drift;
    return widths;
  })();

  /** The width of a cell spanning `span` columns from `index`. */
  const spanWidth = (index: number, span: number) =>
    columnWidths.slice(index, index + span).reduce((sum, value) => sum + value, 0) ||
    columnWidths[index] ||
    Math.floor(tableWidth / Math.max(1, node.columnCount));

  const grid =
    '<w:tblGrid>' +
    columnWidths.map((width) => `<w:gridCol w:w="${width}"/>`).join('') +
    '</w:tblGrid>';

  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="6" w:space="0" w:color="000000"/>`;

  const tblPr =
    '<w:tblPr>' +
    '<w:tblStyle w:val="TableNormal"/>' +
    `<w:tblW w:w="${tableWidth}" w:type="dxa"/>` +
    /*
     * Alignment and indent are alternatives, and the IR has already made them exclusive:
     * `resolveTableBox` reports indent 0 for anything but `left`, so at most one of these
     * two lines emits. That is what Q19 of the reference paper does — `w:jc` with no
     * `w:tblInd` — while its six sibling tables carry the indent and no `w:jc`.
     *
     * `left` writes nothing at all, being Word's own default, so a table nobody has
     * aligned exports byte-identically to what it did before alignment existed.
     */
    (node.align !== 'left' ? `<w:jc w:val="${node.align}"/>` : '') +
    // Emitted only when the table is actually inset, so a full-width table's XML is
    // unchanged from before outer edges could be dragged.
    (tableIndent > 0 ? `<w:tblInd w:w="${tableIndent}" w:type="dxa"/>` : '') +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblBorders>' +
    /*
     * A boxed stimulus rules its frame and nothing inside it.
     *
     * `w:val="none"` rather than omitting the inner elements: Word inherits an unstated
     * border from the table style, so leaving them out draws the grid the box exists to
     * suppress. The frame's four sides are unchanged, which is what keeps an ordinary
     * table byte-identical.
     */
    ['top', 'left', 'bottom', 'right'].map(border).join('') +
    ['insideH', 'insideV']
      .map((side) =>
        node.borders === 'box'
          ? `<w:${side} w:val="none" w:sz="0" w:space="0" w:color="auto"/>`
          : border(side),
      )
      .join('') +
    '</w:tblBorders>' +
    '</w:tblPr>';

  const rows = node.rows
    .map((row, rowIndex) => {
      // No `w:tblHeader`, and no shading or bold: an HKDSE table is uniform, plain-ruled
      // cells throughout (§tables). Emphasis is per-cell formatting like any other text.
      const minHeight = node.rowHeights[rowIndex];
      const trPr =
        '<w:trPr>' +
        // Never split a row across pages (§7.6).
        '<w:cantSplit/>' +
        // `atLeast`, never `exact`: a dragged height is a floor, so a row whose text
        // needs more space still grows and nothing typed later is clipped.
        (minHeight !== undefined
          ? `<w:trHeight w:val="${Math.round(minHeight)}" w:hRule="atLeast"/>`
          : '') +
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

          // A picture inside the cell, as its own paragraph under the text — a cell's
          // first paragraph carries the words, and a drawing needs the `lineRule="auto"`
          // that `pictureXml` sets and `cellParagraph` cannot.
          const picture =
            !coveredVertically && cell.image
              ? pictureXml(
                  {
                    src: cell.image.src,
                    widthPx: cell.image.widthPx,
                    heightPx: cell.image.heightPx,
                    altText: cell.image.altText,
                    align: 'center',
                  },
                  context,
                )
              : '';

          return (
            `<w:tc><w:tcPr>${props.join('')}</w:tcPr>` +
            cellParagraph(runs, cell.align, cell.format) +
            picture +
            '</w:tc>'
          );
        })
        .join('');

      return `<w:tr>${trPr}${cells}</w:tr>`;
    })
    .join('');

  const above = node.captionPlacement === 'above';

  const caption = node.caption
    ? paragraph({
        styleId: STYLE_IDS['Table Caption'],
        runs: biTextRuns(node.caption, context.fonts, context.language),
        // Above the table it must keep with the table below it, or the page can break
        // between a heading and the rows it names.
        keepNext: above ? true : node.keepNext,
      })
    : '';

  // A table must be followed by a paragraph; Word requires it and it also gives the
  // table somewhere to attach keep-with-next behaviour. This stays *after* the table
  // whichever side the caption takes — it is a structural requirement of the format,
  // not part of the caption group.
  const spacer = paragraph({
    styleId: STYLE_IDS.Body,
    runs: '',
    keepNext: node.keepNext,
  });

  const table = `<w:tbl>${tblPr}${grid}${rows}</w:tbl>`;
  return above ? `${caption}${table}${spacer}` : `${table}${caption}${spacer}`;
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
    captionPlacement?: CaptionPlacement;
    keepNext?: boolean;
    align?: TableAlign;
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

  const above = node.captionPlacement === 'above';

  const imageParagraph =
    '<w:p><w:pPr>' +
    `<w:pStyle w:val="${STYLE_IDS.Body}"/>` +
    // A picture is placed by `w:jc` on its own paragraph — there is no alignment
    // property on the drawing itself. Centre is the default rather than `left` because
    // every figure in the reference papers is centred; `align` only records a teacher
    // who chose otherwise, so untouched documents keep exporting exactly as before.
    `<w:jc w:val="${node.align ?? 'center'}"/>` +
    // The picture's line must be allowed to grow to the picture.
    //
    // Every other paragraph carries the document's fixed 12pt line
    // (`w:line="240" w:lineRule="exact"`, inherited from the Body style) because that
    // exact box is what keeps a bilingual page on one rhythm through CJK glyphs and
    // mixed run sizes. `exact` does not grow — it *clips* — and a picture is the one
    // thing in the document that is taller than a line by design: a 300px diagram is
    // ~225pt asking to live in a 12pt box. Word drew the 12pt slice and painted the
    // rest behind the text above it, so the figure was invisible on the page while
    // still selectable at full size — the geometry, the PNG bytes and the relationship
    // were all correct, and only the line box was wrong.
    //
    // `auto` is also what Word itself writes for an inline picture, so a teacher who
    // edits and re-saves the file round-trips this paragraph unchanged. The vertical
    // rhythm around the figure is unaffected: separation is a blank line either side
    // (§one fixed line, no paragraph spacing), never spacing on this paragraph.
    '<w:spacing w:line="240" w:lineRule="auto"/>' +
    // A picture keeps with what follows when something follows it that belongs to it —
    // a caption printed *below*. With the caption above, the picture is the last thing
    // in the group and only `keepNext` from the caller applies.
    (node.keepNext || (node.caption && !above) ? '<w:keepNext/>' : '') +
    '</w:pPr>' +
    `<w:r>${drawing}</w:r>` +
    '</w:p>';

  const caption = node.caption
    ? paragraph({
        styleId: STYLE_IDS['Image Caption'],
        runs: biTextRuns(node.caption, context.fonts, context.language),
        // A caption above must keep with the picture under it, or Word will happily
        // break the page between a heading and the figure it names — which is exactly
        // the orphan the placement was chosen to avoid.
        keepNext: above ? true : node.keepNext,
      })
    : '';

  return above ? caption + imageParagraph : imageParagraph + caption;
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

/**
 * The cover page, as a two-column Word section (§ `model/cover.ts`).
 *
 * The reference's own mechanism, and the only one that produces the shape: the cover is
 * a section with `w:cols w:num="2" w:equalWidth="0"`, and a **continuous section break**
 * at the end of it returns the body to one column. So the cover's own geometry is
 * carried by a `sectPr` inside the last cover paragraph — which is where Word stores the
 * properties of the section a paragraph *ends*, not the one it begins.
 *
 * A `w:br w:type="column"` moves from the left column to the right; there is no
 * "position this in the right column" property, because Word columns are a flow.
 * Everything before the break lands left, everything after lands right — which is why the
 * regions are emitted in exactly that order.
 */
export function coverXml(cover: CoverRenderNode, context: BodyContext): string {
  const chunks: string[] = [];

  const region = (nodes: RenderNode[]) => {
    for (const node of nodes) chunks.push(renderNodeXml(node, context));
  };

  // ---- left column -------------------------------------------------------
  /*
   * The corner block **floats**; it is not in the text flow.
   *
   * The reference anchors a `wgp` group at (-0.65in, -0.25in) — outside the text column,
   * in the page's top-left corner — holding a textbox of the code lines and the diagonal
   * beside it. That position is the point of the block: it hangs off the corner of the
   * sheet, above and left of where any paragraph could start.
   *
   * Emitting the lines as ordinary paragraphs (which this did first) put them *in* the
   * column, so they pushed the identity lines down the page and could never reach the
   * corner. One anchored group reproduces it and costs the flow nothing.
   */
  if (cover.corner.length > 0) {
    chunks.push(cornerGroupXml(cover, context));
    /*
     * Headroom for the floated block.
     *
     * A `wrapNone` anchor reserves no space, which is the point — but it also means the
     * flow starts at the top of the column and the identity lines print *through* the
     * corner block. The reference leaves the same room with blank paragraphs (its cover
     * has eight before the authority lines). Sized to the group's own height so the two
     * always agree.
     */
    for (let i = 0; i < CORNER_CLEARANCE_LINES; i += 1) chunks.push(blankParagraph(context));
  }

  region(cover.head);
  if (cover.head.length > 0) chunks.push(blankParagraph(context));

  region(cover.instructions);

  if (cover.foot.length > 0) {
    chunks.push(blankParagraph(context));
    region(cover.foot);
  }

  // ---- right column ------------------------------------------------------
  if (cover.panel.present) {
    // The column break is what puts the panel on the right; nothing else can.
    chunks.push('<w:p><w:r><w:br w:type="column"/></w:r></w:p>');
    // The rule dividing the two columns, drawn as a shape (§ `coverRuleXml`).
    chunks.push(coverRuleXml(cover, context));
    if (cover.panel.note) {
      // A bordered single-cell table is how a framed note is drawn — the same `box`
      // treatment a stimulus gets, so it needs no new vocabulary.
      chunks.push(framedNoteXml(cover.panel.note, context, cover.columns.right));
      chunks.push(blankParagraph(context));
    }
    if (cover.panel.fieldLabel || cover.panel.boxes > 0) {
      chunks.push(panelBoxesXml(cover.panel, context));
    }
  }

  /*
   * The section break that ends the cover.
   *
   * `w:type="continuous"` rather than `nextPage`, because the *page* break is the
   * caller's job (a cover ends its sheet whether or not the columns change) and a
   * `nextPage` here would emit a second blank sheet between them.
   */
  const columns =
    `<w:cols w:num="2" w:equalWidth="0" w:space="${cover.columns.gap}">` +
    `<w:col w:w="${cover.columns.left}" w:space="${cover.columns.gap}"/>` +
    `<w:col w:w="${cover.columns.right}"/>` +
    '</w:cols>';

  chunks.push(
    '<w:p><w:pPr><w:sectPr>' +
      (cover.panel.present ? columns : '<w:cols w:space="708"/>') +
      '<w:type w:val="continuous"/>' +
      '</w:sectPr></w:pPr></w:p>',
  );

  return chunks.join('');
}

/** An empty paragraph on the page's own line box — the one way to open vertical air. */
function blankParagraph(context: BodyContext): string {
  return renderNodeXml({ kind: 'text', style: 'Body', text: { en: [], zh: [] } }, context);
}

/**
 * A framed note: one bordered cell, the `box` treatment a boxed stimulus already uses.
 *
 * Width is **pinned to the column**, not `auto`. A table inside a Word column still
 * measures itself against the section's full text width unless told otherwise, so `auto`
 * drew a frame that ran off the right edge of the page.
 */
function framedNoteXml(note: RenderNode, context: BodyContext, width: number): string {
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right']
      .map((edge) => `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`)
      .join('') +
    '</w:tblBorders></w:tblPr>' +
    `<w:tr><w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>` +
    renderNodeXml(note, context) +
    '</w:tc></w:tr></w:tbl>' +
    // Word requires a paragraph after a table, or the next one merges into it.
    blankParagraph(context)
  );
}

/**
 * The label and its row of write-in boxes.
 *
 * A real table, unlike everything else on the cover: the boxes are *cells with borders*,
 * which is the one thing tab stops cannot draw.
 */
function panelBoxesXml(panel: CoverPanelRender, context: BodyContext): string {
  if (panel.boxes <= 0) {
    return panel.fieldLabel ? renderNodeXml(panel.fieldLabel, context) : '';
  }

  const label = panel.fieldLabel
    ? '<w:tc><w:tcPr><w:tcW w:w="1554" w:type="dxa"/><w:tcBorders>' +
      ['top', 'left', 'bottom', 'right']
        .map((edge) => `<w:${edge} w:val="nil"/>`)
        .join('') +
      '</w:tcBorders></w:tcPr>' +
      renderNodeXml(panel.fieldLabel, context) +
      '</w:tc>'
    : '';

  const boxes = Array.from({ length: panel.boxes })
    .map(
      () =>
        '<w:tc><w:tcPr><w:tcW w:w="340" w:type="dxa"/></w:tcPr>' +
        blankParagraph(context) +
        '</w:tc>',
    )
    .join('');

  return (
    '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((edge) => `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`)
      .join('') +
    '</w:tblBorders>' +
    '<w:tblLayout w:type="fixed"/></w:tblPr>' +
    `<w:tr>${label}${boxes}</w:tr></w:tbl>` +
    blankParagraph(context)
  );
}


/**
 * Blank lines reserving room for the floated corner block.
 *
 * The group is 1.72in tall and hangs 0.25in above the text, so ~1.5in of it overlaps the
 * column — nine 12pt lines. Expressed in lines rather than a spacing value because the
 * page runs on a fixed line box and separation costs a line (§ one fixed line).
 */
const CORNER_CLEARANCE_LINES = 9;

/** EMU per twip: 914400 EMU per inch, 1440 twips per inch. */
const EMU_PER_TWIP = 635;

/**
 * The vertical rule dividing a cover's two columns.
 *
 * **Not** a column separator, a page border or a paragraph border — the reference draws
 * none of those. It is an anchored `prstGeom prst="line"` connector of zero width and
 * full page height, offset just left of the right column:
 *
 * ```
 * <wp:extent cx="0" cy="8058150"/>        0 x 8.81in
 * <a:ln w="19050">                        1.5pt solid black
 * <wp:positionH><wp:posOffset>-151130     0.165in left of the column
 * ```
 *
 * Worth spelling out because every cheaper mechanism was tried by the file's authors and
 * rejected: `w:cols` has a `w:sep` flag and the reference does not set it (it draws a
 * hairline at a fixed position Word chooses), `w:pgBorders` frames the whole sheet, and a
 * `w:pBdr` follows one paragraph rather than the column. A shape is the only one of the
 * four that puts a line of a chosen weight down the full height of a column.
 *
 * The preview draws the same line as a `border-left` on the right column, which lands in
 * the same place — this is the one piece of cover geometry where the two backends use
 * genuinely different mechanisms to reach the same picture.
 */
function coverRuleXml(cover: CoverRenderNode, context: BodyContext): string {
  // Full text height: the page's own height less its margins is not known here, so the
  // reference's own 8.81in is the height a cover rule runs to.
  const heightEmu = 8058150;
  // Half the gap, so the rule sits midway between the columns rather than against either.
  const offsetEmu = Math.round((cover.columns.gap / 2) * EMU_PER_TWIP);

  return lineShapeXml(context, {
    x: -offsetEmu,
    y: 0,
    cx: 0,
    cy: heightEmu,
    // 19050 EMU = 1.5pt, the reference's own weight for the column divider.
    weight: 19050,
    name: 'Cover rule',
  });
}

/**
 * The corner code block: a floating group of a textbox and a diagonal.
 *
 * This is the reference's own structure, read out of its `document.xml`:
 *
 * ```
 * <wp:anchor>  positionH -0.65in, positionV -0.25in   (outside the text column)
 *   <wpg:wgp>  chExt 2725 x 2710                      (child coordinate space)
 *     <wps:wsp prst="rect">  off 0,312  ext 1520x1350  — the code lines
 *     <wps:wsp prst="line">  off 0,0    ext 2725x2710  — the diagonal, flipH
 * ```
 *
 * A group rather than two separate anchors, because the textbox and the line are one
 * object on the page: the diagonal is positioned *relative to the text it crosses*, so
 * moving the block must carry both. The child coordinate space is what lets those
 * relative positions stay in the reference's own numbers rather than being recomputed
 * into EMU by hand.
 *
 * The textbox has `noFill` and no outline — it is a positioning device, not a visible
 * box.
 */
function cornerGroupXml(cover: CoverRenderNode, context: BodyContext): string {
  const id = context.nextDrawingId();
  // The reference's own extents, so the block sits where its does.
  const groupW = 1730375;
  const groupH = 1720850;
  const childW = 2725;
  const childH = 2710;

  const lines = cover.corner
    .map((node) => renderNodeXml(node, context))
    .join('');

  const textBox =
    '<wps:wsp><wps:cNvPr id="' +
    (id + 1) +
    '" name="Corner text"/><wps:cNvSpPr txBox="1"/>' +
    '<wps:spPr bwMode="auto">' +
    /*
     * Wide enough for the longest code line, which is the whole job of this box.
     *
     * At the reference's own 1520 (of a 2725 child space, ~0.94in) "2025-26" and
     * "PAPER 1" both wrapped onto two lines — its own code lines are shorter
     * ("2019-DSE", "ECON", "PAPER 2" at 9pt). A placeholder a teacher types over can be
     * longer than that, so the box takes the room and the diagonal starts past it.
     */
    `<a:xfrm><a:off x="0" y="312"/><a:ext cx="1900" cy="1350"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    // Invisible: the box positions the text, it is not itself drawn.
    '<a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>' +
    `<wps:txbx><w:txbxContent>${lines}</w:txbxContent></wps:txbx>` +
    '<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" ' +
    'anchor="t" anchorCtr="0"><a:noAutofit/></wps:bodyPr></wps:wsp>';

  const diagonal = cover.cornerRule
    ? '<wps:wsp><wps:cNvPr id="' +
      (id + 2) +
      '" name="Corner rule"/><wps:cNvCnPr/>' +
      '<wps:spPr bwMode="auto">' +
      /*
       * Bottom-left to top-right, which takes **`flipV`**.
       *
       * A DrawingML `line` runs from its box's top-left corner to the bottom-right; a
       * flip in either axis mirrors that into the other diagonal. Which flag to use is
       * not worth reasoning about — it was settled by measuring both.
       *
       * Reference scan: as y goes 30 -> 130 (down the page), x goes 222 -> 122 (left).
       * `flipV` export: as y goes 140 -> 220, x goes 304 -> 231. Same direction, so
       * `flipV` is the one. (`flipH` produced the mirror image, which is what shipped
       * once and read as a backslash.)
       */
      // Starts past the widest code line, so it separates the block from the page rather
      // than striking through the paper's own name. `childW - 1900` is exactly the room
      // the textbox above does not use.
      // Ends above the identity lines: the textbox occupies 312..1662 of the child space,
      // so the diagonal runs the same band and cannot reach into the flow below it. Full
      // height let its tail cross the first identity line on Paper 2, whose narrower
      // column starts higher.
      `<a:xfrm flipV="1"><a:off x="1900" y="150"/><a:ext cx="${childW - 1900}" cy="1550"/></a:xfrm>` +
      '<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:noFill/>' +
      // 38100 EMU = 3pt, twice the column rule's weight, as the reference has it.
      '<a:ln w="38100"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:round/></a:ln>' +
      '</wps:spPr><wps:bodyPr/></wps:wsp>'
    : '';

  return (
    `<w:p><w:pPr><w:pStyle w:val="${STYLE_IDS.Body}"/>` +
    '<w:spacing w:line="20" w:lineRule="exact"/></w:pPr>' +
    '<w:r><w:drawing>' +
    '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" ' +
    'relativeHeight="251633664" behindDoc="0" locked="0" layoutInCell="0" allowOverlap="1">' +
    '<wp:simplePos x="0" y="0"/>' +
    // Outside the text column, in the corner of the sheet — the whole point of the block.
    '<wp:positionH relativeFrom="column"><wp:posOffset>-591185</wp:posOffset></wp:positionH>' +
    '<wp:positionV relativeFrom="paragraph"><wp:posOffset>-230505</wp:posOffset></wp:positionV>' +
    `<wp:extent cx="${groupW}" cy="${groupH}"/>` +
    '<wp:effectExtent l="19050" t="19050" r="22225" b="31750"/><wp:wrapNone/>' +
    `<wp:docPr id="${id}" name="Corner block ${id}"/>` +
    '<wp:cNvGraphicFramePr/>' +
    '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">' +
    '<wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr bwMode="auto">' +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${groupW}" cy="${groupH}"/>` +
    `<a:chOff x="0" y="0"/><a:chExt cx="${childW}" cy="${childH}"/></a:xfrm></wpg:grpSpPr>` +
    textBox +
    diagonal +
    '</wpg:wgp>' +
    '</a:graphicData></a:graphic></wp:anchor>' +
    '</w:drawing></w:r></w:p>'
  );
}

/**
 * One straight line, as an anchored DrawingML shape.
 *
 * The cover's two rules — the column divider and the corner diagonal — are both lines of
 * a chosen weight at a chosen place, which is the one thing Word's border vocabulary
 * cannot express (§ `coverRuleXml`). A shape carries **no relationship**, unlike an
 * image, so an incorrect one prints wrong rather than making Word report the whole file
 * as needing repair.
 */
function lineShapeXml(
  context: BodyContext,
  shape: {
    x: number;
    y: number;
    cx: number;
    cy: number;
    weight: number;
    flipH?: boolean;
    name: string;
  },
): string {
  const id = context.nextDrawingId();
  return (
    `<w:p><w:pPr><w:pStyle w:val="${STYLE_IDS.Body}"/>` +
    '<w:spacing w:line="20" w:lineRule="exact"/></w:pPr>' +
    '<w:r><w:drawing>' +
    '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" ' +
    'relativeHeight="251634688" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">' +
    '<wp:simplePos x="0" y="0"/>' +
    `<wp:positionH relativeFrom="column"><wp:posOffset>${shape.x}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${shape.y}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${shape.cx}" cy="${shape.cy}"/>` +
    '<wp:effectExtent l="0" t="0" r="19050" b="19050"/><wp:wrapNone/>' +
    `<wp:docPr id="${id}" name="${shape.name} ${id}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks/></wp:cNvGraphicFramePr>' +
    '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
    '<wps:wsp><wps:cNvCnPr/><wps:spPr bwMode="auto">' +
    `<a:xfrm${shape.flipH ? ' flipH="1"' : ''}>` +
    `<a:off x="0" y="0"/><a:ext cx="${shape.cx}" cy="${shape.cy}"/></a:xfrm>` +
    '<a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:noFill/>' +
    `<a:ln w="${shape.weight}"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:round/></a:ln>` +
    '</wps:spPr><wps:bodyPr/></wps:wsp>' +
    '</a:graphicData></a:graphic></wp:anchor>' +
    '</w:drawing></w:r></w:p>'
  );
}
