import * as copy from '@/components/translate/copy';
import { loadGlossary } from '@/glossary/load';
import type { Glossary } from '@/glossary/types';
import { editTargetKey } from '@/model/edits';
import { plain } from '@/model/text';
import type { ApplyReport, Side, TextSlot, TranslationWrite } from '@/model/textSlots';
import { isDesktop } from '@/platform';
import { AI_SETTINGS } from '@/settings/aiSettings';
import { appSettings } from '@/settings/store';
import { useAppDialogs } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { createRunDeps } from '@/translate/deps';
import { planFromSlots } from '@/translate/plan';
import { runTranslation, writesFor } from '@/translate/run';
import { termFixWrites, termRowsFromSlots } from '@/translate/termCheck';
import type { JobResult, RunOutcome, TranslationPlan } from '@/translate/types';
import { assistMessages } from '../text';
import { registerVerb } from '../registry';
import type { AiVerb, ReviewItem, VerbContext, VerbIO, VerbOutcome } from '../types';
import {
  CHANGED_WHILE_TRANSLATING,
  DOCUMENT_CHANGED,
  NOTHING_TO_FILL,
  STOPPED_NOTHING,
  applyWrites,
  commitUndo,
  depsError,
  fillCount,
  fillOptions,
  fillSummary,
  needsLook,
  rowNotes,
  sideName,
  slotsOf,
  textsIn,
  usable,
  whereOf,
} from './translateShared';

/**
 * Fill missing 中文 / English and Re-translate: plan with the defaults a click implies,
 * run, then ONE `applyTranslations` with every usable result. Hard failures are never
 * written; warnings are written and come back as `look` items.
 */

export interface TranslateVerbDeps {
  createRunDeps: typeof createRunDeps;
  loadGlossary(): Promise<Glossary>;
  includeTeacherText(): boolean;
  desktop(): boolean;
}

const realDeps: TranslateVerbDeps = {
  createRunDeps,
  loadGlossary: () => loadGlossary(),
  includeTeacherText: () => appSettings.read(AI_SETTINGS).includeTeacherText,
  desktop: isDesktop,
};

export function translateVerb(side: Side, replace: boolean, deps: TranslateVerbDeps = realDeps): AiVerb {
  const planFor = (ctx: VerbContext): TranslationPlan =>
    planFromSlots(ctx.worksheet.id, slotsOf(ctx.worksheet), ctx.scope, fillOptions(ctx.mode, deps.includeTeacherText(), side, replace));
  return {
    id: `translate.${replace ? 'retranslate' : 'fill'}${side === 'zh' ? 'Zh' : 'En'}`,
    group: 'translate',
    order: (replace ? 10 : 0) + (side === 'zh' ? 0 : 1),
    needsKey: true,
    label: () => (replace ? assistMessages().retranslate(sideName(side)) : assistMessages().fillMissing(sideName(side))),
    available(ctx) {
      if (replace && ctx.scope.kind === 'paper') return null;
      const plan = planFor(ctx);
      if (replace && plan.counts.replaceable === 0) return null;
      const count = replace ? textsIn(plan) : fillCount(plan);
      return count > 0 ? { count, unit: assistMessages().unitTexts(count) } : null;
    },
    sendsLine: (ctx, provider) => assistMessages().sendsTexts(textsIn(planFor(ctx)), provider),
    run: (ctx, io) => runFill(ctx, io, planFor(ctx), side, replace, deps),
  };
}

async function runFill(
  ctx: VerbContext,
  io: VerbIO,
  plan: TranslationPlan,
  side: Side,
  replace: boolean,
  deps: TranslateVerbDeps,
): Promise<VerbOutcome> {
  // The same unit the summary counts: every text written, symbol copies included.
  const total = fillCount(plan);
  if (total === 0) return { kind: 'nothing', summary: NOTHING_TO_FILL };
  const label = assistMessages().translatingInto(sideName(side));
  let outcome: RunOutcome = { results: new Map(), stopped: false, model: '', ms: 0 };
  let glossary: Glossary | null = null;
  if (plan.jobs.size > 0) {
    io.progress(0, total, label);
    const resolved = await deps.createRunDeps({ glossary: true });
    if (!resolved.ok) return { kind: 'error', error: depsError(resolved, deps.desktop()) };
    glossary = resolved.deps.glossary;
    const provider = resolved.deps.preset.label;
    let shown = 0;
    outcome = io.signal.aborted
      ? { ...outcome, stopped: true }
      : await runTranslation(plan, resolved.deps, io.signal, (p) => {
          if (p.phase === 'waiting') return io.progress(shown, total, copy.waitingLine(provider, p.waitMs ?? 0));
          shown = Math.max(shown, Math.round((total * p.requestsDone) / Math.max(1, p.requestsTotal)));
          io.progress(shown, total, label);
        });
  }
  const done = new Set([...outcome.results].filter(([, r]) => usable(r)).map(([key]) => key));
  if (outcome.fatal && done.size === 0) return { kind: 'error', error: outcome.fatal };
  if (outcome.stopped && done.size === 0) return { kind: 'nothing', summary: STOPPED_NOTHING };

  // An area's DWL / TR takes the glossary's term; without one it keeps falling back.
  if (!glossary && plan.worded) glossary = await deps.loadGlossary().catch(() => null);
  const writes = writesFor(plan, outcome, done, true, glossary);
  const before = useWorksheetStore.getState().worksheet;
  const report: ApplyReport = writes.length ? applyWrites(writes, ctx.worksheet.id) : { applied: 0, skipped: [], resized: 0 };
  if (report.refused) return { kind: 'nothing', summary: DOCUMENT_CHANGED };
  const undo = useWorksheetStore.getState().worksheet !== before ? commitUndo() : null;

  const items = reviewItems(ctx, plan, outcome, writes, report, glossary);
  const count = (tone: ReviewItem['tone']) => items.filter((item) => item.tone === tone).length;
  const skipped = report.skipped.length;
  const notSent = textsIn(plan, [...plan.jobs.keys()].filter((key) => !outcome.results.has(key)));
  const summary = fillSummary({
    verb: replace ? 'Re-translated' : 'Filled',
    side,
    filled: report.applied,
    look: count('look'),
    failed: count('failed') - skipped,
    skipped,
    stopped: outcome.stopped,
    ...(outcome.fatal ? { notSent: { count: notSent, reason: outcome.fatal.message } } : {}),
  });
  return { kind: 'inserted', summary, items, undo, showSide: side };
}

