/**
 * A 中文 template that spaces a Latin name off the Chinese around it: spaced`在${'Market
 * and Price'}中搜尋` reads 在 Market and Price 中搜尋. A space goes only where a Chinese
 * character meets a name starting or ending in a Latin letter or digit; 中文 names, and
 * names beside a space or bracket (「」), read as written.
 */
const HAN = /\p{Script=Han}/u;
const LATIN = /[\p{Script=Latin}0-9]/u;

export function spaced(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0];
  values.forEach((value, i) => {
    const text = String(value);
    const after = strings[i + 1];
    if (text && HAN.test(out.slice(-1)) && LATIN.test(text[0])) out += ' ';
    out += text;
    if (text && HAN.test(after.charAt(0)) && LATIN.test(text.slice(-1))) out += ' ';
    out += after;
  });
  return out;
}
