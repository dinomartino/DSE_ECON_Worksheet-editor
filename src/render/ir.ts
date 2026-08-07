import type { Diagram } from '@/model/diagram';
import type { ListIndentScheme } from '@/model/numbering';
import type {
  BandFieldSide,
  BiText,
  CaptionPlacement,
  CellAlign,
  CellImage,
  CellPadding,
  ContentBlock,
  DiagramBlock,
  ImageBlock,
  OutputMode,
  TableAlign,
  TableBlock,
  TableBorders,
  TextFormat,
} from '@/model/types';
import { trailingBlankLines } from '@/model/text';
import {
  resolveCellEdges,
  resolveCellPadding,
  resolveColumnWidths,
  resolveTableBox,
} from '@/model/table';

/**
 * Neutral render IR: a question type emits this once; preview, .docx and clipboard
 * consume it. `listRef` carries native Word numbering — the docx backend maps each
 * distinct `stream` to a `w:num`; preview/clipboard fall back to the literal marker.
 */

export type NodeStyle =
  | 'Question Stem'
  | 'MCQ Option'
  | 'Statement'
  | 'Sub-question'
  | 'Sub-sub-question'
  | 'Marks'
  | 'Table Caption'
  | 'Image Caption'
  | 'Section Heading'
  | 'Answer'
  | 'Marking Scheme'
  | 'Worksheet Title'
  | 'Instructions'
  | 'Body';

/**
 * Where a piece of rendered text came from — what makes the preview directly
 * editable. Targets address by **id**, never position. Only authored text gets one
 * (derived text has nowhere to write to). Inert in export.
 */
export type EditTarget =
  | { kind: 'worksheetTitle' }
  | { kind: 'worksheetInstructions' }
  /** A paragraph block anywhere — question stem, part, or sub-part. */
  | { kind: 'blockText'; blockId: string }
  /** A table or image block's caption. */
  | { kind: 'blockCaption'; blockId: string }
  /** One cell of a table block. */
  | { kind: 'tableCell'; blockId: string; cellId: string }
  | { kind: 'mcqOption'; questionId: string; optionId: string }
  | { kind: 'mcqStatement'; questionId: string; index: number }
  | { kind: 'mcqExplanation'; questionId: string }
  | { kind: 'partAnswer'; questionId: string; partId: string }
  | { kind: 'subPartAnswer'; questionId: string; partId: string; subPartId: string }
  /** A text-bearing layout element — heading, note, part header, section heading. */
  | { kind: 'layoutText'; elementId: string }
  /**
   * The authored wording of a band field. `side` names which authored half is meant
   * (the derived value between them carries no target); omitted means `prefix`.
   */
  | { kind: 'bandField'; fieldId: string; side?: BandFieldSide }
  /** One label/value row of a label-list element. */
  | {
      kind: 'labelListCell';
      elementId: string;
      rowId: string;
      column: 'label' | 'value';
    }
  /** One line of a cover region, addressed by its own id. */
  | { kind: 'coverLine'; lineId: string }
  /** A cover's single-value fields, which are not lists and so have no line id. */
  | {
      kind: 'coverField';
      field: 'instructionsHeading' | 'panelNote' | 'panelFieldLabel' | 'footNote';
    };

export interface ListRef {
  /** Identifies the numbering stream; each distinct id becomes one `w:num`. */
  stream: string;
  /** Which abstract numbering definition the stream instantiates. */
  definition: 'question' | 'option' | 'statement';
  /** 0-based level within the multilevel definition. */
  level: number;
  /** Literal fallback for preview/clipboard, e.g. "3." or "(a)" or "A." */
  marker: string;
}

