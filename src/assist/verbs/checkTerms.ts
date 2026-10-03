import * as copy from '@/components/translate/copy';
import { loadGlossary } from '@/glossary/load';
import type { Glossary } from '@/glossary/types';
import { editTargetKey } from '@/model/edits';
import { isRichTextEmpty, plain } from '@/model/text';
import type { TextPath } from '@/model/textSlots';
import { useAppDialogs } from '@/store/appDialogs';
import { slotInScope } from '@/translate/plan';
import { useWorksheetStore } from '@/store/worksheetStore';
import { termFixWrites, termResultFromSlots } from '@/translate/termCheck';
import type { TermRow } from '@/translate/types';
import { copyMessages } from '@/components/translate/text';
import { assistMessages } from '../text';
import { registerVerb } from '../registry';
import { termNotes, termTally, tallySummary, type TermTally } from '../termRules';
import type { AiVerb, FindingsRefresh, ReviewItem, VerbContext, VerbOutcome } from '../types';
import { applyWrites, commitUndo, slotsOf, whereOf } from './translateShared';

/**
 * Check terms (keyless, instant): the 中文 against the EDB glossary. Nothing is written
 * by the check; each finding offers its own fix, and Replace N applies the safe ones
 * (old seeds, mainland/Taiwan forms) in one commit. A textbook variant and a lower rank
 * stay one click each.
 */

export { TERMS_MATCH, fixedPreview, safeFix, termNotes } from '../termRules';

function replace(rows: readonly TermRow[], accepted: Map<TextPath, Set<number>>, worksheetId: string): number {
  const writes = termFixWrites(rows, accepted);
  const report = applyWrites(writes, worksheetId);
  const skipped = new Set(report.skipped.map((s) => s.path));
  let terms = 0;
  for (const write of writes) if (!skipped.has(write.path)) terms += accepted.get(write.path)?.size ?? 0;
  return terms;
}

/** Rows and matches as the check reads them; re-read after a card's action. */
export interface TermResult {
  rows: readonly TermRow[];
  matched: number;
}

const summaryOf = ({ rows, matched }: TermResult, tally: TermTally): string => {
  if (rows.length === 0) return matched > 0 ? assistMessages().termsMatchN(matched) : assistMessages().noTermsFound;
  const fixes = tallySummary(tally);
  return matched > 0 ? `${fixes} · ${assistMessages().matchedN(matched)}` : fixes;
};

function applyAllOf(rows: readonly TermRow[], safe: Map<TextPath, Set<number>>, n: number, worksheetId: string) {
  if (n === 0) return undefined;
  return {
    label: assistMessages().replaceN(n),
    run: () => {
      const terms = replace(rows, safe, worksheetId);
      if (terms === 0) return useAppDialogs.getState().notify(copyMessages().nothingReplaced);
      const undo = commitUndo();
      useAppDialogs.getState().notify(copy.replacedTermsFlash(terms), { label: copyMessages().undoAction, ...undo });
    },
  };
}

/** The bar for a result: summary and Replace N. */
function barOf(result: TermResult, worksheetId: string): FindingsRefresh {
  const { tally, safe, safeCount } = termTally(result.rows);
  const applyAll = applyAllOf(result.rows, safe, safeCount, worksheetId);
  return { summary: summaryOf(result, tally), ...(applyAll ? { applyAll } : {}) };
}

/** `recheck` re-reads the paper after a card's fix, so the bar never counts a fixed term. */
export function termFindings(ctx: VerbContext, result: TermResult, recheck?: () => TermResult): VerbOutcome {
  const { rows } = result;
  if (rows.length === 0) return { kind: 'nothing', summary: summaryOf(result, termTally(rows).tally) };
  const items: ReviewItem[] = [];
  for (const row of rows) {
    const slot = row.slot;
    row.checks.forEach((check, index) => {
      const fix = check.fix;
      items.push({
        id: `${row.path}#${index}`,
        tone: 'finding',
        ...(slot.target ? { targetKey: editTargetKey(slot.target) } : {}),
        ...(slot.questionId ? { questionId: slot.questionId } : {}),
        where: whereOf(slot),
        source: plain(row.en),
        notes: termNotes(row, check),
        ...(fix
          ? {
              action: {
                label: assistMessages().replaceWith(fix.to),
                run: () => {
                  if (replace([row], new Map([[row.path, new Set([index])]]), ctx.worksheet.id) > 0) return true;
                  useAppDialogs.getState().notify(assistMessages().nothingReplacedOne);
                  return false;
                },
              },
            }
          : {}),
      });
    });
  }
  return {
    kind: 'findings',
    ...barOf(result, ctx.worksheet.id),
    items,
    ...(recheck ? { refresh: () => barOf(recheck(), ctx.worksheet.id) } : {}),
  };
}

/** Printed, non-alt text in scope with both sides: what the check reads. */
const hasBoth = (ctx: VerbContext): boolean =>
  slotsOf(ctx.worksheet).some(
    (slot) =>
      slotInScope(slot, ctx.scope) && !slot.unprinted && slot.role !== 'meta' && !isRichTextEmpty(slot.text.en) && !isRichTextEmpty(slot.text.zh),
  );

export function checkTermsVerb(load: () => Promise<Glossary> = loadGlossary): AiVerb {
  return {
    id: 'check.terms',
    group: 'check',
    order: 0,
    needsKey: false,
    label: () => assistMessages().checkTermsLabel,
    available: (ctx) => (hasBoth(ctx) ? {} : null),
    run: async (ctx, io) => {
      io.progress(0, 0, assistMessages().checkingTerms);
      let glossary: Glossary;
      try {
        glossary = await load();
      } catch {
        return {
          kind: 'error',
          error: { kind: 'badOutput', provider: 'gemini', message: copyMessages().termsUnavailable, fatal: false, actions: ['retry'] },
        };
      }
      const read = (): TermResult => termResultFromSlots(slotsOf(useWorksheetStore.getState().worksheet), glossary, ctx.scope);
      return termFindings(ctx, termResultFromSlots(slotsOf(ctx.worksheet), glossary, ctx.scope), read);
    },
  };
}

registerVerb(checkTermsVerb());
