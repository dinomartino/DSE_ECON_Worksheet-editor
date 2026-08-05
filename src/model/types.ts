/**
 * Core document model.
 *
 * Rules the rest of the codebase depends on:
 *  - Every user-visible string is a `BiText` (en + zh), each side a run array.
 *  - Numbering and marks totals are NEVER stored; both are derived at render time.
 *  - `Question` is a discriminated union on `type`; new variants are added via the
 *    registry without touching numbering / persistence / export plumbing.
 */

import type { CoverPage } from './coverTypes';
import type { Diagram } from './diagram';

export type VertAlign = 'superscript' | 'subscript';

/**
 * One stretch of text that shares formatting — Word's run (`w:r`/`w:rPr`).
 * Every field is optional and means "inherit" (run ← element TextFormat ← named style).
 */
export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  vertAlign?: VertAlign;
  /** Point size, e.g. 14. Word stores half-points, so the exporter doubles it. */
  fontSize?: number;
  /** Six-digit hex, no leading "#", matching OOXML's `w:color`. */
  color?: string;
  /** Override the element's font pair for this run only. */
  fonts?: FontPair;
}

/**
 * Run attributes without the text — what a toolbar applies to a selection.
 * In a patch, `null` clears back to inherited; `undefined` cannot (indistinguishable
 * from "not mentioned" once spread).
 */
export type RunFormat = Omit<InlineRun, 'text'>;

export type RunFormatPatch = {
  [K in keyof RunFormat]?: RunFormat[K] | null;
};

export type RichText = InlineRun[];

export interface BiText {
  en: RichText;
  zh: RichText;
}

export type CellAlign = 'left' | 'center' | 'right';

/**
 * Where a whole table sits in the content column — `w:jc` on `w:tblPr`.
 * Distinct from `CellAlign`, which places text inside one cell.
 */
export type TableAlign = 'left' | 'center' | 'right';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/**
 * Per-element formatting overrides. Named styles supply every default; this records
 * only the deltas, so an untouched document exports byte-identically. Every field is
 * optional and means "leave the style's value alone".
 */
export interface TextFormat {
  /** Point size, e.g. 18. Word stores half-points, so the exporter doubles it. */
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: TextAlign;
  /** Six-digit hex, no leading "#", matching OOXML's `w:color`. */
  color?: string;
  /** Space above/below the paragraph, in points. */
  spaceBefore?: number;
  spaceAfter?: number;
  /** Override the worksheet font pair for this element only. */
  fonts?: FontPair;
}

export interface ParagraphBlock {
  kind: 'paragraph';
  id: string;
  text: BiText;
  format?: TextFormat;
}

/**
 * Padding inside a cell's borders, per edge, in **twips** (what `w:tcMar` takes).
 * An absent edge inherits the next level up; 0 is a real value, distinct from absent.
 */
export interface CellPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface TableCell {
  id: string;
  text: BiText;
  /**
   * A picture printed inside the cell, under its text (an extract boxed with its
   * photograph in one frame). An image, not `ContentBlock[]`: a cell is one `w:p`,
   * and a picture is the one thing that joins those runs without making the cell
   * recursive for every backend.
   */
  image?: CellImage;
  colSpan?: number;
  rowSpan?: number;
  align?: CellAlign;
  /** True when this cell is covered by a merge from above/left and must not render. */
  covered?: boolean;
  /** Padding for this cell alone — the innermost level. */
  padding?: CellPadding;
  /**
   * Formatting for the cell's text, layered over Body like any element. Per-cell
   * emphasis is the only mechanism an HKDSE table has (no header rows).
   */
  format?: TextFormat;
}

export interface TableRow {
  id: string;
  cells: TableCell[];
  /** Padding for every cell in this row, unless a cell overrides it. */
  cellPadding?: CellPadding;
  /**
   * A floor on the row's height, in twips — never a ceiling. Exports as
   * `w:trHeight hRule="atLeast"`, so a dragged height can never clip later typing.
   */
  minHeight?: number;
}

/**
 * Which side of its block a caption prints on. `below` is the default and stays
 * unstored. Per block, not per document — a table's heading sits above, a figure's
 * caption below, and one paper legitimately uses both.
 */
export type CaptionPlacement = 'above' | 'below';

