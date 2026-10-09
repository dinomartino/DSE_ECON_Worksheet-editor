import { plain, runLines } from '@/model/text';
import { cssFontFamilies } from '@/model/fonts';
import { contentWidth, DEFAULT_PAGE_SETUP, pageSetupOf, twipsToPt } from '@/model/page';
import { answerGraphBox } from '@/render/answerGraph';
import type {
  BiText,
  FontPair,
  LanguageMode,
  OutputMode,
  TextFormat,
  Worksheet,
} from '@/model/types';
import {
  bandCellHasPageNumber,
  bandCellPieces,
  bandCellSides,
  bandZones,
  trailLabel,
  type ColumnsNode,
  type EditTarget,
  type RenderNode,
  type TextNode,
} from '@/render/ir';
import { renderWorksheet } from '@/render/worksheet';
import { renderAnswerKey } from '@/render/answerKey';
import type { DiagramImageMap } from './diagramImage';

/**
 * Clipboard "Copy for Word" (§7.7).
 *
 * Consumes the same render IR as the .docx exporter, so content, ordering and
 * teacher-only filtering match exactly. Clipboard HTML cannot carry Word numbering
 * definitions, so numbering is written as literal text here — the PRD explicitly
 * accepts that, with the .docx remaining the fidelity gold standard.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function richHtml(text: BiText | undefined, language: LanguageMode): string {
  if (!text) return '';
  const side = (runs: BiText['en']) =>
    runs
      .map((runItem) => {
        // A hard line break (Shift+Enter, stored as `\n`) has to become a real `<br/>`:
        // a literal newline is whitespace in HTML and would paste as a space.
        // Escaped first, so the tag inserted here is the only markup in the output.
        let html = runLines(escapeHtml(runItem.text)).join('<br/>');
        if (runItem.vertAlign === 'superscript') return `<sup>${html}</sup>`;
        if (runItem.vertAlign === 'subscript') return `<sub>${html}</sub>`;
        if (runItem.bold) html = `<b>${html}</b>`;
        if (runItem.italic) html = `<i>${html}</i>`;
        if (runItem.underline) html = `<u>${html}</u>`;
        // A run's own size, colour and font, matching `richTextRuns` in the .docx
        // backend — pasting into Word must carry the same per-run formatting the
        // exported file would.
        const styles: string[] = [];
        if (runItem.fontSize !== undefined) styles.push(`font-size:${runItem.fontSize}pt;`);
        if (runItem.color) styles.push(`color:#${runItem.color};`);
        if (runItem.fonts) {
          styles.push(`font-family:${cssFontFamilies(runItem.fonts, "'", ',')};`);
        }
        if (styles.length) html = `<span style="${styles.join('')}">${html}</span>`;
        return html;
      })
      .join('');

  if (language === 'en') return side(text.en);
  if (language === 'zh') return side(text.zh);

  const en = text.en.length ? side(text.en) : '';
  const zh = text.zh.length ? side(text.zh) : '';
  return en && zh ? `${en}<br/>${zh}` : en || zh;
}

/** Inline styles per node style; Word's HTML paste honours these. */
const NODE_CSS: Record<string, string> = {
  'Worksheet Title': 'font-size:16pt;font-weight:bold;text-align:center;',
  Instructions: 'font-style:italic;',
  'Section Heading': 'font-size:14pt;font-weight:bold;',
  'Question Stem': '',
  Statement: 'margin-left:24pt;',
  'MCQ Option': 'margin-left:24pt;',
  'Sub-question': 'margin-left:24pt;',
  'Sub-sub-question': 'margin-left:48pt;',
  Marks: 'text-align:right;',
  'Table Caption': 'font-size:10pt;font-style:italic;text-align:center;',
  'Image Caption': 'font-size:10pt;font-style:italic;text-align:center;',
  Answer: 'font-weight:bold;color:#C00000;',
  'Marking Scheme': 'color:#1F4E79;margin-left:18pt;',
  Body: '',
};

function marksLabel(marks: number, language: LanguageMode): string {
  const en = `(${marks} ${marks === 1 ? 'mark' : 'marks'})`;
  const zh = `（${marks}分）`;
  if (language === 'en') return en;
  if (language === 'zh') return zh;
  return `${en} ${zh}`;
}

