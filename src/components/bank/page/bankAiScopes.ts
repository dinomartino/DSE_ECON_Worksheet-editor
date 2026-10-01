import type { BankRow } from '@/library/types';
import { uiLanguage } from '@/i18n/language';
import { resolveMessages } from '@/i18n/catalogue';
import type { UiLanguage } from '@/settings/language';
import { missingSides } from './bankPage';
import { BANK_PAGE_MESSAGES as M } from './bankPage.messages';

/**
 * The bank's ✦ AI menu, pure: the scopes a click can act on (the question on screen, your
 * list, every question shown) and the verbs each offers, counted in questions. A verb with
 * nothing to act on is not offered, as in the editor's menu.
 */

export type BankScopeKey = 'question' | 'list' | 'shown';

export interface BankScope {
  key: BankScopeKey;
  label: string;
  rows: BankRow[];
}

/** "This question", "Your list · 5", "All 40 shown": only scopes holding something. */
export function bankScopes(
  question: BankRow | undefined,
  list: readonly BankRow[],
  shown: readonly BankRow[],
  lang: UiLanguage = uiLanguage(),
): BankScope[] {
  const m = resolveMessages(M, lang);
  const scopes: BankScope[] = [];
  if (question) scopes.push({ key: 'question', label: m.scopeQuestion, rows: [question] });
  if (list.length > 0) scopes.push({ key: 'list', label: m.scopeList(list.length), rows: [...list] });
  if (shown.length > 1) scopes.push({ key: 'shown', label: m.scopeShown(shown.length), rows: [...shown] });
  return scopes;
}

export type BankVerbId = 'fill.zh' | 'fill.en' | 'terms';

export interface BankVerbRow {
  id: BankVerbId;
  label: string;
  /** The questions it would act on; a fill's are those missing that side. */
  rows: BankRow[];
  needsKey: boolean;
}

/** What the menu offers for these questions, in the editor's order: fills, then Check terms. */
export function bankVerbRows(rows: readonly BankRow[], teacherText: boolean, lang: UiLanguage = uiLanguage()): BankVerbRow[] {
  const m = resolveMessages(M, lang);
  const lacking = (side: 'zh' | 'en') => rows.filter((row) => missingSides(row, teacherText).includes(side));
  const both = rows.filter((row) => row.languages.includes('en') && row.languages.includes('zh'));
  const verbs: BankVerbRow[] = [
    { id: 'fill.zh', label: m.fillZh, rows: lacking('zh'), needsKey: true },
    { id: 'fill.en', label: m.fillEn, rows: lacking('en'), needsKey: true },
    { id: 'terms', label: m.checkTerms, rows: both, needsKey: false },
  ];
  return verbs.filter((verb) => verb.rows.length > 0);
}

export const questionCount = (n: number, lang: UiLanguage = uiLanguage()): string => resolveMessages(M, lang).questions(n);

/** The editor's line for what a click sends where: "Sends 12 questions to Gemini with your key". */
export const sendsLine = (n: number, provider: string, lang: UiLanguage = uiLanguage()): string =>
  resolveMessages(M, lang).sends(n, provider);