/** One item per printed text, in reading order. */
function reviewItems(
  ctx: VerbContext,
  plan: TranslationPlan,
  outcome: RunOutcome,
  writes: readonly TranslationWrite[],
  report: ApplyReport,
  glossary: Glossary | null,
): ReviewItem[] {
  const slots = slotsOf(ctx.worksheet);
  const order = new Map(slots.map((slot, i) => [slot.path, i]));
  const byPath = new Map(slots.map((slot) => [slot.path, slot]));
  const skipped = new Set(report.skipped.map((skip) => skip.path));
  const items: ReviewItem[] = [];
  const base = (write: Pick<TranslationWrite, 'path' | 'sourceSnapshot'>): Omit<ReviewItem, 'tone' | 'notes'> => {
    const slot = byPath.get(write.path);
    return {
      id: write.path,
      ...(slot?.target ? { targetKey: editTargetKey(slot.target) } : {}),
      ...(slot?.questionId ? { questionId: slot.questionId } : {}),
      where: whereOf(slot),
      source: plain(write.sourceSnapshot),
    };
  };
  const written = new Map(writes.map((write) => [write.path, write]));
  for (const [key, job] of plan.jobs) {
    const result = outcome.results.get(key);
    if (!result) continue;
    for (const planned of job.slots) {
      const write = written.get(planned.path);
      if (!usable(result) || !write) {
        items.push({ ...base(planned), tone: 'failed', notes: rowNotes(result).map((n) => n.text) });
      } else if (skipped.has(planned.path)) {
        items.push({ ...base(planned), tone: 'failed', notes: [CHANGED_WHILE_TRANSLATING] });
      } else {
        items.push(insertedItem(base(planned), result, write, byPath.get(planned.path), glossary));
      }
    }
  }
  for (const write of plan.copies) {
    if (!written.has(write.path)) continue;
    items.push(skipped.has(write.path)
      ? { ...base(write), tone: 'failed', notes: [CHANGED_WHILE_TRANSLATING] }
      : { ...base(write), tone: 'inserted', notes: [] });
  }
  return items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function insertedItem(
  item: Omit<ReviewItem, 'tone' | 'notes'>,
  result: JobResult,
  write: TranslationWrite,
  slot: TextSlot | undefined,
  glossary: Glossary | null,
): ReviewItem {
  const notes = rowNotes(result).map((n) => n.text);
  if (!needsLook(result)) return { ...item, tone: 'inserted', notes };
  return { ...item, tone: 'look', notes, action: termFixAction(write, slot, glossary) ?? removeAction(write) };
}

const worksheetId = () => useWorksheetStore.getState().worksheet.id;

/** Puts the side back as it was before the fill, in one commit, only if it is untouched. */
function removeAction(write: TranslationWrite): NonNullable<ReviewItem['action']> {
  return {
    label: assistMessages().remove,
    run: () => {
      const report = applyWrites([{ ...write, targetSnapshot: write.next, next: write.targetSnapshot }], worksheetId());
      if (report.skipped.length) useAppDialogs.getState().notify(assistMessages().changedSince);
    },
  };
}

/** A reversed or non-EDB term in the 中文 just written: the glossary's own fix, when it has one. */
function termFixAction(write: TranslationWrite, slot: TextSlot | undefined, glossary: Glossary | null): ReviewItem['action'] {
  if (!slot || !glossary || write.side !== 'zh') return undefined;
  const written = { ...slot, text: { ...slot.text, zh: write.next } };
  const [row] = termRowsFromSlots([written], glossary, { kind: 'paths', paths: [slot.path] });
  const index = row?.checks.findIndex((check) => check.fix) ?? -1;
  const fix = index >= 0 ? row.checks[index].fix : undefined;
  if (!row || !fix) return undefined;
  return {
    label: assistMessages().replaceWith(fix.to),
    run: () => {
      const report = applyWrites(termFixWrites([row], new Map([[row.path, new Set([index])]])), worksheetId());
      if (report.skipped.length) useAppDialogs.getState().notify(assistMessages().changedSince);
    },
  };
}

registerVerb(translateVerb('zh', false));
registerVerb(translateVerb('en', false));
registerVerb(translateVerb('zh', true));
registerVerb(translateVerb('en', true));