/**
 * Which rules a table draws. Three named modes, deliberately not per-edge control
 * (removed once already for being wrong about real papers):
 *  - `all` — the ordinary ruled grid; unstored default.
 *  - `box` — one frame, nothing ruled inside (a boxed stimulus).
 *  - `headerRule` — the T-account: frame, one rule under the top row, one down the
 *    middle (a bank's balance sheet). Neither `all` nor `box` can reach it.
 * A mode earns its place by being a shape the syllabus draws the same way every year.
 */
export type TableBorders = 'all' | 'box' | 'headerRule';

/**
 * A picture inside a table cell. Its own type rather than `ImageBlock`: no caption,
 * no placement, and no id anything else addresses.
 */
export interface CellImage {
  /** data: URL or app-managed asset id. Never a remote URL. */
  src: string;
  widthPx: number;
  heightPx: number;
  altText: BiText;
}

export interface TableBlock {
  kind: 'table';
  id: string;
  rows: TableRow[];
  caption?: BiText;
  captionPlacement?: CaptionPlacement;
  /** Which rules the table draws. Undefined means `all`. */
  borders?: TableBorders;
  /** The table's own default padding, under every row, column and cell. */
  cellPadding?: CellPadding;
  /**
   * Padding by column index, between the row's and the cell's. Sparse by design; a
   * hole says nothing. Word has no column margin, so this flattens onto `w:tcMar`.
   */
  columnPadding?: (CellPadding | undefined)[];
  /**
   * Column widths as fractions of the *table's* width (undefined = equal), so
   * proportions survive paper/margin changes and stay independent of box resizes.
   */
  columnWidths?: number[];
  /** Fraction of the content width the table spans. Undefined means all (`w:tblW`). */
  width?: number;
  /**
   * The table's left edge, as a fraction of content width (`w:tblInd`). Only
   * meaningful while `align` is `left` — the two are alternative answers to the same
   * question (see `align`).
   */
  indent?: number;
  /**
   * How the table sits in the content column (`w:jc`). Undefined means `left`.
   * Genuinely not an indent: a centred table stays centred when margins change.
   * Mutually exclusive with `indent` by construction — choosing centre/right drops
   * `indent`; dragging the left edge returns `align` to `left`.
   */
  align?: TableAlign;
}

export interface ImageBlock {
  kind: 'image';
  id: string;
  /** data: URL or app-managed asset id. Never a remote URL. */
  src: string;
  widthPx: number;
  heightPx: number;
  /** Intrinsic size, used to keep the aspect ratio locked while resizing. */
  naturalWidthPx?: number;
  naturalHeightPx?: number;
  caption?: BiText;
  captionPlacement?: CaptionPlacement;
  /**
   * How the picture sits in the content column; undefined means `left`. Word models
   * this as `w:jc` on the paragraph holding the drawing, hence on the block. No
   * `indent` companion — "centre" is the whole answer for a picture.
   */
  align?: TableAlign;
  altText: BiText;
}

/**
 * An economics diagram, stored as geometry rather than pixels. Exports as a single
 * image (one `w:drawing`, one `<img>`); the raster is derived at export, never saved,
 * which is what keeps the diagram re-labellable.
 */
export interface DiagramBlock {
  kind: 'diagram';
  id: string;
  diagram: Diagram;
  /** Printed size. Height follows from the diagram's own aspect ratio. */
  widthPx: number;
  heightPx: number;
  /**
   * Deliberately no `caption`, alone among captionable blocks: `Diagram.title` draws
   * the words inside the exported image, so nothing can come unstuck from the figure.
   */
  altText: BiText;
  /** How the picture sits in the content column. Undefined means `left`; see `ImageBlock`. */
  align?: TableAlign;
}

export type ContentBlock = ParagraphBlock | TableBlock | ImageBlock | DiagramBlock;

export interface QuestionBase {
  id: string;
  type: string;
  /** The stem: paragraphs, tables, images, in order. */
  blocks: ContentBlock[];
  /** Flat marks for question types that carry their own (e.g. MCQ). */
  marks?: number;
}

export interface McqOption {
  id: string;
  text: BiText;
  /**
   * Content printed under the option's own line — for questions whose options are
   * figures. A blocks-bearing option is always forced `stacked`
   * (`resolveOptionLayout`): a tab-stop row cannot hold a picture per cell and would
   * drop the figures silently.
   */
  blocks?: ContentBlock[];
}

