import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdingKeystrokes, holdKeystrokes, takeHeldKeystrokes, typesCharacter } from './heldKeystrokes';

/**
 * k-0200: no keystroke is ever dropped. Between the key that asks for a field (Enter, Tab, a
 * letter on a selected field) and the field's editor taking focus, typed letters are held on
 * the window and typed into the field when it opens (`RichTextEditable`, `takeHeldKeystrokes`).
 * In Chrome: `scripts/word-typing-verify.mjs` types at full speed across Enter.
 */

type Key = { key: string; ctrlKey?: boolean; metaKey?: boolean; isComposing?: boolean; keyCode?: number };

/** A window stand-in: the node test environment has none. */
let target: EventTarget;

function press(init: Key): Event {
  const event = new Event('keydown', { cancelable: true });
  Object.assign(event, { ctrlKey: false, metaKey: false, isComposing: false, ...init });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  target = new EventTarget();
  vi.stubGlobal('window', Object.assign(target, { setTimeout, clearTimeout }));
});

afterEach(() => {
  takeHeldKeystrokes();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('held keystrokes', () => {
  it('keeps every letter typed before the field opens, and hands them over once', () => {
    holdKeystrokes();
    for (const key of 'second line') expect(press({ key }).defaultPrevented).toBe(true);
    expect(takeHeldKeystrokes()).toBe('second line');
    expect(holdingKeystrokes()).toBe(false);
    // Released: the next key is the page's again.
    expect(press({ key: 'x' }).defaultPrevented).toBe(false);
    expect(takeHeldKeystrokes()).toBe('');
  });

  it('starts with the key that opened the field, and Backspace takes a held letter back', () => {
    holdKeystrokes('S');
    press({ key: 'u' });
    press({ key: 'p' });
    press({ key: 'Backspace' });
    press({ key: 'p' });
    expect(takeHeldKeystrokes()).toBe('Sup');
  });

  it('lets shortcuts and navigation keys through', () => {
    holdKeystrokes();
    expect(press({ key: 'z', metaKey: true }).defaultPrevented).toBe(false);
    expect(press({ key: 'c', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press({ key: 'ArrowDown' }).defaultPrevented).toBe(false);
    expect(press({ key: 'Backspace' }).defaultPrevented).toBe(false);
    expect(takeHeldKeystrokes()).toBe('');
  });

  it('lets go by itself if no field opens, so the keyboard is never swallowed', () => {
    holdKeystrokes();
    press({ key: 'a' });
    vi.advanceTimersByTime(2000);
    expect(holdingKeystrokes()).toBe(false);
    expect(press({ key: 'b' }).defaultPrevented).toBe(false);
  });

  it('a second hold replaces the first, so one listener is ever live', () => {
    holdKeystrokes('a');
    holdKeystrokes('b');
    press({ key: 'c' });
    expect(takeHeldKeystrokes()).toBe('bc');
    expect(press({ key: 'd' }).defaultPrevented).toBe(false);
  });

  it('counts only keys that type a character', () => {
    expect(typesCharacter({ key: 'a', ctrlKey: false, metaKey: false, isComposing: false })).toBe(true);
    expect(typesCharacter({ key: '中', ctrlKey: false, metaKey: false, isComposing: false })).toBe(true);
    expect(typesCharacter({ key: ' ', ctrlKey: false, metaKey: false, isComposing: false })).toBe(true);
    expect(typesCharacter({ key: 'Enter', ctrlKey: false, metaKey: false, isComposing: false })).toBe(false);
    expect(typesCharacter({ key: 'a', ctrlKey: false, metaKey: true, isComposing: false })).toBe(false);
    expect(typesCharacter({ key: 'a', ctrlKey: false, metaKey: false, isComposing: true })).toBe(false);
  });
});

describe('held keystrokes and a Chinese IME (k-0263)', () => {
  it('never holds a key the IME owns, so the composition keeps its characters', () => {
    holdKeystrokes();
    press({ key: 'a' });
    // Chrome while composing, WebKit's 229 with isComposing false, Chrome's "Process" key.
    for (const init of [
      { key: 'n', isComposing: true, keyCode: 229 },
      { key: 'i', keyCode: 229 },
      { key: 'Process', keyCode: 229 },
      { key: 'Enter', keyCode: 229 },
      { key: 'Backspace', isComposing: true, keyCode: 229 },
    ]) {
      expect(press(init).defaultPrevented).toBe(false);
    }
    expect(takeHeldKeystrokes()).toBe('a');
  });

  it('a 229 key is not a typed character', () => {
    expect(typesCharacter({ key: 'n', ctrlKey: false, metaKey: false, isComposing: false, keyCode: 229 })).toBe(false);
  });
});
