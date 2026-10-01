import { isDrawableGraph, type SavedGraph } from '@/model/graph';
import { buildFromTemplate } from '@/model/diagramTemplates';

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
export function graphCount(count: number): string {
  return `${count} ${count === 1 ? 'graph' : 'graphs'}`;
}

/** A template the Graphs screen offers: one the drawing canvas edits (not pie, flow or forum). */
export function isGraphTemplate(templateId: string): boolean {
  const diagram = buildFromTemplate(templateId);
  return isDrawableGraph({ kind: 'diagram', id: '', diagram, widthPx: 0, heightPx: 0, altText: { en: [], zh: [] } });
}

/** The autosave's word for the top bar. */
export type GraphSaveState = 'saved' | 'saving' | 'failed' | 'readOnly';

export function graphSaveLabel(state: GraphSaveState): { word: string; detail: string } {
  switch (state) {
    case 'saving':
      return { word: 'Saving', detail: 'Saving your changes' };
    case 'failed':
      return { word: 'Not saved', detail: 'Your latest changes could not be saved. They are kept here; try again.' };
    case 'readOnly':
      return {
        word: 'Read-only',
        detail: 'Saved by a newer version of Econ Studio, so it cannot be changed here',
      };
    default:
      return { word: 'Saved', detail: 'All changes saved' };
  }
}
