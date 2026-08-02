import type { Diagram } from '@/model/diagram';
import type {
  BandFieldSide,
  BiText,
  CaptionPlacement,
  CellAlign,
  CellImage,
  CellPadding,
  ContentBlock,
  OutputMode,
  TableAlign,
  TableBorders,
  TextFormat,
} from '@/model/types';
import { trailingBlankLines } from '@/model/text';
import { resolveCellPadding, resolveColumnWidths, resolveTableBox } from '@/model/table';

/**
 * Neutral render IR.
 *
 * A question type emits this once (via its registry entry); the preview, the .docx
 * exporter and the clipboard exporter are three consumers of the same IR. This is
 * what makes §9 hold: a new question type ships one `render` function and gets all
 * three outputs, and none of the export orchestration changes.
 *
 * `listRef` is what carries native Word numbering. A node that belongs to a live
 * list names its numbering stream and level; the docx backend maps each distinct
 * `stream` to a `w:num` instance (restarting per question where required, §7.2),
 * while the preview and clipboard backends fall back to the literal `marker`.
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
 * Where a piece of rendered text came from in the document model.
 *
 * This is what makes the preview directly editable: a node carries the address of
 * the `BiText` it was rendered from, so clicking the text on the page can write
 * back to exactly that field. Every variant addresses its target by **id** rather
 * than by position, so an edit stays correct if questions are reordered mid-edit.
 *
 * Only user-authored text gets a target. Derived text — a marks total, the
 * "Answer: C" line — deliberately has none, because it is computed rather than
 * stored (§4, §3.5) and typing over it would have nowhere to go.
 *
 * The .docx and clipboard backends ignore this field entirely; it exists purely for
 * the preview, and adding it leaves exported output byte-for-byte unchanged.
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
  /**
   * A text-bearing layout element in the document flow — a free heading, a note, a
   * part header, or a **section heading**.
   *
   * A section heading has no target of its own: a section is a layout element now, so
   * the one address that reaches every element reaches it too. An element id is enough
   * to find it, which is why no section id is carried here.
   */
  | { kind: 'layoutText'; elementId: string }
  /**
   * The authored wording of a band field — masthead, header or footer.
   *
   * `side` is what makes a *computed* field editable. Every kind is authored text around
   * a derived value (§ `bandSegments`), so the target names which half it means: the
   * prefix of a `totalMarks` field is "Full marks: ", its suffix " marks", and the number
   * between them carries no target at all, being derived. A plain `text` field is the
   * degenerate case — all prefix, no value.
   *
   * Omitted `side` means `prefix`, so a target built before this existed still resolves
   * to the same text it always did.
   */
  | { kind: 'bandField'; fieldId: string; side?: BandFieldSide }
  /** One label/value row of a label-list element. */
  | {
      kind: 'labelListCell';
      elementId: string;
      rowId: string;
      column: 'label' | 'value';
    }
  /**
   * One line of a cover region, addressed by its own id.
   *
   * Id rather than region+index, so an edit survives a line being added or removed above
   * it — the same reason every other target names an id.
   */
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
  /** Teacher-version-only content; stripped entirely from student output (§11.8). */
  teacherOnly?: boolean;
  /** Extra left indent in twips beyond the style default (used for non-list nesting). */
  indent?: number;
  /** Where this text lives in the model, so the preview can edit it in place. */
  edit?: EditTarget;
  /**
   * Per-element overrides on top of `style`. All three backends apply these as
   * direct formatting, so the named style keeps supplying every value not set here.
   */
  format?: TextFormat;
}

