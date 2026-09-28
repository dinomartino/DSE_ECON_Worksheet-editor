import type { RichText } from './types';

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u;
/** Unicode sub/superscript digits and letters (E₀, x², ₐ), and Greek (ε, Δ): symbols, not words. */
const SCRIPT_MARKS = /[²³¹ᴬ-ᵪᶛ-ᶿ⁰-₟\p{Script=Greek}]/gu;
const WORD = /\p{L}+/gu;
const LATIN = /^\p{Script=Latin}+$/u;

/**
 * English words short enough to pass for symbols, in capitals: prompt rule 5's emphasis
 * words and the cover and band wording (`PAPER 2`, `ECON`). Never `AS`, `IS`: curves.
 */
export const CAPITAL_WORDS: ReadonlySet<string> = new Set([
  'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
  'NOT', 'NONE', 'NEVER', 'ALL', 'ANY', 'BEST', 'BOTH', 'ONLY', 'EACH', 'EXCEPT', 'MOST', 'LEAST',
  'AND', 'OR', 'NO', 'YES', 'OF', 'TO', 'IN', 'ON', 'AT', 'BY', 'IF', 'THE', 'FOR',
  'PAPER', 'ECON', 'TOTAL', 'NAME', 'CLASS', 'DATE', 'TIME', 'FORM', 'MARK', 'MARKS',
  'SCORE', 'PART', 'NOTE', 'END', 'TEST', 'EXAM', 'ANSWER',
]);
/** Two-letter English words, in lower or title case (`No`, `or`); `Qd`, `Pw` stay symbols. */
const SHORT_WORDS = new Set([
  'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it',
  'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we',
]);
const ABBREVIATION = /\b(?:e\.g|i\.e)\./i;

const isWord = (token: string) =>
  token === token.toUpperCase() ? CAPITAL_WORDS.has(token) : SHORT_WORDS.has(token.toLowerCase());

const isSymbolToken = (token: string) =>
  LATIN.test(token) &&
  !isWord(token) &&
  (token.length <= 2 || (token.length <= 6 && token === token.toUpperCase()));

/**
 * Symbol-only text (E₀, S₁, $14 000, MC = MR, AD) never goes to a model: no CJK, and every
 * Latin token left after removing digits, punctuation, math and sub/superscripts is at most
 * 2 letters or all capitals up to 6, and not an English word (`CAPITAL_WORDS`, `No`, `e.g.`).
 * A capitals phrase of plain words ("END OF PAPER") is prose. Blank text is not symbol-only.
 */
export function isSymbolOnly(runs: RichText): boolean {
  const all = runs.map((run) => run.text).join('');
  if (!all.trim() || CJK.test(all)) return false;

  const text = runs
    .filter((run) => !run.vertAlign)
    .map((run) => run.text)
    .join('')
    .replace(SCRIPT_MARKS, ' ');
  if (ABBREVIATION.test(text)) return false;
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
