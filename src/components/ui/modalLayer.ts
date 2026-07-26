'use client';

import { useEffect } from 'react';

/**
 * Who owns the keyboard right now.
 *
 * The editor has several independent `window` keydown listeners — the preview's four
 * delete handlers, the drawing canvas's shortcuts — and `window` is the same target for
 * all of them, so `stopPropagation` cannot separate one from another and the listener
 * that happens to be registered first does not win in any useful sense. They all fire.
 *
 * That was a real bug, not a theoretical one: with a diagram selected on the page and
 * the drawing canvas open on top of it, pressing Delete to remove one curve **also ran
 * the preview's handler and deleted the entire diagram block**. The canvas called
 * `preventDefault`, which does nothing to a sibling listener on the same target.
 *
 * So ownership is tracked explicitly instead. A modal surface registers itself while it
 * is open, and every listener that belongs to the page underneath asks
 * `isModalLayerOpen()` before acting. Deliberately a plain module-level counter rather
 * than React state or context: a keydown handler needs the answer *synchronously* inside
 * an event, before the next render, and every consumer is already a `useEffect` closure
 * that would otherwise have to re-subscribe to get a fresh value.
 *
 * A counter rather than a boolean, so two stacked overlays (the canvas, then a confirm
 * dialog inside it) release the keyboard only when the last of them closes.
 */
let openCount = 0;

/** Is a modal surface currently on top? Page-level key handlers must no-op when true. */
export function isModalLayerOpen(): boolean {
  return openCount > 0;
}

/**
 * Claim the keyboard, returning the release function.
 *
 * Separated from the hook so the counting can be tested without a React renderer: an
 * unbalanced claim silently kills every page-level shortcut, and a missing one silently
 * brings back the delete-the-whole-diagram bug, so it is worth pinning directly.
 */
export function claimModalLayer(): () => void {
  openCount += 1;
  let released = false;
  return () => {
    // Guard against a double release — React can invoke a cleanup more than once in
    // development's double-invoked effects, and going negative would leave the counter
    // permanently below zero and the guard permanently off.
    if (released) return;
    released = true;
    openCount -= 1;
  };
}

/**
 * Claim the keyboard for as long as this component is mounted.
 *
 * Call it from any full-surface overlay. `active` lets a component that renders its own
 * conditional overlay claim and release without remounting.
 */
export function useModalLayer(active = true): void {
  useEffect(() => {
    if (!active) return;
    return claimModalLayer();
  }, [active]);
}

/** Test seam: reset the counter between cases so one leak cannot fail the next test. */
export function resetModalLayerForTest(): void {
  openCount = 0;
}
