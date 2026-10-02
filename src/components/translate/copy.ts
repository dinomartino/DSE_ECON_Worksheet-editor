import { COPY_EN, copyMessages } from './text';

/**
 * The AI translation, Check terms and error copy: teacher-facing strings as constants and
 * small format functions. The text lives in `./messages.ts`. A constant is the English
 * text; the functions, and components through `useMessages(COPY_MESSAGES)`, follow the
 * interface language.
 */

// ---- entry points ----

export const MENU_SETTINGS = COPY_EN.menuSettings;

// ---- flash ----

export const UNDO_ACTION = COPY_EN.undoAction;
export const replacedTermsFlash = (n: number): string => copyMessages().replacedTerms(n);

// ---- paper check ----

// The findings' own wording lives in `checkPaper` (src/model/paperHealth.ts).
export const PAPER_CHECK_OPEN_AI = COPY_EN.paperCheckOpenAi;

// ---- run bar ----

export const CLOSE = COPY_EN.close;
export const STOP = COPY_EN.stop;
export const TERMS_UNAVAILABLE = COPY_EN.termsUnavailable;
export const waitingLine = (provider: string, ms: number): string => copyMessages().waitingLine(provider, ms);

// ---- item notes ----

export const termFixed = (from: string, to: string): string => copyMessages().termFixed(from, to);
export const SIMPLIFIED_FIXED = COPY_EN.simplifiedFixed;
export const conflictChip = (form: string, meansEn: string): string => copyMessages().conflictChip(form, meansEn);
/** `mine`: the expected wording is the teacher's own choice or term, so it is not labelled EDB. */
export const termChip = (state: string, en: string, expected: string, mine = false): string => {
  const m = copyMessages();
  if (mine) return m.ownChip(en, expected);
  return state === 'not-preferred' ? m.termChipNotPreferred(en, expected) : m.termChip(en, expected);
};
export const failedRow = (reason: string): string => copyMessages().failedRow(reason);
export const SAFETY_ROW = COPY_EN.safetyRow;

// ---- Error ----

export const TECHNICAL_DETAIL = COPY_EN.technicalDetail;
export const REGION_GEMINI_NOTE = COPY_EN.regionGeminiNote;
export const useProvider = (name: string): string => copyMessages().useProvider(name);
export const HK_PROVIDERS_NOTE = COPY_EN.hkProvidersNote;
export const TRY_AGAIN = COPY_EN.tryAgain;
export const OPEN_SETTINGS = COPY_EN.openSettings;
export const CHOOSE_MODEL = COPY_EN.chooseModel;
export const SWITCH_PROVIDER = COPY_EN.switchProvider;
export const GET_NEW_KEY = COPY_EN.getNewKey;
export const openProvider = (provider: string): string => copyMessages().openProvider(provider);
export const switchModel = (model: string): string => copyMessages().switchModel(model);
export const noKeyError = (provider: string, desktop: boolean): string => copyMessages().noKeyError(provider, desktop);
export const noModelError = (provider: string): string => copyMessages().noModelError(provider);
export const noBaseUrlError = (provider: string): string => copyMessages().noBaseUrlError(provider);

// ---- Check terms ----

/** A textbook variant is offered, not counted as wrong. */
export const checkSummary = (fix: number, variants: number, lower: number, manual: number): string => {
  const m = copyMessages();
  return [
    fix > 0 || variants + lower + manual === 0 ? m.summaryFix(fix) : '',
    variants > 0 ? m.summaryVariant(variants) : '',
    lower > 0 ? m.summaryLower(lower) : '',
    manual > 0 ? m.summaryManual(manual) : '',
  ]
    .filter(Boolean)
    .join(' · ');
};
export const NOTHING_REPLACED = COPY_EN.nothingReplaced;
export const lowerRankLine = (en: string, found: string, expected: string): string =>
  copyMessages().lowerRankLine(en, found, expected);
