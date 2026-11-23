import type { BiDraft } from '@/generate/types';
import { foldWidth } from '@/translate/wire';

/**
 * Every number in a draft's English must be the same number in its 中文, with the units
 * read out: 5 billion is 50億, not 5億 (Mentor's accuracy study found a tenfold slip in
 * Chinese). Local; it compares the two sides field by field (stem, each statement, each
 * option, the explanation), so a mismatch names where it is.
 *
 * Bare single digits are left out: Chinese writes small counts in characters (三間) and
 * English in digits, which is no error. A number with a unit, a percent, a decimal or two
 * digits is always compared.
 */

interface Quantity {
  /** Absolute value: 5 billion is 5e9; a percent keeps its own scale. */
  value: number;
  percent: boolean;
  /** As printed, for the finding. */
  text: string;
}

const EN_SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
/** Traditional forms only: a draft's 中文 has been through `traditionalize` before any check reads it. */
const ZH_SCALE: Record<string, number> = { 千: 1e3, 萬: 1e4, 百萬: 1e6, 千萬: 1e7, 億: 1e8, 兆: 1e12 };

const strip = (text: string) => foldWidth(text.replace(/\*\*/g, '')).replace(/(\d)[,  ](?=\d{3}(?!\d))/g, '$1').replace(/[(][1-9][)]/g, ' ');

/** A single digit with no unit and no percent: not worth comparing across languages. */
const trivial = (q: Quantity, hasUnit: boolean) => !q.percent && !hasUnit && Number.isInteger(q.value) && Math.abs(q.value) < 10;

export function englishQuantities(text: string): Quantity[] {
  const out: Quantity[] = [];
  for (const m of strip(text).matchAll(/(?<![\w.])(\d+(?:\.\d+)?)(?:\s*(%|percent|per cent)|\s+(thousand|million|billion|trillion)\b)?/gi)) {
    const q: Quantity = {
      value: Number(m[1]) * (m[3] ? EN_SCALE[m[3].toLowerCase()] : 1),
      percent: Boolean(m[2]),
      text: m[0].trim(),
    };
    if (!trivial(q, Boolean(m[3]))) out.push(q);
  }
  return out;
}

export function chineseQuantities(text: string): Quantity[] {
  const out: Quantity[] = [];
  const folded = strip(text).replace(/百分之\s*(\d+(?:\.\d+)?)/g, '$1%');
  for (const m of folded.matchAll(/(\d+(?:\.\d+)?)\s*(%|百萬|千萬|萬|億|千|兆)?/g)) {
    const percent = m[2] === '%';
    const q: Quantity = { value: Number(m[1]) * (m[2] && !percent ? ZH_SCALE[m[2]] : 1), percent, text: m[0].trim() };
    if (!trivial(q, Boolean(m[2]) && !percent)) out.push(q);
  }
  return out;
}

const key = (q: Quantity) => `${q.percent ? 'p' : 'n'}${q.value}`;

/** The numbers each side states that the other does not (multiset difference). */
function differ(en: Quantity[], zh: Quantity[]): { enOnly: string[]; zhOnly: string[] } {
  const take = (from: Quantity[], against: Quantity[]) => {
    const pool = new Map<string, number>();
    for (const q of against) pool.set(key(q), (pool.get(key(q)) ?? 0) + 1);
    const left: string[] = [];
    for (const q of from) {
      const n = pool.get(key(q)) ?? 0;
      if (n > 0) pool.set(key(q), n - 1);
      else left.push(q.text);
    }
    return left;
  };
  return { enOnly: take(en, zh), zhOnly: take(zh, en) };
}

export interface NumberMismatch { enOnly: string[]; zhOnly: string[] }

/** The numbers that disagree between the two sides of `fields`; null when they all agree. */
export function checkNumbers(fields: readonly BiDraft[]): NumberMismatch | null {
  const enOnly = new Set<string>();
  const zhOnly = new Set<string>();
  for (const field of fields) {
    if (!field.en.trim() || !field.zh.trim()) continue;
    const d = differ(englishQuantities(field.en), chineseQuantities(field.zh));
    d.enOnly.forEach((t) => enOnly.add(t));
    d.zhOnly.forEach((t) => zhOnly.add(t));
  }
  return enOnly.size || zhOnly.size ? { enOnly: [...enOnly], zhOnly: [...zhOnly] } : null;
}
