import { defineMessages, type Messages } from '@/i18n/catalogue';
import type { StyleFinding, StyleFindingId } from './check';
import { DSE_STYLE_WORDS } from './words';

/**
 * What the HKDSE house-style check found, in words (k-0548; entries in `words.ts`). Another
 * feature (k-0549's wording enhancement) reads them with `useMessages(DSE_STYLE_MESSAGES)` +
 * `styleFindingText`; the studio has the same entries in its findings catalogue. Each says
 * what HKEAA papers do, so the teacher can judge; none is a block.
 */
export const DSE_STYLE_MESSAGES = defineMessages(DSE_STYLE_WORDS);

/** The resolved words of one language: `useMessages(DSE_STYLE_MESSAGES)`, or a catalogue that spreads `DSE_STYLE_WORDS`. */
export type DseStyleMessages = Messages<typeof DSE_STYLE_WORDS>;

const str = (v: string | number | undefined): string => (v === undefined ? '' : String(v));

/** A style finding as a sentence in one language (`m` holds `DSE_STYLE_MESSAGES`' entries). */
export function styleFindingText(finding: StyleFinding | { id: string; params?: Readonly<Record<string, string | number>> }, m: DseStyleMessages): string | null {
  const p = finding.params ?? {};
  const side = p.side === 'zh' ? m.styleSideZh : m.styleSideEn;
  switch (finding.id as StyleFindingId) {
    case 'style.negativeCase':
      return m.styleNegativeCase;
    case 'style.questionMark':
      return m.styleQuestionMark(side);
    case 'style.comboForm':
      return m.styleComboForm(side);
    case 'style.comboOnly':
      return m.styleComboOnly(side);
    case 'style.comboOrder':
      return m.styleComboOrder(side);
    case 'style.numberOrder':
      return m.styleNumberOrder(side);
    case 'style.thousandsComma':
      return m.styleThousandsComma(str(p.example));
    case 'style.optionStops':
      return m.styleOptionStops(side);
    case 'style.statementStops':
      return m.styleStatementStops(side);
    case 'style.blankSeparator':
      return m.styleBlankSeparator(side);
    case 'style.zhPunctuation':
      return m.styleZhPunctuation(str(p.example));
    case 'style.zhSimplified':
      return m.styleZhSimplified(str(p.example));
    case 'style.zhMoney':
      return m.styleZhMoney(str(p.example));
    case 'style.contraction':
      return m.styleContraction(str(p.example));
    case 'style.filler':
      return m.styleFiller(str(p.example));
    case 'style.paperWord':
      return m.stylePaperWord(str(p.example), str(p.paper));
    case 'style.longSentence':
      return m.styleLongSentence(side, typeof p.length === 'number' ? p.length : Number(p.length) || 0);
    case 'style.spelling':
      return m.styleSpelling(str(p.example), str(p.british));
    default:
      return null;
  }
}