export interface TableNodeCell {
  text: BiText;
  colSpan: number;
  rowSpan: number;
  align: CellAlign;
  covered: boolean;
  /**
   * The padding in effect on this cell, in twips, already resolved.
   *
   * Fully resolved here rather than per backend because Word has no row- or column-level
   * cell margin: the `.docx` can only write the winner onto each `w:tcMar`, so a backend
   * that re-derived it could show the page a padding the exported file does not have.
   */
  padding: Required<CellPadding>;
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
   * Column widths as fractions of the content width, one per column, summing to 1.
   *
   * Always present and always resolved, so no backend has to decide what "no widths
   * stored" means — the preview's `colgroup` and the exporter's `w:gridCol` divide the
   * same numbers and cannot disagree about where a column edge falls.
   */
  columnWidths: number[];
  /**
   * The table's own box: how much of the content width it spans, and where it starts.
   *
   * Always resolved, like `columnWidths`, so no backend decides what "not stored" means.
   * `columnWidths` are fractions of `width`, not of the page.
   */
  width: number;
  indent: number;
  /**
   * How the table sits in the content column (`w:jc` on the table).
   *
   * Resolved alongside the box because the two are one decision: `indent` is already
   * zeroed here for a centred table, so a backend places by `align` and offsets by
   * `indent` without having to know they are alternatives.
   */
  align: TableAlign;
  /**
   * Which rules the table draws. **Always resolved**, like the box and the column
   * widths — an unstored value means `all`, and no backend should decide that alone.
   */
  borders: TableBorders;
  /** A floor on each row's height in twips, in row order; undefined means content-sized. */
  rowHeights: (number | undefined)[];
  /** Which block this came from, so the preview can resize its columns. */
  blockId: string;
  /** Edit target for the caption. */
  captionEdit?: EditTarget;
  /**
   * Which side the caption prints on. **Always resolved**, like `columnWidths` and the
   * table box: no backend should have to decide what an unstored placement means, and
   * three of them deciding separately is three chances to disagree about where the words
   * go.
   */
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
  /**
   * How the picture sits in the content column (`w:jc` on its paragraph).
   *
   * **Always resolved**, like `captionPlacement` and the table box: an unstored
   * alignment means `left`, and three backends each deciding that separately is three
   * chances to disagree about where the figure sits.
   */
  align: TableAlign;
  /** Which block this came from, so the preview can select and resize it. */
  blockId: string;
}

/**
 * An economics diagram, carried as geometry rather than as pixels.
 *
 * It reaches the page as **exactly one image** in both export backends — the whole
 * diagram is a single `w:drawing` in Word and a single `<img>` on the clipboard —
 * because a Word document that held the axes, curves and labels as separate shapes
 * would let a stray click in Word pull the diagram apart, and could not be moved or
 * resized as one thing.
 *
 * The geometry rides in the IR rather than a pre-rendered data URL so the preview can
 * draw a crisp, live SVG at any zoom while the exporters rasterize the same geometry at
 * print resolution. Rasterizing needs a browser canvas, so it happens in the export
 * step (`export/diagramImage.ts`) rather than here — keeping this module pure.
 */
export interface DiagramNode {
  kind: 'diagram';
  diagram: Diagram;
  widthPx: number;
  heightPx: number;
  altText: BiText;
  keepNext?: boolean;
  teacherOnly?: boolean;
  /**
   * No caption, unlike `TableNode` and `ImageNode`.
   *
   * A diagram's words are `diagram.title`, drawn *inside* the geometry and rasterized
   * into the same PNG. There is deliberately nothing here for a backend to print beside
   * the picture: a caption paragraph is what let the words break onto their own line and
   * drift away from the figure. Every backend therefore renders a diagram as exactly one
   * image and nothing else.
   */
  /** How the picture sits in the content column; always resolved. See `ImageNode`. */
  align: TableAlign;
  /** Which block this came from, so the preview can select and edit it. */
  blockId: string;
}

export interface PageBreakNode {
  kind: 'pageBreak';
}