export interface TextNode {
  kind: 'text';
  style: NodeStyle;
  text: BiText;
  listRef?: ListRef;
  /** Trailing "(4 marks) / （4分）" appended on the same line, right-aligned via tab. */
  marks?: number;
  /** Keep with the following paragraph so a question is not split (§7.6). */
  keepNext?: boolean;
  /** Keep this paragraph's own lines on one page (`w:keepLines`) — the docx half of
   *  keeping an exam question whole; the preview's paginator never splits an item. */
  keepLines?: boolean;
  /** Teacher-version-only content; stripped entirely from student output (§11.8). */
  teacherOnly?: boolean;
  /** Extra left indent in twips beyond the style default (used for non-list nesting). */
  indent?: number;
  /** Where this text lives in the model, so the preview can edit it in place. */
  edit?: EditTarget;
  /**
   * This paragraph's `format.spaceBefore` is a *boundary* gap — air between two
   * top-level items — rather than spacing anyone authored (§ `withLeadingGap`). The
   * preview drops it when the item leads a sheet; Word does the same to `w:before` by
   * itself. Marked explicitly so a teacher's own spacing is never mistaken for it.
   */
  boundaryGap?: boolean;
  /**
   * Per-element overrides on top of `style`. All three backends apply these as
   * direct formatting, so the named style keeps supplying every value not set here.
   */
  format?: TextFormat;
}

/**
 * Which of a cell's own edges are ruled. Explicit `false` matters: Word inherits an
 * unstated border from the table style, so omitting an edge draws the very rule the
 * shape exists to suppress.
 */
export interface TableCellEdges {
  top: boolean;
  left: boolean;
  bottom: boolean;
  right: boolean;
}

export interface TableNodeCell {
  text: BiText;
  colSpan: number;
  rowSpan: number;
  align: CellAlign;
  covered: boolean;
  /**
   * The padding in effect, in twips, resolved once here — three backends re-deriving
   * it is three chances to draw a different table.
   */
  padding: Required<CellPadding>;
  /**
   * Ruled edges, resolved from border mode + grid position. Only `headerRule`
   * populates it; `all` and `box` are uniform and say so on the table.
   */
  edges?: TableCellEdges;
  /** Direct formatting for the cell's text, over the Body style. */
  format?: TextFormat;
  /** A picture printed under the cell's text; see `TableCell.image`. */
  image?: CellImage;
  edit?: EditTarget;
}

export interface TableNode {
  kind: 'table';
  rows: TableNodeCell[][];
  caption?: BiText;
  keepNext?: boolean;
  teacherOnly?: boolean;
  columnCount: number;
  /**
   * Column widths as fractions of the content width, summing to 1. Always resolved,
   * so no backend decides what "not stored" means.
   */
  columnWidths: number[];
  /**
   * The table's own box, always resolved. `columnWidths` are fractions of `width`,
   * not of the page.
   */
  width: number;
  indent: number;
  /**
   * `w:jc` on the table; `indent` is already zeroed for a centred table, so backends
   * need not know the two are alternatives.
   */
  align: TableAlign;
  /** Which rules the table draws. Always resolved. */
  borders: TableBorders;
  /** A floor on each row's height in twips, in row order; undefined means content-sized. */
  rowHeights: (number | undefined)[];
  /** Which block this came from, so the preview can resize its columns. */
  blockId: string;
  /** Edit target for the caption. */
  captionEdit?: EditTarget;
  /** Which side the caption prints on. Always resolved. */
  captionPlacement: CaptionPlacement;
}

export interface ImageNode {
  kind: 'image';
  src: string;
  widthPx: number;
  heightPx: number;
  altText: BiText;
  caption?: BiText;
  keepNext?: boolean;
  teacherOnly?: boolean;
  /** Edit target for the caption. */
  captionEdit?: EditTarget;
  /** Which side the caption prints on; always resolved. See `TableNode`. */
  captionPlacement: CaptionPlacement;
  /** How the picture sits in the content column (`w:jc` on its paragraph). Always resolved. */
  align: TableAlign;
  /** Which block this came from, so the preview can select and resize it. */
  blockId: string;
}

/**
 * An economics diagram, carried as geometry. Exports as **exactly one image** (a
 * multi-shape diagram could be pulled apart in Word). The geometry rides in the IR so
 * the preview draws live SVG; rasterizing needs a canvas and happens in
 * `export/diagramImage.ts`, keeping this module pure. Deliberately no caption —
 * a diagram's words are `diagram.title`, drawn inside the image.
 */
