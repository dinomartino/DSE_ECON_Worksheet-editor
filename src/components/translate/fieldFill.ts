import { isAiError, type AiErrorInfo, type ProviderId } from '@/ai/types';
import type { TermCheck } from '@/glossary/types';
import { isRichTextEmpty } from '@/model/text';
import { sameRuns, type Side, type SlotKind } from '@/model/textSlots';
import type { BiText, LanguageMode, RichText } from '@/model/types';
import type { createRunDeps } from '@/translate/deps';
import type { translateOne } from '@/translate/run';
import { localizedErrorMessage } from '@/components/ai/errorCopy';
import { COPY_EN, copyMessages } from './text';
import type { Direction, JobResult, RunDepsResult } from '@/translate/types';

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

export const SETUP_TRANSLATION = COPY_EN.setupTranslation;
export const SETUP_IN_SETTINGS_TITLE = COPY_EN.setupInSettingsTitle;
export const fillLabel = (side: Side): string => (side === 'zh' ? copyMessages().fillZh : copyMessages().fillEn);

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
    return { show: true, side: needs, action: 'blocked', label: fillLabel(needs), title: copyMessages().setupInSettingsTitle };
  }
  return { show: true, side: needs, action: 'setup', label: copyMessages().setupTranslation };
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

type NoProvider = Extract<RunDepsResult, { ok: false }>;

export type FieldFillOutcome =
  /** Written. `warn`: a formatting or term note the review would tick but show. */
  | { kind: 'filled'; value: BiText; note: string; tone: 'ok' | 'warn' }
  /** Not written: the review would leave it unticked (content risk, a reversed term). */
  | { kind: 'needsLook'; runs: RichText; note: string }
  /** The field changed while translating: nothing written. */
  | { kind: 'stale' }
  | { kind: 'noProvider'; provider: ProviderId; reason: NoProvider['reason']; error?: NoProvider['error'] }
  | { kind: 'cancelled' }
  /** `switchTo`: the providers a region error offers (`[Use DeepSeek]`). */
  | { kind: 'failed'; message: string; switchTo: ProviderId[] };

export const FILL_STALE = COPY_EN.fillStale;
export const INSERT_ANYWAY = COPY_EN.insertAnyway;
/** The two providers that serve Hong Kong (§A.5 region), by their button names. */
const SWITCH_TARGETS: Partial<Record<ProviderId, string>> = { deepseek: 'DeepSeek', qwen: 'Qwen' };

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
    if (!resolved.ok) {
      const { provider, reason, error } = resolved;
      return error ? { kind: 'noProvider', provider, reason, error } : { kind: 'noProvider', provider, reason };
    }
    if (signal.aborted) return { kind: 'cancelled' };
    const slotMeta = meta.aroundValue ? { kind: meta.kind, aroundValue: meta.aroundValue } : { kind: meta.kind };
    const result = await deps.translateOne(sent, directionFor(side), slotMeta, resolved.deps, signal);
    if (signal.aborted) return { kind: 'cancelled' };
    if (result.status === 'failed' || !result.runs) {
      return failed(result.error, resolved.deps.preset.id);
    }
    // The Translate review leaves these unticked; a field has no review, so it asks.
    if (!result.defaultAccepted) return { kind: 'needsLook', runs: result.runs, note: lookNote(result) };
    const now = latest();
    if (!canApplyFill(now, sent, side)) return { kind: 'stale' };
    const value = { ...now, [side]: result.runs };
    const caveat = result.status === 'flagged' ? caveatOf(result) : undefined;
    if (caveat) return { kind: 'filled', value, note: copyMessages().filledCheck(caveat), tone: 'warn' };
    return { kind: 'filled', value, note: filledNote(result), tone: 'ok' };
  } catch (cause) {
    if (signal.aborted) return { kind: 'cancelled' };
    return failed(isAiError(cause) ? cause.info : undefined);
  }
}

function failed(info: AiErrorInfo | undefined, current?: ProviderId): FieldFillOutcome {
  const from = info?.provider ?? current;
  const switchTo = info?.actions.includes('switchProvider') ? (Object.keys(SWITCH_TARGETS) as ProviderId[]).filter((p) => p !== from) : [];
  return { kind: 'failed', message: info ? localizedErrorMessage(info) : copyMessages().fillFailed, switchTo };
}

/** Only a deterministic glossary fix is credited to the EDB (never a repair or a
 *  Simplified→Traditional conversion). */
function filledNote(result: JobResult): string {
  const fix = result.fixes.find((f) => f.how === 'autoFix');
  if (!fix) return copyMessages().filled;
  const term = result.terms.find((t) => t.expected.split('/').includes(fix.to));
  return copyMessages().filledFix(term?.en ?? fix.from, fix.to);
}

const termLine = (t: TermCheck): string =>
  t.conflict
    ? copyMessages().conflictLine(t.conflict.form, t.conflict.meansEn, t.en, t.expected)
    : t.chosen || t.custom
      ? copyMessages().ownChip(t.en, t.expected)
      : copyMessages().termChip(t.en, t.expected);

/** The first thing the review would chip, most severe first. */
function caveatOf(result: JobResult): string | undefined {
  const conflict = result.terms.find((t) => t.conflict);
  if (conflict) return termLine(conflict);
  for (const severity of ['fail', 'warn'] as const) {
    const issue = result.issues.find((i) => i.severity === severity);
    if (issue) return issue.message;
  }
  const term = result.terms.find((t) => t.severity === 'warn' || t.severity === 'note');
  return term ? termLine(term) : result.issues[0]?.message;
}

function lookNote(result: JobResult): string {
  const caveat = caveatOf(result);
  return caveat ? copyMessages().notFilled(caveat) : copyMessages().needsLook;
}

/** After a run finds no usable provider: deep-link with the reason, or, over a modal
 *  (which no app dialog may stack on), say why on the field's line. */
export function afterNoProvider(
  outcome: Extract<FieldFillOutcome, { kind: 'noProvider' }>,
  modalOpen: boolean,
): { open: { provider: ProviderId; reason: string } } | { line: string } {
  if (!modalOpen) return { open: { provider: outcome.provider, reason: outcome.reason } };
  return { line: outcome.reason === 'secretError' && outcome.error ? outcome.error.message : copyMessages().setupInSettingsTitle };
}

/** A switch button of the region error: switch now when that provider's key is saved,
 *  otherwise deep-link to it — never over a modal. */
export function switchButton(provider: ProviderId, keySaved: boolean, modalOpen: boolean) {
  const action: 'switch' | 'setup' | 'blocked' = keySaved ? 'switch' : modalOpen ? 'blocked' : 'setup';
  const label = copyMessages().useProvider(SWITCH_TARGETS[provider] ?? provider);
  return { provider, label, action, title: action === 'blocked' ? copyMessages().setupInSettingsTitle : undefined };
}
