/**
 * The one table of HKEAA forms that rewrite Latin letters or currency. Prompt rule 12 is
 * rendered from `promptLine`, and the `symbols` check counts a consumed token as kept
 * when one of the Chinese forms is present — so correct HKEAA output is never warned.
 */
export interface Convention {
  id: string;
  /** On the source plain text; global. */
  en: RegExp;
  /** Accepted Chinese forms. */
  zh: (m: RegExpMatchArray) => string[];
  /** latinSymbols tokens it satisfies. */
  consumes: (m: RegExpMatchArray) => string[];
  promptLine: string;
}

const STEMS = ['甲', '乙', '丙', '丁'];
const stem = (letter: string) => STEMS['ABCD'.indexOf(letter)];

export const CONVENTIONS: readonly Convention[] = [
  {
    id: 'country',
    en: /\bCountry ([A-D])\b/g,
    zh: (m) => [`${stem(m[1])}國`],
    consumes: (m) => [m[1]],
    promptLine: 'Country A / B → 甲國 / 乙國',
  },
  {
    id: 'student',
    en: /\bStudent ([A-D])\b/g,
    zh: (m) => [`學生${stem(m[1])}`],
    consumes: (m) => [m[1]],
    promptLine: 'Student A / B → 學生甲 / 學生乙',
  },
  {
    id: 'section',
    en: /\bSection ([A-D])\b/g,
    zh: (m) => [`${stem(m[1])}部`],
    consumes: (m) => [m[1]],
    promptLine: 'Section A / B / C → 甲部 / 乙部 / 丙部',
  },
  {
    id: 'hkd',
    en: /\bHK\$\s?\d/g,
    zh: () => ['港元'],
    consumes: () => ['HK'],
    promptLine: 'HK$500 → 500港元',
  },
  {
    id: 'usd',
    en: /\bUS\$\s?\d/g,
    zh: () => ['美元'],
    consumes: () => ['US'],
    promptLine: 'US$20 → 20美元',
  },
  {
    id: 'adas',
    en: /\b(?:AD-AS|AS-AD) diagram/gi,
    zh: () => ['總供需圖'],
    consumes: () => ['AD', 'AS'],
    promptLine: 'an AD-AS diagram → 總供需圖',
  },
  {
    id: 'supplyDemand',
    en: /\b(?:supply-demand|demand-supply) diagram/gi,
    zh: () => ['供需圖'],
    consumes: () => [],
    promptLine: 'a supply-demand diagram → 供需圖',
  },
];

/** Tokens a convention satisfies in this pair: its Chinese form is in the output. */
export function consumedSymbols(sourceEn: string, outputZh: string): Set<string> {
  const out = new Set<string>();
  for (const row of CONVENTIONS) {
    for (const match of sourceEn.matchAll(row.en)) {
      if (row.zh(match).some((form) => outputZh.includes(form))) row.consumes(match).forEach((t) => out.add(t));
    }
  }
  return out;
}