/**
 * How the four options are arranged. `undefined` means "decide from the option text"
 * — real papers mix short inline runs and stacked sentences.
 */
export type McqOptionLayout = 'stacked' | 'inline' | 'columns2';

export interface McqQuestion extends QuestionBase {
  type: 'mcq';
  /** Optional HKDSE combination-MCQ statements, rendered as (1)(2)(3)(4). */
  statements?: BiText[];
  options: McqOption[];
  answerIndex: number;
  explanation?: BiText;
  /** Omitted means auto: chosen from how long the options are. */
  optionLayout?: McqOptionLayout;
}

export interface QuestionSubPart {
  id: string;
  blocks: ContentBlock[];
  /**
   * Omitted when this sub-part is not separately marked — real papers give one marks
   * label to a *group* of sub-parts. Absent prints nothing; `0` prints "(0 marks)".
   * When no sub-part carries marks the total comes from the part's own `marks`.
   */
  marks?: number;
  answer?: BiText;
  /**
   * Dotted writing lines printed after this sub-part (the QAB's answer space) — on
   * the sub-part because that is where the booklet puts the room, and a flow element
   * cannot sit inside a question. Absent prints nothing.
   */
  answerSpace?: number;
}

export interface QuestionPart {
  id: string;
  /**
   * Unnumbered blocks printed *above* this part's number, at the stem's text column —
   * the mid-question interlude that revises the scenario for the parts below. It
   * belongs to the part below it (deleting/moving that part carries its lead-in).
   * A full `ContentBlock[]`: interludes are regularly tables or figures.
   */
  blocksBefore?: ContentBlock[];
  blocks: ContentBlock[];
  /**
   * The part's own marks. Normally omitted with sub-parts (the total derives from
   * them) — still read when the sub-parts share a single label and carry none.
   */
  marks?: number;
  subParts?: QuestionSubPart[];
  answer?: BiText;
  /**
   * Dotted writing lines after this part. On a part with sub-parts it prints after
   * the whole group.
   */
  answerSpace?: number;
}

export interface StructuredQuestion extends QuestionBase {
  type: 'structured';
  parts: QuestionPart[];
  /**
   * Dotted writing room under the stem, for a whole-question essay with no parts.
   * Only rendered when the question has **no parts**.
   */
  answerSpace?: number;
  /**
   * Print the trailing "(Total: N marks)" line. Off by default (per-part marking is
   * the norm); stored as opt-in so the absent field means the default. The total
   * itself is still derived, never stored.
   */
  showTotalMarks?: boolean;
}

export type Question = McqQuestion | StructuredQuestion;

/**
 * A design element that is not a question. Deliberately outside the `Question` union:
 * these take no number and no marks, so registering them would force numbering and
 * marks totalling to learn about types that have neither.
 */
export type LayoutElement =
  /** A free-standing heading, independent of the section heading. */
  | { kind: 'heading'; id: string; text: BiText; format?: TextFormat }
  /** A note, rubric line, or any prose that is not part of a question. */
  | { kind: 'text'; id: string; text: BiText; format?: TextFormat }
  /** Vertical whitespace, e.g. an answer area. Height in points. */
  | { kind: 'spacer'; id: string; heightPt: number }
  /** A horizontal rule. */
  | { kind: 'divider'; id: string }
  /** Forces the following content onto a new page. */
  | { kind: 'pageBreak'; id: string }
  /** Ruled writing lines for a handwritten answer. */
  | { kind: 'answerLines'; id: string; lines: number }
  /**
   * Dotted writing lines, the QAB's answer space. A different primitive from
   * `answerLines`, not a variant: different mechanism, pitch and Word style, and a
   * variant flag would change what existing documents mean.
   */
  | {
      kind: 'answerSpace';
      id: string;
      /**
       * The printed line count. For a `fill` element this is the **resolved** value
       * the paginator last wrote, kept in the model so every backend reads the same
       * number the preview showed.
       */
      lines: number;
      /**
       * Fill the rest of the sheet: `lines` becomes the paginator's output, not the
       * author's input. A fill element always ends its sheet, which is what makes
       * resolution a single pass.
       */
      fill?: boolean;
    }
  /**
   * A part header: "Part A: Multiple-choice questions (19 marks)". The marks total is
   * derived from the enclosing section's questions.
   */
  | { kind: 'partHeader'; id: string; text: BiText; showMarks?: boolean; format?: TextFormat }
  /**
   * The MCQ paper's lead-in ("There are 45 questions in this paper. …"). The count is
   * derived from the document; the wording is authored `prefix`/`suffix` around it,
   * the same decomposition a `BandField` uses.
   */
  | {
      kind: 'questionCount';
      id: string;
      /** Wording before the number. Absent falls back to the reference's own phrasing. */
      prefix?: BiText;
      /** Wording after the number, carrying the rest of the sentence. */
      suffix?: BiText;
      format?: TextFormat;
    }
  /**
   * A section heading, and the point at which question numbering may restart.
   * A section is a **marker in the flow, not a container** — the questions live in
   * the one document-wide flow, which is what lets a section begin mid-sheet.
   */
  | {
      kind: 'section';
      id: string;
      text: BiText;
      restartNumbering?: boolean;
      /** Append the derived "(44 marks)" suffix, as `partHeader` does. Opt-in. */
      showMarks?: boolean;
      format?: TextFormat;
    }
  /**
   * A borderless label/value list: "First preference:  Watching a movie".
   * Exports as tab stops, not a table.
   */
  | {
      kind: 'labelList';
      id: string;
      rows: Array<{ id: string; label: BiText; value: BiText }>;
      /** Where the value column starts, as a fraction of the row width. */
      valueAt?: number;
      indent?: number;
      /**
       * Hang the value column so a wrapped value stays in its own column (numbered
       * instructions). When set it supersedes `valueAt`.
       */
      hanging?: number;
      format?: TextFormat;
    };