export interface DiagramNode {
  kind: 'diagram';
  diagram: Diagram;
  widthPx: number;
  heightPx: number;
  altText: BiText;
  keepNext?: boolean;
  teacherOnly?: boolean;
  /** How the picture sits in the content column; always resolved. See `ImageNode`. */
  align: TableAlign;
  /** Which block this came from, so the preview can select and edit it. */
  blockId: string;
}

/**
 * A figure with a companion table beside it (§ `FigureRowBlock`). The children are
 * ordinary nodes, so every backend reuses its picture and table emitters; only the
 * side-by-side frame is new. Word gets a borderless two-cell layout table with the
 * real table nested in one cell; the preview a flex row; both centre vertically,
 * which is the reference's own alignment.
 */
export interface FigureRowNode {
  kind: 'figureRow';
  figure: ImageNode | DiagramNode;
  table: TableNode;
  /** Which side the table sits. Always resolved; `right` is the reference's shape. */
  tableSide: 'left' | 'right';
  keepNext?: boolean;
  teacherOnly?: boolean;
  /** Which block this came from, so the preview can select and edit it. */
  blockId: string;
}

export interface PageBreakNode {
  kind: 'pageBreak';
}

/**
 * Several pieces of text sharing one line — the primitive behind every side-by-side
 * layout. Exports as one paragraph with tab stops, never a table. Positions are
 * fractions (0..1) of the row's own width after `indent`, so they survive
 * paper/margin changes.
 */
export interface ColumnsNode {
  kind: 'columns';
  style: NodeStyle;
  cells: Array<{
    text: BiText;
    /** Left edge as a fraction of the row's width, after `indent`. */
    at: number;
    /** How the text sits relative to `at`. */
    align?: 'left' | 'center' | 'right';
    /** Literal marker printed before the text, e.g. "A." — derived, never stored. */
    marker?: string;
    edit?: EditTarget;
    format?: TextFormat;
    /**
     * The cell's interior when it mixes authored text with computed values (a band
     * field). Parts are not separate cells (a cell is a tab stop); `text` above stays
     * the whole string for consumers that don't care. Absent = entirely `text`.
     */
    parts?: Array<{
      text: BiText;
      /** Present on authored text: where to write an edit back to. */
      edit?: EditTarget;
      /** Present on a derived value, naming what computed it. Never editable. */
      token?: 'totalMarks' | 'page' | 'pageCount' | 'rule';
    }>;
  }>;
  /** Extra left indent in twips before the first cell. */
  indent?: number;
  /**
   * Pull the row's first line back by this many twips (`w:ind w:hanging`). Without it
   * a wrapped cell's continuation returns to `indent` — under the marker, not the
   * text. Long rows (cover instructions) need it.
   */
  hanging?: number;
  /** Hairline rule under the row, used by masthead bands. */
  rule?: boolean;
  /**
   * Air above the row in points (`w:before`), when this row leads an item and carries
   * its boundary gap (§ `withLeadingGap`). A row-level property because a `ColumnsNode`
   * has no `format` of its own — its formatting is per cell, and the gap belongs to the
   * whole paragraph.
   */
  spaceBefore?: number;
  /** `spaceBefore` here is a boundary gap, not authored spacing. See `TextNode`. */
  boundaryGap?: boolean;
  keepNext?: boolean;
  /** Keep the row's wrapped lines on one page (`w:keepLines`). See `TextNode`. */
  keepLines?: boolean;
  teacherOnly?: boolean;
}

/** Fixed vertical whitespace, e.g. room to write an answer. Height in points. */
export interface SpacerNode {
  kind: 'spacer';
  heightPt: number;
  /** The layout element this came from, so the preview can size it in place. Inert in export. */
  elementId?: string;
  /**
   * Keep this gap with what follows: inside a stem → gap → table chain, a plain blank
   * is exactly where Word would break.
   */
  keepNext?: boolean;
}

/** A horizontal rule across the text column. */
export interface DividerNode {
  kind: 'divider';
}

/** Ruled writing lines. Exported as empty bottom-bordered paragraphs. */
export interface AnswerLinesNode {
  kind: 'answerLines';
  lines: number;
  /** The layout element this came from, so the preview can size it in place. */
  elementId?: string;
}

