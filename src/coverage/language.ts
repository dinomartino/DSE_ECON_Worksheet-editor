import type { LanguageMode } from '@/model/types';
import { anchorText } from '@/quality/collect';
import type { CoverageQuestion } from './types';

/**
 * The language a coverage report is written in (k-0489): the paper's, not the app's. A
 * Chinese paper reads 需求的價格彈性 in its report even in an English interface, and the
 * AI's one-line reasons come back in it too. Interface chrome stays in the app's language.
 * The rule beside it: topic names are paper words (`model/topics.ts` → `topicNamesFor`).
 */
export type ReportLanguage = 'en' | 'zh';

/** About what one Chinese character carries in Latin letters (as `thumbnailLanguage`). */
const LETTERS_PER_CHARACTER = 3;
/** Below this share of the other, a side is incidental: a term, a name, "(4 marks)". */
const INCIDENTAL = 0.25;

const LATIN = /[A-Za-z]/g;
const CJK = /[㐀-鿿豈-﫿]/g;
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/**
 * Read from the questions' own words:
 * - only one language really written (the other is empty, or only a few terms) → that one;
 * - both written (a translated paper) → the side the editor is showing (it starts in
 *   Settings → Language → Papers); the bilingual view → English, the side a bilingual
 *   paper leads with (`topicNamesFor`: topic names are paper words);
 * - no words in either (numbers only) → `fallback`, the app's language.
 *
 * Latin letters are counted on the English side and Chinese characters on both sides, so a
 * Chinese paper typed into the English slots still reads as Chinese.
 */
export function reportLanguage(
  papers: readonly (readonly CoverageQuestion[])[],
  view: LanguageMode,
  fallback: ReportLanguage,
): ReportLanguage {
  let latin = 0;
  let cjk = 0;
  for (const questions of papers) {
    for (const { question } of questions) {
      for (const anchor of question.anchors) {
        const en = anchorText(anchor, 'en');
        latin += count(en, LATIN);
        cjk += count(en, CJK) + count(anchorText(anchor, 'zh'), CJK);
      }
    }
  }
  const en = latin / LETTERS_PER_CHARACTER;
  if (en === 0 && cjk === 0) return fallback;
  if (cjk <= en * INCIDENTAL) return 'en';
  if (en <= cjk * INCIDENTAL) return 'zh';
  return view === 'zh' ? 'zh' : 'en';
}
