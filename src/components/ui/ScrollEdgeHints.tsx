'use client';

import type { ScrollEdges } from './scrollEdges';

/**
 * The edge hints for a scroll pane, from `useScrollEdges`. Place inside a `relative`
 * wrapper around the pane that carries the pane's background, so `--surface` here is the
 * pane's own. Top: a hairline once content has gone up. Bottom: a fade while more is
 * below. Never takes a click, never takes space.
 */
export function ScrollEdgeHints({ edges }: { edges: ScrollEdges }) {
  const fade = 'pointer-events-none absolute left-0 z-10 transition-opacity duration-200 motion-reduce:transition-none';
  return (
    <>
      <div
        aria-hidden
        data-scroll-hint="top"
        className={`${fade} top-0 h-3 border-t border-line bg-linear-to-b from-surface to-transparent ${edges.atTop ? 'opacity-0' : 'opacity-100'}`}
        style={{ right: edges.gutter }}
      />
      <div
        aria-hidden
        data-scroll-hint="bottom"
        className={`${fade} bottom-0 h-14 bg-linear-to-t from-surface to-transparent ${edges.atBottom ? 'opacity-0' : 'opacity-100'}`}
        style={{ right: edges.gutter }}
      />
    </>
  );
}
