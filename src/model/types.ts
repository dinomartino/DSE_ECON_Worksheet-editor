/**
 * Core document model (PRD §3).
 *
 * Rules that the rest of the codebase depends on:
 *  - Every user-visible string is a `BiText` (en + zh), each side a run array.
 *  - Numbering is NEVER stored; it is derived at render time (§4).
 *  - Marks totals are NEVER stored; they are computed (§3.5).
 *  - `Question` is a discriminated union on `type`; new variants are added via the
 *    registry (§9) without touching numbering / persistence / export plumbing.
 */

import type { Diagram } from './diagram';

export type VertAlign = 'superscript' | 'subscript';

/**
 * One stretch of text that shares formatting — the unit Word calls a run.
 *
 * Formatting is **per run, not per element**: a single question stem can hold a 14pt
 * bold phrase next to ordinary body text, because a `RichText` is an array of these and
 * each carries its own attributes. This mirrors `w:r`/`w:rPr` exactly, which is what
 * lets one paragraph export as several runs with different properties.
 *
 * Every field is optional and means "inherit". A run inherits from the element's own
 * `TextFormat`, which in turn inherits from the named style — so the three layers
 * compose and a document that never touches formatting still exports style-only
 * (§ Per-element formatting).
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
 * The run-level attributes, without the text. What a toolbar applies to a selection.
 *
 * `null` clears an attribute back to inherited, which a bare `undefined` cannot express
 * in a patch — `{ bold: undefined }` is indistinguishable from "not mentioned" once
 * spread over an existing run.
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
 *
 * Distinct from `CellAlign`, which places text inside one cell. Same three words, two
 * unrelated decisions: a left-aligned table can hold centred cells and usually does.
 */
export type TableAlign = 'left' | 'center' | 'right';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/**
 * Per-element formatting overrides.
 *
 * Named styles (§7.3) still supply every default; this only records the deltas a
 * teacher chose deliberately, so a worksheet that never touches formatting exports
 * exactly as before and a later change to a style still reaches everything that did
 * not override it. Every field is optional and means "leave the style's value alone".
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
 * The breathing room inside a cell's borders, per edge, in **twips**.
 *
 * Twips because that is what Word's `w:tcMar` takes and what `pageSetup` already stores,
 * so the exporter writes these numbers straight out and the preview converts once — the
 * same reason margins are not held in points or millimetres.
 *
 * Every edge is optional and means "inherit the next level up" (§ padding resolves in one
 * direction). An edge set to 0 is a real value, deliberately distinct from absent: a
 * teacher tightening a dense table to the border must not read as having said nothing.
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
  colSpan?: number;
  rowSpan?: number;
  align?: CellAlign;
  /** True when this cell is covered by a merge from above/left and must not render. */
  covered?: boolean;
  /**
   * Padding for this cell alone — the innermost level, beating its column, row and table.
   */
  padding?: CellPadding;
  /**
   * Formatting for the cell's text, layered over the Body style like every other element.
   *
   * A cell is a `w:p` inside a `w:tc`, so it takes direct formatting exactly as a stem
   * paragraph does; this is what lets the toolbar bold a heading cell. Emphasis in an
   * HKDSE table is per-cell precisely because the papers have no header row to carry it
   * (see the note on this block).
   */
  format?: TextFormat;
}

export interface TableRow {
  id: string;
  cells: TableCell[];
  /** Padding for every cell in this row, unless a cell overrides it. */
  cellPadding?: CellPadding;
  /**
   * A floor on the row's height, in twips — never a ceiling.
   *
   * Exports as `w:trHeight` with `hRule="atLeast"`, which is Word's own default: a row
   * whose text needs more space still grows, so dragging a row taller can never clip what
   * is typed into it later. `hRule="exact"` would match the paragraph line box, but a
   * table cell is the one place in this document where content, not the grid, decides the
   * height — the reference tables' rows are as tall as their wrapped labels need.
   */
  minHeight?: number;
}

/**
 * A table: rows of cells, and nothing about which of them is a "header".
 *
 * There was a `headerRowCount` here, and it was wrong about real papers. It drove three
 * things in the `.docx` — `w:tblHeader`, grey `EFEFEF` shading and bold text — while
 * **no HKDSE table has any of them**: the reference papers rule plain uniform borders
 * and set every cell in the same weight. So the default of 1 produced output a teacher's
 * first action was to undo.
 *
 * It could not express the papers either. A distribution table's top-left cell is empty
 * with headings running across the top *and* down the left side, which is not a count of
 * rows. Emphasis is therefore per-cell formatting like any other text, which reaches a
 * left-hand column as easily as a top row.
 */