/**
 * Several pieces of text sharing one line at fixed horizontal positions.
 *
 * This is the one primitive behind every side-by-side layout the app offers: inline MCQ
 * options, a label/value list, and the title block's left/centre/right bands. It exports
 * as a single paragraph with tab stops rather than as a table, because a borderless
 * table would still be a table in Word — awkward to edit, and it would break the
 * numbering stream a question's options belong to.
 *
 * Positions are fractions (0..1) of the row's **own** width — that is, of what remains
 * after `indent` — so every backend can use them directly and they stay correct when the
 * paper size or margins change.
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
     * The cell's interior, when it mixes authored text with computed values.
     *
     * A band field is the case: "Full marks: 45 marks" is typed, derived, typed. The
     * parts are *not* separate cells — a cell is a tab stop, so splitting a field across
     * three would put a `w:tab` between each fragment and scatter it across the row.
     * They describe what is inside one cell, so the preview knows which stretches to make
     * editable and the .docx knows where a native `PAGE` field goes.
     *
     * `text` above stays the whole concatenated string, so a consumer that does not care
     * about the distinction (the clipboard, a thumbnail) needs to know nothing about
     * this. When absent, the cell is entirely `text` and `edit` covers all of it.
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
   * Pull the row's **first line** back by this many twips, Word's `w:ind w:hanging`.
   *
   * A row of tab stops is one paragraph, so without this a wrapped cell's continuation
   * lines return to `indent` — under the *marker* rather than under the text it belongs
   * to. That is invisible on the short rows this primitive was built for (band zones,
   * inline MCQ options) and wrong on the long ones: an exam cover's numbered instructions
   * wrap heavily, and both reference papers hang them under their own text column.
   *
   * Expressed as a hanging indent rather than a per-line rule because that is the shape
   * Word has, and the same shape a numbered paragraph already uses (§ a numbered
   * paragraph indents as a block). `indent` still positions the block; this only decides
   * where its first line starts.
   */
  hanging?: number;
  /** Hairline rule under the row, used by masthead bands. */
  rule?: boolean;
  keepNext?: boolean;
  teacherOnly?: boolean;
}

