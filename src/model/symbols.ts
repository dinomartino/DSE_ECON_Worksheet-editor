import type { RichText } from './types';

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
/** Unicode sub/superscript digits and letters (E₀, x², ₐ), and Greek (ε, Δ): symbols, not words. */
const SCRIPT_MARKS = /[²³¹ᴬ-ᵪᶛ-ᶿ⁰-₟\p{Script=Greek}]/gu;
const WORD = /\p{L}+/gu;
const LATIN = /^\p{Script=Latin}+$/u;

const isSymbolToken = (token: string) =>
  LATIN.test(token) &&
  (token.length <= 2 || (token.length <= 6 && token === token.toUpperCase()));

/**
 * Symbol-only text (E₀, S₁, $14 000, MC = MR, AD) never goes to a model: no CJK, and every
 * Latin token left after removing digits, punctuation, math and sub/superscripts is at most
 * 2 letters or all capitals up to 6. A capitals phrase of plain words ("END OF PAPER") is
 * prose, not symbols. Blank text is not symbol-only.
 */
export function isSymbolOnly(runs: RichText): boolean {
  const all = runs.map((run) => run.text).join('');
  if (!all.trim() || CJK.test(all)) return false;

  const text = runs
    .filter((run) => !run.vertAlign)
    .map((run) => run.text)
    .join('')
    .replace(SCRIPT_MARKS, ' ');
  const tokens = [...text.matchAll(WORD)];
  if (!tokens.every(([token]) => isSymbolToken(token))) return false;

  // Words separated only by spaces, one of them longer than a symbol usually is.
  const phrase =
    tokens.length >= 2 &&
    tokens.some(([token]) => token.length >= 3) &&
    tokens.every((match, i) => {
      if (i === 0) return true;
      const previous = tokens[i - 1];
      const between = text.slice(previous.index! + previous[0].length, match.index);
      return /^\s+$/.test(between);
    });
  return !phrase;
}
