import { describe, expect, it } from 'vitest';
import { watchDismiss } from './dismiss';

const part = () => {
  const inner = {};
  const n = { inner, contains: (x: unknown) => x === n || x === inner };
  return n;
};

function setup() {
  const target = new EventTarget();
  const pop = part();
  const button = part();
  const closes: boolean[] = [];
  const stop = watchDismiss(target, { inside: () => [pop, button], close: (refocus) => closes.push(refocus) });
  const fire = (type: string, init: Record<string, unknown>) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.entries(init).forEach(([k, v]) => Object.defineProperty(event, k, { value: v }));
    target.dispatchEvent(event);
    return event;
  };
  return { target, pop, button, closes, stop, fire };
}

describe('watchDismiss (k-0528: studio popovers close like people expect)', () => {
  it('a press outside closes it; a press inside it or on its button does not', () => {
    const { pop, button, closes, fire } = setup();
    fire('pointerdown', { target: pop.inner });
    fire('pointerdown', { target: button });
    expect(closes).toEqual([]);
    fire('pointerdown', { target: {} });
    expect(closes).toEqual([false]);
  });

  it('Esc closes it, gives focus back to the button only when focus was inside, and goes no further', () => {
    const { pop, closes, fire } = setup();
    const inside = fire('keydown', { key: 'Escape', target: pop.inner, isComposing: false, keyCode: 27 });
    const outside = fire('keydown', { key: 'Escape', target: {}, isComposing: false, keyCode: 27 });
    expect(closes).toEqual([true, false]);
    expect(inside.cancelBubble && outside.cancelBubble).toBe(true);
  });

  it('other keys and an IME Escape leave it open', () => {
    const { pop, closes, fire } = setup();
    fire('keydown', { key: 'Enter', target: pop.inner, isComposing: false, keyCode: 13 });
    fire('keydown', { key: 'Escape', target: pop.inner, isComposing: true, keyCode: 229 });
    expect(closes).toEqual([]);
  });

  it('focus moving out closes it; moving within it, or out of the window, does not', () => {
    const { pop, button, closes, fire } = setup();
    fire('focusout', { target: pop.inner, relatedTarget: button });
    fire('focusout', { target: pop.inner, relatedTarget: null });
    fire('focusout', { target: {}, relatedTarget: {} });
    expect(closes).toEqual([]);
    fire('focusout', { target: pop.inner, relatedTarget: {} });
    expect(closes).toEqual([false]);
  });

  it('stops listening once closed', () => {
    const { closes, fire, stop } = setup();
    stop();
    fire('pointerdown', { target: {} });
    expect(closes).toEqual([]);
  });
});
