/** The gap between stacked sheets: `#print-root`'s `gap-6`. */
export const SHEET_GAP = '1.5rem';

/**
 * `#print-root`'s bottom margin at `scale`: a transform leaves the layout box unscaled,
 * so the stack takes back (s − 1) of its own height, every sheet (cover included) and
 * every gap between them. Counting the paginated pages alone left a scaled-down booklet
 * with a cover's worth of empty desk after its last sheet.
 */
export function sheetStackMargin(scale: number, pageHeightMm: number, sheets: number): string | undefined {
  if (scale === 1 || sheets === 0) return undefined;
  return `calc(${scale - 1} * (${pageHeightMm * sheets}mm + ${sheets - 1} * ${SHEET_GAP}))`;
}
