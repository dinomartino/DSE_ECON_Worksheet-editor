import type { KeyboardEvent } from 'react';

/**
 * Esc in a field holding text clears it and does nothing else; Esc in an empty field is
 * left to the window's handlers (go up a level, close the dialog). A window handler cannot
 * decide by reading the value: the clear re-renders before it runs, so it would see an
 * empty field and act too. React's handler runs first, so the key stops here.
 */
export function escapeClears(event: KeyboardEvent, value: string, clear: () => void): boolean {
  if (event.key !== 'Escape' || !value) return false;
  event.preventDefault();
  event.stopPropagation();
  clear();
  return true;
}
