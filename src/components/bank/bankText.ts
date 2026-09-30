import type { BankRow } from '@/library/types';
import type { LanguageMode } from '@/model/types';

/**
 * The question bank's small words: counts that agree with their noun, and what tells an
 * edited version from the one beside it.
 */

/** "1 question", "3 questions"; `many` for a noun that is not plain -s ("1 copy", "2 copies"). */
export function countOf(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Every one of a set, as a sentence says it: "both copies", "all 3 copies" (`many` is the plural noun). */
export function allOf(count: number, many: string): string {
  return count === 2 ? `both ${many}` : `all ${count} ${many}`;
}

/** Chinese characters: text in them has no spaces, so it is compared character by character. */
const HAN = /\p{Script=Han}/u;

/** Two texts as tokens (words, or characters for 中文), and how many they share at each end. */
function sharedEnds(text: string, other: string) {
  const han = HAN.test(text);
  const tokens = han ? [...text] : text.split(/\s+/).filter(Boolean);
  const theirs = han ? [...other] : other.split(/\s+/).filter(Boolean);
  let start = 0;
  while (start < tokens.length && start < theirs.length && tokens[start] === theirs[start]) start += 1;
  let end = 0;
  while (
    end < tokens.length - start &&
    end < theirs.length - start &&
    tokens[tokens.length - 1 - end] === theirs[theirs.length - 1 - end]
  )
    end += 1;
  return { han, tokens, theirs, start, end };
}

/**
 * Where `text` differs from `other`, as a short excerpt of `text`: the changed words with
 * one word either side, "…" where it was cut ("…falls by 25% and…"). Undefined when the two
 * read the same, as when an edit lies past what the excerpts hold.
 */
export function diffSnippet(text: string, other: string, maxTokens = 8): string | undefined {
  if (text === other) return undefined;
  const { han, tokens, start, end } = sharedEnds(text, other);
  // The changed run, widened by one token of context each side (a deletion shows its neighbours).
  const from = Math.max(0, start - 1);
  const to = Math.min(tokens.length, Math.max(tokens.length - end + 1, start + 1));
  if (from >= to) return undefined;
  const cut = Math.min(to, from + (han ? maxTokens * 2 : maxTokens));
  const body = tokens.slice(from, cut).join(han ? '' : ' ');
  if (!body) return undefined;
  return `${from > 0 ? '…' : ''}${body}${cut < tokens.length ? '…' : ''}`;
}

/**
 * How an edited version tells itself from the one beside it, in the language the list reads:
 * where it differs ("Says “…by 25% and…”", `diffSnippet`); "Reworded" when less than half of
 * it is shared, where a quote would only repeat the question; "Edited further down" when
 * their excerpts match.
 */
export function versionDiff(
  version: Pick<BankRow, 'excerpt'>,
  beside: Pick<BankRow, 'excerpt'>,
  language: LanguageMode,
): string {
  const side = (row: Pick<BankRow, 'excerpt'>) =>
    language === 'zh' ? row.excerpt.zh || row.excerpt.en : row.excerpt.en || row.excerpt.zh;
  const mine = side(version);
  const theirs = side(beside);
  const snippet = diffSnippet(mine, theirs);
  if (!snippet) return 'Edited further down';
  const { tokens, theirs: other, start, end } = sharedEnds(mine, theirs);
  if (start + end < Math.min(tokens.length, other.length) / 2) return 'Reworded';
  return `Says “${snippet}”`;
}
