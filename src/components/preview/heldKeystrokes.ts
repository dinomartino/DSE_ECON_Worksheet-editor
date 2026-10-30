/**
 * Letters typed while no field is open yet are kept, never dropped (k-0200, Word-like typing).
 *
 * A field opens a frame or more after the key that asked for it: Enter splits a paragraph and
 * the new one mounts after the store commits, Tab and Enter move to a cell or option that is
 * created on demand, a key on a selected field opens it. A teacher types straight on, as in
 * Word, and those first letters used to land on no editor at all. `holdKeystrokes` catches
 * them on the window (capture phase, before any page shortcut) and the next field to open
 * takes them (`takeHeldKeystrokes`) and types them at its caret.
 *
 * Only printable characters and Backspace over what is held; a key with ⌘ or Ctrl goes on
 * as usual. The hold lets go by itself after `HOLD_MS`, so a field that never opens cannot
 * swallow the keyboard. A key an input method owns (`ui/ime.ts`: a Chinese IME composing, or
 * the Enter that confirms its candidate) is never held: holding it would cancel the
 * composition and keep its Latin letters instead of the characters (k-0263).
 */
import { isImeKeydown } from '@/components/ui/ime';

const HOLD_MS = 1500;

let held: { text: string; release: () => void } | undefined;

/** A key that types a character, as opposed to a shortcut or a navigation key. */
export function typesCharacter(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'isComposing'> & { keyCode?: number },
): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !isImeKeydown(event);
}

/** Start holding typed characters for the field about to open; `first` is the key that opened it. */
export function holdKeystrokes(first = ''): void {
  held?.release();
  if (typeof window === 'undefined') return;
  const onKey = (event: KeyboardEvent) => {
    if (!held || isImeKeydown(event)) return;
    if (typesCharacter(event)) {
      held.text += event.key;
    } else if (event.key === 'Backspace' && held.text.length > 0) {
      held.text = held.text.slice(0, -1);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener('keydown', onKey, { capture: true });
  const timer = window.setTimeout(() => current.release(), HOLD_MS);
  const current = {
    text: first,
    release: () => {
      window.removeEventListener('keydown', onKey, { capture: true });
      window.clearTimeout(timer);
      if (held === current) held = undefined;
    },
  };
  held = current;
}

/** What was typed since `holdKeystrokes`, and stop holding. Empty when nothing is held. */
export function takeHeldKeystrokes(): string {
  if (!held) return '';
  const { text } = held;
  held.release();
  return text;
}

/** Whether keys are being held for a field about to open. */
export function holdingKeystrokes(): boolean {
  return held !== undefined;
}
