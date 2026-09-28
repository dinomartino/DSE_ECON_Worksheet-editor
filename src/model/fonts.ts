import type { FontPair } from './types';

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