/** The right-hand label: the marks, else a scheme's `trail` (§ `TextNode.trail`). */
function textNodeLabel(node: TextNode, language: LanguageMode): string {
  if (node.marks !== undefined) return marksLabel(node.marks, language);
  return node.trail ? trailLabel(node.trail, language) : '';
}

/** Per-element overrides as inline CSS, mirroring the docx direct formatting. */
export function formatCss(format: TextFormat | undefined): string {
  if (!format) return '';
  const parts: string[] = [];
  if (format.fontSize !== undefined) parts.push(`font-size:${format.fontSize}pt;`);
  if (format.bold !== undefined) parts.push(`font-weight:${format.bold ? 'bold' : 'normal'};`);
  if (format.italic !== undefined) parts.push(`font-style:${format.italic ? 'italic' : 'normal'};`);
  if (format.underline !== undefined)
    parts.push(`text-decoration:${format.underline ? 'underline' : 'none'};`);
  if (format.align) parts.push(`text-align:${format.align};`);
  if (format.color) parts.push(`color:#${format.color};`);
  if (format.spaceBefore !== undefined) parts.push(`margin-top:${format.spaceBefore}pt;`);
  if (format.spaceAfter !== undefined) parts.push(`margin-bottom:${format.spaceAfter}pt;`);
  if (format.fonts) parts.push(`font-family:${cssFontFamilies(format.fonts, "'", ',')},serif;`);
  return parts.join('');
}

function textNodeHtml(node: TextNode, language: LanguageMode, fontCss: string): string {
  // Overrides come last so they win over the named style's defaults.
  const css = `${fontCss}${NODE_CSS[node.style] ?? ''}${
    node.indent ? `margin-left:${node.indent / 20}pt;` : ''
  }${node.marksColumn ? `padding-right:${node.marksColumn / 20}pt;` : ''}${formatCss(node.format)}`;
  // Numbering becomes literal text, which is the accepted tradeoff for clipboard.
  const marker = node.listRef ? `${escapeHtml(node.listRef.marker)}&nbsp;` : '';
  const body = richHtml(node.text, language);
  const label = textNodeLabel(node, language);
  // In a Marks column the label floats into the paragraph's right padding.
  const column = node.marksColumn ? `;margin-right:-${node.marksColumn / 20}pt` : '';
  const marks = label ? `<span style="float:right${column}">${escapeHtml(label)}</span>` : '';
  return `<p style="${css}">${marks}${marker}${body}</p>`;
}

