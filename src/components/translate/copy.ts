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

export const untranslatedFinding = (n: number): string => `${n} strings are written in one language only.`;
export const PAPER_CHECK_TRANSLATE = 'Translate…';
export const terminologyFinding = (n: number): string => `${n} terms differ from the EDB glossary.`;
export const PAPER_CHECK_REVIEW_TERMS = 'Review terms…';

// ---- footer ----

/** The ⓘ beside it carries the full citation (`GLOSSARY_ATTRIBUTION`). */
export const FOOTER_ATTRIBUTION = 'Terms: EDB Economics glossary (2020)';

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
