import type { Diagram } from '@/model/diagram';
import type { BiText, CellAlign, ContentBlock, OutputMode, TextFormat } from '@/model/types';

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
  /** An authored text or fill-in field inside a masthead band. */
  | { kind: 'bandField'; fieldId: string }
  /** One label/value row of a label-list element. */
  | {
      kind: 'labelListCell';
      elementId: string;
      rowId: string;
      column: 'label' | 'value';
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
  header: boolean;
  edit?: EditTarget;
}

export interface TableNode {
  kind: 'table';
  rows: TableNodeCell[][];
  headerRowCount: number;
  caption?: BiText;
  keepNext?: boolean;
  teacherOnly?: boolean;
  columnCount: number;
  /** Edit target for the caption. */
  captionEdit?: EditTarget;
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
  caption?: BiText;
  keepNext?: boolean;
  teacherOnly?: boolean;
  captionEdit?: EditTarget;
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
  }>;
  /** Extra left indent in twips before the first cell. */
  indent?: number;
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

export type RenderNode =
  | TextNode
  | ColumnsNode
  | TableNode
  | ImageNode
  | DiagramNode
  | PageBreakNode
  | SpacerNode
  | DividerNode
  | AnswerLinesNode;

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
      nodes.push({
        kind: 'table',
        columnCount,
        headerRowCount: block.headerRowCount,
        caption: block.caption,
        keepNext: options.keepNext,
        teacherOnly: options.teacherOnly,
        captionEdit: { kind: 'blockCaption', blockId: block.id },
        rows: block.rows.map((row, rowIndex) =>
          row.cells.map((cell) => ({
            text: cell.text,
            colSpan: cell.colSpan ?? 1,
            rowSpan: cell.rowSpan ?? 1,
            align: cell.align ?? 'left',
            covered: Boolean(cell.covered),
            header: rowIndex < block.headerRowCount,
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
        caption: block.caption,
        keepNext: options.keepNext,
        teacherOnly: options.teacherOnly,
        captionEdit: { kind: 'blockCaption', blockId: block.id },
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
        keepNext: options.keepNext,
        teacherOnly: options.teacherOnly,
        captionEdit: { kind: 'blockCaption', blockId: block.id },
        blockId: block.id,
      });
    }
  }
  return nodes;
}
