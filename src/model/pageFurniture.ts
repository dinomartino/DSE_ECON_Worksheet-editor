import type { PageFurniture, PageMargins } from './types';
import { bi } from './text';

export type { PageFurniture } from './types';

/*
 * Per-page furniture: the QAB's page frame and rotated margin notes.
 *
 * The reference booklet draws a rectangle around every page's writing area and sets a
 * rotated sentence down each vertical margin. Its own mechanism is **anchored shapes
 * inside the header** — a `prstGeom prst="rect"` and two `bodyPr vert="vert270"`
 * textboxes — which is why that file carries 21 header parts: Word needs a section per
 * page to vary the incidental apparatus beside them. Stripped of that apparatus the
 * furniture is identical on every page, so this app emits **one running header** that
 * repeats, and no per-page sections (§ a page is derived).
 *
 * Wording is authorable and defaults to a neutral phrase. The reference's own margin
 * sentence is rubric — reproduced structure, never prose (§ copyright) — so the
 * default cannot ship it; a school types its own line, or the HKEAA one if it may.
 */

/**
 * The reference's furniture geometry, in twips, measured out of its `header2.xml`
 * (EMU ÷ 635). Shared by the exporter and the preview — two copies is how the two
 * backends would drift (§ the panel grid is the reference's numbers).
 */
export const FURNITURE_GEOMETRY = {
  /** The frame extends this far beyond the text column on each side. */
  frameOutset: 140,
  /** Frame top, from the page's top edge. */
  frameTop: 1280,
  /** Frame bottom, from the page's bottom edge. */
  frameBottom: 1592,
  /** Frame stroke, EMU (0.75pt) — the reference's `a:ln w="9525"`. */
  frameStrokeEmu: 9525,
  /** Margin note box: top from the page's top edge, then its size. */
  noteTop: 6247,
  noteHeight: 4409,
  /**
   * The strip's width for a **rotated** note — the reference's own number, and the
   * thickness of one laid-down Latin line.
   */
  noteWidth: 245,
  /**
   * The strip's width for an **upright vertical** note (Chinese).
   *
   * A rotated line's strip only has to be as thick as the line; an upright vertical one
   * has to be as wide as a whole glyph. At 9pt a CJK character is a full 180tw em plus
   * side bearings, so the rotated 245tw leaves nothing to round with: LibreOffice wrapped
   * the sentence into a second and third column inside the strip and dropped characters
   * off the end — the margin read as scattered fragments. Wide enough for one glyph and
   * its bearings, and no wider: the strip sits between the frame and the page edge, and
   * the inset that positions it is measured from the text column.
   */
  noteWidthVertical: 380,
  /** The left note's left edge sits this far left of the text column. */
  noteLeftInset: 400,
  /** The right note's left edge sits this far right of the text column. */
  noteRightInset: 165,
  /**
   * The horizontal bottom note — the same sentence again, printed left-aligned just
   * below the frame's bottom edge, above the footer line. The reference anchors it in
   * each footer part (`footer2.xml`, a textbox riding above the footer paragraph); here
   * it joins the other furniture in the running header, anchored to the same place on
   * the page. Measured off the reference's page 10 raster: the text band sits
   * ~1100–1400tw above the page's bottom edge.
   */
  noteBottomTop: 1430,
  noteBottomHeight: 250,
} as const;

/**
 * The reference booklet's own page margins, in twips — `w:pgMar w:top="1296"
 * w:right="1296" w:bottom="1440" w:left="1296"`, carried by 18 of its 24 sections
 * (the others are its barcode pages and cover).
 *
 * The booklet document type **always** uses these: the furniture geometry, the
 * dotted-line pitch and the lines-per-page count were all measured against this
 * column, so a booklet on different margins would be a mimic of nothing. The wizard
 * therefore does not offer the margins choice for it.
 */
export const QAB_MARGINS: PageMargins = { top: 1296, right: 1296, bottom: 1440, left: 1296 };

/** Resolved page-absolute boxes for one sheet, in twips. */
export interface FurnitureBoxes {
  frame: { left: number; top: number; width: number; height: number };
  noteLeft: { left: number; top: number; width: number; height: number };
  noteRight: { left: number; top: number; width: number; height: number };
  noteBottom: { left: number; top: number; width: number; height: number };
}

