import { isAiError } from '@/ai/types';
import { isRichTextEmpty } from '@/model/text';
import { sameRuns, type Side, type SlotKind } from '@/model/textSlots';
import type { BiText, LanguageMode } from '@/model/types';
import type { createRunDeps } from '@/translate/deps';
import type { translateOne } from '@/translate/run';
import type { Direction } from '@/translate/types';

/**
 * `BiTextField`'s inline fill (§A.4), kept pure: which button the field shows, and one
 * fill run with its deps injected. The field only renders and routes the write through
 * its own `onChange`, so a fill is one store commit and one undo.
 */

/** What a field holds. Without it a field offers no fill: a default kind would drop the
 *  wording rules (a zh→en fill of 本卷共有 must end with one space). */
export interface FieldTranslate {
  kind: SlotKind;
  aroundValue?: 'before' | 'after';
  /** The renderer draws the other side when this one is empty (diagram text). */
  fallsBack?: boolean;
}

export const SETUP_TRANSLATION = 'Set up translation…';
export const SETUP_IN_SETTINGS_TITLE = 'Set up translation in Settings (⋯ → Settings…)';
export const fillLabel = (side: Side): string => (side === 'zh' ? 'Fill 中文' : 'Fill English');

export type FillButton =
  | { show: false }
  | {
      show: true;
      side: Side;
      /** fill: run now · setup: deep-link to Settings · blocked: inside a modal, never deep-links. */
      action: 'fill' | 'setup' | 'blocked';
      label: string;
      title?: string;
    };

export function fillButton(input: {
  translate: FieldTranslate | undefined;
  language: LanguageMode;
  readOnly: boolean;
  /** `fieldNeedsFill(value)`: the missing side, or null (both, neither, symbol-only). */
  needs: Side | null;
  configured: boolean;
  /** `isModalLayerOpen()` — a dialog or canvas owns the screen, so no app dialog may open. */
  modalOpen: boolean;
}): FillButton {
  const { translate, needs } = input;
  if (!translate || needs === null || input.readOnly || input.language !== 'bilingual') return { show: false };
  if (input.configured) return { show: true, side: needs, action: 'fill', label: fillLabel(needs) };
  if (input.modalOpen) {
    return { show: true, side: needs, action: 'blocked', label: fillLabel(needs), title: SETUP_IN_SETTINGS_TITLE };
  }
  return { show: true, side: needs, action: 'setup', label: SETUP_TRANSLATION };
}

export const directionFor = (side: Side): Direction => (side === 'zh' ? 'toZh' : 'toEn');
const other = (side: Side): Side => (side === 'zh' ? 'en' : 'zh');

/** Write only if the field still holds the same source and an empty target. */
export function canApplyFill(latest: BiText, sent: BiText, side: Side): boolean {
  const source = other(side);
  return sameRuns(latest[source] ?? [], sent[source] ?? []) && isRichTextEmpty(latest[side]);
}

export interface FieldFillDeps {
  createRunDeps: typeof createRunDeps;
  translateOne: typeof translateOne;
}

export type FieldFillOutcome =
  | { kind: 'filled'; value: BiText; note: string }
  /** The field changed while translating: nothing written. */
  | { kind: 'stale' }
  | { kind: 'noProvider' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

export const FILL_STALE = 'Not filled — this text changed while translating.';
const FILL_FAILED = 'Couldn’t translate this text safely.';

/** One field through the whole pipeline (pins, checks, auto-fix, repair). `latest` reads
 *  the field's current value at the end, for the stale guard. Never rejects. */
export async function runFieldFill(
  sent: BiText,
  side: Side,
  meta: FieldTranslate,
  latest: () => BiText,
  signal: AbortSignal,
  deps: FieldFillDeps,
): Promise<FieldFillOutcome> {
  try {
    const resolved = await deps.createRunDeps();
    if (!resolved.ok) return { kind: 'noProvider' };
    if (signal.aborted) return { kind: 'cancelled' };
    const slotMeta = meta.aroundValue ? { kind: meta.kind, aroundValue: meta.aroundValue } : { kind: meta.kind };
    const result = await deps.translateOne(sent, directionFor(side), slotMeta, resolved.deps, signal);
    if (signal.aborted) return { kind: 'cancelled' };
    if (result.status === 'failed' || !result.runs) {
      return { kind: 'failed', message: result.error?.message ?? FILL_FAILED };
    }
    const now = latest();
    if (!canApplyFill(now, sent, side)) return { kind: 'stale' };
    const fix = result.fixes[0];
    const note = fix ? `Filled · ${fix.from} → ${fix.to} (EDB)` : 'Filled';
    return { kind: 'filled', value: { ...now, [side]: result.runs }, note };
  } catch (cause) {
    if (signal.aborted) return { kind: 'cancelled' };
    return { kind: 'failed', message: isAiError(cause) ? cause.info.message : FILL_FAILED };
  }
}
