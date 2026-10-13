import type { FontPair, Worksheet } from './types';

/**
 * Browser stand-ins for an East-Asian face a Mac does not ship under its Word name.
 *
 * The document stores (and the `.docx` writes) the Word name only; this list exists so
 * the preview, print and clipboard land on the same *style* of face. A font with no
 * entry renders as itself, so documents set in the older presets produce the same CSS
 * they always did.
 */
const EAST_ASIA_FALLBACKS: Record<string, readonly string[]> = {
  // 標楷體: Windows' DFKai-SB, then the Kai faces macOS offers.
  'DFKai-SB': ['標楷體', 'BiauKai', 'BiauKaiTC', 'Kaiti TC', 'STKaiti', 'KaiTi'],
};

/** The East-Asian face followed by its browser stand-ins, most specific first. */
export function eastAsiaFamilies(eastAsia: string): readonly string[] {
  return [eastAsia, ...(EAST_ASIA_FALLBACKS[eastAsia] ?? [])];
}

/**
 * A CSS family list for a font pair, without the generic fallback: the Latin face,
 * then the East-Asian face and its stand-ins. `quote` and `sep` follow each caller's
 * existing spelling so an unchanged font pair yields unchanged CSS.
 */
export function cssFontFamilies(fonts: FontPair, quote = "'", sep = ', '): string {
  return [fonts.latin, ...eastAsiaFamilies(fonts.eastAsia)]
    .map((name) => `${quote}${name}${quote}`)
    .join(sep);
}

/**
 * The body sizes a teacher can pick (Document setup), in points. 11 is the default and
 * is stored as absence, so choosing it hands back a document whose export is the same
 * as one that never had the field (§ `Worksheet.baseFontSize`).
 */
export const BODY_TEXT_SIZES = [10, 11, 12] as const;

/** What `baseFontSize` means when absent; the exporter's `DEFAULT_BASE_FONT_SIZE_PT`. */
export const DEFAULT_BODY_TEXT_SIZE = 11;

/** The document's body size in points, absent read as 11. */
export function bodyTextSizeOf(worksheet: Pick<Worksheet, 'baseFontSize'>): number {
  return worksheet.baseFontSize ?? DEFAULT_BODY_TEXT_SIZE;
}

/**
 * The document set at `size`: 11 removes the field, anything else stores it. The same
 * object when nothing changes, so `commit` records no undo step for a no-op.
 */
export function withBodyTextSize(worksheet: Worksheet, size: number): Worksheet {
  const stored = size === DEFAULT_BODY_TEXT_SIZE ? undefined : size;
  if (worksheet.baseFontSize === stored) return worksheet;
  const next: Worksheet = { ...worksheet, baseFontSize: stored };
  if (stored === undefined) delete next.baseFontSize;
  return next;
}