/**
 * Which side of its block a caption prints on.
 *
 * `below` is the default and stays **unstored**, so every existing document exports
 * byte-identically (§formatting layers over named styles — the same rule: only a
 * deviation is written down).
 *
 * Both conventions are real in the reference material and they are not interchangeable:
 * a table's heading conventionally sits *above* it, while a figure's caption sits below.
 * The choice is per block rather than per document because one paper legitimately uses
 * both.
 */
export type CaptionPlacement = 'above' | 'below';

export interface TableBlock {
  kind: 'table';
  id: string;
  rows: TableRow[];
  caption?: BiText;
  captionPlacement?: CaptionPlacement;
  /** The table's own default padding, under every row, column and cell. */
  cellPadding?: CellPadding;
  /**
   * Padding by column index, sitting between the row's and the cell's.
   *
   * Sparse by design: a hole means "that column says nothing", which is not the same as
   * a column padded to zero. Word has no column-level margin, so this is flattened onto
   * each `w:tcMar` at export (§ padding resolves in one direction).
   */
  columnPadding?: (CellPadding | undefined)[];
  /**
   * Column widths as fractions of the table's own width, in column order.
   *
   * Undefined means equal columns, which is what every table did before widths existed.
   * Fractions rather than twips so a table keeps its proportions when the paper size or
   * the margins change — the same reason `ColumnsNode` positions are fractions.
   *
   * Of the *table's* width, not the page's: a narrowed table's columns keep their shares
   * of whatever it now spans, so resizing the table as a whole and resizing one column
   * stay independent gestures.
   */
  columnWidths?: number[];
  /**
   * How much of the content width the table spans, as a fraction. Undefined means all.
   *
   * A real paper's table often does not fill the column — the distribution table in the
   * reference set is inset from both sides — and Word models that with a `w:tblW` under
   * the content width rather than by padding the outer cells.
   */
  width?: number;
  /**
   * The table's left edge, as a fraction of the content width from the left margin.
   *
   * Separate from `width` because they are what the two outer-edge drags each change:
   * pulling the right edge resizes alone, pulling the left edge resizes *and* indents.
   * Exports as `w:tblInd`.
   *
   * Only meaningful while `align` is `left`: the two are alternative ways to place the
   * same edge, and Word lets only one of them speak (see `align`).
   */
  indent?: number;
  /**
   * How the table sits in the content column. Undefined means `left`.
   *
   * Word models this as `w:jc` on the table, and it is genuinely *not* the same thing as
   * an indent: Q19 of the reference paper centres its table with `<w:jc w:val="center"/>`
   * and no `w:tblInd` at all, while its six sibling tables carry an indent and no `w:jc`.
   * A centred table stays centred when the paper or the margins change, where an indent
   * chosen to look centred does not — which is the whole reason Word offers both.
   *
   * So they are mutually exclusive by construction rather than by convention: choosing
   * centre or right drops `indent`, and dragging the left edge returns `align` to `left`.
   * Storing both would leave two answers to "where is the left edge" and let the page and
   * the `.docx` pick different ones.
   */
  align?: TableAlign;
}

export interface ImageBlock {
  kind: 'image';
  id: string;
  /** data: URL or app-managed asset id. Never a remote URL (§3.3). */
  src: string;
  widthPx: number;
  heightPx: number;
  /** Intrinsic size, used to keep the aspect ratio locked while resizing. */
  naturalWidthPx?: number;
  naturalHeightPx?: number;
  caption?: BiText;
  captionPlacement?: CaptionPlacement;
  altText: BiText;
}

/**
 * An economics diagram, stored as geometry rather than as pixels.
 *
 * It exports as a **single image** — one `w:drawing` in Word, one `<img>` on the
 * clipboard — because that is the only form Word can be trusted to place, size and
 * print identically everywhere. Keeping the geometry in the document is what lets the
 * teacher come back and re-label a curve or move an equilibrium point instead of
 * redrawing, and it is why the block stores a `Diagram` and not a data URL: the raster
 * is derived at export time (§7.5), never saved.
 */
export interface DiagramBlock {
  kind: 'diagram';
  id: string;
  diagram: Diagram;
  /** Printed size. Height follows from the diagram's own aspect ratio. */
  widthPx: number;
  heightPx: number;
  caption?: BiText;
  captionPlacement?: CaptionPlacement;
  altText: BiText;
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
}

/**
 * How the four options are arranged on the page.
 *
 * Real papers mix these within one part: short options ("(1) and (2) only") run along
 * one line to save vertical space, while full-sentence options stack. `undefined` means
 * "decide from the option text", which is what makes the common case need no setting.
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
  marks: number;
  answer?: BiText;
}

export interface QuestionPart {
  id: string;
  blocks: ContentBlock[];
  /** Omitted when the part has sub-parts; totals then derive from them. */
  marks?: number;
  subParts?: QuestionSubPart[];
  answer?: BiText;
}

