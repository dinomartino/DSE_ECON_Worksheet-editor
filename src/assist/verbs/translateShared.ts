import { presetFor } from '@/ai/providers';
import type { AiErrorInfo } from '@/ai/types';
import * as copy from '@/components/translate/copy';
import type { ApplyReport, Side, TextSlot, TranslationWrite } from '@/model/textSlots';
import { collectTexts } from '@/model/textWalk';
import type { OutputMode, Worksheet } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { defaultTranslateOptions } from '@/translate/plan';
import type { JobResult, RunDepsResult, TranslateOptions, TranslationPlan } from '@/translate/types';

/**
 * What the translate and Check terms verbs share: the options a click implies, the unit
 * every count uses (printed texts), the notes a result carries, and the one-commit apply
 * with an Undo that belongs to its commit.
 */

export const sideName = (side: Side): string => (side === 'zh' ? '中文' : 'English');
const plural = (n: number, word: string): string => (n === 1 ? word : `${word}s`);

const slotCache = new WeakMap<Worksheet, TextSlot[]>();

/** The walker's slots, once per worksheet object (the menu asks every verb on open). */
export function slotsOf(ws: Worksheet): TextSlot[] {
  let slots = slotCache.get(ws);
  if (!slots) slotCache.set(ws, (slots = collectTexts(ws)));
  return slots;
}

/** One direction; teacher text when the editor shows it or the remembered setting is on;
 *  diagram labels on; symbol copies per the edition rule (`defaultTranslateOptions`). */
export function fillOptions(mode: OutputMode, includeTeacherText: boolean, side: Side, replace: boolean): TranslateOptions {
  const base = defaultTranslateOptions(mode, includeTeacherText || mode.version === 'teacher', replace ? side : undefined);
  const toZh = side === 'zh';
  return {
    ...base,
    directions: { toZh, toEn: !toZh },
    copySymbols: { toZh: toZh && base.copySymbols.toZh, toEn: !toZh && base.copySymbols.toEn },
  };
}

/** The one unit: printed texts (slots). A deduped job (×2) is two, each copy one. */
export function textsIn(plan: TranslationPlan, keys: Iterable<string> = plan.jobs.keys()): number {
  let n = 0;
  for (const key of keys) n += plan.jobs.get(key)?.slots.length ?? 0;
  return n;
}

/** Texts a fill writes: translated slots plus symbol copies. */
export const fillCount = (plan: TranslationPlan): number => textsIn(plan) + plan.copies.length;

export const usable = (result: JobResult | undefined): result is JobResult & { runs: NonNullable<JobResult['runs']> } =>
  !!result && result.status !== 'failed' && !!result.runs;

/** Inserted, but worth a look: a warning, or a content risk the old review left unticked. */
export const needsLook = (result: JobResult): boolean => result.status === 'flagged' || !result.defaultAccepted;

export type NoteTone = 'fail' | 'warn' | 'note' | 'ok';
export interface RowNote { tone: NoteTone; text: string }
const ORDER: Record<NoteTone, number> = { fail: 0, warn: 1, note: 2, ok: 3 };

/** A result's notes, only when it is not plainly ready: fail, warn, note, then what was fixed. */
export function rowNotes(result: JobResult): RowNote[] {
  if (result.status === 'ready' && result.fixes.length === 0) return [];
  if (result.status === 'failed') {
    if (result.error?.kind === 'safety') return [{ tone: 'fail', text: copy.SAFETY_ROW }];
    const reason = result.issues.find((i) => i.severity === 'fail')?.message ?? result.error?.message ?? 'no answer';
    return [{ tone: 'fail', text: copy.failedRow(reason) }];
  }
  const notes: RowNote[] = result.issues.map((issue) => ({ tone: issue.severity, text: issue.message }));
  for (const term of result.terms) {
    if (term.severity !== 'warn' && term.severity !== 'note') continue;
    const text = term.conflict ? copy.conflictChip(term.conflict.form, term.conflict.meansEn) : copy.termChip(term.state, term.en, term.expected);
    notes.push({ tone: term.severity, text });
  }
  for (const fix of result.fixes) {
    notes.push({ tone: 'ok', text: fix.how === 'simplified' ? copy.SIMPLIFIED_FIXED : copy.termFixed(fix.from, fix.to) });
  }
  return notes.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
}

export const CHANGED_WHILE_TRANSLATING = 'Changed while translating. Left as it is.';
export const NOTHING_TO_FILL = 'Nothing to fill here';
export const STOPPED_NOTHING = 'Stopped. Nothing was changed.';
export const DOCUMENT_CHANGED = 'Another document is open. Nothing was inserted.';

/** "Filled 47 中文 texts, 5 need a look, 2 couldn't be translated". */
export function fillSummary(o: {
  verb: 'Filled' | 'Re-translated';
  side: Side;
  filled: number;
  look: number;
  failed: number;
  skipped: number;
  stopped: boolean;
  notSent?: { count: number; reason: string };
}): string {
  const parts = [
    o.filled > 0 ? `${o.verb} ${o.filled} ${sideName(o.side)} ${plural(o.filled, 'text')}` : `Nothing ${o.verb.toLowerCase()}`,
    o.look > 0 ? `${o.look} ${o.look === 1 ? 'needs' : 'need'} a look` : '',
    o.failed > 0 ? `${o.failed} couldn't be translated` : '',
    o.skipped > 0 ? `${o.skipped} changed while translating` : '',
    o.notSent && o.notSent.count > 0 ? `${o.notSent.count} not sent (${o.notSent.reason})` : '',
  ].filter(Boolean);
  return `${o.stopped ? 'Stopped · ' : ''}${parts.join(', ')}`;
}

export const whereOf = (slot: TextSlot | undefined, fallback = ''): string =>
  slot ? [slot.group.label, slot.label].filter(Boolean).join(' · ') : fallback;

/** A run that could not start: the provider's settings are incomplete or the key unreadable. */
export function depsError(result: Extract<RunDepsResult, { ok: false }>, desktop: boolean): AiErrorInfo {
  const label = presetFor(result.provider).label;
  const base = { provider: result.provider, fatal: true } as const;
  switch (result.reason) {
    case 'noModel':
      return { ...base, kind: 'model', message: copy.noModelError(label), actions: ['chooseModel'] };
    case 'noBaseUrl':
      return { ...base, kind: 'notConfigured', message: copy.noBaseUrlError(label), actions: ['openSettings'] };
    case 'secretError':
      return {
        ...base,
        kind: 'notConfigured',
        message: result.error?.message ?? copy.noKeyError(label, desktop),
        actions: ['retry', 'openSettings'],
      };
    case 'noKey':
      return { ...base, kind: 'notConfigured', message: copy.noKeyError(label, desktop), actions: ['openSettings'] };
  }
}

/** One `applyTranslations` call: one commit, one ⌘Z. */
export function applyWrites(writes: readonly TranslationWrite[], worksheetId: string): ApplyReport {
  return useWorksheetStore.getState().applyTranslations(writes, { worksheetId });
}

/** Undoes the commit just made, only while it is still the latest: any later edit or ⌘Z
 *  retires it rather than undoing something unrelated. */
export function commitUndo(): { run(): void; live(): boolean } {
  const committed = useWorksheetStore.getState().worksheet;
  const live = () => useWorksheetStore.getState().worksheet === committed;
  return {
    live,
    run: () => {
      if (live()) useWorksheetStore.getState().undo();
    },
  };
}
