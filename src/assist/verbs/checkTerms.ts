import * as copy from '@/components/translate/copy';
import { loadGlossary } from '@/glossary/load';
import type { Glossary, TermCheck } from '@/glossary/types';
import { editTargetKey } from '@/model/edits';
import { isRichTextEmpty, plain } from '@/model/text';
import type { TextPath } from '@/model/textSlots';
import { useAppDialogs } from '@/store/appDialogs';
import { slotInScope } from '@/translate/plan';
import { termFixWrites, termRowsFromSlots } from '@/translate/termCheck';
import type { TermRow } from '@/translate/types';
import { registerVerb } from '../registry';
import type { AiVerb, ReviewItem, VerbContext, VerbOutcome } from '../types';
import { applyWrites, commitUndo, slotsOf, whereOf } from './translateShared';

/**
 * Check terms (keyless, instant): the 中文 against the EDB glossary. Nothing is written
 * by the check; each finding offers its own fix, and Replace N applies the safe ones
 * (old seeds, mainland/Taiwan forms) in one commit. A textbook variant and a lower rank
 * stay one click each.
 */

export const TERMS_MATCH = 'Terms match the EDB glossary';

const isVariant = (check: TermCheck): boolean => check.fix?.kind === 'deny' && check.fix.denyKind === 'variant';

/** Pre-ticked in the old panel, applied by Replace N: a wrong form, not a variant or a lower rank. */
export const safeFix = (check: TermCheck): boolean => check.fix?.kind === 'deny' && !isVariant(check);

/** The Chinese with one fix applied (plain-text offsets). */
export function fixedPreview(row: TermRow, check: TermCheck): string {
  const text = plain(row.zh);
  return check.fix ? text.slice(0, check.fix.start) + check.fix.to + text.slice(check.fix.end) : text;
}

export function termNotes(row: TermRow, check: TermCheck): string[] {
  const edb = `${check.en} — EDB: ${check.expected}`;
  if (!check.fix) {
    const found = check.found ? `${check.en} → ${check.found.text} — EDB: ${check.expected}` : edb;
    return check.conflict ? [found, copy.conflictChip(check.conflict.form, check.conflict.meansEn)] : [found];
  }
  if (check.fix.kind === 'lowerRank') return [copy.lowerRankLine(check.en, check.found?.text ?? '', check.expected)];
  const preview = `→ ${fixedPreview(row, check)}`;
  return isVariant(check) ? [edb, preview, `A textbook form; EDB lists ${check.fix.to} first.`] : [edb, preview];
}

const NOTHING_REPLACED_ONE = 'Nothing replaced — this text changed since the check.';

function replace(rows: readonly TermRow[], accepted: Map<TextPath, Set<number>>, worksheetId: string): number {
  const writes = termFixWrites(rows, accepted);
  const report = applyWrites(writes, worksheetId);
  const skipped = new Set(report.skipped.map((s) => s.path));
  let terms = 0;
  for (const write of writes) if (!skipped.has(write.path)) terms += accepted.get(write.path)?.size ?? 0;
  return terms;
}

export function termFindings(ctx: VerbContext, rows: readonly TermRow[]): VerbOutcome {
  if (rows.length === 0) return { kind: 'nothing', summary: TERMS_MATCH };
  const items: ReviewItem[] = [];
  const tally = { fix: 0, variants: 0, lower: 0, manual: 0 };
  const safe = new Map<TextPath, Set<number>>();
  for (const row of rows) {
    const slot = row.slot;
    row.checks.forEach((check, index) => {
      const fix = check.fix;
      if (!fix) tally.manual += 1;
      else if (fix.kind === 'lowerRank') tally.lower += 1;
      else if (isVariant(check)) tally.variants += 1;
      else tally.fix += 1;
      if (safeFix(check)) safe.set(row.path, new Set([...(safe.get(row.path) ?? []), index]));
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
                label: `Replace with ${fix.to}`,
                run: () => {
                  if (replace([row], new Map([[row.path, new Set([index])]]), ctx.worksheet.id) === 0) {
                    useAppDialogs.getState().notify(NOTHING_REPLACED_ONE);
                  }
                },
              },
            }
          : {}),
      });
    });
  }
  const n = [...safe.values()].reduce((sum, set) => sum + set.size, 0);
  const summary = copy.checkSummary(tally.fix, tally.variants, tally.lower, tally.manual);
  return {
    kind: 'findings',
    summary,
    items,
    ...(n > 0
      ? {
          applyAll: {
            label: `Replace ${n}`,
            run: () => {
              const terms = replace(rows, safe, ctx.worksheet.id);
              if (terms === 0) return useAppDialogs.getState().notify(copy.NOTHING_REPLACED);
              const undo = commitUndo();
              useAppDialogs.getState().notify(copy.replacedTermsFlash(terms), { label: copy.UNDO_ACTION, ...undo });
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
    label: () => 'Check terms against EDB glossary',
    available: (ctx) => (hasBoth(ctx) ? {} : null),
    run: async (ctx, io) => {
      io.progress(0, 0, 'Checking terms');
      let glossary: Glossary;
      try {
        glossary = await load();
      } catch {
        return {
          kind: 'error',
          error: { kind: 'badOutput', provider: 'gemini', message: copy.TERMS_UNAVAILABLE, fatal: false, actions: ['retry'] },
        };
      }
      return termFindings(ctx, termRowsFromSlots(slotsOf(ctx.worksheet), glossary, ctx.scope));
    },
  };
}

registerVerb(checkTermsVerb());
