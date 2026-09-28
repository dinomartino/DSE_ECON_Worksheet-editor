import type { RichText } from './types';

/**
 * Symbol-only text (E₀, S₁, $14 000, MC = MR, AD) never goes to a model: no CJK, and every
 * Latin token left after removing digits, punctuation, math and sub/superscripts is at most
 * 2 letters or all capitals up to 6.
 */
export function isSymbolOnly(runs: RichText): boolean {
  // P-TEXT replaces this body
  void runs;
  return false;
}