function nodeHtml(
  node: RenderNode,
  language: LanguageMode,
  fontCss: string,
  diagramImages: DiagramImageMap = new Map(),
  /** The live text column; only a graph answer space reads it (§ `answerGraphBox`). */
  textWidthTwips: number = contentWidth(DEFAULT_PAGE_SETUP),
): string {
  if (node.kind === 'text') return textNodeHtml(node, language, fontCss);

  if (node.kind === 'answerGraph') {
    // Its PNG from the same pre-pass map, at the size the `.docx` places it; the
    // paragraph is the box's full height, so the paste keeps the room.
    const src = diagramImages.get(node.key);
    if (!src) return '';
    const box = answerGraphBox(node, textWidthTwips);
    return (
      `<p style="text-align:${node.widthShare < 1 ? 'center' : 'left'};margin:0;` +
      `line-height:${(box.boxHeightPx * 3) / 4}pt"><img src="${src}" width="${box.widthPx}" ` +
      `height="${box.imageHeightPx}" alt="Blank axes"/></p>`
    );
  }

  if (node.kind === 'table') {
    const rows = node.rows
      .map((row, rowIndex) => {
        const cells = row
          .map((cell) => {
            if (cell.covered) return '';
            // Every cell is a plain `td`: uniform borders, no shading or bold, which is
            // what an HKDSE table looks like (§tables). A `th` would also re-introduce
            // the browser's own bold-and-centred default on paste.
            //
            // Padding comes from the IR already resolved, so a row's or column's setting
            // reaches the clipboard as the same winner the `.docx` flattens onto `w:tcMar`.
            const pad = cell.padding;
            /*
             * A T-account's own edges (§`TableCellEdges`), resolved in the IR so this
             * paints the identical table the `.docx` and the preview draw. Every side is
             * stated, `none` included: a pasted table lands in a document with its own
             * table styling, and an unstated edge inherits it.
             */
            const edges = cell.edges;
            const style =
              (edges
                ? `border-top:${edges.top ? '1px solid #000' : 'none'};` +
                  `border-left:${edges.left ? '1px solid #000' : 'none'};` +
                  `border-bottom:${edges.bottom ? '1px solid #000' : 'none'};` +
                  `border-right:${edges.right ? '1px solid #000' : 'none'};`
                : // A boxed stimulus rules its frame only; the frame itself is on the
                  // `<table>` below, so the cells inside carry no rule of their own.
                  node.borders === 'box'
                  ? 'border:none;'
                  : 'border:1px solid #000;') +
              `padding:${twipsToPt(pad.top)}pt ${twipsToPt(pad.right)}pt ` +
              `${twipsToPt(pad.bottom)}pt ${twipsToPt(pad.left)}pt;` +
              // The "does not apply" slash, bottom-left to top-right as everywhere else
              // (§`TableCell.diagonal`). Word keeps a pasted background gradient, so this
              // survives the paste that matters.
              (cell.diagonal
                ? 'background-image:linear-gradient(to bottom right,transparent calc(50% - 0.5px),' +
                  '#000 calc(50% - 0.5px),#000 calc(50% + 0.5px),transparent calc(50% + 0.5px));'
                : '') +
              `text-align:${cell.align};${cell.vAlign ? `vertical-align:${cell.vAlign};` : ''}${formatCss(cell.format)}`;
            const span =
              (cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '') +
              (cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '');
            // A picture inside the cell prints under its words, centred — the boxed
            // stimulus that frames an extract and a photograph together.
            const cellImage = cell.image
              ? `<p style="text-align:center;margin:0"><img src="${cell.image.src}" ` +
                `width="${cell.image.widthPx}" height="${cell.image.heightPx}" ` +
                `alt="${escapeHtml(plain(cell.image.altText.en) || plain(cell.image.altText.zh) || 'Image')}"/></p>`
              : '';
            const body = (richHtml(cell.text, language) || (cellImage ? '' : '&nbsp;')) + cellImage;
            return `<td style="${style}"${span}>${body}</td>`;
          })
          .join('');
        const minHeight = node.rowHeights[rowIndex];
        // A floor, matching `w:trHeight hRule="atLeast"`, so pasted content can still
        // grow the row rather than being clipped by it.
        const height =
          minHeight !== undefined ? ` style="height:${twipsToPt(minHeight)}pt"` : '';
        return `<tr${height}>${cells}</tr>`;
      });
    const caption = node.caption
      ? `<p style="${fontCss}${NODE_CSS['Table Caption']}">${richHtml(node.caption, language)}</p>`
      : '';
    // A `colgroup` carries the widths, which is what Word's paste path reads to set the
    // grid; percentages so the table keeps its proportions in whatever document it lands
    // in, since the clipboard deliberately carries no page setup of its own.
    const colgroup =
      '<colgroup>' +
      node.columnWidths
        .map((fraction) => `<col style="width:${(fraction * 100).toFixed(3)}%"/>`)
        .join('') +
      '</colgroup>';
    // The table's own box as a percentage and a left margin. Percentages rather than
    // absolute widths because the clipboard carries no page setup of its own, so the
    // table has to keep its proportions in whatever document it is pasted into.
    // Alignment rides as `auto` margins, the same shape the preview uses and the same
    // thing Word means by `w:jc` — placed from the column's edges rather than from a
    // stored offset. `indent` is already 0 for anything but `left`, so only one applies.
    const box =
      `width:${(node.width * 100).toFixed(3)}%;` +
      (node.align === 'center'
        ? 'margin-left:auto;margin-right:auto;'
        : node.align === 'right'
          ? 'margin-left:auto;margin-right:0;'
          : node.indent > 0
            ? `margin-left:${(node.indent * 100).toFixed(3)}%;`
            : '');
    // The frame of a boxed stimulus. On the table rather than on the edge cells, so it
    // stays one unbroken rectangle however the rows are merged or spanned.
    const frame = node.borders === 'box' ? 'border:1px solid #000;' : '';
    // Heading rows go in a `thead`, which Word's paste turns into rows that repeat on
    // each page (`TableNode.headerRows`); a table without them is unchanged.
    const heading = node.headerRows ?? 0;
    const head = heading > 0 ? `<thead>${rows.slice(0, heading).join('')}</thead>` : '';
    const table =
      `<table style="border-collapse:collapse;${frame}${box}table-layout:fixed;${fontCss}">` +
      `${colgroup}${head}<tbody>${rows.slice(heading).join('')}</tbody></table>`;
    return node.captionPlacement === 'above' ? caption + table : table + caption;
  }

  if (node.kind === 'columns' && node.band) {
    return bandRowHtml(node, language, fontCss, textWidthTwips);
  }

  if (node.kind === 'columns') {
    // A borderless table: Word's paste keeps the column positions. Band rows (above)
    // paste as tab stops instead, the .docx's shape.
    const cells = node.cells
      .map((cell, index) => {
        const next = node.cells[index + 1];
        const width = ((next ? next.at - cell.at : 1 - cell.at) * 100).toFixed(1);
        const marker = cell.marker ? `${escapeHtml(cell.marker)}&nbsp;` : '';
        const style =
          `border:none;padding:0 4pt 0 0;vertical-align:top;width:${width}%;` +
          `text-align:${cell.align ?? 'left'};${formatCss(cell.format)}`;
        return `<td style="${style}">${marker}${richHtml(cell.text, language) || '&nbsp;'}</td>`;
      })
      .join('');
    const indent = node.indent ? `margin-left:${node.indent / 20}pt;` : '';
    const rule = node.rule ? 'border-bottom:1px solid #808080;' : '';
    return (
      `<table style="border-collapse:collapse;border:none;width:100%;${indent}${rule}${fontCss}` +
      `${NODE_CSS[node.style] ?? ''}"><tbody><tr>${cells}</tr></tbody></table>`
    );
  }

  if (node.kind === 'spacer') {
    return `<p style="height:${node.heightPt}pt;margin:0">&nbsp;</p>`;
  }

  if (node.kind === 'divider') {
    return '<hr style="border:none;border-top:1px solid #808080"/>';
  }

  if (node.kind === 'answerLines') {
    return Array.from(
      { length: Math.max(1, node.lines) },
      () => `<p style="${fontCss}border-bottom:1px solid #A6A6A6;margin:0 0 12pt 0">&nbsp;</p>`,
    ).join('');
  }

  if (node.kind === 'answerSpace') {
    // The dotted QAB line. Clipboard HTML cannot carry a Word underline-over-tab, so a
    // dotted bottom border is the nearest paste-safe spelling; the pitch matches the
    // .docx's exact line box (§ LQ_LINE_PITCH_TWIPS: 442tw ≈ 22.1pt → ~10pt of body
    // plus the border leaves the same rhythm once margins collapse).
    return Array.from(
      { length: Math.max(1, node.lines) },
      () => `<p style="${fontCss}border-bottom:1px dotted #000000;margin:0 0 10pt 0">&nbsp;</p>`,
    ).join('');
  }

  if (node.kind === 'pageBreak') {
    return '<p style="page-break-before:always"></p>';
  }

  if (node.kind === 'image' || node.kind === 'diagram') {
    // A diagram pastes as its rasterized PNG — one <img>, exactly like a picture — so
    // Word receives a single object rather than something it would have to reassemble.
    const src = node.kind === 'image' ? node.src : diagramImages.get(node.blockId);
    if (!src) return '';

    // A data: URI survives the paste into Word as an embedded image.
    const alt = escapeHtml(plain(node.altText.en) || plain(node.altText.zh) || 'Image');
    const picture =
      `<p style="text-align:${node.align}"><img src="${src}" width="${node.widthPx}" ` +
      `height="${node.heightPx}" alt="${alt}"/></p>`;

    // Only a picture has a caption beside it. A diagram's words are drawn inside its own
    // PNG, so it pastes as the image alone — there is nothing here that could arrive in
    // Word as a separate paragraph.
    if (node.kind === 'diagram') return picture;

    const caption = node.caption
      ? `<p style="${fontCss}${NODE_CSS['Image Caption']}">${richHtml(node.caption, language)}</p>`
      : '';
    return node.captionPlacement === 'above' ? caption + picture : picture + caption;
  }

  if (node.kind === 'source') {
    // A labelled source panel: a one-cell table, framed or not — the same shape the
    // .docx builds, and the only HTML that keeps a frame around mixed content when
    // pasted into Word.
    const body = node.nodes
      .map((child) => nodeHtml(child, language, fontCss, diagramImages))
      .join('');
    const frame = node.framed ? '1px solid #000' : 'none';
    // Lined up with its own label, not the page margin (§`SourceNode.indent`).
    const indent = node.indent ? `margin-left:${twipsToPt(node.indent)}pt;` : '';
    return (
      `<table style="border-collapse:collapse;border:${frame};${indent}">` +
      `<tr><td style="border:none;padding:6pt">${body}</td></tr></table>`
    );
  }

  if (node.kind === 'optionRow') {
    // A row of figure-bearing MCQ options: a borderless equal-cell table, top aligned
    // so the letters sit level — the same shape the .docx builds, and the only HTML
    // Word pastes side by side.
    const share = `${100 / Math.max(1, node.cells.length)}%`;
    const cells = node.cells
      .map(
        (cell) =>
          `<td style="border:none;vertical-align:top;padding:0;width:${share}">` +
          cell.map((child) => nodeHtml(child, language, fontCss, diagramImages)).join('') +
          '</td>',
      )
      .join('');
    return (
      '<table style="border-collapse:collapse;border:none;width:100%">' +
      `<tr>${cells}</tr></table>`
    );
  }

  if (node.kind === 'figureRow') {
    // A borderless two-cell layout table, vertically centred — the same shape the
    // .docx builds, because it is the only HTML Word pastes side by side.
    const figure = nodeHtml(node.figure, language, fontCss, diagramImages);
    const table = nodeHtml(node.table, language, fontCss, diagramImages);
    const cell = (content: string) =>
      `<td style="border:none;vertical-align:middle;padding:0">${content}</td>`;
    const cells =
      node.tableSide === 'left' ? cell(table) + cell(figure) : cell(figure) + cell(table);
    return (
      '<table style="border-collapse:collapse;border:none;width:100%">' +
      `<tr>${cells}</tr></table>`
    );
  }

  return '';
}

