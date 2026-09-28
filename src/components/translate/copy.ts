/**
 * The AI translation, Check terms and error copy: teacher-facing strings in one place, as
 * constants and small format functions. The AI door's verbs and bar read them.
 */

// ---- entry points ----

export const MENU_SETTINGS = 'Settings…';

// ---- flash ----

export const UNDO_ACTION = 'Undo';
export const replacedTermsFlash = (n: number): string => `Replaced ${n} ${plural(n, 'term')}`;

// ---- paper check ----

// The findings' own wording lives in `checkPaper` (src/model/paperHealth.ts).
export const PAPER_CHECK_OPEN_AI = 'Open ✦ AI';

// ---- run bar ----

export const CLOSE = 'Close';
export const STOP = 'Stop';
export const TERMS_UNAVAILABLE = 'Terminology check unavailable';
export const waitingLine = (provider: string, ms: number): string =>
  `Waiting for ${provider}'s rate limit (${Math.max(1, Math.round(ms / 1000))} s)`;

// ---- item notes ----

export const termFixed = (from: string, to: string): string => `Term fixed: ${from} → ${to} (EDB)`;
export const SIMPLIFIED_FIXED = 'Simplified characters changed to Traditional';
export const conflictChip = (form: string, meansEn: string): string => `Meaning reversed? ${form} is “${meansEn}”`;
export const termChip = (state: string, en: string, expected: string): string =>
  state === 'not-preferred' ? `EDB lists ${expected} first for “${en}”` : `${en} — EDB: ${expected}`;
export const failedRow = (reason: string): string => `Couldn't translate this text safely (${reason}).`;
export const SAFETY_ROW = 'The provider declined to translate this text.';

// ---- Error ----

export const TECHNICAL_DETAIL = 'Technical detail';
export const REGION_GEMINI_NOTE = 'Keep the VPN on while you use Gemini.';
export const useProvider = (name: string): string => `Use ${name}`;
export const HK_PROVIDERS_NOTE = 'DeepSeek and Qwen work in Hong Kong without a VPN.';
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

/** A textbook variant is offered, not counted as wrong. */
export const checkSummary = (fix: number, variants: number, lower: number, manual: number): string =>
  [
    fix > 0 || variants + lower + manual === 0 ? `${fix} to fix` : '',
    variants > 0 ? `${variants} textbook ${plural(variants, 'variant')}` : '',
    lower > 0 ? `${lower} acceptable but not the first choice` : '',
    manual > 0 ? `${manual} to check by hand` : '',
  ]
    .filter(Boolean)
    .join(' · ');
export const NOTHING_REPLACED = 'Nothing replaced — these texts changed since the check.';
export const lowerRankLine = (en: string, found: string, expected: string): string =>
  `${en}: ${found} — EDB lists ${expected} first`;

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
