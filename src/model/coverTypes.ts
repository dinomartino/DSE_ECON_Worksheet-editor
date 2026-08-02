import type { BiText, FontPair, TextFormat } from './types';

/**
 * A mock-exam cover page.
 *
 * ## Why a cover is its own model, and not layout elements
 *
 * A first attempt built covers out of the existing pieces — masthead `Band`s plus flow
 * elements — and it could not produce the shape at all. A band is one printed row across
 * the full text column, so a stack of them makes a stack of centred lines. The reference
 * cover is nothing like that: **two unequal columns side by side**, a corner block hung
 * outside the text column, and a bordered panel in the right column. No arrangement of
 * full-width rows reaches it.
 *
 * The reference's own mechanism, read out of its `word/document.xml`:
 *
 * ```
 * <w:cols w:num="2" w:equalWidth="0">
 *   <w:col w:w="5328" w:space="144"/>   left  — identity, title, instructions
 *   <w:col w:w="3845"/>                 right — the candidate panel
 * </w:cols>
 * ```
 *
 * So a cover is modelled as what it is: **a page divided into named regions**, each
 * holding lines of text. That is still slot-based — a teacher fills regions rather than
 * dragging boxes to arbitrary coordinates (§ layout is slot-based, never free) — but the
 * slots are *areas of a page* rather than thirds of a row.
 *
 * ## What is reproduced and what is not
 *
 * The **structure** is reproduced: a two-column exam cover is a layout, not anybody's
 * property. The **wording is this project's own** — none of the reference's rubric prose,
 * authority or examination lines, or copyright notice. `cover.test.ts` guards that with a
 * phrase blocklist and a sliding-window check against the real file.
 *
 * The right-hand panel is deliberately **name / class / class number**, not a barcode box
 * and candidate number: those are the HKEAA's own apparatus, and a school mock identifies
 * its candidates by name anyway. Same slot, same place, doing the job a school needs.
 */

/**
 * Which paper the cover fronts.
 *
 * The two DSE papers differ in where candidates put their answers, which is what their
 * instructions have to say — an MCQ paper points at a separate answer sheet, a write-in
 * booklet at the spaces provided.
 */
export type CoverPaperStyle = 'mcq' | 'writeIn';

/**
 * One line of a cover region.
 *
 * Its own small type rather than a `ContentBlock`, because every line on a cover is a
 * single run of text with a size and a weight — the block vocabulary (tables, images,
 * diagrams) would be noise here, and a cover line has to stay a *line* for the two-column
 * geometry to hold.
 */
export interface CoverLine {
  id: string;
  text: BiText;
  format?: TextFormat;
  /**
   * Blank lines printed *after* this one, to group the identity block.
   *
   * The reference does not run its cover lines together: the paper name and its kind sit
   * as a pair, then air, then the timing, then more air before INSTRUCTIONS. Air on a
   * cover is structural — it is what separates "which paper this is" from "how long you
   * have" — so it is authored per line rather than baked into the generator's ordering.
   *
   * A count of blank lines rather than a `spaceAfter`, for the reason the whole document
   * uses: the page runs on a fixed 12pt line with no paragraph spacing, so separation
   * costs a line (§ one fixed line, no paragraph spacing).
   */
  gapAfter?: number;
}

/** A named region of the cover; what the editor addresses and what a click reports. */
export type CoverRegion = 'corner' | 'head' | 'instructions' | 'panel' | 'foot';

/**
 * The page divided into the regions the reference actually uses.
 *
 * Every field is optional, and an absent one prints nothing — so a teacher can strip a
 * cover back to a title and a name box without meeting empty frames.
 */
export interface CoverPage {
  /**
   * The corner code block: "2019-DSE / ECON / PAPER 2" in the reference.
   *
   * Hung at the top-left, above the identity lines. Its own region because nothing else
   * sits there and because it is what a paper is recognised by at a glance.
   */
  cornerLines?: CoverLine[];
  /** Draw the diagonal rule across the corner block, as the reference does. */
  cornerRule?: boolean;

  /** Identity lines in the left column: school, examination, paper name, timing. */
  headLines?: CoverLine[];

  /** "INSTRUCTIONS". Its own field so the heading can be renamed or removed. */
  instructionsHeading?: BiText;
  /**
   * How an instruction's number is written: `1.` or `(1)`.
   *
   * The two reference papers genuinely differ — Paper 1 numbers `1.`, Paper 2 `(1)` — and
   * it is a house style a school may have its own view on, so it is stored rather than
   * derived from `paperStyle`. The number itself is still derived from position.
   */
  instructionMarker?: 'dot' | 'paren';
  /**
   * The numbered instruction list.
   *
   * The numbers are **derived from position**, never stored — the same rule questions
   * follow, so deleting instruction (2) renumbers the rest instead of leaving a hole.
   */
  instructions?: CoverLine[];

  /** Framed note at the top of the right column. */
  panelNote?: BiText;
  /** Label beside the boxed grid under the note. */
  panelFieldLabel?: BiText;
  /** How many boxes the grid has. 0 or absent draws none. */
  panelBoxes?: number;

  /** Footer block at the bottom of the left column. */
  footLines?: CoverLine[];

  /**
   * A boxed note at the bottom-right of the page — the reference's Paper 1 carries one
   * ("keep the paper on your desk" territory, in this project's own words). It prints
   * beside the foot block, framed; empty or absent draws nothing.
   */
  footNote?: BiText;

  /**
   * The face the cover's *unstyled* lines take.
   *
   * A cover is typographically its own thing, but the two reference papers differ in how
   * far that goes, so this is a **default rather than a blanket**: any line may override
   * it through its own `format.fonts` (§`createCoverPage`).
   *
   * - Paper 2 sets the whole front page in Arial.
   * - Paper 1 mixes deliberately: Arial for the corner block, the authority lines and the
   *   paper's name; Times New Roman for the timing, "INSTRUCTIONS" and the instruction
   *   body. The sans lines are the ones a candidate reads at a glance; the serif lines are
   *   the ones they read properly.
   *
   * A single cover-wide font could express Paper 2 and not Paper 1, which is why the face
   * has to reach a line rather than the page.
   */
  fonts?: FontPair;

  /**
   * Column split in twips, mirroring `w:cols w:equalWidth="0"`.
   *
   * Stored rather than derived because it is genuinely a choice: the reference splits
   * 5328 / 144 / 3845, but a cover with no panel wants one wide column.
   */
  columns?: { left: number; gap: number; right: number };
}
