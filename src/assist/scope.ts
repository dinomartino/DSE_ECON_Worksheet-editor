import { editTargetKey, findTableBlock } from '@/model/edits';
import { computeNumbering } from '@/model/numbering';
import type { TextSlot } from '@/model/textSlots';
import { collectTexts } from '@/model/textWalk';
import type { Worksheet } from '@/model/types';
import { assistMessages } from './text';
import type { AiScope } from './types';

/** The worksheet store's selection fields this module reads (a structural subset). */
export interface SelectionState {
  worksheet: Worksheet;
  selectedQuestionId?: string;
  selectedElementId?: string;
  selectedTargetKey?: string;
  selectedFlowIds?: readonly string[];
  cellSelection?: { blockId: string; anchorId: string; focusId: string };
}

const blockIdOfKey = (key: string): string | undefined => {
  const [kind, id] = key.split(':');
  return kind === 'blockText' || kind === 'tableCell' || kind === 'blockCaption' ? id : undefined;
};

/** Slots the page's selected component addresses, narrowed to the selected question when
 *  Duplicate left several copies sharing the address. */
function slotsForKey(slots: readonly TextSlot[], key: string, questionId: string | undefined): TextSlot[] {
  const hits = slots.filter((slot) => slot.target !== undefined && !slot.unprinted && editTargetKey(slot.target) === key);
  if (hits.length <= 1 || questionId === undefined) return hits;
  return hits.filter((slot) => slot.questionId === questionId);
}

function blockScope(slots: readonly TextSlot[], blockId: string, questionId: string | undefined): AiScope | null {
  const inBlock = slots.filter((slot) => slot.blockIds.includes(blockId));
  if (inBlock.length === 0) return null;
  const owner = questionId !== undefined && inBlock.some((slot) => slot.questionId === questionId) ? questionId : undefined;
  if (owner === undefined && new Set(inBlock.map((slot) => slot.questionId)).size > 1) return null;
  return owner === undefined ? { kind: 'block', blockId } : { kind: 'block', blockId, questionId: owner };
}

/**
 * What the AI door acts on, from the editor's selection, finest first: a swept cell range
 * (its table), the selected page text, a selected picture or figure, the multi-selection,
 * the selected question, the selected layout element, else the whole paper. Pure.
 */
export function scopeFromSelection(state: SelectionState): AiScope {
  const { worksheet: ws, selectedQuestionId: questionId } = state;
  const key = state.selectedTargetKey;
  if (key !== undefined || state.cellSelection) {
    const slots = collectTexts(ws);
    if (state.cellSelection) {
      const scope = blockScope(slots, state.cellSelection.blockId, questionId);
      if (scope) return scope;
    }
    if (key !== undefined) {
      const hits = slotsForKey(slots, key, questionId);
      if (hits.length === 1) return { kind: 'paths', paths: [hits[0].path] };
      const blockId = hits.length === 0 ? blockIdOfKey(key) : undefined;
      const scope = blockId === undefined ? null : blockScope(slots, blockId, questionId);
      if (scope) return scope;
    }
  }
  const multi = state.selectedFlowIds ?? [];
  if (multi.length > 1) {
    const isQuestion = new Set(ws.questions.map((q) => q.id));
    return multi.every((id) => isQuestion.has(id))
      ? { kind: 'questions', ids: [...multi] }
      : { kind: 'flowItems', ids: [...multi] };
  }
  if (questionId !== undefined && ws.questions.some((q) => q.id === questionId)) {
    return { kind: 'questions', ids: [questionId] };
  }
  if (multi.length === 1) {
    const [only] = multi;
    return ws.questions.some((q) => q.id === only) ? { kind: 'questions', ids: [only] } : { kind: 'flowItems', ids: [only] };
  }
  if (state.selectedElementId !== undefined && ws.layout.some((e) => e.id === state.selectedElementId)) {
    return { kind: 'flowItems', ids: [state.selectedElementId] };
  }
  return { kind: 'paper' };
}

const questionLabel = (ws: Worksheet, id: string): string => {
  const numbered = computeNumbering(ws).byQuestionId.get(id);
  const m = assistMessages();
  return numbered ? m.questionN(numbered.number) : m.thisQuestion;
};

/** "Whole paper", "Question 2", "3 questions", "This text", "This table", "This figure". */
export function scopeLabel(worksheet: Worksheet, scope: AiScope): string {
  const m = assistMessages();
  switch (scope.kind) {
    case 'paper':
      return m.wholePaper;
    case 'questions':
      return scope.ids.length === 1 ? questionLabel(worksheet, scope.ids[0]) : m.questionsN(scope.ids.length);
    case 'flowItems': {
      if (scope.ids.length > 1) return m.itemsN(scope.ids.length);
      const [id] = scope.ids;
      return worksheet.questions.some((q) => q.id === id) ? questionLabel(worksheet, id) : m.thisItem;
    }
    case 'paths':
      return scope.paths.length === 1 ? m.thisText : m.textsN(scope.paths.length);
    case 'block':
      return findTableBlock(worksheet, scope.blockId) ? m.thisTable : m.thisFigure;
  }
}

export interface ScopeChoice {
  scope: AiScope;
  label: string;
}

/** The menu's scope chip: the scope it opened with, its owning question when narrower,
 *  then the whole paper. Pure. */
export function scopeChoices(worksheet: Worksheet, scope: AiScope): ScopeChoice[] {
  const chain: AiScope[] = [scope];
  const owner =
    scope.kind === 'block'
      ? scope.questionId
      : scope.kind === 'paths' && scope.paths.length === 1
        ? collectTexts(worksheet).find((slot) => slot.path === scope.paths[0])?.questionId
        : undefined;
  if (owner !== undefined && worksheet.questions.some((q) => q.id === owner)) {
    chain.push({ kind: 'questions', ids: [owner] });
  }
  if (scope.kind !== 'paper') chain.push({ kind: 'paper' });
  return chain.map((s) => ({ scope: s, label: scopeLabel(worksheet, s) }));
}
