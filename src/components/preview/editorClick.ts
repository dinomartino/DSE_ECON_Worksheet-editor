import { useCallback, useEffect, useRef } from 'react';

/**
 * A click that belongs to an open text editor on the page (k-0484, user u-zatn).
 *
 * Clicking a text box opens its editor and shows the format bar. A second click inside the
 * *same* box, to put the caret on a word or select some text, used to bubble up to the
 * question's (or a layout element's, or the paper's) own click handler. Those handlers read
 * any click that reaches them as one on the question's padding or the blank paper, and drop
 * the finer selection: the page forgot the text, and the format bar vanished while the caret
 * was still blinking in the box.
 *
 * Two shapes reach an ancestor:
 *  - a click, double-click or tap inside the editor itself (its target is in the editor);
 *  - a drag that selects words and is released past the editor's edge: the browser sends
 *    that click to the common ancestor of press and release, so the target is the question
 *    or the paper, and only where the press began says it was the editor's gesture.
 */

/** What an open editor on the page is: the `RichTextEditable` host (`contenteditable`). */
export const OPEN_EDITOR = '[contenteditable="true"]';

interface Closest {
  closest?: (selector: string) => unknown;
}

/** Whether `target` is inside an open text editor. */
export function inOpenEditor(target: EventTarget | null | undefined): boolean {
  const node = target as Closest | null | undefined;
  return typeof node?.closest === 'function' && node.closest(OPEN_EDITOR) != null;
}

/**
 * Whether a click reaching an ancestor is the open editor's own gesture, not a click on
 * what surrounds it: it landed in the editor, or its press began there (a drag-select).
 */
export function isEditorClick(target: EventTarget | null | undefined, pressedInEditor: boolean): boolean {
  return pressedInEditor || inOpenEditor(target);
}

/**
 * The page's guard: `(event) => true` when a click reaching a question, a layout element or
 * the paper is the open editor's own (landed in it, or pressed there and released past it).
 *
 * The press is noted on `window` in capture, before anything can stop it, and spent once the
 * click has bubbled past the page's handlers, so a click with no press of its own (a
 * keyboard's, a script's) is never taken for one.
 */
export function useEditorClick(): (event: { target: EventTarget | null }) => boolean {
  const pressRef = useRef(false);
  useEffect(() => {
    const onPress = (event: PointerEvent) => {
      pressRef.current = inOpenEditor(event.target);
    };
    const onClickDone = () => {
      pressRef.current = false;
    };
    window.addEventListener('pointerdown', onPress, true);
    window.addEventListener('click', onClickDone);
    return () => {
      window.removeEventListener('pointerdown', onPress, true);
      window.removeEventListener('click', onClickDone);
    };
  }, []);
  return useCallback((event) => isEditorClick(event.target, pressRef.current), []);
}