/**
 * One tab, as Word's HTML spells it. Word replaces the span with a tab; the tab character
 * inside is for apps that ignore `mso-tab-count` (LibreOffice pastes it as a tab).
 */
const TAB_HTML = "<span style='mso-tab-count:1'>&#9;</span>";

/**
 * A page number as a Word simple field (`mso-field-code`) whose shown text is 1: Word
 * pastes a live field, as the `.docx` exports one; any other app pastes the 1.
 */
function fieldHtml(field: 'PAGE' | 'NUMPAGES'): string {
  return `<span style='mso-field-code:" ${field} "'>1</span>`;
}

/** A field's text, page numbers as fields (§ `bandCellPieces`). */
function bandCellHtml(cell: ColumnsNode['cells'][number], language: LanguageMode): string {
  if (!bandCellHasPageNumber(cell)) return richHtml(cell.text, language);
  return bandCellSides(cell, language)
    .map((side) =>
      bandCellPieces(cell, side)
        .map((piece) =>
          'field' in piece ? fieldHtml(piece.field) : richHtml({ en: piece.text, zh: [] }, 'en'),
        )
        .join(''),
    )
    .join('<br/>');
}

/**
 * A band row as the `.docx` writes it (§ Bands and zones): one paragraph, a tab stop per
 * occupied centre or right zone, a tab before every zone but a left one, fields in a zone
 * one space apart. Word's HTML paste reads `tab-stops` and `mso-tab-count`.
 */
