import * as copy from '@/components/translate/copy';
import { loadGlossary } from '@/glossary/load';
import type { Glossary } from '@/glossary/types';
import { editTargetKey } from '@/model/edits';
import { isRichTextEmpty, plain } from '@/model/text';
import type { TextPath } from '@/model/textSlots';
import { useAppDialogs } from '@/store/appDialogs';
import { slotInScope } from '@/translate/plan';
import { termFixWrites, termRowsFromSlots } from '@/translate/termCheck';
import type { TermRow } from '@/translate/types';
import { copyMessages } from '@/components/translate/text';
import { assistMessages } from '../text';
import { registerVerb } from '../registry';
import { termNotes, termTally, tallySummary } from '../termRules';
import type { AiVerb, ReviewItem, VerbContext, VerbOutcome } from '../types';
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

export function termFindings(ctx: VerbContext, rows: readonly TermRow[]): VerbOutcome {
  if (rows.length === 0) return { kind: 'nothing', summary: assistMessages().termsMatch };
  const items: ReviewItem[] = [];
  const { tally, safe, safeCount: n } = termTally(rows);
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
                  if (replace([row], new Map([[row.path, new Set([index])]]), ctx.worksheet.id) === 0) {
                    useAppDialogs.getState().notify(assistMessages().nothingReplacedOne);
                  }
                },
              },
            }
          : {}),
      });
    });
  }
  const summary = tallySummary(tally);
  return {
    kind: 'findings',
    summary,
    items,
    ...(n > 0
      ? {
          applyAll: {
            label: assistMessages().replaceN(n),
            run: () => {
              const terms = replace(rows, safe, ctx.worksheet.id);
              if (terms === 0) return useAppDialogs.getState().notify(copyMessages().nothingReplaced);
              const undo = commitUndo();
              useAppDialogs.getState().notify(copy.replacedTermsFlash(terms), { label: copyMessages().undoAction, ...undo });
            },
          },
        }
      : {}),
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
      return termFindings(ctx, termRowsFromSlots(slotsOf(ctx.worksheet), glossary, ctx.scope));
    },
  };
}

registerVerb(checkTermsVerb());
