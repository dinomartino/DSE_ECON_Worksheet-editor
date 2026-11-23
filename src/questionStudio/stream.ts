import type { LiveDraft, LiveState, StudioEvent } from './types';

/**
 * The live screen's state from a run's events (k-0514): what to draw while the paper is
 * written word by word. Pure; the session keeps one (`StudioState.live`) and a screen that
 * runs the engine itself can fold `RunHooks.onEvent` through it.
 */

export const emptyLive = (): LiveState => ({ picks: [], references: 0, drafts: [] });

const put = (drafts: readonly LiveDraft[], index: number, change: (current: LiveDraft) => LiveDraft): LiveDraft[] => {
  const out = [...drafts];
  const at = out.findIndex((d) => d.index === index);
  const base: LiveDraft = at === -1 ? { index, attempt: 1 } : out[at];
  const next = change(base);
  if (at === -1) out.push(next);
  else out[at] = next;
  return out.sort((a, b) => a.index - b.index);
};

export function applyEvent(state: LiveState, event: StudioEvent): LiveState {
  switch (event.type) {
    case 'stage':
      return { ...state, stage: event.stage };
    case 'pick':
      return { ...state, picks: event.picks };
    case 'references':
      return { ...state, references: event.count };
    case 'write':
      return { ...state, mode: event.mode };
    case 'text':
      // A rewrite's words replace the first try's: the checked draft steps back to words until it is checked again.
      return { ...state, drafts: put(state.drafts, event.index, (d) => ({ ...d, partial: event.draft, attempt: event.attempt, ...(event.attempt > d.attempt || (d.draft && d.draft.attempt < event.attempt) ? { draft: undefined, diagram: undefined } : {}) })) };
    case 'draft':
      return { ...state, drafts: put(state.drafts, event.index, (d) => ({ ...d, draft: event.draft, attempt: event.draft.attempt })) };
    case 'diagram':
      return { ...state, drafts: put(state.drafts, event.index, (d) => ({ ...d, diagram: event.state })) };
  }
}
