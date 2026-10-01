import type { AiScope } from '@/assist/types';
import { missingSide, type TextSlot } from '@/model/textSlots';
import type { LanguageMode } from '@/model/types';
import type { EditTarget } from '@/render/ir';
import type { PageMenuPayload } from '@/components/preview/PageContextMenu';
import { copyMessages } from './text';

/**
 * The AI door's entry points, pure (slot sources injected): the scope a page right-click
 * acts on, the ⋯ menu's Settings entry, and the verb Export's paper check preselects.
 * Every AI action opens through `openAi`; a read-only document offers none.
 */

/** The page menu's one AI item. */
export const PAGE_AI_ITEM = '✦ AI…';

export interface PageMenuSources {
  /** `slotsForTarget(ws, target)`. */
  slotsForTarget: (target: EditTarget) => TextSlot[];
  /** `collectTexts(ws)`: block scopes. */
  slots: () => readonly TextSlot[];
}

/** Duplicate keeps block ids, so a page address can name several copies; the emitting
 *  question picks one. Still several → ambiguous. */
function narrow(slots: readonly TextSlot[], questionId: string | undefined): TextSlot[] {
  if (slots.length <= 1 || questionId === undefined) return [...slots];
  return slots.filter((slot) => slot.questionId === questionId);
}

/** The one question every slot belongs to, else the emitting question, else the paper. */
function questionOr(slots: readonly TextSlot[], questionId: string | undefined): AiScope {
  const owners = new Set(slots.map((slot) => slot.questionId));
  const only = owners.size === 1 ? [...owners][0] : undefined;
  const id = questionId ?? only;
  return id === undefined ? { kind: 'paper' } : { kind: 'questions', ids: [id] };
}

function blockScope(blockId: string, questionId: string | undefined, sources: PageMenuSources): AiScope {
  const inBlock = sources.slots().filter((slot) => slot.blockIds.includes(blockId));
  const scoped = narrow(inBlock, questionId);
  if (scoped.length === 0) return questionOr([], questionId);
  if (questionId !== undefined) return { kind: 'block', blockId, questionId };
  // A block copied by Duplicate, with no emitting question to pick one: the paper.
  return new Set(scoped.map((slot) => slot.questionId)).size > 1 ? { kind: 'paper' } : { kind: 'block', blockId };
}

/** What a right-click's AI item acts on, finest first: the one printed text, a cell's
 *  table, the block, else the emitting question (the question's own box names it
 *  outright). An ambiguous target falls back to its question. Built at event time. */
export function pageAiScope(payload: PageMenuPayload, sources: PageMenuSources): AiScope {
  if (payload.kind === 'question') return { kind: 'questions', ids: [payload.questionId] };
  if (payload.kind === 'block') return blockScope(payload.blockId, payload.questionId, sources);
  const target: EditTarget =
    payload.kind === 'cell' ? { kind: 'tableCell', blockId: payload.blockId, cellId: payload.cellId } : payload.target;
  const matches = narrow(sources.slotsForTarget(target), payload.questionId);
  if (matches.length === 1 && !matches[0].unprinted) return { kind: 'paths', paths: [matches[0].path] };
  if (matches.length === 0 && payload.kind === 'cell') return blockScope(payload.blockId, payload.questionId, sources);
  return questionOr(matches, payload.questionId);
}

/** The fill verb Export's untranslated finding preselects: the edition's side, or for a
 *  bilingual paper the side missing more often. */
export function fillVerbFor(slots: readonly TextSlot[], language: LanguageMode): 'translate.fillZh' | 'translate.fillEn' {
  if (language !== 'bilingual') return language === 'zh' ? 'translate.fillZh' : 'translate.fillEn';
  let zh = 0;
  let en = 0;
  for (const slot of slots) {
    if (slot.unprinted) continue;
    const side = missingSide(slot.text);
    if (side === 'zh') zh += 1;
    else if (side === 'en') en += 1;
  }
  return en > zh ? 'translate.fillEn' : 'translate.fillZh';
}

export interface ToolbarEntry {
  label: string;
  hint?: string;
}

/** The ⋯ menu's Settings… before "What's new…" (kept when read-only — not a document
 *  action; absent while no Settings section is registered). */
export function toolbarSettingsEntries(opts: {
  hasSettings: boolean;
  /** Desktop only: ⌘, / Ctrl+,. A browser may claim the shortcut first. */
  settingsHint?: string;
}): ToolbarEntry[] {
  if (!opts.hasSettings) return [];
  return [{ label: copyMessages().menuSettings, ...(opts.settingsHint ? { hint: opts.settingsHint } : {}) }];
}
