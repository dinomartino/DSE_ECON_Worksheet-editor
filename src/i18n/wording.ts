import { simplifiedChars } from '@/translate/simplified';
import { KEEP_ENGLISH, SIMPLIFIED_ONLY, TAIWAN_ONLY } from './terms';

/**
 * The Hong Kong wording checks (`docs/design/ui-language.md`), shared by the guards over
 * the interface catalogues and the CHANGELOG's 繁體中文.
 */

const CJK = '[\\u3400-\\u9fff\\uf900-\\ufaff]';
/** ASCII punctuation straight after a Chinese character: Hong Kong text uses ，。：；？！ */
const HALF_WIDTH = new RegExp(`${CJK}[,.:;?!]`);

/** What is wrong with `zh` as the Chinese of `en`; empty when nothing is. */
export function wordingProblems(en: string, zh: string): string[] {
  const out: string[] = [];
  if (zh.trim() === '') out.push('empty zh');
  for (const { term, match } of KEEP_ENGLISH) {
    const used = match ? match.test(en) : new RegExp(`(?<![\\w.])${escape(term)}(?![\\w])`).test(en);
    if (used && !zh.includes(term)) out.push(`"${term}" must stay in English in zh`);
  }
  const simplified = [...new Set([...simplifiedChars(zh), ...[...zh].filter((ch) => SIMPLIFIED_ONLY.includes(ch))])];
  if (simplified.length) out.push(`Simplified characters ${simplified.join(' ')}`);
  for (const word of TAIWAN_ONLY) if (zh.includes(word)) out.push(`Taiwan wording ${word}`);
  if (HALF_WIDTH.test(zh)) out.push(`half-width punctuation after Chinese: ${zh.match(HALF_WIDTH)![0]}`);
  if (zh.includes('—')) out.push('em dash in zh');
  return out;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