export interface StructuredQuestion extends QuestionBase {
  type: 'structured';
  parts: QuestionPart[];
  /**
   * Print the trailing "(Total: N marks)" line. **Off by default.**
   *
   * A multi-part question is normally marked purely per-part, so repeating the sum at
   * the end is noise — which is why the default is to omit it. Stored as an opt-*in*
   * rather than as `hideTotalMarks`, so that the absent field means the default: a
   * negative flag would have required writing `hideTotalMarks: true` into every
   * question just to get the ordinary case.
   *
   * The total itself is still derived, never stored (§3.5); this only decides whether
   * it is printed.
   */
  showTotalMarks?: boolean;
}

export type Question = McqQuestion | StructuredQuestion;

/**
 * A design element that is not a question.
 *
 * These deliberately sit outside the `Question` union: they take no number and carry
 * no marks, so putting them in the registry would force numbering and marks totalling
 * to learn about types that have neither. Keeping them separate is what lets §4 and
 * §3.5 stay unchanged.
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
   * A part header: "Part A: Multiple-choice questions (19 marks)".
   *
   * The marks total is derived from the questions in the enclosing section, so it stays
   * correct when a question is added, removed or re-marked (§3.5).
   */
  | { kind: 'partHeader'; id: string; text: BiText; showMarks?: boolean; format?: TextFormat }
  /**
   * A section heading, and the point at which question numbering may restart (§4).
   *
   * A section is a **marker in the flow, not a container**. It names the run of questions
   * that follows it and optionally restarts their numbering, while the questions
   * themselves live in the one document-wide flow. That is what lets a section begin
   * mid-sheet — which every real paper does, and which the user explicitly wants — without
   * a page and a section disagreeing about which of them owns an item.
   *
   * Before this, a section owned `questions`/`layout`/`flow`, so a sheet shared by two
   * sections had to be shown as two page groups in the outline, an insert had to guess
   * which container to land in, and moving a page had to carry ids between containers
   * first. Making the section a marker deletes all three problems rather than refereeing
   * them.
   *
   * `restartNumbering` travels with the heading a teacher can see and drag, which is why
   * it lives here rather than on a separate stored list.
   */
  | {
      kind: 'section';
      id: string;
      text: BiText;
      restartNumbering?: boolean;
      format?: TextFormat;
    }
  /**
   * A borderless label/value list: "First preference:  Watching a movie".
   *
   * A table would draw borders and be awkward to edit; this exports as tab stops.
   */
  | {
      kind: 'labelList';
      id: string;
      rows: Array<{ id: string; label: BiText; value: BiText }>;
      /** Where the value column starts, as a fraction of the row width. */
      valueAt?: number;
      indent?: number;
      format?: TextFormat;
    };

/**
 * One component inside a band zone.
 *
 * These are the small pieces a paper's masthead is made of. Two of them print a number
 * that is **computed, never stored** — `totalMarks` from `worksheetMarks()` — which is
 * exactly why they are their own kind rather than text a teacher retypes and has to keep
 * in sync after editing a question (§3.5).
 */
