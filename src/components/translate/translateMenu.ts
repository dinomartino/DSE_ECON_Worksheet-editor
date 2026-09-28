import { isSymbolOnly } from '@/model/symbols';
import { isRichTextEmpty } from '@/model/text';
import { missingSide, type Side, type TextSlot } from '@/model/textSlots';
import type { EditTarget } from '@/render/ir';
import type { TranslateRequest } from '@/store/appDialogs';
import type { TranslateScope } from '@/translate/types';
import type { PageMenuPayload } from '@/components/preview/PageContextMenu';
import { MENU_CHECK_TERMS, MENU_SETTINGS, MENU_TRANSLATE } from './copy';

/**
 * Every Translate entry point's request, built pure (§A.2): the page menu's "Translation"
 * group, the multi-select pill, the Outline row and the toolbar. Callers hand the result
 * to `useAppDialogs.getState().openTranslate`. A read-only document gets no items.
 */

export const TRANSLATION_GROUP = 'Translation';
export const AMBIGUOUS_TITLE = 'This text also appears in a copied question — translate the question instead';
/** A page or field action this small skips Setup: the click was the explicit send. */
export const AUTO_START_MAX = 3;

const fillLabel = (side: Side): string => (side === 'zh' ? 'Fill 中文' : 'Fill English');
const retranslateLabel = (side: Side): string =>
  side === 'zh' ? 'Re-translate into 中文…' : 'Re-translate into English…';

export interface TranslateMenuItem {
  label: string;
  disabled?: boolean;
  title?: string;
  /** Absent only on a disabled item. */
  request?: TranslateRequest;
}

export const paperRequest = (worksheetId: string, mode: 'translate' | 'check' = 'translate'): TranslateRequest => ({
  worksheetId,
  mode,
  scope: { kind: 'paper' },
});

const translate = (worksheetId: string, scope: TranslateScope, extra?: Partial<TranslateRequest>): TranslateRequest => ({
  worksheetId,
  mode: 'translate',
  scope,
  ...extra,
});

/** A slot a model could fill: printed somewhere, one side missing, not symbols alone. */
function fillableSide(slot: TextSlot): Side | null {
  if (slot.unprinted) return null;
  const side = missingSide(slot.text);
  if (side === null) return null;
  return isSymbolOnly(side === 'zh' ? slot.text.en : slot.text.zh) ? null : side;
}

/** Duplicate keeps block ids, so a page address can name several copies; the emitting
 *  question picks one. Still several → ambiguous. */
function narrow(slots: readonly TextSlot[], questionId: string | undefined): TextSlot[] {
  if (slots.length <= 1 || questionId === undefined) return [...slots];
  return slots.filter((slot) => slot.questionId === questionId);
}
const bothSides = (slot: TextSlot): boolean => !isRichTextEmpty(slot.text.en) && !isRichTextEmpty(slot.text.zh);
const spansCopies = (slots: readonly TextSlot[]): boolean =>
  new Set(slots.map((slot) => slot.questionId)).size > 1;

export interface PageMenuSources {
  /** `slotsForTarget(ws, target)`. */
  slotsForTarget: (target: EditTarget) => TextSlot[];
  /** `collectTexts(ws)`: block and question scopes. */
  slots: () => readonly TextSlot[];
  /** What the right-clicked block is, for the item's wording. */
  blockKind?: (blockId: string) => string | undefined;
}

/** The page menu's "Translation" items for one payload, built at event time. */
export function pageTranslateItems(
  worksheetId: string,
  payload: PageMenuPayload,
  sources: PageMenuSources,
  readOnly: boolean,
): TranslateMenuItem[] {
  if (readOnly) return [];
  if (payload.kind === 'block') return blockItems(worksheetId, payload, sources);

  const target: EditTarget =
    payload.kind === 'cell' ? { kind: 'tableCell', blockId: payload.blockId, cellId: payload.cellId } : payload.target;
  const matches = narrow(sources.slotsForTarget(target), payload.questionId);
  const items: TranslateMenuItem[] = [];
  if (matches.length > 1) {
    items.push({ label: 'Translate…', disabled: true, title: AMBIGUOUS_TITLE });
  } else if (matches.length === 1) {
    const [slot] = matches;
    const scope: TranslateScope = { kind: 'paths', paths: [slot.path] };
    const fill = fillableSide(slot);
    if (fill) items.push({ label: fillLabel(fill), request: translate(worksheetId, scope, { autoStart: true }) });
    else if (!slot.unprinted && bothSides(slot)) {
      for (const side of ['zh', 'en'] as const) {
        items.push({ label: retranslateLabel(side), request: translate(worksheetId, scope, { retranslate: side }) });
      }
    }
  }
  // A cell also offers its whole table.
  if (payload.kind === 'cell') {
    items.push(...blockItems(worksheetId, { kind: 'block', blockId: payload.blockId, questionId: payload.questionId }, sources));
  }
  const questionId = matches.length === 1 ? matches[0].questionId : payload.questionId;
  if (questionId !== undefined) {
    items.push({
      label: 'Translate this question…',
      request: translate(worksheetId, { kind: 'questions', ids: [questionId] }),
    });
  }
  return items;
}

