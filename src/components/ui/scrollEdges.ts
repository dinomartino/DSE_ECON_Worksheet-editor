'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Is there content past a scroll pane's edges? Overlay scrollbars (macOS) are invisible
 * until scrolled, so a pane that hides content says so with an edge hint instead
 * (`ScrollEdgeHints`). `gutter` is the pane's classic-scrollbar width, so a hint can stop
 * short of it.
 */
export interface ScrollEdges {
  atTop: boolean;
  atBottom: boolean;
  gutter: number;
}

/** Nothing hidden: the state before measuring, and whenever the content fits. */
export const NO_OVERFLOW: ScrollEdges = { atTop: true, atBottom: true, gutter: 0 };

/** Fractional scroll offsets (page zoom) never reach the exact end. */
const SLACK = 1;

type Measured = Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight' | 'offsetWidth' | 'clientWidth'>;

export function readScrollEdges(el: Measured): ScrollEdges {
  return {
    atTop: el.scrollTop <= SLACK,
    atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - SLACK,
    gutter: Math.max(0, el.offsetWidth - el.clientWidth),
  };
}

const same = (a: ScrollEdges, b: ScrollEdges) =>
  a.atTop === b.atTop && a.atBottom === b.atBottom && a.gutter === b.gutter;

/**
 * Report `el`'s edges on scroll and on any resize of it or its children, at most once a
 * frame, and only when they change: a no-op setState per scroll frame re-renders the
 * whole screen. Returns the teardown.
 */
export function watchScrollEdges(el: HTMLElement, onChange: (edges: ScrollEdges) => void): () => void {
  let last = NO_OVERFLOW;
  let frame: number | undefined;
  const measure = () => {
    frame = undefined;
    const next = readScrollEdges(el);
    if (same(next, last)) return;
    last = next;
    onChange(next);
  };
  const schedule = () => {
    if (frame === undefined) frame = requestAnimationFrame(measure);
  };

  // The pane's own box catches window resizes; its children catch content growing inside
  // a pane whose own size does not change. Children come and go, so re-observe on change.
  const resize = new ResizeObserver(schedule);
  const observeAll = () => {
    resize.disconnect();
    resize.observe(el);
    for (const child of Array.from(el.children)) resize.observe(child);
  };
  const mutation = new MutationObserver(() => {
    observeAll();
    schedule();
  });
  observeAll();
  mutation.observe(el, { childList: true });
  el.addEventListener('scroll', schedule, { passive: true });
  measure();

  return () => {
    el.removeEventListener('scroll', schedule);
    resize.disconnect();
    mutation.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}

/**
 * The edges of the element given to `ref`. A callback ref, not a ref object: the pane can
 * unmount and remount while its owner stays (the start screen's aside does), and the
 * watcher must follow the new element.
 */
export function useScrollEdges<T extends HTMLElement>(): { ref: (el: T | null) => void; edges: ScrollEdges } {
  const [el, setEl] = useState<T | null>(null);
  const [edges, setEdges] = useState(NO_OVERFLOW);
  useEffect(() => {
    if (!el) return;
    const stop = watchScrollEdges(el, setEdges);
    return () => {
      stop();
      setEdges(NO_OVERFLOW);
    };
  }, [el]);
  const ref = useCallback((node: T | null) => setEl(node), []);
  return { ref, edges };
}
