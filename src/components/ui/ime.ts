/**
 * Whether a keydown belongs to an input method (a Chinese IME: Pinyin, Cangjie, Zhuyin…),
 * so Enter that confirms a candidate never splits a paragraph, moves to the next option,
 * splits a mark point or finishes a field, and Escape, Backspace or an arrow that works the
 * candidate list never closes, joins or leaves one (k-0263).
 *
 * Engines report the confirming Enter differently, so every sign counts:
 *
 * - **Chrome** (and WebView2): `keydown` Enter with `isComposing: true`, keyCode 229, *then*
 *   `compositionend`.
 * - **WebKit** (Safari, and the macOS desktop app's WKWebView): `compositionend` *first*, then
 *   `keydown` Enter with `isComposing: false` (keyCode 229). The keyCode is the usual tell; a
 *   key arriving within `JUST_ENDED_MS` of a `compositionend` is caught as well, should an
 *   engine send it as 13.
 * - Any key while a composition is open (`compositionstart` seen, `compositionend` not yet).
 *
 * A key that is the IME's is left to the browser: no `preventDefault`, no handler.
 */

/** Long enough for the key that ended a composition, far shorter than a second key press. */
export const JUST_ENDED_MS = 40;

const state = { composing: false, endedAt: Number.NEGATIVE_INFINITY };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

type ImeKey = Pick<KeyboardEvent, 'key' | 'isComposing'> & { keyCode?: number };

/** True for a keydown the IME owns (see above). Takes a DOM event or React's `nativeEvent`. */
export function isImeKeydown(event: ImeKey): boolean {
  return (
    event.isComposing ||
    event.keyCode === 229 ||
    event.key === 'Process' ||
    state.composing ||
    now() - state.endedAt < JUST_ENDED_MS
  );
}

/** A composition is open somewhere on the page (between `compositionstart` and `compositionend`). */
export function isComposingNow(): boolean {
  return state.composing;
}

/**
 * Follow composition on `target` (the window, capture phase, so it sees every field). Done
 * once on load in the browser; tests call it on a stand-in. Returns the cleanup.
 */
export function watchComposition(target: EventTarget): () => void {
  const start = () => {
    state.composing = true;
  };
  const end = () => {
    state.composing = false;
    state.endedAt = now();
  };
  // A field removed mid-composition may never send `compositionend`; an ordinary key (every
  // engine marks a composing key with 229 or `isComposing`) shows it is over, so a lost end
  // can never leave Enter dead.
  const key = (event: Event) => {
    const keyEvent = event as KeyboardEvent;
    if (!keyEvent.isComposing && keyEvent.keyCode !== 229 && keyEvent.key !== 'Process') state.composing = false;
  };
  target.addEventListener('compositionstart', start, { capture: true });
  target.addEventListener('compositionend', end, { capture: true });
  target.addEventListener('keydown', key, { capture: true });
  return () => {
    target.removeEventListener('compositionstart', start, { capture: true });
    target.removeEventListener('compositionend', end, { capture: true });
    target.removeEventListener('keydown', key, { capture: true });
    resetComposition();
  };
}

/** Forget any composition seen (tests). */
export function resetComposition(): void {
  state.composing = false;
  state.endedAt = Number.NEGATIVE_INFINITY;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') watchComposition(window);
