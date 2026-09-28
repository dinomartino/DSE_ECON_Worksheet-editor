import { useEffect } from 'react';
import type { ReviewItem, ReviewTone } from '@/assist/types';

/**
 * The review's highlights on the page, imperative: a `data-ai-mark` attribute on the
 * page text each item names, re-applied after every re-render (a MutationObserver), so
 * the IR and `ItemBody` read nothing new. Queries stay inside `#print-root` (the
 * pagination probe duplicates the page). Styled under `@media screen` only.
 */

export const MARK_ATTR = 'data-ai-mark';
export const CURRENT_ATTR = 'data-ai-current';
export type MarkTone = Exclude<ReviewTone, 'failed'>;

const RANK: Record<MarkTone, number> = { inserted: 0, look: 1, finding: 2 };

/** Target key → the strongest tone among its items. A failed item has no text to mark. */
export function markTones(items: readonly ReviewItem[]): Map<string, MarkTone> {
  const out = new Map<string, MarkTone>();
  for (const item of items) {
    if (item.tone === 'failed' || item.targetKey === undefined) continue;
    const had = out.get(item.targetKey);
    if (had === undefined || RANK[item.tone] > RANK[had]) out.set(item.targetKey, item.tone);
  }
  return out;
}

const selector = (key: string) => `[data-page-target="${CSS.escape(key)}"]`;

export function pageTextFor(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#print-root ${selector(key)}`);
}

export function clearMarks(root: ParentNode = document): void {
  for (const el of root.querySelectorAll(`[${MARK_ATTR}]`)) {
    el.removeAttribute(MARK_ATTR);
    el.removeAttribute(CURRENT_ATTR);
  }
}

export function applyMarks(root: ParentNode, marks: ReadonlyMap<string, MarkTone>, current?: string): void {
  clearMarks(root);
  for (const [key, tone] of marks) {
    for (const el of root.querySelectorAll(selector(key))) {
      el.setAttribute(MARK_ATTR, tone);
      if (key === current) el.setAttribute(CURRENT_ATTR, '');
    }
  }
}

/** Marks the page while `marks` is set; clears it when they go (Done, Undo all, a new run). */
export function usePageMarks(marks: ReadonlyMap<string, MarkTone> | null, current: string | undefined): void {
  useEffect(() => {
    if (!marks || marks.size === 0) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const root = document.getElementById('print-root');
      if (root) applyMarks(root, marks, current);
    };
    paint();
    // Attributes are not observed, so painting never re-triggers itself.
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(paint);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      clearMarks();
    };
  }, [marks, current]);
}

/** The first click on marked text (which also selects it, as ever) reports its key. */
export function useMarkClicks(active: boolean, onKey: (key: string) => void): void {
  useEffect(() => {
    if (!active) return;
    const onClick = (event: MouseEvent) => {
      const el = (event.target as Element | null)?.closest?.(`#print-root [${MARK_ATTR}]`);
      const key = el?.getAttribute('data-page-target');
      if (key) onKey(key);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active, onKey]);
}