/**
 * Dotted writing lines — the QAB's answer space. One paragraph per line: a
 * right-aligned tab wearing a dotted underline. Not `answerLines` with a flag; the
 * pitch, mechanism and Word style all differ.
 */
export interface AnswerSpaceNode {
  kind: 'answerSpace';
  lines: number;
  /** The layout element this came from, so the preview can size it in place. */
  elementId?: string;
  /**
   * The count is paginator-resolved, not authored; the preview withholds the resize
   * handle. Inert in export.
   */
  fill?: boolean;
}

/**
 * The cover page: a two-column sheet of regions. Deliberately **not** a `RenderNode`
 * (nothing in that union is a whole page); regions hold `RenderNode[]` so backends
 * reuse their emitters — only the frame is new.
 */
export interface CoverRenderNode {
  kind: 'cover';
  /** Column widths in twips, mirroring `w:cols w:equalWidth="0"`. */
  columns: { left: number; gap: number; right: number };
  /** Top-left code block, hung above the identity lines. */
  corner: RenderNode[];
  /** Diagonal rule across the corner block. */
  cornerRule: boolean;
  /** Identity lines: school, examination, paper name, timing. */
  head: RenderNode[];
  /** "INSTRUCTIONS" plus the numbered list, already numbered. */
  instructions: RenderNode[];
  /** The right column. Empty means the sheet prints as one wide column. */
  panel: CoverPanelRender;
  /** Footer block at the bottom of the left column. */
  foot: RenderNode[];
  /** Boxed note at the bottom-right (the reference's P1 carries one). */
  footNote?: RenderNode;
}

export interface CoverPanelRender {
  /** Framed note at the top of the right column. */
  note?: RenderNode;
  /** Label beside the boxed grid. */
  fieldLabel?: RenderNode;
  /** How many write-in boxes the grid draws. */
  boxes: number;
  /** False when nothing in the panel would print. */
  present: boolean;
}

export type RenderNode =
  | TextNode
  | ColumnsNode
  | TableNode
  | ImageNode
  | DiagramNode
  | FigureRowNode
  | PageBreakNode
  | SpacerNode
  | DividerNode
  | AnswerLinesNode
  | AnswerSpaceNode;

/** Context handed to a question type's `render` function. */
export interface RenderContext {
  mode: OutputMode;
  /** Derived display number for this question (§4). */
  questionNumber: number;
  /** Unique per question; used to build restart-per-question numbering streams. */
  questionId: string;
  /**
   * Numbering stream for the question/part/sub-part list. Sections configured to
   * restart get their own stream so Word restarts at 1 natively rather than
   * relying on a number we typed in (§4, §7.2).
   */
  questionStream: string;
  /**
   * The document's list geometry (§ `listIndentScheme`) — the exam paper carries its
   * own. Question types take continuation indents from here, never from the module
   * constants directly, so one document renders on one scheme throughout.
   */
  indents: ListIndentScheme;
}

/** Convenience: does this node survive in the current version mode? */
export function includeNode(node: RenderNode, mode: OutputMode): boolean {
  if (mode.version === 'teacher') return true;
  return !('teacherOnly' in node && node.teacherOnly);
}

/**
 * One blank body line, the separator every gap on the page goes through. A real node,
 * not a style property — on the fixed 12pt line a spent line is the only way to open
 * air. Carries no `elementId`: it belongs to the question, not to a `spacer` element.
 */
export const BLANK_LINE_PT = 12;

export function blankLine(): SpacerNode {
  return { kind: 'spacer', heightPt: BLANK_LINE_PT };
}

/**
 * Push a separating blank line, unless the stream already ends in one. A gap counts
 * what is already there: a trailing hard break counts *as* the gap instead of adding
 * to it, so every gap is exactly one line however the text was typed.
 */
export function pushGap(nodes: RenderNode[]): void {
  if (!endsInBlankLine(nodes)) nodes.push(blankLine());
}