/** Fixed vertical whitespace, e.g. room to write an answer. Height in points. */
export interface SpacerNode {
  kind: 'spacer';
  heightPt: number;
  /**
   * The layout element this came from, so the preview can size it in place.
   *
   * The same role `blockId` plays on `ImageNode`: whitespace has no text, so without an
   * id the only handle on it is the sidebar. It is inert in export for the reason
   * `EditTarget` is — the .docx and clipboard backends never read it.
   */
  elementId?: string;
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
 * Dotted writing lines — the Question-Answer Book's answer space.
 *
 * Exported as one paragraph per line whose only run is a right-aligned tab wearing a
 * dotted underline (`w:u w:val="dotted"`), the reference booklet's own mechanism. Not
 * `answerLines` with a flag: the pitch, the drawing mechanism and the Word style all
 * differ, and the two must stay independently restylable (§ the LQ line is a different
 * primitive).
 */
export interface AnswerSpaceNode {
  kind: 'answerSpace';
  lines: number;
  /** The layout element this came from, so the preview can size it in place. */
  elementId?: string;
  /**
   * The count is paginator-resolved, not authored (§`LayoutElement.answerSpace.fill`).
   * The preview reads it to withhold the resize handle — dragging a derived size would
   * be overwritten by the next resolution. Inert in export, like `edit`.
   */
  fill?: boolean;
}

/**
 * The cover page: a two-column sheet of regions.
 *
 * Deliberately **not** a `RenderNode`. Every member of that union is something that
 * flows in the document body, and a cover is the opposite of that — it is a whole page
 * with its own column geometry, printed before the body begins. Adding it to the union
 * would have forced every backend's node walk to handle a case that can never appear
 * inside a question.
 *
 * Regions hold `RenderNode[]` so the backends reuse the paragraph and columns emitters
 * they already have; only the *frame* around them is new.
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
}

/** Convenience: does this node survive in the current version mode? */
export function includeNode(node: RenderNode, mode: OutputMode): boolean {
  if (mode.version === 'teacher') return true;
  return !('teacherOnly' in node && node.teacherOnly);
}

/**
 * One blank body line, the separator every question type uses between its own parts.
 *
 * The reference paper puts a blank line between a stem and its statements, between the
 * statements and the options, and between each part of a structured question — 102 of
 * its 296 paragraphs are empty. With the document on a fixed 12pt line and zero
 * paragraph spacing (§ One fixed line, no paragraph spacing), a spent line is the *only*
 * way to open that air, so it is a real node rather than a style property.
 *
 * Exported here rather than written out in each question type so "how far apart are the
 * parts of a question" is one number, and so a new question type inherits the paper's
 * rhythm by using the same helper instead of inventing its own gap.
 *
 * It carries no `elementId`: it belongs to the question that emitted it, not to a
 * `spacer` layout element a teacher can select, drag or resize.
 */
export const BLANK_LINE_PT = 12;

export function blankLine(): RenderNode {
  return { kind: 'spacer', heightPt: BLANK_LINE_PT };
}

/**
 * Push a separating blank line, unless the page already ends in one.
 *
 * A gap is a property of the *boundary*, so it has to count what is already there. Text
 * ending in a trailing hard break (Shift+Enter) prints its own blank line, and a
 * separator pushed blindly after it opened a **double** gap — a part typed with a
 * trailing break sat twice as far from the next part as its neighbours did, for a reason
 * invisible in the document.
 *
 * The trailing break still prints; it simply *counts as* the gap instead of adding to
 * one. So every gap is exactly one line however the text happened to be typed, which is
 * the invariant the fixed 12pt rhythm depends on (§ One fixed line, no paragraph
 * spacing).
 *
 * Both cases are checked because both spend a line: an explicit `blankLine()` already
 * pushed, and a text node whose own last line is empty.
 */
export function pushGap(nodes: RenderNode[]): void {
  if (!endsInBlankLine(nodes)) nodes.push(blankLine());
}

/**
 * Does this node stream already end in a spent line?
 *
 * Deliberately **language-neutral**, like the rest of the IR: one IR feeds all three
 * backends, so the gap cannot be decided per language without the preview and the `.docx`
 * disagreeing about the document's height — and the paginator measures these boxes. A
 * trailing break on *either* side therefore counts, so the shape is the same whichever
 * language is being shown.
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

/** Expand a content block into IR nodes (shared by every question type). */
export function renderContentBlocks(
  blocks: ContentBlock[],
  style: NodeStyle,
  options: { keepNext?: boolean; teacherOnly?: boolean; indent?: number } = {},
): RenderNode[] {
  const nodes: RenderNode[] = [];
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
      const columnCount = Math.max(
        1,
        ...block.rows.map((row) =>
          row.cells.reduce((sum, cell) => sum + (cell.covered ? 0 : cell.colSpan ?? 1), 0),
        ),
      );
      /*
       * A table with rows but no cells in them emits **no node at all**.
       *
       * Such a table is reachable from documents saved before `removeColumn` had a floor,
       * and it broke pagination outright: an empty `<table>` measures zero in the
       * paginator's off-screen probe but still occupies a line in the real sheet, so the
       * two passes disagreed about the document's height forever. The sheet count
       * oscillated 1 ↔ 2 and React reported "Maximum update depth exceeded" from the item
       * measurement — a symptom several components away from the cause.
       *
       * Skipping it here rather than in the preview is what makes the two agree: one IR
       * feeds the probe, the sheet, the `.docx` and the clipboard, so *nothing*
       * renders it and no measurement can differ. The block stays in the document, and the
       * sidebar offers to give it a column back (§tables).
       */
      if (block.rows.every((row) => row.cells.length === 0)) continue;
      nodes.push({
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
            format: cell.format,
            image: cell.image,
            edit: { kind: 'tableCell', blockId: block.id, cellId: cell.id },
          })),
        ),
      });
    } else if (block.kind === 'diagram') {
      nodes.push({
        kind: 'diagram',
        diagram: block.diagram,
        widthPx: block.widthPx,
        heightPx: block.heightPx,
        altText: block.altText,
        keepNext: options.keepNext,
        teacherOnly: options.teacherOnly,
        align: block.align ?? 'center',
        blockId: block.id,
      });
    } else {
      nodes.push({
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
      });
    }
  }
  return nodes;
}
