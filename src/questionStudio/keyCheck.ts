import type { StudioDraft } from './types';

/**
 * Does the answer key match the drawing (k-0540)? The figure step works the key out again
 * from the diagram's geometry and saves it with the draft (`diagram.solved`, k-0534); this
 * reads it against the key as it is now.
 *
 * - `ok`: the diagram gives the keyed option.
 * - `differs`: it gives another option (`gives` = its letter), or none says it (`gives` = '').
 * - `again`: the teacher drew over the diagram by hand, so the saved result no longer
 *   describes it; the key has to be checked against the new drawing.
 * - null: nothing to say (no figure with the question, or the solver could not read it:
 *   the blind solve and the other checks cover those).
 */
export type KeyCheck = { state: 'ok' } | { state: 'differs'; gives: string } | { state: 'again' };

const LETTERS = 'ABCD';

export function keyCheckOf(draft: Pick<StudioDraft, 'diagram' | 'draft' | 'diagramSet'>): KeyCheck | null {
  // Several figures (k-0545): the key the drawings give together (a grid of tax graphs); a
  // figure the teacher redrew means checking again.
  const set = draft.diagramSet;
  if (set) {
    const drawn = set.figures.filter((f) => f.block && f.placement === 'question');
    if (!drawn.length) return null;
    if (drawn.some((f) => f.edited)) return { state: 'again' };
    if (!set.solved) return null;
    if (set.solved.option === draft.draft.answerIndex) return { state: 'ok' };
    return { state: 'differs', gives: set.solved.option >= 0 ? (LETTERS[set.solved.option] ?? '') : '' };
  }
  const figure = draft.diagram;
  if (!figure?.block || figure.placement !== 'question') return null;
  if (figure.edited) return { state: 'again' };
  const solved = figure.solved;
  if (!solved) return null;
  if (solved.option === draft.draft.answerIndex) return { state: 'ok' };
  return { state: 'differs', gives: solved.option >= 0 ? (LETTERS[solved.option] ?? '') : '' };
}
