'use client';

import { useEffect } from 'react';

/**
 * Who owns the keyboard. Every keydown listener is on `window`, so all fire and
 * `stopPropagation` cannot separate them (Delete in the canvas once also deleted the
 * whole diagram block). Overlays register while open; page handlers ask
 * `isModalLayerOpen()`. A module-level **counter** — synchronous inside the event,
 * and two stacked overlays release only on the last close.
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
