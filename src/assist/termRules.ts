import * as copy from '@/components/translate/copy';
import { copyMessages } from '@/components/translate/text';
import { ASSIST_EN, assistMessages } from './text';
import type { TermCheck } from '@/glossary/types';
import { plain } from '@/model/text';
import type { TextPath } from '@/model/textSlots';
import type { TermRow } from '@/translate/types';

/**
 * Check terms' rules, pure: which fixes are safe to apply together, what a finding says,
 * and the tally the summary counts. The editor's verb (`src/assist/verbs/checkTerms.ts`)
 * and the question bank's check (`src/assist/bankRun.ts`) both read them.
 */

export const TERMS_MATCH = ASSIST_EN.termsMatch;
export const NOTHING_REPLACED_ONE = ASSIST_EN.nothingReplacedOne;

export const isVariant = (check: TermCheck): boolean => check.fix?.kind === 'deny' && check.fix.denyKind === 'variant';

/** Pre-ticked in the old panel, applied by Replace N: a wrong form, not a variant or a lower rank. */
export const safeFix = (check: TermCheck): boolean => check.fix?.kind === 'deny' && !isVariant(check);

/** The Chinese with one fix applied (plain-text offsets). */
export function fixedPreview(row: TermRow, check: TermCheck): string {
  const text = plain(row.zh);
  return check.fix ? text.slice(0, check.fix.start) + check.fix.to + text.slice(check.fix.end) : text;
}

export function termNotes(row: TermRow, check: TermCheck): string[] {
  const m = assistMessages();
  const edb = copyMessages().termChip(check.en, check.expected);
  if (!check.fix) {
    const found = check.found ? m.foundLine(check.en, check.found.text, check.expected) : edb;
    return check.conflict ? [found, copy.conflictChip(check.conflict.form, check.conflict.meansEn)] : [found];
  }
  if (check.fix.kind === 'lowerRank') return [copy.lowerRankLine(check.en, check.found?.text ?? '', check.expected)];
  const preview = `→ ${fixedPreview(row, check)}`;
  return isVariant(check) ? [edb, preview, m.textbookForm(check.fix.to)] : [edb, preview];
}

export interface TermTally {
  fix: number;
  variants: number;
  lower: number;
  manual: number;
}

/** What the summary counts, and the safe fixes Replace N applies (by path, indexes into `checks`). */
export function termTally(rows: readonly TermRow[]): { tally: TermTally; safe: Map<TextPath, Set<number>>; safeCount: number } {
  const tally: TermTally = { fix: 0, variants: 0, lower: 0, manual: 0 };
  const safe = new Map<TextPath, Set<number>>();
  for (const row of rows) {
    row.checks.forEach((check, index) => {
      const fix = check.fix;
      if (!fix) tally.manual += 1;
      else if (fix.kind === 'lowerRank') tally.lower += 1;
      else if (isVariant(check)) tally.variants += 1;
      else tally.fix += 1;
      if (safeFix(check)) safe.set(row.path, new Set([...(safe.get(row.path) ?? []), index]));
    });
  }
  const safeCount = [...safe.values()].reduce((sum, set) => sum + set.size, 0);
  return { tally, safe, safeCount };
}

/** "3 to fix · 1 textbook variant". */
export const tallySummary = (tally: TermTally): string => copy.checkSummary(tally.fix, tally.variants, tally.lower, tally.manual);