function bandRowHtml(
  node: ColumnsNode,
  language: LanguageMode,
  fontCss: string,
  textWidthTwips: number,
): string {
  const indent = node.indent ?? 0;
  const width = Math.max(720, textWidthTwips - indent);
  const zones = bandZones(node);
  const stops = zones
    .map((cells) => cells[0])
    .filter((cell) => cell.align === 'center' || cell.align === 'right')
    .map((cell) => `${cell.align} ${twipsToPt(Math.round(indent + cell.at * width))}pt`)
    .join(' ');
  const body = zones
    .map((cells) => {
      const align = cells[0].align ?? 'left';
      const lead = align === 'center' || align === 'right' ? TAB_HTML : '';
      const fields = cells
        .map((cell) => {
          const html = bandCellHtml(cell, language);
          const css = formatCss(cell.format);
          return html && css ? `<span style="${css}">${html}</span>` : html;
        })
        .filter(Boolean)
        .join(' ');
      // `data-zone` is inert in Word; the start screen's thumbnail places zones by it.
      return `${lead}<span data-zone="${align}">${fields}</span>`;
    })
    .join('');
  const css =
    `${fontCss}${NODE_CSS[node.style] ?? ''}` +
    (indent ? `margin-left:${indent / 20}pt;` : '') +
    (node.rule ? 'border-bottom:1px solid #808080;' : '') +
    (stops ? `tab-stops:${stops};` : '') +
    // Restated after `tab-stops`, which LibreOffice misreads as an alignment.
    'text-align:left;';
  return `<p data-band style="${css}">${body || '&nbsp;'}</p>`;
}

