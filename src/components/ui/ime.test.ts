import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isComposingNow, isImeKeydown, JUST_ENDED_MS, resetComposition, watchComposition } from './ime';

/**
 * k-0263: Enter that confirms a Chinese IME candidate (macOS Pinyin, Cangjie, Zhuyin) never
 * splits a paragraph, moves to the next option, splits a mark point or finishes a field.
 * Chrome and WebKit (Safari, the macOS desktop app) send the events in different orders; both
 * are replayed here as the engines send them. In Chrome, with a real composition:
 * `scripts/word-typing-verify.mjs --part=ime`.
 */

type Key = { key: string; keyCode?: number; isComposing?: boolean };

let target: EventTarget;
let stop: () => void;

type Pressed = Event & { key: string; keyCode: number; isComposing: boolean };

function keydown(init: Key): Pressed {
  const event = new Event('keydown', { cancelable: true }) as Pressed;
  Object.assign(event, { isComposing: false, keyCode: init.key === 'Enter' ? 13 : 65, ...init });
  target.dispatchEvent(event);
  return event;
}
const composition = (type: 'compositionstart' | 'compositionupdate' | 'compositionend') =>
  target.dispatchEvent(new Event(type));

beforeEach(() => {
  vi.useFakeTimers();
  resetComposition();
  target = new EventTarget();
  stop = watchComposition(target);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('a keydown the IME owns', () => {
  it('Chrome: Enter that confirms a candidate arrives composing (229), then compositionend', () => {
    composition('compositionstart');
    expect(isImeKeydown(keydown({ key: 'Process', keyCode: 229, isComposing: true }))).toBe(true); // "z"
    composition('compositionupdate');
    const confirm = keydown({ key: 'Enter', keyCode: 229, isComposing: true });
    expect(isImeKeydown(confirm)).toBe(true);
    composition('compositionend');
    // The teacher's own Enter, a moment later, is Enter again.
    vi.advanceTimersByTime(200);
    expect(isImeKeydown(keydown({ key: 'Enter' }))).toBe(false);
  });

  it('WebKit: compositionend first, then Enter with isComposing false and keyCode 229', () => {
    composition('compositionstart');
    keydown({ key: 'n', keyCode: 229 });
    expect(isComposingNow()).toBe(true);
    composition('compositionend');
    expect(isComposingNow()).toBe(false);
    expect(isImeKeydown(keydown({ key: 'Enter', keyCode: 229, isComposing: false }))).toBe(true);
    vi.advanceTimersByTime(200);
    expect(isImeKeydown(keydown({ key: 'Enter' }))).toBe(false);
  });

  it('WebKit, should the confirming Enter come as 13: caught as the key that ended the composition', () => {
    composition('compositionstart');
    composition('compositionend');
    expect(isImeKeydown(keydown({ key: 'Enter', keyCode: 13 }))).toBe(true);
    vi.advanceTimersByTime(JUST_ENDED_MS + 1);
    expect(isImeKeydown(keydown({ key: 'Enter', keyCode: 13 }))).toBe(false);
  });

  it('Escape, Backspace and arrows inside a composition are the IME’s too', () => {
    composition('compositionstart');
    for (const key of ['Escape', 'Backspace', 'ArrowDown', 'Tab']) {
      expect(isImeKeydown(keydown({ key, keyCode: 229, isComposing: true }))).toBe(true);
    }
    // An engine that marks none of them: the open composition still counts.
    expect(isImeKeydown({ key: 'Escape', isComposing: false })).toBe(true);
  });

  it('a composition whose end never came (its field removed) cannot leave Enter dead', () => {
    composition('compositionstart');
    keydown({ key: 'a', keyCode: 65 });
    expect(isComposingNow()).toBe(false);
    expect(isImeKeydown(keydown({ key: 'Enter' }))).toBe(false);
  });

  it('no IME: ordinary keys are never mistaken for one', () => {
    for (const key of ['Enter', 'a', 'Escape', 'Backspace', 'Tab']) expect(isImeKeydown(keydown({ key }))).toBe(false);
  });
});
