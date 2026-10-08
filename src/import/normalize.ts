/**
 * Text normalisation. The body keeps its characters (smart quotes, full-width
 * punctuation) because they print; only invisible junk goes. Labels and matching keys
 * are normalised harder, char for char, so offsets into the body stay valid.
 */

const INVISIBLE = /[\uFEFF\u200B-\u200D\u2060\u00AD]/g;
const ODD_SPACES = /[\u2000-\u200A\u202F\u205F]/g;

/** Whole-paste tidy: BOM, zero-width and soft hyphens out; odd spaces to plain ones; NBSP kept only inside numbers. */
export function tidyText(text: string): string {
  return text
    .replace(INVISIBLE, '')
    .replace(ODD_SPACES, ' ')
    .replace(/(?<=\d)\u00A0(?=\d)/g, '\u0001')
    .replace(/\u00A0/g, ' ')
    .replace(/\u0001/g, '\u00A0');
}

/** Cyrillic capitals and lower-case that look Latin (a Word paste carried `Factory В`). */
const CYRILLIC: Record<string, string> = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X',
  а: 'a', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x', і: 'i', ѵ: 'v',
};

/** One character to its ASCII look-alike: full-width forms, Cyrillic, `、`. Length-preserving. */
function asciiChar(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0xff01 && code <= 0xff5e) return String.fromCharCode(code - 0xfee0);
  if (code === 0x3000) return ' ';
  return CYRILLIC[ch] ?? ch;
}

/** Normalise the first `upto` characters (the label zone) char for char. */
export function labelZone(text: string, upto = 24): string {
  let head = '';
  for (const ch of text.slice(0, upto)) head += asciiChar(ch);
  return head + text.slice(upto);
}

/** Every character to its ASCII look-alike, length-preserving (for scanning a whole line). */
export function fold(text: string): string {
  let out = '';
  for (let k = 0; k < text.length; k++) out += asciiChar(text[k]);
  return out;
}

/** A comparison key: quotes straightened, full-width folded, spaces collapsed, digits kept. */
export function matchKey(text: string): string {
  let out = '';
  for (const ch of text) out += asciiChar(ch);
  return out
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The key two running headers share: digits (page numbers) folded. */
export function repeatKey(text: string): string {
  return matchKey(text).replace(/\d+/g, '#').toLowerCase();
}

const HAN = /[㐀-鿿豈-﫿]/g;
const LATIN_WORD = /[A-Za-z]{2,}/g;

/** Han characters against Latin words: a Han character is about a word. */
export function cjkShare(text: string): number {
  const han = text.match(HAN)?.length ?? 0;
  const words = text.match(LATIN_WORD)?.length ?? 0;
  return han + words === 0 ? 0 : han / (han + words);
}