function fontCss(fonts: FontPair): string {
  return `font-family:${cssFontFamilies(fonts, "'", ',')},serif;font-size:12pt;`;
}

/** HTML for the whole worksheet, ready to paste into Word. */
export function worksheetClipboardHtml(
  worksheet: Worksheet,
  mode: OutputMode,
  diagramImages: DiagramImageMap = new Map(),
): string {
  const rendered = renderWorksheet(worksheet, mode);
  const css = fontCss(worksheet.fonts);
  const parts: string[] = [];
  const textWidth = contentWidth(pageSetupOf(worksheet));
  const html = (node: RenderNode) => nodeHtml(node, mode.language, css, diagramImages, textWidth);

  /*
   * The cover is deliberately not copied, by the same rule that keeps page setup and
   * headers out of this backend: pasting must not impose this document's page furniture
   * on the destination. A cover is exactly that — and clipboard HTML cannot carry any of
   * its mechanisms (a section's unequal columns, the anchored corner group, the
   * column-rule shape), so it could only arrive as a stack of bare paragraphs that reads
   * as lost content. The .docx export is the fidelity path and carries it.
   */

  // A masthead replaces the bare title, which is one of its own fields.
  if (rendered.bands.length > 0) {
    for (const band of rendered.bands) parts.push(html(band));
  } else if (rendered.title) {
    parts.push(html(rendered.title));
  }
  // No running header here, so the label prints even where the page's header names it.
  const versionLabel = rendered.versionLabel ?? rendered.headerVersionLabel;
  if (versionLabel) parts.push(html(versionLabel));
  if (mode.version === 'teacher') {
    parts.push(`<p style="${css}${NODE_CSS.Answer}text-align:center">Teacher Version / 教師版</p>`);
  }
  if (rendered.instructions) parts.push(html(rendered.instructions));

  for (const item of rendered.items) {
    const nodes = item.type === 'question' ? item.question.nodes : item.layout.nodes;
    for (const node of nodes) parts.push(html(node));
  }

  return wrapHtml(parts.join(''), css);
}

/**
 * HTML for a single question (per-question copy button, §7.7). `printedNumber` replaces
 * the number this worksheet derives on the question's own line: a question rendered out
 * of a one-question copy of its paper keeps the number it has in the paper.
 */
export function questionClipboardHtml(
  worksheet: Worksheet,
  questionId: string,
  mode: OutputMode,
  diagramImages: DiagramImageMap = new Map(),
  printedNumber?: number,
): string {
  const nodes = questionClipboardNodes(worksheet, questionId, mode, diagramImages, printedNumber);
  return wrapHtml(nodes.map((node) => node.html).join(''), fontCss(worksheet.fonts));
}