/**
 * A boundary gap is air *between* two items, not part of either — so it must vanish
 * when the boundary falls on a page break. A gap at the top of a sheet is only a
 * shifted top margin, and on the exam paper's three-line boundary it reads as a
 * missing question.
 *
 * The gap therefore rides on the item's first paragraph as `spaceBefore` rather than
 * as leading `blankLine()` spacers. That is the one separation in this document not
 * spelled as a spent line, and it is deliberate: **Word discards `w:before` at the top
 * of a page and honours it everywhere else**, which is exactly the rule, applied by
 * the one party that knows where the .docx's pages actually break. Spacer paragraphs
 * cannot express it — an empty paragraph occupies its line wherever it lands.
 *
 * The preview owns the same rule on its own side: it knows which item leads each
 * sheet, so `Preview.tsx` drops the gap there (§ *A boundary gap dies at a page top*).
 *
 * Returns the nodes unchanged when there is no gap to apply, so an untouched document
 * keeps emitting byte-identical XML.
 */
export function withLeadingGap(nodes: RenderNode[], lines: number): RenderNode[] {
  if (lines <= 0 || nodes.length === 0) return nodes;
  const [first, ...rest] = nodes;
  const spaceBefore = lines * BLANK_LINE_PT;

  // Only a paragraph carries `w:spacing`. A leading table, picture or rule has no
  // paragraph properties of its own, so those keep a real spacer — which is correct
  // for them anyway: none of the three can lead a question on the exam paper, and a
  // classroom worksheet's single line above a table is the ordinary spent line.
  if (first.kind === 'text') {
    return [
      { ...first, boundaryGap: true, format: { ...first.format, spaceBefore } },
      ...rest,
    ];
  }
  if (first.kind === 'columns') {
    return [{ ...first, boundaryGap: true, spaceBefore }, ...rest];
  }
  return [...Array.from({ length: lines }, blankLine), ...nodes];
}

/**
 * Does this node stream already end in a spent line? Deliberately language-neutral
 * (a trailing break on either side counts) — one IR feeds all backends, and the
 * paginator measures these boxes.
 */
export function endsInBlankLine(nodes: RenderNode[]): boolean {
  const last = nodes[nodes.length - 1];
  if (!last) return false;
  if (last.kind === 'spacer') return true;
  // A text node ending in a hard break leaves an empty final line, which is the same
  // spent line a spacer would have contributed.
  if (last.kind === 'text') {
    return trailingBlankLines(last.text.en) > 0 || trailingBlankLines(last.text.zh) > 0;
  }
  return false;
}

/**
 * Expand content blocks into IR nodes, appending to the caller's stream — appends
 * rather than returns so the table-gap rule can see what the stream already ends in.
 */
export function renderContentBlocks(
  nodes: RenderNode[],
  blocks: ContentBlock[],
  style: NodeStyle,
  options: { keepNext?: boolean; teacherOnly?: boolean; indent?: number } = {},
): void {
  for (const block of blocks) {
    if (block.kind === 'paragraph') {
      nodes.push({
        kind: 'text',
        style,
        text: block.text,
        keepNext: options.keepNext,
        teacherOnly: options.teacherOnly,
        indent: options.indent,
        edit: { kind: 'blockText', blockId: block.id },
        format: block.format,
      });
    } else if (block.kind === 'table') {
      const table = tableNodeFor(block, options);
      // A table with rows but no cells emits no node at all — an empty <table>
      // measures zero in the probe but occupies a line on the sheet, so pagination
      // oscillated forever. Skipped here so *nothing* renders it; the block stays in
      // the document and the sidebar offers a column back.
      if (!table) continue;
      // One blank line before every table, via the gap-counting rule; skipped at the
      // head of the stream. Carries the caller's keepNext (a plain blank is exactly
      // where Word would break the stem → gap → table chain).
      if (nodes.length > 0 && !endsInBlankLine(nodes)) {
        nodes.push({ ...blankLine(), keepNext: options.keepNext });
      }
      nodes.push(table);
    } else if (block.kind === 'diagram') {
      nodes.push(diagramNodeFor(block, options));
    } else if (block.kind === 'figureRow') {
      // The figure and its companion table, side by side. The row takes the table's
      // own separating blank line — it contains one, and flush under a paragraph the
      // frame reads as part of the text above.
      const table = tableNodeFor(block.table, options);
      const figure =
        block.figure.kind === 'diagram'
          ? diagramNodeFor(block.figure, options)
          : imageNodeFor(block.figure, options);
      if (nodes.length > 0 && !endsInBlankLine(nodes)) {
        nodes.push({ ...blankLine(), keepNext: options.keepNext });
      }
      // A row whose table has lost every cell renders as the bare figure — same rule
      // as a standalone empty table: nothing may render an unmeasurable box.
      if (!table) {
        nodes.push(figure);
        continue;
      }
      nodes.push({
        kind: 'figureRow',
        figure,
        table,
        tableSide: block.tableSide ?? 'right',
        keepNext: options.keepNext,
        teacherOnly: options.teacherOnly,
        blockId: block.id,
      });
    } else {
      nodes.push(imageNodeFor(block, options));
    }
  }
}

