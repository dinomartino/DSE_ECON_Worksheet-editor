export type UndoAction = 'undo' | 'redo';

type Keys = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>;

/** The page's undo keys: ⌘Z / Ctrl+Z undoes, with Shift it redoes. */
export function undoChord(event: Keys): UndoAction | null {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return null;
  return event.shiftKey ? 'redo' : 'undo';
}

/** Inputs that take no typing, so have no text of their own for ⌘Z to take back. */
const UNTYPED_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/**
 * Whether ⌘Z in `element` belongs to it (a text field taking back a character) rather than
 * to the document. A ticked box, a radio or a slider has no text undo, so there the keys
 * undo the document, as they do with focus on a button — or a teacher who ticks "Start on
 * a new page" and presses ⌘Z sees nothing happen.
 */
export function holdsTextUndo(
  element: Pick<Element, 'tagName'> & { type?: string; isContentEditable?: boolean } | null,
): boolean {
  if (!element) return false;
  if (element.isContentEditable === true || element.tagName === 'TEXTAREA') return true;
  return element.tagName === 'INPUT' && !UNTYPED_INPUTS.has(element.type ?? 'text');
}

/**
 * Any key that undoes or redoes somewhere: the page's chord, or Ctrl+Y (a text field's
 * redo on Windows). What an in-flight gesture swallows.
 */
export function isUndoRedoKey(event: Keys): boolean {
  return undoChord(event) !== null || (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'y');
}

/**
 * A key during an in-flight drag: Esc cancels it; undo/redo are swallowed, since an
 * undo mid-gesture would land the release on a document the drag never saw.
 */
export function gestureKey(event: Keys): 'cancel' | 'swallow' | null {
  if (event.key === 'Escape') return 'cancel';
  return isUndoRedoKey(event) ? 'swallow' : null;
}