/** One top-level IR node of a question as clipboard HTML, and the id it names (`nodeTarget`). */
export interface ClipboardNodeHtml {
  html: string;
  target?: string;
}

/**
 * `questionClipboardHtml`'s body, node by node: joined, exactly its body. For a reader that
 * marks part of a question (the bank preview's "this part tests it" highlight, fed
 * `model/tagSlots.ts:slotHighlightIds` and `highlightedNodes`) without the clipboard ever
 * carrying the mark. Empty when the question is not in the worksheet.
 */
export function questionClipboardNodes(
  worksheet: Worksheet,
  questionId: string,
  mode: OutputMode,
  diagramImages: DiagramImageMap = new Map(),
  printedNumber?: number,
): ClipboardNodeHtml[] {
  const rendered = renderWorksheet(worksheet, mode);
  const css = fontCss(worksheet.fonts);
  const match = rendered.questions.find((entry) => entry.questionId === questionId);
  if (!match) return [];
  const nodes = printedNumber === undefined ? match.nodes : match.nodes.map((node) => withQuestionNumber(node, printedNumber));
  const width = contentWidth(pageSetupOf(worksheet));
  return nodes.map((node) => {
    const target = nodeTarget(node);
    const html = nodeHtml(node, mode.language, css, diagramImages, width);
    return target === undefined ? { html } : { html, target };
  });
}

/** The block, part or sub-part an edit target belongs to. */
function targetOwner(edit: EditTarget | undefined): string | undefined {
  if (!edit) return undefined;
  switch (edit.kind) {
    case 'blockText':
    case 'blockCaption':
    case 'sourceLabel':
    case 'sourceFootnote':
    case 'tableCell':
      return edit.blockId;
    case 'partAnswer':
      return edit.partId;
    case 'subPartAnswer':
      return edit.subPartId;
    default:
      return undefined;
  }
}

/**
 * The id a node names: the block it was rendered from, or for an answer the part or
 * sub-part it answers (`model/tagSlots.ts:TagSlotInfo`'s `blockIds` and `answerIds`).
 * Undefined for a node that names nothing (a gap, answer lines, a scheme).
 */
export function nodeTarget(node: RenderNode): string | undefined {
  switch (node.kind) {
    case 'text':
      return targetOwner(node.edit);
    case 'table':
    case 'image':
    case 'diagram':
    case 'figureRow':
    case 'source':
      return node.blockId;
    default:
      return undefined;
  }
}

/**
 * Which nodes a highlight covers, by each node's `target`: a node naming a highlighted id
 * starts or continues a run, a node naming nothing belongs with the node before it, and a
 * node naming anything else ends the run.
 */
export function highlightedNodes(targets: readonly (string | undefined)[], highlight: ReadonlySet<string>): boolean[] {
  let inRun = false;
  return targets.map((target) => {
    if (target !== undefined) inRun = highlight.has(target);
    return inRun;
  });
}

/** The question's own numbered line (`listRef.definition` 'question', level 0) carrying `number`. */
function withQuestionNumber(node: RenderNode, number: number): RenderNode {
  if (node.kind !== 'text' || node.listRef?.definition !== 'question' || node.listRef.level !== 0) return node;
  return { ...node, listRef: { ...node.listRef, marker: `${number}.` } };
}

function wrapHtml(body: string, css: string): string {
  // A full document with an explicit charset; Word's paste path is much happier
  // with this than with a bare fragment.
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    `<body style="${css}">${body}</body></html>`
  );
}

