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

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  vertAlign?: VertAlign;
}

export type RichText = InlineRun[];

export interface BiText {
  en: RichText;
  zh: RichText;
}

export type CellAlign = 'left' | 'center' | 'right';

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

export interface TableCell {
  id: string;
  text: BiText;
  colSpan?: number;
  rowSpan?: number;
  align?: CellAlign;
  /** True when this cell is covered by a merge from above/left and must not render. */
  covered?: boolean;
}

export interface TableRow {
  id: string;
  cells: TableCell[];
}

export interface TableBlock {
  kind: 'table';
  id: string;
  rows: TableRow[];
  headerRowCount: number;
  caption?: BiText;
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
  | { kind: 'totalMarks'; id: string; label?: BiText; format?: TextFormat }
  /** A ruled fill-in field: "Name: ______". */
  | { kind: 'fillIn'; id: string; label: BiText; widthCh?: number; format?: TextFormat }
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
      format?: TextFormat;
    };

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
 * One entry in a section's flow: either a question or a layout element.
 *
 * Sections keep `questions` as the numbering-relevant list and interleave layout
 * elements via `flow`, so a teacher can put a divider or an instruction between
 * question 3 and question 4 and drag any of them past the others.
 */
export type SectionItem =
  | { type: 'question'; id: string }
  | { type: 'layout'; id: string };

export interface Section {
  id: string;
  heading?: BiText;
  headingFormat?: TextFormat;
  /** Restart question numbering at 1 for this section (§4). */
  restartNumbering?: boolean;
  questions: Question[];
  /** Non-question design elements, addressed by id from `flow`. */
  layout?: LayoutElement[];
  /**
   * Display order of everything in the section. Absent means "questions in their
   * array order", which is how every pre-v4 document behaves; ids missing from the
   * flow are appended, so adding a question never depends on the flow being updated.
   */
  flow?: SectionItem[];
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
  sections: Section[];
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