/**
 * One component inside a band zone. Kinds that print a number derive it at render
 * time — which is why they are their own kind rather than text a teacher retypes.
 */
export type BandField =
  /** Authored text: a title, a subtitle, "Time allowed: 60 minutes". */
  | { kind: 'text'; id: string; text: BiText; format?: TextFormat }
  /** "Full marks: 45 marks", with the total derived from the whole worksheet. */
  | {
      kind: 'totalMarks';
      id: string;
      /**
       * @deprecated Superseded by `prefix`. Read only by `migrateFieldWording`
       * (v5→v6); nothing else may consult it.
       */
      label?: BiText;
      prefix?: BiText;
      suffix?: BiText;
      format?: TextFormat;
    }
  /** A ruled fill-in field: "Name: ______". */
  | {
      kind: 'fillIn';
      id: string;
      /** @deprecated Superseded by `prefix`; see the note on `totalMarks.label`. */
      label?: BiText;
      prefix?: BiText;
      suffix?: BiText;
      widthCh?: number;
      format?: TextFormat;
    }
  /**
   * A live page number, printed to a pattern. One field, not a three-part assembly —
   * the numbers stay Word `PAGE`/`NUMPAGES` fields whichever pattern is chosen.
   */
  | {
      kind: 'pageNumber';
      id: string;
      /** `plain` → "5", `pDot` → "P.5", `longForm` → "Page 5 of 12". */
      pattern?: 'plain' | 'pDot' | 'longForm';
      prefix?: BiText;
      suffix?: BiText;
      format?: TextFormat;
    };

/**
 * Which authored side of a band field a target names. Every band field is
 * *authored text · derived value · authored text*; `longForm` page numbers interleave
 * two values, which is why segments are a list.
 */
export type BandFieldSide = 'prefix' | 'suffix';

/** Left / centre / right zones of one band. */
export interface BandZones {
  left: BandField[];
  center: BandField[];
  right: BandField[];
}

/**
 * A horizontal band of three drop zones — the constrained alternative to free
 * positioning. Every arrangement maps onto one Word paragraph with tab stops.
 */
export interface Band {
  id: string;
  zones: BandZones;
  /** Hairline rule under the band. */
  rule?: boolean;
}

/**
 * One entry in the document's flow: either a question or a layout element.
 * `questions` stays the numbering-relevant list; `flow` interleaves layout elements.
 */
export type FlowItem =
  | { type: 'question'; id: string }
  | { type: 'layout'; id: string };

/**
 * A section as authored before v5, when it was a container. Kept only so `migrate`
 * can read documents written by older builds; nothing produces these any more.
 */
export interface LegacySection {
  id: string;
  heading?: BiText;
  headingFormat?: TextFormat;
  restartNumbering?: boolean;
  questions: Question[];
  layout?: LayoutElement[];
  flow?: FlowItem[];
}

