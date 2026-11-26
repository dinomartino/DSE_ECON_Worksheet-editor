import type { BankRow } from '@/library/types';
import { tagJob, type CreditJob } from '@/ai/credits';
import { isPaused } from '@/assist/paused';
import { AI_TAG_MESSAGES } from '@/components/bank/aiTag/AiTag.messages';
import { hasAnyTopic } from '@/components/bank/aiTag/aiTagStore';
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

export type BankScopeKey = 'question' | 'list' | 'shown' | 'untagged';

export interface BankScope {
  key: BankScopeKey;
  label: string;
  rows: BankRow[];
}

/**
 * "This question", "Your list · 5", "All 40 shown", and "All untagged · 12" (every question
 * in the bank without a topic, k-0560): only scopes holding something.
 */
export function bankScopes(
  question: BankRow | undefined,
  list: readonly BankRow[],
  shown: readonly BankRow[],
  lang: UiLanguage = uiLanguage(),
  untagged: readonly BankRow[] = [],
): BankScope[] {
  const m = resolveMessages(M, lang);
  const scopes: BankScope[] = [];
  if (question) scopes.push({ key: 'question', label: m.scopeQuestion, rows: [question] });
  if (list.length > 0) scopes.push({ key: 'list', label: m.scopeList(list.length), rows: [...list] });
  if (shown.length > 1) scopes.push({ key: 'shown', label: m.scopeShown(shown.length), rows: [...shown] });
  if (untagged.length > 0 && !isPaused('tag')) scopes.push({ key: 'untagged', label: resolveMessages(AI_TAG_MESSAGES, lang).scopeUntagged(untagged.length), rows: [...untagged] });
  return scopes;
}

export type BankVerbId = 'fill.zh' | 'fill.en' | 'terms' | 'tag' | 'tag.again';

export interface BankVerbRow {
  id: BankVerbId;
  label: string;
  /** The questions it would act on; a fill's are those missing that side. */
  rows: BankRow[];
  needsKey: boolean;
  /** A quiet line under it while it is the active row (what it leaves alone, what it does). */
  note?: string;
  /** "Uses about N credits" on the DSEcon Mentor account. */
  estimate?: CreditJob;
}

/** Roughly the words a question sends: one language of its printed text (`searchText` holds both). */
const sentText = (rows: readonly BankRow[]) => rows.map((row) => row.searchText.slice(0, Math.ceil(row.searchText.length / 2))).join('\n');

/** The items a tagging run gets back for these rows: one per leaf part where there are two or more (u-g13t), else one. */
export const tagItems = (rows: readonly BankRow[]): number =>
  rows.reduce((n, row) => {
    const leaves = (row.slots ?? []).filter((slot) => slot.leaf).length;
    return n + (leaves >= 2 ? leaves : 1);
  }, 0);

/**
 * AI tagging (k-0560): the untagged among these questions; or, for one question that has
 * topics, "Suggest topics again" (the teacher asking: Accept then replaces them). Already
 * tagged questions in a larger scope are left alone and counted.
 */
export function tagVerbRows(rows: readonly BankRow[], lang: UiLanguage = uiLanguage()): BankVerbRow[] {
  if (isPaused('tag')) return [];
  const t = resolveMessages(AI_TAG_MESSAGES, lang);
  const untagged = rows.filter((row) => !hasAnyTopic(row));
  if (untagged.length > 0) {
    const left = rows.length - untagged.length;
    return [{ id: 'tag', label: t.verb, rows: untagged, needsKey: true, note: left > 0 ? `${t.verbHint} ${t.leftAlone(left)}` : t.verbHint, estimate: tagJob(untagged.length, sentText(untagged), tagItems(untagged)) }];
  }
  if (rows.length === 1) return [{ id: 'tag.again', label: t.verbAgain, rows: [...rows], needsKey: true, note: t.verbAgainHint, estimate: tagJob(1, sentText(rows), tagItems(rows)) }];
  return [];
}

/**
 * What the menu offers for these questions, in the editor's order: fills, then Check terms,
 * then Tag topics. `only`: just these verbs (tag as you go offers tagging alone).
 */
export function bankVerbRows(
  rows: readonly BankRow[],
  teacherText: boolean,
  lang: UiLanguage = uiLanguage(),
  only?: readonly BankVerbId[],
): BankVerbRow[] {
  const all = [...editVerbRows(rows, teacherText, lang), ...tagVerbRows(rows, lang)];
  return only ? all.filter((verb) => only.includes(verb.id)) : all;
}

function editVerbRows(rows: readonly BankRow[], teacherText: boolean, lang: UiLanguage): BankVerbRow[] {
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