/**
 * How far the frame's bottom edge cuts into the text column, in twips.
 *
 * The frame is measured from the page edge (`frameBottom`), the text column from the
 * bottom margin, and on the reference's geometry the two do not meet: the frame closes
 * 152tw — about 10px — above where the column ends. Content is free to fill the column,
 * so the last line of a full page landed *below the frame*, printed across the margin
 * note with the rule above it. On screen and in Word alike, since both draw the frame
 * from these same numbers.
 *
 * On a Question-Answer Book the frame **is** the writing area, so this is the amount the
 * paginator has to give back before deciding what fits. Zero when the margin already
 * clears the frame, which is the ordinary worksheet with no furniture at all.
 *
 * Returned as a number rather than folded into `furnitureBoxes` because the paginator
 * asks a different question from the renderer: not "where is the frame" but "how much
 * room does it cost me".
 */
export function frameBottomIntrusion(margins: PageMargins): number {
  return Math.max(0, FURNITURE_GEOMETRY.frameBottom - margins.bottom);
}

/**
 * Where the furniture sits on a page, resolved from the live page setup so a margin or
 * paper change moves the frame with the text column it frames.
 *
 * `verticalNote` widens the two margin strips for upright vertical text (§
 * `noteWidthVertical`). It is an argument rather than a second function because both
 * backends must agree about the box: the preview draws these numbers as millimetres and
 * the exporter writes them as EMU, and a strip that is 245tw in one and 420tw in the
 * other is the drift this module exists to prevent. Both note strips take it together —
 * the same sentence prints in both margins, so they are never set differently.
 */
export function furnitureBoxes(
  pageWidth: number,
  pageHeight: number,
  margins: PageMargins,
  options?: { verticalNote?: boolean },
): FurnitureBoxes {
  const g = FURNITURE_GEOMETRY;
  const columnLeft = margins.left;
  const columnRight = pageWidth - margins.right;
  const noteWidth = options?.verticalNote ? g.noteWidthVertical : g.noteWidth;
  return {
    frame: {
      left: columnLeft - g.frameOutset,
      top: g.frameTop,
      width: columnRight - columnLeft + 2 * g.frameOutset,
      height: pageHeight - g.frameTop - g.frameBottom,
    },
    /*
     * A wider strip is grown *away* from the text column on each side, so the frame it
     * sits beside does not move: the left strip keeps its right edge against the column
     * and extends toward the page edge, and the right strip simply starts at the same
     * inset and is wider. Growing the left one rightward would print it over the frame.
     */
    noteLeft: {
      left: columnLeft - g.noteLeftInset - (noteWidth - g.noteWidth),
      top: g.noteTop,
      width: noteWidth,
      height: g.noteHeight,
    },
    noteRight: {
      left: columnRight + g.noteRightInset,
      top: g.noteTop,
      width: noteWidth,
      height: g.noteHeight,
    },
    noteBottom: {
      left: columnLeft,
      top: pageHeight - g.noteBottomTop,
      width: columnRight - columnLeft,
      height: g.noteBottomHeight,
    },
  };
}

/**
 * Whether a document is the Question-Answer Book.
 *
 * The furniture is the booklet's shape — only `lqMock` creates it — so its presence is
 * the marker, the same way `coverHasPanel()` is the one switch for a cover's shape.
 * What hangs off it: the booklet always prints its footer and never offers a header
 * (the header part is the furniture's own vehicle), so `DocumentSettings` reads this
 * to withhold those controls rather than offering switches the mode forbids.
 */
export function isQabDocument(worksheet: { pageFurniture?: PageFurniture }): boolean {
  return worksheet.pageFurniture !== undefined;
}

/**
 * The QAB's furniture, with the neutral default wording (§ copyright — the reference's
 * own margin sentence is rubric and must be typed by the school, never shipped).
 */
export function createQabFurniture(): PageFurniture {
  return {
    frame: true,
    marginNote: bi('Answers written in the margins will not be marked.', '寫於邊界以外的答案，將不予評閱。'),
  };
}
