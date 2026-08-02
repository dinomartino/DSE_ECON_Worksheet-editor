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
  noteWidth: 245,
  /** The left note's left edge sits this far left of the text column. */
  noteLeftInset: 400,
  /** The right note's left edge sits this far right of the text column. */
  noteRightInset: 165,
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
}

/**
 * Where the furniture sits on a page, resolved from the live page setup so a margin or
 * paper change moves the frame with the text column it frames.
 */
export function furnitureBoxes(
  pageWidth: number,
  pageHeight: number,
  margins: PageMargins,
): FurnitureBoxes {
  const g = FURNITURE_GEOMETRY;
  const columnLeft = margins.left;
  const columnRight = pageWidth - margins.right;
  return {
    frame: {
      left: columnLeft - g.frameOutset,
      top: g.frameTop,
      width: columnRight - columnLeft + 2 * g.frameOutset,
      height: pageHeight - g.frameTop - g.frameBottom,
    },
    noteLeft: {
      left: columnLeft - g.noteLeftInset,
      top: g.noteTop,
      width: g.noteWidth,
      height: g.noteHeight,
    },
    noteRight: {
      left: columnRight + g.noteRightInset,
      top: g.noteTop,
      width: g.noteWidth,
      height: g.noteHeight,
    },
  };
}

/**
 * The QAB's furniture, with the neutral default wording (§ copyright — the reference's
 * own margin sentence is rubric and must be typed by the school, never shipped).
 */
export function createQabFurniture(): PageFurniture {
  return {
    frame: true,
    marginNote: bi('Do not write in this margin.', '請勿在此邊界內書寫。'),
  };
}
