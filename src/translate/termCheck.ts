import type { Glossary, TermCheck } from '@/glossary/types';
import type { TermSummary } from '@/model/paperHealth';
import { isRichTextEmpty, normalizeRuns, plain, richTextLength, sliceRichText } from '@/model/text';
import type { TextPath, TextSlot, TranslationWrite } from '@/model/textSlots';
import { collectTexts } from '@/model/textWalk';
import type { RichText, Worksheet } from '@/model/types';
import { slotInScope } from './plan';
import type { TermRow, TranslateScope } from './types';

/**
 * Check terms (keyless): every printed slot with both sides present, checked EN→ZH
 * against the glossary. `TermSummary` is declared in `paperHealth.ts`, so the paper check
 * imports nothing from here.
 */

/** What a teacher can act on: a fix, a conflict, or a warn to find on the page. */
const actionable = (check: TermCheck) =>
  (check.severity === 'note' || check.severity === 'warn') && Boolean(check.fix || check.conflict || check.severity === 'warn');

function checked(slots: readonly TextSlot[], glossary: Glossary, scope: TranslateScope) {
  return slots
    .filter((slot) => slotInScope(slot, scope) && !slot.unprinted)
    .filter((slot) => !isRichTextEmpty(slot.text.en) && !isRichTextEmpty(slot.text.zh))
    .map((slot) => ({ slot, checks: glossary.checkEnToZh(plain(slot.text.en), plain(slot.text.zh)) }));
}

/** Pure core of `buildTermCheck`, over hand-built or walked slots. */
export function termRowsFromSlots(slots: readonly TextSlot[], glossary: Glossary, scope: TranslateScope): TermRow[] {
  return checked(slots, glossary, scope).flatMap(({ slot, checks }) => {
    const kept = checks.filter(actionable);
    return kept.length ? [{ path: slot.path, slot, en: slot.text.en, zh: slot.text.zh, checks: kept }] : [];
  });
}

export function buildTermCheck(ws: Worksheet, glossary: Glossary, scope: TranslateScope): TermRow[] {
  return termRowsFromSlots(collectTexts(ws), glossary, scope);
}

/** `[start, end)` becomes `to`, formatted like the first character it replaces. */
function replaceSpan(runs: RichText, start: number, end: number, to: string): RichText {
  const [first] = sliceRichText(runs, start, start + 1);
  return normalizeRuns([
    ...sliceRichText(runs, 0, start),
    { ...first, text: to },
    ...sliceRichText(runs, end, richTextLength(runs)),
  ]);
}

/** One write per row with any accepted index into `row.checks`: side 'zh',
 *  sourceSnapshot = row.en, targetSnapshot = row.zh, next = row.zh with the accepted
 *  `fix` spans (plain-text offsets, mapped to runs) replaced right to left. Checks without
 *  a `fix`, and a fix overlapping one already taken, are ignored. */
export function termFixWrites(
  rows: readonly TermRow[],
  accepted: ReadonlyMap<TextPath, ReadonlySet<number>>,
): TranslationWrite[] {
  return rows.flatMap((row) => {
    const fixes = [...(accepted.get(row.path) ?? [])]
      .map((index) => row.checks[index]?.fix)
      .filter((fix): fix is NonNullable<TermCheck['fix']> => Boolean(fix))
      .sort((a, b) => b.start - a.start);
    let next = row.zh;
    let limit = Infinity;
    for (const fix of fixes) {
      if (fix.end > limit) continue;
      next = replaceSpan(next, fix.start, fix.end, fix.to);
      limit = fix.start;
    }
    if (next === row.zh) return [];
    return [{ path: row.path, side: 'zh' as const, sourceSnapshot: row.en, targetSnapshot: row.zh, next }];
  });
}

/** Pure core of `termSummary`. */
export function termSummaryFromSlots(slots: readonly TextSlot[], glossary: Glossary): TermSummary {
  let warn = 0;
  let outsideQuestions = 0;
  const questionIds: string[] = [];
  for (const { slot, checks } of checked(slots, glossary, { kind: 'paper' })) {
    const warns = checks.filter((check) => check.severity === 'warn').length;
    if (!warns) continue;
    warn += warns;
    if (slot.questionId === undefined) outsideQuestions += warns;
    else if (!questionIds.includes(slot.questionId)) questionIds.push(slot.questionId);
  }
  return { warn, questionIds, outsideQuestions };
}

export function termSummary(ws: Worksheet, glossary: Glossary): TermSummary {
  return termSummaryFromSlots(collectTexts(ws), glossary);
}
