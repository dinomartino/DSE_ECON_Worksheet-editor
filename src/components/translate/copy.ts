/**
 * The Translate / Check terms / Settings copy deck: every teacher-facing string in one
 * place, as constants and small format functions.
 */

import type { Side } from '@/model/textSlots';

// ---- entry points ----

export const PILL_TITLE = 'Fill the missing language with AI translation…';
export const pillLabel = (n: number): string => `${n} untranslated`;

export const MENU_TRANSLATE = 'Translate…';
export const MENU_CHECK_TERMS = 'Check terms…';
export const MENU_SETTINGS = 'Settings…';
export const START_SETTINGS_LINK = 'Settings';

// ---- Setup privacy line ----

/** "Sends these 46 texts, plus 6 already-translated lines from the same questions for
 *  context, from this browser to Google with your key." Followed by `preset.privacy`. */
export function privacyLine(opts: { texts: number; context: number; desktop: boolean; provider: string }): string {
  const context =
    opts.context > 0
      ? `, plus ${opts.context} already-translated ${plural(opts.context, 'line')} from the same questions for context,`
      : '';
  const where = opts.desktop ? 'computer' : 'browser';
  return `Sends these ${opts.texts} ${plural(opts.texts, 'text')}${context} from this ${where} to ${opts.provider} with your key.`;
}

// ---- flash ----

export function filledFlash(filled: number, skipped: number): string {
  const base = `Filled ${filled} ${plural(filled, 'text')}`;
  return skipped > 0 ? `${base} · ${skipped} skipped (changed while translating)` : base;
}
/** The flash's action: jump to the side just filled. */
export const viewSideAction = (side: Side): string => (side === 'zh' ? 'View 中文' : 'View English');
export const UNDO_ACTION = 'Undo';
export const replacedTermsFlash = (n: number): string => `Replaced ${n} ${plural(n, 'term')}`;

// ---- paper check ----

/** Matches `checkPaper`'s existing wording, singular included. */
export const untranslatedFinding = (n: number): string =>
  `${n} ${n === 1 ? 'string is' : 'strings are'} written in one language only.`;
export const PAPER_CHECK_TRANSLATE = 'Translate…';
export const terminologyFinding = (n: number): string =>
  `${n} ${n === 1 ? 'term differs' : 'terms differ'} from the EDB glossary.`;
export const PAPER_CHECK_REVIEW_TERMS = 'Review terms…';

// ---- footer ----

/** The ⓘ beside it carries the full citation (`GLOSSARY_ATTRIBUTION`). */
export const FOOTER_ATTRIBUTION = 'Terms: EDB Economics glossary (2020)';

// ---- dialog ----

export const DIALOG_TITLE = 'Translate';
export const SETUP_DESCRIPTION = 'Fill the missing language. Nothing changes until you insert.';
export const CHECK_DESCRIPTION = 'Compare the Chinese with the EDB Economics glossary. No key needed.';
export const MODE_TRANSLATE = 'Translate';
export const MODE_CHECK = 'Check terms';
/** Short footer form; its tooltip carries the full citation. */
export const FOOTER_ATTRIBUTION_SHORT = 'Terms: EDB (2020)';
export const CLOSE = 'Close';
export const CANCEL = 'Cancel';

// ---- Setup ----

export const SCOPE_LABEL = 'What';
export const SCOPE_PAPER = 'Whole paper';
export const scopeSelected = (n: number): string => `Selected (${n})`;
export const SCOPE_TEXT = 'This text';
export const SCOPE_FIGURE = 'This figure';
export const scopeQuestions = (n: number): string => (n === 1 ? 'This question' : `${n} questions`);

export const OPTION_TO_ZH = 'English → 中文';
export const OPTION_TO_EN = '中文 → English';
export const OPTION_TEACHER = 'Answers, mark schemes and alt text (teacher version)';
export const OPTION_DIAGRAM = 'Diagram labels';
const sideName = (side: Side): string => (side === 'zh' ? '中文' : 'English');
export const optionSymbols = (side: Side): string => `Numbers and symbols → ${sideName(side)} (copied as they are)`;
export const optionSymbolsHint = (side: Side): string =>
  `For ${side === 'zh' ? 'a 中文-only' : 'an English-only'} paper. In EN+中 they would print twice.`;
export const optionReplace = (side: Side): string => `Also replace existing ${sideName(side)}`;
export const textsCount = (n: number): string => `${n} ${plural(n, 'text')}`;

export const termsLine = (n: number): string =>
  `${n} economics ${plural(n, 'term')} will follow the EDB glossary.`;
export const TERMS_UNAVAILABLE = 'Terminology check unavailable';
export const CHANGE_PROVIDER = 'Change…';
/** A keyless local provider replaces the privacy line. */
export const localPrivacyLine = (provider: string): string => `Sent to ${provider} on this computer. Nothing leaves it.`;
export const translateButton = (n: number): string => `Translate ${n}`;

export const NO_PROVIDER_LEAD = 'Translation uses an AI provider and your own key.';
export const NO_PROVIDER_HK =
  "Gemini's key is free where Google offers it. In Hong Kong, Google doesn't offer Gemini's key or API: use DeepSeek or Qwen.";
export const setUpProvider = (name: string): string => `Set up ${name}`;
export const CHECK_WITHOUT_KEY = 'Check terms works without a key →';
export const NOTHING_TO_FILL = 'Every text has both English and 中文.';
export const onlySymbols = (n: number): string =>
  `${n} numbers and symbols can be copied as they are — no AI needed.`;