export interface FontPair {
  latin: string;
  eastAsia: string;
}

export type PaperSize = 'A4' | 'A3' | 'Letter' | 'Legal';
export type Orientation = 'portrait' | 'landscape';

/** Page margins in twips (1/1440 inch), matching Word's `w:pgMar`. */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageSetup {
  paper: PaperSize;
  orientation: Orientation;
  margins: PageMargins;
}

/**
 * Header/footer content as authored before v6. Kept only so `migrate` can read
 * documents written by older builds; a header is `Band[]` now.
 */
export type HeaderFooterPart =
  | { kind: 'text'; id: string; text: BiText }
  | { kind: 'pageNumber'; id: string }
  | { kind: 'pageCount'; id: string };

/** Left / centre / right, as authored before v6. See `HeaderFooterPart`. */
export interface HeaderFooterSlots {
  left: HeaderFooterPart[];
  center: HeaderFooterPart[];
  right: HeaderFooterPart[];
}

/**
 * A page header or footer: a list of printed rows — deliberately the **same** `Band`
 * the masthead uses (real papers stack rows), so there is one editing surface, one
 * drag interaction and one exporter path.
 */
export interface HeaderFooter {
  enabled: boolean;
  /** One `Band` per printed row. */
  bands: Band[];
  /** Hairline rule under a header / above a footer. */
  rule?: boolean;
  /** When false, the first page omits it (title pages usually should). */
  showOnFirstPage?: boolean;
  /**
   * Rows printed on page 1 *instead of* `bands` (Word: `w:titlePg` + a
   * `w:type="first"` part). Three states:
   *   - absent, `showOnFirstPage !== false` → page 1 shows `bands`;
   *   - `showOnFirstPage: false`            → page 1 shows nothing;
   *   - `firstPage` present                 → page 1 shows these rows.
   */
  firstPage?: {
    bands: Band[];
    /** Rule on the page-1 variant. Falls back to the main `rule` when absent. */
    rule?: boolean;
  };
}

/**
 * Per-page furniture: the QAB's page frame and rotated margin notes. Geometry lives
 * in `model/pageFurniture.ts`; the type sits here because `Worksheet` carries it.
 */
export interface PageFurniture {
  /** Draw the page frame rectangle on every sheet. */
  frame?: boolean;
  /** Rotated note down both vertical margins. Absent draws no notes. */
  marginNote?: BiText;
}

export interface Worksheet {
  schemaVersion: number;
  id: string;
  title: BiText;
  titleFormat?: TextFormat;
  instructions?: BiText;
  instructionsFormat?: TextFormat;
  /**
   * Every question in the document, in printed order — the authority on question
   * order and the list numbering walks.
   */
  questions: Question[];
  /** Non-question design elements, addressed by id from `flow`. */
  layout: LayoutElement[];
  /**
   * Display order of everything, questions and layout interleaved. Ids missing from
   * the flow are appended, so adding a question never depends on the flow.
   */
  flow: FlowItem[];
  fonts: FontPair;
  /**
   * The document's body text size, in points; absent means 11. A *document*
   * property, not a style override — the QAB's whole body is 10pt, and per-element
   * seeding would revert on the first typed question. The fixed 12pt line is
   * untouched.
   */
  baseFontSize?: number;
  /** The masthead: bands printed above the instructions. Absent renders `title`. */
  bands?: Band[];
  /**
   * A mock-exam cover page, printed before everything else. Its own field because a
   * cover is a two-column page of regions no stack of rows can express.
   */
  cover?: CoverPage;
  /**
   * The QAB's per-page furniture: frame and margin notes via one running header.
   * Absent draws nothing.
   */
  pageFurniture?: PageFurniture;
  /** Paper, orientation and margins. Optional for documents saved before v3. */
  pageSetup?: PageSetup;
  header?: HeaderFooter;
  footer?: HeaderFooter;
  createdAt: string;
  updatedAt: string;
  /**
   * Fields written by a NEWER app version. Preserved verbatim through load/save so
   * round-tripping never drops data.
   */
  __unknown?: Record<string, unknown>;
}

export type LanguageMode = 'en' | 'zh' | 'bilingual';
export type VersionMode = 'student' | 'teacher';

export interface OutputMode {
  language: LanguageMode;
  version: VersionMode;
}
