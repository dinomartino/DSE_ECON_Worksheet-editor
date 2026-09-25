/**
 * Dragging a saved document onto a folder — the gesture's pure half.
 *
 * Pointer events, not HTML5 drag-and-drop: the desktop shell's webview keeps
 * `dragDropEnabled` on (so a file dragged from Finder/Explorer reaches the app), and
 * with it on the webview never delivers `dragover`/`drop` to the page. The component
 * feeds pointer events in and resolves the target under the pointer; this decides.
 */

/** Travel before a press becomes a drag, so a click (and its jitter) still opens. */
export const DRAG_THRESHOLD_PX = 5;

/** A folder row's `data-folder-drop` value for All documents (out of any folder). */
export const ROOT_DROP = 'root';

/** Where a drop would file the document: a folder, or none (`folderId: undefined`). */
export interface DropTarget {
  folderId: string | undefined;
}

export type DragState =
  | { phase: 'idle' }
  | { phase: 'pressed'; docId: string; pointerId: number; x: number; y: number }
  | { phase: 'dragging'; docId: string; pointerId: number; target: DropTarget | null };

export type DragInput =
  | { type: 'down'; docId: string; pointerId: number; x: number; y: number }
  /** `left`: the pointer left the pressed element — a drag, however short the travel. */
  | { type: 'move'; pointerId: number; x: number; y: number; target: DropTarget | null; left?: boolean }
  | { type: 'up'; pointerId: number; target: DropTarget | null }
  /** Escape, pointercancel, lost capture, window blur. */
  | { type: 'cancel' };

export interface DragStep {
  state: DragState;
  /** The press just became a drag: capture the pointer, show the ghost. */
  started?: boolean;
  /** The drag ended (dropped or cancelled): swallow the click that follows the release. */
  ended?: boolean;
  /** File this document here — produced once per gesture, on release over a target. */
  drop?: { docId: string; folderId: string | undefined };
}

export const IDLE: DragState = { phase: 'idle' };

/** `data-folder-drop` → a target; anything else is no target. */
export function parseDropTarget(value: string | null | undefined): DropTarget | null {
  if (value === ROOT_DROP) return { folderId: undefined };
  if (value && value.startsWith('folder:') && value.length > 'folder:'.length) {
    return { folderId: value.slice('folder:'.length) };
  }
  return null;
}

/** The attribute value a folder row carries (`undefined`: All documents). */
export function dropTargetValue(folderId: string | undefined): string {
  return folderId === undefined ? ROOT_DROP : `folder:${folderId}`;
}

export function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.folderId === b.folderId;
}

/**
 * One input → the next state. Events from another pointer are ignored, and every path
 * out of `dragging` returns to `idle`, so a gesture can produce at most one drop.
 */
export function stepDrag(state: DragState, input: DragInput): DragStep {
  switch (input.type) {
    case 'down':
      // A second press mid-gesture (another finger, another button) changes nothing.
      if (state.phase !== 'idle') return { state };
      return {
        state: { phase: 'pressed', docId: input.docId, pointerId: input.pointerId, x: input.x, y: input.y },
      };
    case 'move': {
      if (state.phase === 'idle' || input.pointerId !== state.pointerId) return { state };
      if (state.phase === 'pressed') {
        const travelled = Math.hypot(input.x - state.x, input.y - state.y);
        if (!input.left && travelled < DRAG_THRESHOLD_PX) return { state };
        return {
          state: { phase: 'dragging', docId: state.docId, pointerId: state.pointerId, target: input.target },
          started: true,
        };
      }
      if (sameTarget(state.target, input.target)) return { state };
      return { state: { ...state, target: input.target } };
    }
    case 'up': {
      if (state.phase === 'idle' || input.pointerId !== state.pointerId) return { state };
      // A press that never travelled is a click: nothing to do, let it through.
      if (state.phase === 'pressed') return { state: IDLE };
      const target = input.target;
      return target
        ? { state: IDLE, ended: true, drop: { docId: state.docId, folderId: target.folderId } }
        : { state: IDLE, ended: true };
    }
    case 'cancel':
      if (state.phase === 'dragging') return { state: IDLE, ended: true };
      return { state: IDLE };
  }
}