type BlockNodeOptions = { keepNext?: boolean; teacherOnly?: boolean };

/**
 * A table block's IR node, or undefined for a table with no cells at all. Shared by
 * the standalone case and the figure row, so the two cannot resolve widths or edges
 * differently.
 */
function tableNodeFor(block: TableBlock, options: BlockNodeOptions): TableNode | undefined {
  if (block.rows.every((row) => row.cells.length === 0)) return undefined;
  const columnCount = Math.max(
    1,
    ...block.rows.map((row) =>
      row.cells.reduce((sum, cell) => sum + (cell.covered ? 0 : cell.colSpan ?? 1), 0),
    ),
  );
  return {
    kind: 'table',
    columnCount,
    // Resolved once, here, so the preview's colgroup and the exporter's w:gridCol
    // divide the identical numbers — the paginator measures boxes Word must reproduce.
    columnWidths: resolveColumnWidths(block, columnCount),
    ...resolveTableBox(block),
    rowHeights: block.rows.map((row) => row.minHeight),
    borders: block.borders ?? 'all',
    blockId: block.id,
    caption: block.caption,
    captionPlacement: block.captionPlacement ?? 'below',
    keepNext: options.keepNext,
    teacherOnly: options.teacherOnly,
    captionEdit: { kind: 'blockCaption', blockId: block.id },
    rows: block.rows.map((row, rowIndex) =>
      row.cells.map((cell, cellIndex) => ({
        text: cell.text,
        colSpan: cell.colSpan ?? 1,
        rowSpan: cell.rowSpan ?? 1,
        align: cell.align ?? 'left',
        covered: Boolean(cell.covered),
        padding: resolveCellPadding(block, rowIndex, cellIndex),
        // Only the T-account rules by position; `all` and `box` are uniform and say
        // so on the table itself (§`TableCellEdges`).
        edges:
          block.borders === 'headerRule'
            ? resolveCellEdges(block, rowIndex, cellIndex, columnCount)
            : undefined,
        format: cell.format,
        image: cell.image,
        edit: { kind: 'tableCell', blockId: block.id, cellId: cell.id },
      })),
    ),
  };
}

function diagramNodeFor(block: DiagramBlock, options: BlockNodeOptions): DiagramNode {
  return {
    kind: 'diagram',
    diagram: block.diagram,
    widthPx: block.widthPx,
    heightPx: block.heightPx,
    altText: block.altText,
    keepNext: options.keepNext,
    teacherOnly: options.teacherOnly,
    align: block.align ?? 'center',
    blockId: block.id,
  };
}

function imageNodeFor(block: ImageBlock, options: BlockNodeOptions): ImageNode {
  return {
    kind: 'image',
    src: block.src,
    widthPx: block.widthPx,
    heightPx: block.heightPx,
    altText: block.altText,
    caption: block.caption,
    captionPlacement: block.captionPlacement ?? 'below',
    align: block.align ?? 'center',
    keepNext: options.keepNext,
    teacherOnly: options.teacherOnly,
    captionEdit: { kind: 'blockCaption', blockId: block.id },
    blockId: block.id,
  };
}
