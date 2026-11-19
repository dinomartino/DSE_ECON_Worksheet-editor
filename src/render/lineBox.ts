import type { NodeStyle } from './ir';

/**
 * The height of one line of a paragraph, in twips, for the document's line spacing
 * (`TextNode.lineSpacing`, k-0468). The page and the `.docx` both read it, so a spaced
 * line is the same box in each: the preview writes `twips / 20` pt as `line-height`, the
 * exporter writes the twips as `w:line` with `w:lineRule="exact"` (§ `exact` does not grow).
 *
 * Single is the box each paragraph already has: the fixed 12pt line, or for larger text
 * the box `exactLineFor()` scales from the 11pt/12pt base (the title's 16pt, a section
 * heading's 14pt, a run set larger by hand). `lineBox.test.ts` pins both to the exporter.
 */

/** The fixed body line, 12pt (`FIXED_LINE_TWIPS` in `export/docx/styles.ts`). */
const SINGLE_LINE_TWIPS = 240;
/** The body size the fixed line is calibrated for (`exactLineFor`). */
const SINGLE_LINE_BASE_PT = 11;

/** The styles whose own size is larger than the body's (`styleSpecs` in the exporter). */
const STYLE_SIZE_PT: Partial<Record<NodeStyle, number>> = {
  'Worksheet Title': 16,
  'Section Heading': 14,
};

/** One single line of `style` set at `fontSize` (absent: the style's own size). */
export function singleLineTwips(style: NodeStyle, fontSize?: number): number {
  const size = fontSize ?? STYLE_SIZE_PT[style];
  if (size === undefined || size <= SINGLE_LINE_BASE_PT) return SINGLE_LINE_TWIPS;
  return Math.round((SINGLE_LINE_TWIPS * size) / SINGLE_LINE_BASE_PT);
}

/** One line of `style` at `spacing` times its single height, in whole twips. */
export function spacedLineTwips(style: NodeStyle, fontSize: number | undefined, spacing: number): number {
  return Math.round(singleLineTwips(style, fontSize) * spacing);
}
