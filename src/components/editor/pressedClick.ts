'use client';

import { useEffect, type RefObject } from 'react';

/**
 * A press on a panel control is a click on that control, even when the panel moved under
 * the pointer between press and release (k-0478).
 *
 * The browser sends `click` to the nearest element holding *both* the `pointerdown` and
 * the `pointerup` targets. Clicking text on the page opens a field; the first press in
 * the side panel blurs it, the field commits, the selection clears, and anything in the
 * panel that follows the selection (the "You are editing" line, a card's state) re-renders
 * before the release. If the button moved even a few pixels, the release lands on
 * something else, the click goes to a common ancestor, and the button never hears it:
 * the teacher's first click "does nothing" and only the second works.
 *
 * The panel avoids moving on a selection change where it can (`PanelWhereAmI` keeps its
 * line); this is the net under every control, present and future: a press that starts on
 * a control and ends where it started (a click, not a drag or a scroll) clicks that
 * control. A click that reached the control itself is left alone.
 */

/** What a press started on: a control the teacher can click. */
const CONTROL =
  'button, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="switch"], [role="checkbox"], a[href], summary';

/** Fields own their own pointer handling (caret, native popups): never redirected. */
const FIELD = 'input, select, textarea, [contenteditable="true"], [contenteditable=""]';

/** How far the pointer may travel and still be a click, in CSS pixels. */
export const CLICK_SLOP_PX = 8;
/** How long a press may last and still be a click. */
export const CLICK_MAX_MS = 1500;

export interface Press {
  control: Element;
  x: number;
  y: number;
  at: number;
}

/** The control a press on `target` starts on, if it is one to protect. */
export function controlOf(target: EventTarget | null): Element | undefined {
  if (!(target instanceof Element)) return undefined;
  if (target.closest(FIELD)) return undefined;
  const control = target.closest(CONTROL);
  if (!control) return undefined;
  if (control.hasAttribute('disabled') || control.getAttribute('aria-disabled') === 'true') return undefined;
  return control;
}

/**
 * Whether a `click` at (x, y) landing on `target` is a press on `press.control` that the
 * browser misdirected. Only a click that missed the control, close to where the press
 * started, soon after it, with the control still on the page.
 */
export function isMisdirected(press: Press, click: { target: EventTarget | null; x: number; y: number; at: number }): boolean {
  if (!press.control.isConnected) return false;
  if (click.target && press.control.contains(click.target as Node)) return false;
  if (click.at - press.at > CLICK_MAX_MS) return false;
  return Math.hypot(click.x - press.x, click.y - press.y) <= CLICK_SLOP_PX;
}

/**
 * Install the net on a panel: presses are recorded inside `root`; the click is watched on
 * the whole document, since the common ancestor the browser picks can be outside it.
 */
export function usePressedClick(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let press: Press | undefined;

    const onPointerDown = (event: PointerEvent) => {
      press = undefined;
      if (event.button !== 0 || !event.isPrimary) return;
      const control = controlOf(event.target);
      if (control) press = { control, x: event.clientX, y: event.clientY, at: event.timeStamp };
    };
    const onCancel = () => {
      press = undefined;
    };
    const onClick = (event: MouseEvent) => {
      const pending = press;
      press = undefined;
      // Keyboard clicks (detail 0) and clicks the code made are never pointer presses.
      if (!pending || !event.isTrusted || event.detail === 0) return;
      if (!isMisdirected(pending, { target: event.target, x: event.clientX, y: event.clientY, at: event.timeStamp })) return;
      // The misdirected click must not act where it landed (a card, the panel body):
      // the teacher pressed the control, so the control gets it, once.
      event.preventDefault();
      event.stopPropagation();
      (pending.control as HTMLElement).click();
    };

    // Any press forgets the last one; a press inside the panel then records itself (the
    // document's capture listener runs first, being the outer one).
    document.addEventListener('pointerdown', onCancel, true);
    host.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointercancel', onCancel, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('pointerdown', onCancel, true);
      host.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointercancel', onCancel, true);
      document.removeEventListener('click', onClick, true);
    };
  }, [root]);
}
