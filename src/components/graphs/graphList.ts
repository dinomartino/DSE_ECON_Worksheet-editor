import type { SavedGraph } from '@/model/graph';
import { undoChord, type UndoAction } from '@/components/ui/undoChord';
import { questionExcerpt } from '@/model/excerpt';
import { sectionShortLabel } from '@/model/flow';
import { computeNumbering } from '@/model/numbering';
import type { LanguageMode, Worksheet } from '@/model/types';
import type { WorksheetSummary } from '@/storage/types';
import { resolveMessages } from '@/i18n/catalogue';
import { uiLanguage } from '@/i18n/language';
import type { UiLanguage } from '@/settings/language';
import { GRAPH_EDITOR_MESSAGES, GRAPH_USE_MESSAGES } from './messages';

/** Summaries whose title holds every word of the search, newest first. */
export function searchSummaries(summaries: readonly WorksheetSummary[], search: string): WorksheetSummary[] {
  const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return summaries
    .filter((summary) => {
      const title = summary.title.toLocaleLowerCase();
      return words.every((word) => title.includes(word));
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface QuestionChoice {
  id: string;
  /** "Q3", or "Section B · Q3" when the document has sections. */
  label: string;
  excerpt: string;
}

/** The document's questions in print order, numbered as the page numbers them. */
export function questionChoices(worksheet: Worksheet, language: LanguageMode = 'en'): QuestionChoice[] {
  const lang = language === 'zh' ? 'zh' : 'en';
  return computeNumbering(worksheet).questions.map(({ question, sectionId, number }) => {
    const section = sectionShortLabel(worksheet, sectionId);
    return {
      id: question.id,
      label: section ? `${section} · Q${number}` : `Q${number}`,
      excerpt: questionExcerpt(question, lang, 90),
    };
  });
}

/** Graphs whose name holds every word of the search, in list order. */
export function searchGraphs(graphs: readonly SavedGraph[], search: string): SavedGraph[] {
  const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...graphs];
  return graphs.filter((graph) => {
    const name = graph.name.toLocaleLowerCase();
    return words.every((word) => name.includes(word));
  });
}

/** "6 graphs", "1 graph". */
export function graphCount(count: number, lang: UiLanguage = uiLanguage()): string {
  return resolveMessages(GRAPH_USE_MESSAGES, lang).graphCount(count);
}

/** A field that keeps its own ⌘Z: a text input, a textarea, or rich text. */
export function isTypingTarget(element: Element | null): boolean {
  if (!element) return false;
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || (element as HTMLElement).isContentEditable === true;
}

/**
 * The graph editor's undo or redo for this key, or null: a field keeps its own, and a
 * dialog over the editor owns the keyboard.
 */
export function graphHistoryAction(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>,
  { typing, dialogOpen }: { typing: boolean; dialogOpen: boolean },
): UndoAction | null {
  if (typing || dialogOpen) return null;
  return undoChord(event);
}

/** The autosave's word for the top bar. */
export type GraphSaveState = 'saved' | 'saving' | 'failed' | 'readOnly';

export function graphSaveLabel(state: GraphSaveState, lang: UiLanguage = uiLanguage()): { word: string; detail: string } {
  const m = resolveMessages(GRAPH_EDITOR_MESSAGES, lang);
  switch (state) {
    case 'saving':
      return { word: m.saving, detail: m.savingDetail };
    case 'failed':
      return { word: m.notSaved, detail: m.notSavedDetail };
    case 'readOnly':
      return { word: m.readOnly, detail: m.readOnlyDetail };
    default:
      return { word: m.saved, detail: m.savedDetail };
  }
}
