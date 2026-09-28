/**
 * Folding both languages to a comparable form. Chinese folds keep an index map back to the
 * original string, so a hit can be highlighted and fixed where the teacher typed it.
 */

/** Stripped before comparing: whitespace (NBSP and U+3000 included) and quote marks. */
const ZH_STRIP = /[\s 　「」《》『』"“”]/;

/** Variant characters HK text mixes freely; folded on both sides (glossary research §1). */
const ZH_CHAR_FOLD: Readonly<Record<string, string>> = {
  户: '戶',
  週: '周',
  鉤: '鈎',
  捆: '綑',
  託: '托',
  綫: '線',
  爲: '為',
  凈: '淨',
  着: '著',
  甦: '蘇',
  賬: '帳',
  '︰': '：',
  '﹔': '；',
  '（': '(',
  '）': ')',
};

/** Same-length phrase folds; 係 folds only in 係數, since 系 is right in 系統 and 體系. */
const ZH_PHRASE_FOLD: ReadonlyArray<readonly [string, string]> = [
  ['部分', '部份'],
  ['係數', '系數'],
];

export interface FoldedZh {
  folded: string;
  /** `map[i]` is the original index of folded character `i`. */
  map: number[];
}

const CJK = /[㐀-鿿豈-﫿]/;

/**
 * NFC, strip, fold variants. With `dropDe`, a 的 between two CJK characters is removed too
 * (the 的-less alias of a variant, and the text side of the "near" test).
 */
export function foldZh(text: string, opts: { dropDe?: boolean } = {}): FoldedZh {
  let chars: string[] = [];
  let map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i].normalize('NFC');
    if (ZH_STRIP.test(c)) continue;
    chars.push(ZH_CHAR_FOLD[c] ?? c);
    map.push(i);
  }
  let folded = chars.join('');
  for (const [from, to] of ZH_PHRASE_FOLD) folded = folded.split(from).join(to);
  if (opts.dropDe) {
    chars = [];
    const kept: number[] = [];
    for (let i = 0; i < folded.length; i++) {
      if (folded[i] === '的' && CJK.test(folded[i - 1] ?? '') && CJK.test(folded[i + 1] ?? '')) continue;
      chars.push(folded[i]);
      kept.push(map[i]);
    }
    folded = chars.join('');
    map = kept;
  }
  return { folded, map };
}

/** Original `[start, end)` of folded `[from, to)`. */
export function unfoldSpan(f: FoldedZh, from: number, to: number): { start: number; end: number } {
  return { start: f.map[from], end: f.map[to - 1] + 1 };
}

/** One English token as a trie key: lower case, possessive dropped, one spelling. */
export function foldEnToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/'s$|'$/, '')
    .replace(/is(e|ed|es|er|ers|ing|ation|ations)$/, 'iz$1')
    .replace(/^(labo|behavio|neighbo|favo|colo)ur/, '$1r')
    .replace(/^centre/, 'center')
    .replace(/^licence/, 'license')
    .replace(/^cheque/, 'check')
    .replace(/^programme/, 'program')
    .replace(/^judgement/, 'judgment')
    .replace(/yse$/, 'yze');
}

/** Plural fold; never on -ss/-us/-is/-ics/-ous, so economics and gross stay whole. */
export function singular(token: string): string {
  if (/(ss|us|is|ics|ous)$/.test(token) || token.length < 4) return token;
  if (token === 'indices') return 'index';
  if (/theses$/.test(token)) return token.slice(0, -2) + 'is';
  if (/[^aeiou]ies$/.test(token)) return token.slice(0, -3) + 'y';
  if (/(ch|sh|x|z)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export interface EnToken {
  text: string;
  start: number;
  end: number;
}

/** ASCII words, keeping an inner apostrophe (consumer's); hyphens split tokens. */
export function tokenizeEn(text: string): EnToken[] {
  const out: EnToken[] = [];
  for (const m of text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Between two tokens of one term: whitespace, a hyphen or a possessive, at most 3 chars. */
export function isTermGap(gap: string): boolean {
  return gap.length <= 3 && /^['’]?[\s \-‐–]*$/.test(gap);
}
