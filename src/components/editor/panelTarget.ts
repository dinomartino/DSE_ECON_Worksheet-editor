import { editTargetKey } from '@/model/edits';

/**
 * The sidebar control matching the page's selection, marked so the teacher can see it
 * (§ Inspector). Controls carry `data-edit-target`; the match gets `data-edit-current`,
 * styled once in `globals.css`, so every panel is covered without a prop.
 */
export const TARGET_ATTR = 'data-edit-target';
export const CURRENT_ATTR = 'data-edit-current';

/**
 * The keys that can stand for a page selection, finest first. A component with no
 * control of its own falls back to its owner's: a cell, caption or source line to its
 * block, a label-list value to its row (the row is keyed by its label).
 */
export function panelTargetCandidates(key: string): string[] {
  const [kind, id] = key.split(':');
  switch (kind) {
    case 'tableCell':
    case 'blockCaption':
    case 'sourceLabel':
    case 'sourceFootnote':
      return [key, editTargetKey({ kind: 'blockText', blockId: id })];
    case 'labelListCell': {
      const label = editTargetKey({ kind: 'labelListCell', elementId: '', rowId: id, column: 'label' });
      return label === key ? [key] : [key, label];
    }
    default:
      return [key];
  }
}

/**
 * Mark the control for `key` inside `root` and unmark every other; returns the match.
 * Idempotent: an element already marked is left alone, so re-marking after a re-render
 * never restarts its arrival pulse — only a newly marked element plays it.
 */
export function markPanelTarget(root: ParentNode, key: string | undefined): Element | undefined {
  const controls = Array.from(root.querySelectorAll(`[${TARGET_ATTR}]`));
  const byKey = new Map<string, Element>();
  for (const control of controls) {
    const own = control.getAttribute(TARGET_ATTR);
    if (own && !byKey.has(own)) byKey.set(own, control);
  }
  const match =
    key === undefined
      ? undefined
      : panelTargetCandidates(key)
          .map((candidate) => byKey.get(candidate))
          .find((control) => control !== undefined);
  for (const control of controls) {
    if (control === match) {
      if (!control.hasAttribute(CURRENT_ATTR)) control.setAttribute(CURRENT_ATTR, '');
    } else if (control.hasAttribute(CURRENT_ATTR)) {
      control.removeAttribute(CURRENT_ATTR);
    }
  }
  return match;
}
