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
  /** Digit groups it spells out in Chinese (S5 → 中五). */
  digits?: (m: RegExpMatchArray) => string[];
  promptLine: string;
}

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己'];
const stem = (letter: string) => STEMS['ABCDEF'.indexOf(letter)];
const NUMERALS = ['', '一', '二', '三', '四', '五', '六'];
const COUNTS = ['', '一', '兩', '三', '四', '五', '六'];

/** "Country A", "country A", "Countries A and B", "Sections A, B or C": the letters in m[1]. */
const lettered = (noun: string) => new RegExp(`\\b${noun} ([A-F](?:(?:,\\s*|,?\\s+(?:and|or)\\s+)[A-F])*)\\b`, 'g');
const lettersOf = (m: RegExpMatchArray) => m[1].match(/[A-F]/g) ?? [];
/** Each 甲國, or the joint 甲、乙兩國. */
const letteredZh = (m: RegExpMatchArray, form: (stem: string) => string, unit: string) => {
  const letters = lettersOf(m);
  const each = letters.map((l) => form(stem(l)));
  return letters.length > 1 ? [...each, `${letters.map(stem).join('、')}${COUNTS[letters.length]}${unit}`] : each;
};

export const CONVENTIONS: readonly Convention[] = [
  {
    id: 'country',
    en: lettered('[Cc]ountr(?:y|ies)'),
    zh: (m) => letteredZh(m, (s) => `${s}國`, '國'),
    consumes: lettersOf,
    promptLine: 'Country A / B → 甲國 / 乙國',
  },
  {
    id: 'student',
    en: lettered('[Ss]tudents?'),
    zh: (m) => letteredZh(m, (s) => `學生${s}`, '位學生'),
    consumes: lettersOf,
    promptLine: 'Student A / B → 學生甲 / 學生乙',
  },
  {
    id: 'section',
    en: lettered('Sections?'),
    zh: (m) => letteredZh(m, (s) => `${s}部`, '部'),
    consumes: lettersOf,
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
  // Paper furniture, as the app's own seeds write it (cover.ts, bands.ts).
  {
    id: 'form',
    // S.6 always; S5 only before a title word ("S5 Economics"), so a curve S1 never matches.
    en: /\bS(?:\.\s?([1-6])\b|([1-6])\b(?=\s+[A-Z][a-z]))/g,
    zh: (m) => [`中${NUMERALS[Number(m[1] ?? m[2])]}`],
    consumes: (m) => [m[1] ? 'S' : `S${m[2]}`],
    digits: (m) => [m[1] ?? m[2]],
    promptLine: 'a school form S5 / S.6 → 中五 / 中六 (a curve S1 stays S1)',
  },
  {
    id: 'paper',
    en: /\bpaper ([12])\b/gi,
    zh: (m) => [`卷${NUMERALS[Number(m[1])]}`],
    consumes: (m) => (m[0].startsWith('PAPER') ? ['PAPER'] : []),
    digits: (m) => [m[1]],
    promptLine: 'PAPER 1 → 試卷一',
  },
  {
    id: 'subject',
    en: /\bECON\b/g,
    zh: () => ['經濟'],
    consumes: () => ['ECON'],
    promptLine: 'ECON → 經濟',
  },
];

function applied(sourceEn: string, outputZh: string, pick: (row: Convention, m: RegExpMatchArray) => string[]): Set<string> {
  const out = new Set<string>();
  for (const row of CONVENTIONS) {
    for (const match of sourceEn.matchAll(row.en)) {
      if (row.zh(match).some((form) => outputZh.includes(form))) pick(row, match).forEach((t) => out.add(t));
    }
  }
  return out;
}

/** Tokens a convention satisfies in this pair: its Chinese form is in the output. */
export const consumedSymbols = (sourceEn: string, outputZh: string) => applied(sourceEn, outputZh, (row, m) => row.consumes(m));

/** Digit groups a convention spells out in this pair. */
export const consumedDigits = (sourceEn: string, outputZh: string) => applied(sourceEn, outputZh, (row, m) => row.digits?.(m) ?? []);
