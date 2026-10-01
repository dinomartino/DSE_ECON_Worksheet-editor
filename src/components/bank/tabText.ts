import { paperTypeIds, typesOutsidePaper } from '@/library/paperTypes';
import { MARK_BANDS, type TabFilters } from '@/library/tabFilters';
import type { Worksheet } from '@/model/types';
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import { topicHeading } from '@/model/topics';
import type { UiLanguage } from '@/settings/language';
import { typeLabel } from './BankRow';
import { BANK_TAB_MESSAGES } from './messages';

/** "MCQs", "structured questions": the registry's label, never a branch on the id. */
export function typePlural(typeId: string, lang: UiLanguage = uiLanguage()): string {
  const m = resolveMessages(BANK_TAB_MESSAGES, lang);
  if (!typeId) return m.noQuestions;
  const label = typeLabel(typeId);
  return /[A-Z]$/.test(label) ? m.typeNounShort(label) : m.typeNounLong(label);
}

/** A mark band as the Marks picker names it. */
export function markBandLabel(value: string, lang: UiLanguage = uiLanguage()): string {
  const m = resolveMessages(BANK_TAB_MESSAGES, lang);
  const labels: Record<string, string> = {
    any: m.bandAny,
    '1': m.band1,
    '2-4': m.band2to4,
    '5-8': m.band5to8,
    '9+': m.band9,
  };
  return labels[value] ?? MARK_BANDS.find((band) => band.value === value)?.label ?? value;
}

/** What the filters asked for, as the filtered-to-nothing line says it. */
export function emptySentence(
  filters: TabFilters,
  classLabel: string | undefined,
  lang: UiLanguage = uiLanguage(),
): string {
  const m = resolveMessages(BANK_TAB_MESSAGES, lang);
  const parts: string[] = [];
  if (filters.topic) parts.push(m.emptyIn(topicHeading(filters.topic, lang === 'zh-HK' ? 'zh' : 'en')));
  const band = MARK_BANDS.find((entry) => entry.value === filters.marks);
  if (band?.range) parts.push(m.emptyWorth(markBandLabel(band.value, lang)));
  if (filters.text.trim()) parts.push(m.emptyMatching(filters.text.trim()));
  if (filters.notUsedWithClass && classLabel?.trim()) parts.push(m.emptyNotUsed(classLabel.trim()));
  if (filters.from === 'banks') parts.push(m.emptyBanks);
  else if (typeof filters.from === 'object') parts.push(m.emptyDoc);
  return m.emptySentence(typePlural(filters.typeId, lang), parts.join(m.listComma));
}

/**
 * One quiet line when an insert brought in a type this paper does not normally take
 * ("This paper usually takes MCQs only."); undefined when every type fits.
 */
export function outsidePaperNote(
  worksheet: Worksheet,
  typeIds: readonly string[],
  lang: UiLanguage = uiLanguage(),
): string | undefined {
  if (typesOutsidePaper(worksheet, typeIds).length === 0) return undefined;
  const takes = paperTypeIds(worksheet);
  if (takes.length === 0) return undefined;
  const m = resolveMessages(BANK_TAB_MESSAGES, lang);
  return m.paperTakes(
    takes.map((id) => typePlural(id, lang)).join(m.listAnd),
  );
}
