'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { isImeKeydown } from '@/components/ui/ime';

type Inside = { contains(node: Node | null): boolean };

/** What one open popover is watched with: the parts that count as inside it, and how it closes. */
export interface DismissWatch {
  /** The popover and the button that toggles it: a press on either is not 'outside'. */
  inside: () => readonly (Inside | null | undefined)[];
  /** Close it. `refocus` is true when Esc closed it from inside: focus goes back to the button. */
  close: (refocus: boolean) => void;
}

/**
 * Close an open popover the way people expect (k-0528, u-5ev0): a press anywhere outside it
 * (blank space, the message box, the list), Esc, or focus moving out of it (Tab, or a click
 * on something that takes focus). A press on its own button is left to the button, so the
 * button still toggles. A choice inside it keeps it open. Focus leaving the window (another
 * app, a click on plain text that takes no focus) does not close it by itself: the press
 * does. Framework-free so it can be tested without a DOM; `useDismiss` wires it to React.
 */
export function watchDismiss(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, watch: DismissWatch): () => void {
  const isInside = (node: unknown) => node != null && watch.inside().some((part) => part?.contains(node as Node));
  const onDown = (event: Event) => {
    if (!isInside(event.target)) watch.close(false);
  };
  const onKey = (event: Event) => {
    const key = event as KeyboardEvent;
    if (key.key !== 'Escape' || isImeKeydown(key)) return;
    // Esc closes this popover only, not a dialog or the selection behind it.
    key.stopPropagation();
    watch.close(isInside(key.target));
  };
  const onFocus = (event: Event) => {
    const to = (event as FocusEvent).relatedTarget;
    if (to && isInside((event as FocusEvent).target) && !isInside(to)) watch.close(false);
  };
  // `{ capture: true }`, not `true`: Node's EventTarget (the tests) never removes a `true` one.
  const capture = { capture: true };
  target.addEventListener('pointerdown', onDown, capture);
  target.addEventListener('keydown', onKey, capture);
  target.addEventListener('focusout', onFocus, capture);
  return () => {
    target.removeEventListener('pointerdown', onDown, capture);
    target.removeEventListener('keydown', onKey, capture);
    target.removeEventListener('focusout', onFocus, capture);
  };
}

/**
 * `watchDismiss` for a React popover while `open`: `parts` are the popover and its toggle
 * button; `button` gets focus back when Esc closes it from inside.
 */
export function useDismiss(open: boolean, onClose: () => void, parts: readonly RefObject<HTMLElement | null>[], button?: RefObject<HTMLElement | null>) {
  const latest = useRef({ onClose, parts, button });
  useEffect(() => {
    latest.current = { onClose, parts, button };
  });
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    return watchDismiss(document, {
      inside: () => latest.current.parts.map((part) => part.current),
      close: (refocus) => {
        latest.current.onClose();
        if (refocus) latest.current.button?.current?.focus();
      },
    });
  }, [open]);
}