/** Plain-text fallback flavour. */
/** One node as plain-text lines, pushed onto `lines`. */
function pushPlain(lines: string[], node: RenderNode, language: LanguageMode): void {
  if (node.kind === 'text') {
    const marker = node.listRef ? `${node.listRef.marker} ` : '';
    const en = plain(node.text.en);
    const zh = plain(node.text.zh);
    const body = language === 'en' ? en : language === 'zh' ? zh : [en, zh].filter(Boolean).join(' / ');
    const label = textNodeLabel(node, language);
    const marks = label ? ` ${label}` : '';
    if (marker || body || marks) lines.push(`${marker}${body}${marks}`.trim());
  } else if (node.kind === 'table') {
    for (const row of node.rows) {
      lines.push(
        row
          .filter((cell) => !cell.covered)
          .map((cell) => plain(language === 'zh' ? cell.text.zh : cell.text.en))
          .join('\t'),
      );
    }
  } else if (node.kind === 'columns' && node.band) {
    // The band row's tabs (§ `bandRowHtml`): a page number prints its field's shown 1.
    const field = (cell: ColumnsNode['cells'][number]) =>
      bandCellSides(cell, language)
        .map((side) =>
          bandCellHasPageNumber(cell)
            ? bandCellPieces(cell, side)
                .map((piece) => ('field' in piece ? '1' : plain(piece.text)))
                .join('')
            : plain(cell.text[side]),
        )
        .join(' / ');
    lines.push(
      bandZones(node)
        .map((cells) => {
          const lead = cells[0].align === 'center' || cells[0].align === 'right' ? '\t' : '';
          return lead + cells.map(field).filter(Boolean).join(' ');
        })
        .join(''),
    );
  } else if (node.kind === 'columns') {
    // Tab-separated, matching how the docx lays the row out.
    lines.push(
      node.cells
        .map((cell) => {
          const text = plain(language === 'zh' ? cell.text.zh : cell.text.en);
          return cell.marker ? `${cell.marker} ${text}` : text;
        })
        .join('\t'),
    );
  } else if (node.kind === 'image' || node.kind === 'diagram') {
    const fallback = node.kind === 'diagram' ? 'Diagram' : 'Image';
    lines.push(`[${plain(node.altText.en) || plain(node.altText.zh) || fallback}]`);
  } else if (node.kind === 'answerGraph') {
    lines.push('[Blank axes]');
  } else if (node.kind === 'divider') {
    lines.push('---');
  } else if (node.kind === 'answerLines' || node.kind === 'answerSpace') {
    for (let i = 0; i < Math.max(1, node.lines); i += 1) lines.push('');
  } else if (node.kind === 'spacer' || node.kind === 'pageBreak') {
    lines.push('');
  }
}

/**
 * The answer key (`render/answerKey.ts`) as clipboard HTML: the Marking scheme view's
 * Copy for Word. The nodes the `.docx` key is built from; no page furniture, as ever.
 */
export function answerKeyClipboardHtml(
  worksheet: Worksheet,
  language: LanguageMode,
  diagramImages: DiagramImageMap = new Map(),
): string {
  const css = fontCss(worksheet.fonts);
  const width = contentWidth(pageSetupOf(worksheet));
  const body = renderAnswerKey(worksheet, language)
    .map((node) => nodeHtml(node, language, css, diagramImages, width))
    .join('');
  return wrapHtml(body, css);
}

/** One node's clipboard HTML. Exposed for the tests that prove edit targets are inert. */
export { nodeHtml as clipboardNodeHtml };

/** The answer key's plain-text flavour. */
export function answerKeyPlainText(worksheet: Worksheet, language: LanguageMode): string {
  const lines: string[] = [];
  for (const node of renderAnswerKey(worksheet, language)) pushPlain(lines, node, language);
  return lines.join('\n');
}

export function worksheetPlainText(worksheet: Worksheet, mode: OutputMode): string {
  const rendered = renderWorksheet(worksheet, mode);
  const lines: string[] = [];
  const push = (node: RenderNode) => pushPlain(lines, node, mode.language);

  if (rendered.bands.length > 0) rendered.bands.forEach(push);
  else if (rendered.title) push(rendered.title);
  const versionLabel = rendered.versionLabel ?? rendered.headerVersionLabel;
  if (versionLabel) push(versionLabel);
  if (rendered.instructions) push(rendered.instructions);
  for (const item of rendered.items) {
    (item.type === 'question' ? item.question.nodes : item.layout.nodes).forEach(push);
  }

  return lines.join('\n');
}

/**
 * Write both flavours to the clipboard. Falls back to plain text where the async
 * Clipboard API's `write` (with an HTML flavour) is unavailable.
 */
export async function copyForWord(html: string, text: string): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    return;
  }
  await navigator.clipboard.writeText(text);
}