function blockItems(
  worksheetId: string,
  payload: Extract<PageMenuPayload, { kind: 'block' }>,
  sources: PageMenuSources,
): TranslateMenuItem[] {
  const { blockId, questionId } = payload;
  const inBlock = sources.slots().filter((slot) => slot.blockIds.includes(blockId));
  const scoped = questionId === undefined ? inBlock : inBlock.filter((slot) => slot.questionId === questionId);
  const fillable = scoped.filter((slot) => fillableSide(slot) !== null).length;
  if (fillable === 0) return [];
  const label = sources.blockKind?.(blockId) === 'table' ? 'Translate this table' : 'Translate labels in this figure';
  if (questionId === undefined && spansCopies(scoped)) return [{ label, disabled: true, title: AMBIGUOUS_TITLE }];
  const scope: TranslateScope = questionId === undefined ? { kind: 'block', blockId } : { kind: 'block', blockId, questionId };
  return [{ label, request: translate(worksheetId, scope, fillable <= AUTO_START_MAX ? { autoStart: true } : undefined) }];
}

export interface ToolbarEntry {
  label: string;
  hint?: string;
  run: { kind: 'translate'; request: TranslateRequest } | { kind: 'settings' };
}

/** The ⋯ menu's additions: Translate… and Check terms… after "Copy for Word" (absent when
 *  read-only); Settings… before "What's new…" (kept when read-only — not a document
 *  action; absent while no Settings section is registered). */
export function toolbarMenuEntries(opts: {
  worksheetId: string;
  readOnly: boolean;
  hasSettings: boolean;
  /** Desktop only: ⌘, / Ctrl+,. A browser may claim the shortcut first. */
  settingsHint?: string;
}): { translate: ToolbarEntry[]; settings: ToolbarEntry[] } {
  const translate: ToolbarEntry[] = opts.readOnly
    ? []
    : [
        { label: MENU_TRANSLATE, run: { kind: 'translate', request: paperRequest(opts.worksheetId) } },
        { label: MENU_CHECK_TERMS, run: { kind: 'translate', request: paperRequest(opts.worksheetId, 'check') } },
      ];
  const settings: ToolbarEntry[] = opts.hasSettings
    ? [{ label: MENU_SETTINGS, ...(opts.settingsHint ? { hint: opts.settingsHint } : {}), run: { kind: 'settings' } }]
    : [];
  return { translate, settings };
}

/** The multi-select pill: every selected flow item (questions and layout elements). */
export const flowItemsRequest = (worksheetId: string, ids: readonly string[]): TranslateRequest =>
  translate(worksheetId, { kind: 'flowItems', ids: [...ids] });

/** Flow entries the walker finds printed text in, so an empty stimulus or a bare
 *  question count offers nothing (absent stays absent) and a new kind needs no list. */
export const layoutIdsWithText = (slots: readonly TextSlot[]): ReadonlySet<string> =>
  new Set(slots.flatMap((slot) => (slot.flowId && !slot.unprinted ? [slot.flowId] : [])));

/** The Outline row's ⋯: a question, or a layout row holding text (`layoutIdsWithText`). */
export function outlineTranslateItem(
  worksheetId: string,
  row: { kind: 'question'; id: string } | { kind: 'layout'; id: string; holdsText: boolean },
  readOnly: boolean,
): TranslateMenuItem | null {
  if (readOnly) return null;
  if (row.kind === 'question') {
    return { label: 'Translate question…', request: translate(worksheetId, { kind: 'questions', ids: [row.id] }) };
  }
  return row.holdsText ? { label: 'Translate…', request: translate(worksheetId, { kind: 'flowItems', ids: [row.id] }) } : null;
}