export const copyButton = (n: number): string => `Copy ${n}`;

// ---- Running ----

export const runningTitle = (n: number, provider: string): string => `Translating ${textsCount(n)} with ${provider}…`;
export const requestsLine = (done: number, total: number): string => `${done} of ${total} ${plural(total, 'request')}`;
export const PHASE_TRANSLATING = 'Translating…';
export const PHASE_CHECKING = 'Checking terms…';
export const PHASE_FIXING = 'Fixing terms…';
export const waitingLine = (provider: string, ms: number): string =>
  `Waiting for ${provider}'s rate limit (${Math.max(1, Math.round(ms / 1000))} s)`;
export const STOP_QUESTION = 'Stop translating? Finished rows are kept.';
export const KEEP_GOING = 'Keep going';
export const STOP = 'Stop';

// ---- Review ----

export const directionsLabel = (toZh: boolean, toEn: boolean): string =>
  toZh && toEn ? 'English ↔ 中文' : toEn ? '中文 → English' : 'English → 中文';
export const reviewSummary = (o: { directions: string; texts: number; model: string; ms: number }): string =>
  [o.directions, textsCount(o.texts), o.model, o.ms > 0 ? `${Math.max(1, Math.round(o.ms / 1000))} s` : '']
    .filter(Boolean)
    .join(' · ');
export const filterAll = (n: number): string => `All ${n}`;
export const filterLook = (n: number): string => `Needs a look ${n}`;
export const filterFailed = (n: number): string => `Couldn't translate ${n}`;
export const SHOW = 'Show:';
export const SELECT = 'Select:';
export const SELECT_ALL = 'All';
export const SELECT_NONE = 'None';
export const stoppedNote = (done: number, total: number): string => `Stopped · ${done} of ${total} translated`;
export const copiesGroup = (n: number): string => `Numbers and symbols · copied as they are (${n})`;
export const appearsTimes = (n: number): string => `Appears ${n} times in this scope`;
export const termFixed = (from: string, to: string): string => `Term fixed: ${from} → ${to} (EDB)`;
export const SIMPLIFIED_FIXED = 'Simplified characters changed to Traditional';
export const conflictChip = (form: string, meansEn: string): string => `Meaning reversed? ${form} is “${meansEn}”`;
export const termChip = (state: string, en: string, expected: string): string =>
  state === 'not-preferred' ? `EDB lists ${expected} first for “${en}”` : `${en} — EDB: ${expected}`;
export const failedRow = (reason: string): string => `Couldn't translate this text safely (${reason}).`;
export const SAFETY_ROW = 'The provider declined to translate this text.';
export const REVIEW_HINT = 'Edit any line on the page after inserting.';
export const BACK = 'Back';
export const insertButton = (n: number): string => `Insert ${n}`;
export const RETRY_FAILED = 'Retry failed';
export const translateRest = (n: number): string => `Translate the other ${n}`;
export const discardQuestion = (n: number): string => `Discard ${n} ${plural(n, 'translation')}?`;
export const KEEP_REVIEWING = 'Keep reviewing';
export const DISCARD = 'Discard';
export const NOTHING_INSERTED = 'Nothing inserted — these texts changed while translating.';
export const NO_ROWS = 'No texts in this view.';

// ---- Error ----

export const TECHNICAL_DETAIL = 'Technical detail';
export const REGION_GEMINI_NOTE = "This is Google's rule for Hong Kong, not a problem with your key.";
export const useProvider = (name: string): string => `Use ${name}`;
export const HK_PROVIDERS_NOTE = 'Both work from Hong Kong.';
export const reviewFinished = (n: number): string => `Review the ${n} finished`;
export const TRY_AGAIN = 'Try again';
export const OPEN_SETTINGS = 'Open Settings';
export const CHOOSE_MODEL = 'Choose a model…';
export const SWITCH_PROVIDER = 'Switch provider…';
export const GET_NEW_KEY = 'Get a new key';
export const openProvider = (provider: string): string => `Open ${provider}`;
export const switchModel = (model: string): string => `Switch to ${model}`;
export const noKeyError = (provider: string, desktop: boolean): string =>
  `No key for ${provider} is saved on this ${desktop ? 'computer' : 'browser'}.`;
export const noModelError = (provider: string): string => `Choose a model for ${provider} in Settings.`;
export const noBaseUrlError = (provider: string): string => `Add the server address for ${provider} in Settings.`;

// ---- Check terms ----

export const checkSummary = (fix: number, lower: number, manual: number): string =>
  [
    `${fix} to fix`,
    lower > 0 ? `${lower} acceptable but not the first choice` : '',
    manual > 0 ? `${manual} to check by hand` : '',
  ]
    .filter(Boolean)
    .join(' · ');
export const GLOSSARY_LOADING = 'Loading the glossary…';
export const NO_TERM_FINDINGS = 'No term differs from the EDB glossary.';
export const LOWER_RANK_GROUP = 'Acceptable, not the first choice';
export const MANUAL_GROUP = "Can't fix automatically";
export const SHOW_ON_PAGE = 'Show on page';
export const NOTHING_REPLACED = 'Nothing replaced — these texts changed since the check.';
export const usePreferred = (form: string): string => `Use ${form}`;
export const lowerRankLine = (en: string, found: string, expected: string): string =>
  `${en}: ${found} — EDB lists ${expected} first`;
export const replaceButton = (n: number): string => `Replace ${n} ${plural(n, 'term')}`;

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