export type BandField =
  /** Authored text: a title, a subtitle, "Time allowed: 60 minutes". */
  | { kind: 'text'; id: string; text: BiText; format?: TextFormat }
  /** "Full marks: 45 marks", with the total derived from the whole worksheet. */
  | {
      kind: 'totalMarks';
      id: string;
      /**
       * @deprecated Superseded by `prefix`, which is rich text rather than a plain
       * label. Read only by `migrateFieldWording` (v5→v6); nothing else may consult it.
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
   * A live page number, printed to a pattern.
   *
   * One field rather than the old three-part assembly (pageNumber + literal text +
   * pageCount), because every reference paper writes it as a single idiom — "P.5",
   * "Page 3 of 12", a bare "2" — and hand-building that from parts put the burden of
   * getting the spacing right on the teacher. The numbers stay Word `PAGE`/`NUMPAGES`
   * fields whichever pattern is chosen, so they renumber per page (§7.1).
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
 * The authored wording around a computed value, and which side it sits on.
 *
 * Every band field is *authored text · derived value · authored text*. Naming the two
 * authored halves once is what lets one editing surface, one write path and one
 * exporter serve all four kinds without branching on the kind at each site — a
 * computed field differs from a plain text field only in having something inert in
 * the middle.
 *
 * `longForm` page numbers are the reason this is a list rather than a single pair:
 * "Page 5 of 12" interleaves two derived numbers with three authored gaps.
 */
export type BandFieldSide = 'prefix' | 'suffix';

/** Left / centre / right zones of one band. */
export interface BandZones {
  left: BandField[];
  center: BandField[];
  right: BandField[];
}

/**
 * A horizontal band of three drop zones.
 *
 * This is the constrained alternative to free positioning: a component can be dragged
 * between zones and reordered within one, but it can never land at an arbitrary x/y.
 * Every arrangement therefore maps onto something Word can express — one paragraph per
 * row of the band, with tab stops — so what the teacher arranges is what exports.
 */
export interface Band {
  id: string;
  zones: BandZones;
  /** Hairline rule under the band. */
  rule?: boolean;
}

/**
 * One entry in the document's flow: either a question or a layout element.
 *
 * The worksheet keeps `questions` as the numbering-relevant list and interleaves layout
 * elements via `flow`, so a teacher can put a divider or an instruction between
 * question 3 and question 4 and drag any of them past the others.
 */
export type FlowItem =
  | { type: 'question'; id: string }
  | { type: 'layout'; id: string };

/**
 * A section as authored before v5, when it was a container.
 *
 * Kept only so `migrate` can read a document written by an older build — the same reason
 * `HeaderSlot` below is kept. Nothing in the app produces these any more: a section is a
 * `section` **layout element** in the one document flow, so that a page and a section can
 * no longer disagree about which of them owns a question.
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
 * One piece of header/footer content, as authored before v6.
 *
 * Kept only so `migrate` can read a document written by an older build. Nothing in the
 * app produces these any more — a header is `Band[]` now, and a band's `BandField`
 * covers every one of these kinds plus fill-in rules the old shape could not express.
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
 * A page header or footer: a list of printed rows.
 *
 * `bands` rather than a single left/centre/right triple, and deliberately the **same**
 * `Band` the masthead uses. Real papers stack rows — `real_life_reference/head2.png`
 * runs an exam line with a page number, then three centred title rows, then a marks
 * line beside a "Date:____" rule — and a one-row model could not express any of that.
 *
 * Sharing `Band` rather than growing a parallel type means one editing surface, one
 * drag-between-zones interaction and one exporter path: a header row and a masthead row
 * are the same thing printed in a different part of the page, and both already map onto
 * a single Word paragraph with tab stops (§ "One row, many uses").
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
   * Rows printed on page 1 *instead of* `bands`.
   *
   * Page 1 of a real exam paper rarely carries the same header as page 2: the cover
   * states the school, the paper and a "Name:____" rule, while continuation pages carry
   * a running title and a page number. Word models exactly this with `w:titlePg` plus a
   * `w:type="first"` part, so this maps onto one flag and one extra part rather than a
   * second section.
   *
   * Three states, not two, which is why this is a separate field rather than a wider
   * reading of `showOnFirstPage`:
   *   - absent, `showOnFirstPage !== false` → page 1 shows `bands` (the default);
   *   - `showOnFirstPage: false`            → page 1 shows nothing;
   *   - `firstPage` present                 → page 1 shows *these* rows.
   *
   * Absent means "behave exactly as before", so every saved document keeps its output
   * and no migration is needed.
   */
  firstPage?: {
    bands: Band[];
    /** Rule on the page-1 variant. Falls back to the main `rule` when absent. */
    rule?: boolean;
  };
}

export interface Worksheet {
  schemaVersion: number;
  id: string;
  title: BiText;
  titleFormat?: TextFormat;
  instructions?: BiText;
  instructionsFormat?: TextFormat;
  /**
   * Every question in the document, in printed order.
   *
   * This is the authority on question order and the list §4 numbering walks. A section
   * no longer owns a slice of it — sections are `section` layout elements sitting in
   * `flow`, so a run of questions belongs to whichever section marker precedes it.
   */
  questions: Question[];
  /** Non-question design elements, addressed by id from `flow`. */
  layout: LayoutElement[];
  /**
   * Display order of everything in the document, questions and layout interleaved.
   *
   * Ids missing from the flow are appended, so adding a question never depends on the
   * flow being updated — the same tolerance the per-section flow had.
   */
  flow: FlowItem[];
  fonts: FontPair;
  /**
   * The masthead: bands of left/centre/right zones printed above the instructions.
   *
   * Absent means "just render `title`", which is how every pre-v5 document behaves, so
   * adding this changes nothing until a teacher builds a title block.
   */
  bands?: Band[];
  /** Paper, orientation and margins. Optional for documents saved before v3. */
  pageSetup?: PageSetup;
  header?: HeaderFooter;
  footer?: HeaderFooter;
  createdAt: string;
  updatedAt: string;
  /**
   * Fields written by a NEWER app version that this build does not understand.
   * Preserved verbatim through load/save (§6) so round-tripping never drops data.
   */
  __unknown?: Record<string, unknown>;
}

export type LanguageMode = 'en' | 'zh' | 'bilingual';
export type VersionMode = 'student' | 'teacher';

export interface OutputMode {
  language: LanguageMode;
  version: VersionMode;
}
