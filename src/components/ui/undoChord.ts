export type UndoAction = 'undo' | 'redo';

type Keys = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>;

/** The page's undo keys: ⌘Z / Ctrl+Z undoes, with Shift it redoes. */
export function undoChord(event: Keys): UndoAction | null {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return null;
  return event.shiftKey ? 'redo' : 'undo';
}

/**
 * Any key that undoes or redoes somewhere: the page's chord, or Ctrl+Y (a text field's
 * redo on Windows). What an in-flight gesture swallows.
 */
export function isUndoRedoKey(event: Keys): boolean {
  return undoChord(event) !== null || (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'y');
}
