import { commentParagraphs, formatPercent } from '@/model/examResults';
import { bi } from '@/model/text';
import type { BiText, LanguageMode } from '@/model/types';
import { pushGap, type RenderNode } from './ir';

/**
 * What the answer key prints of the exam results (k-0471, `Worksheet.examResults`): each
 * MC answer's % correct, "A (65%)" as HKEAA's answer keys print it (the section layouts
 * call `percentNote`), and the candidates' performance comments at the end of the key, as
 * an HKEAA examination report gives them. Printed wording: it follows the document's
 * language, so it stays out of the `messages.ts` catalogues.
 */
export const EXAM_RESULTS_WORDING = {
  heading: { en: 'Candidates’ performance', zh: '考生表現' },
  mc: { en: 'Multiple-choice questions', zh: '多項選擇題' },
  sq: { en: 'Structured questions', zh: '結構題' },
} as const;

/** "(65%)": a key's % correct, after its letter. */
export function percentNote(percent: number): string {
  return `(${formatPercent(percent)}%)`;
}

/**
 * "Candidates' performance", then the MC comment and the structured-question comment each
 * under its own bold label (kept with its first line), a paragraph per line typed. Nothing typed → nothing printed.
 */
export function renderPerformance(
  nodes: RenderNode[],
  performance: { mc?: BiText; sq?: BiText },
  language: LanguageMode,
): void {
  const parts = (
    [
      [EXAM_RESULTS_WORDING.mc, commentParagraphs(performance.mc, language)],
      [EXAM_RESULTS_WORDING.sq, commentParagraphs(performance.sq, language)],
    ] as const
  ).filter(([, paragraphs]) => paragraphs.length > 0);
  if (parts.length === 0) return;
  pushGap(nodes);
  const { heading } = EXAM_RESULTS_WORDING;
  nodes.push({ kind: 'text', style: 'Section Heading', text: bi(heading.en, heading.zh), keepNext: true });
  for (const [label, paragraphs] of parts) {
    pushGap(nodes);
    nodes.push({ kind: 'text', style: 'Body', text: bi(label.en, label.zh), keepNext: true, format: { bold: true } });
    for (const text of paragraphs) nodes.push({ kind: 'text', style: 'Body', text });
  }
}
